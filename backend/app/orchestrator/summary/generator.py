import json
import logging
import re
from datetime import datetime, timezone

from groq import AsyncGroq
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.summary import CallSummary, Escalation
from app.orchestrator.memory.manager import SessionMemory
from app.observability.bus import event_bus
from app.api.websocket.events import EscalationCreatedEvent, CallSummaryEvent

logger = logging.getLogger(__name__)
settings = get_settings()

SUMMARY_SYSTEM = (
    "You are a call summary engine for an enterprise insurance CRM system (InsureAI). "
    "Given a conversation between a policy-holder and an AI agent, produce a structured, detailed summary.\n\n"
    "Your summary must cover:\n"
    "1. What the policy-holder called about (primary issue / request — e.g. claim inquiry, premium refund, policy renewal)\n"
    "2. What information was gathered or verified (policy details, invoice data, coverage type, identity)\n"
    "3. What actions were taken (refunds issued with reference numbers, tickets created, surveyor scheduled, escalations raised)\n"
    "4. What the final outcome was for the policy-holder (resolved, unresolved, pending review, escalated to claims specialist)\n\n"
    "Write 3-5 clear sentences. Be specific: include reference numbers, amounts, invoice IDs if mentioned. "
    "Avoid vague phrases like 'the agent handled the request'. "
    "Then classify: resolved | partially_resolved | unresolved | escalated.\n\n"
    "Respond ONLY with JSON: {\"summary\": \"...\", \"resolution\": \"...\"}"
)

ESCALATION_TRIGGERS = {
    "angry",
    "complaint",
    "cancellation_request",
}


def _extract_json(text: str) -> dict:
    text = text.strip()
    match = re.search(r'```(?:json)?\s*({.*?})\s*```', text, re.DOTALL)
    if match:
        text = match.group(1)
    else:
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            text = text[start:end + 1]
    try:
        return json.loads(text)
    except Exception:
        sum_m = re.search(r'"summary"\s*:\s*"([^"]+)"', text)
        res_m = re.search(r'"resolution"\s*:\s*"([^"]+)"', text)
        return {
            "summary": sum_m.group(1) if sum_m else "Call handled by AI agent.",
            "resolution": res_m.group(1) if res_m else "partially_resolved",
        }


class CallSummaryGenerator:
    def __init__(self):
        self._client = AsyncGroq(api_key=settings.groq_api_key)

    async def generate(
        self,
        session_id: str,
        conversation_id,
        memory: SessionMemory,
        tools_used: list[str],
        duration_sec: int,
        db: AsyncSession,
    ) -> CallSummary:
        history = memory.history  # full conversation — not just last 12
        # Build a rich context for the LLM: conversation + tools used
        conversation_text = "\n".join(
            f"{turn['role'].capitalize()}: {turn['content']}"
            for turn in history
        )
        tools_context = f"\nTools used during this conversation: {', '.join(sorted(set(tools_used)))}" if tools_used else ""

        summary_text = "Conversation handled by AI agent."
        resolution = "unresolved"

        if history:
            try:
                response = await self._client.chat.completions.create(
                    model="qwen/qwen3.8-27b",
                    messages=[
                        {"role": "system", "content": SUMMARY_SYSTEM},
                        {"role": "user", "content": f"Conversation:\n{conversation_text}{tools_context}\n\nDuration: {duration_sec} seconds"},
                    ],
                    max_tokens=600,
                    temperature=0.1,
                )
                data = _extract_json(response.choices[0].message.content or "{}")
                summary_text = data.get("summary", summary_text)
                resolution = data.get("resolution", resolution)
            except Exception as exc:
                logger.error("Summary generation error: %s", exc)

        escalated = resolution == "escalated"

        record = CallSummary(
            conversation_id=conversation_id,
            summary_text=summary_text,
            resolution=resolution,
            escalated=escalated,
            duration_sec=duration_sec,
            tools_used=tools_used,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)

        logger.info("Call summary saved for session %s: %s", session_id, resolution)

        try:
            await event_bus.emit(session_id, CallSummaryEvent(
                session_id=session_id,
                summary_text=summary_text,
                resolution=resolution,
                escalated=escalated,
                duration_sec=duration_sec,
                tools_used=tools_used,
            ))
        except Exception:
            pass

        return record


class EscalationHandler:
    def should_escalate(self, sentiment: str, intents: list[str], turn_count: int, customer_verified: bool) -> tuple[bool, str]:
        if sentiment == "angry" and turn_count >= 3:
            return True, "Customer is highly frustrated after multiple turns"

        if "cancellation_request" in intents and sentiment in {"frustrated", "angry"}:
            return True, "Cancellation request with negative sentiment — human agent recommended"

        if "complaint" in intents and turn_count >= 5:
            return True, "Unresolved complaint after extended interaction"

        if not customer_verified and turn_count >= 4:
            return True, "Cannot verify identity — manual verification required"

        return False, ""

    async def escalate(
        self,
        session_id: str,
        conversation_id,
        reason: str,
        memory: SessionMemory,
        db: AsyncSession,
        appointment_reference: str | None = None,
    ) -> Escalation:
        customer_id_str: str | None = memory.state.get("customer_id")

        handoff_context = {
            "session_id": session_id,
            "sentiment": memory.state.get("sentiment", "unknown"),
            "domain": memory.state.get("domain", "general"),
            "turn_count": len(memory.history) // 2,
            "customer_verified": memory.state.get("customer_verified", False),
            "customer_id": customer_id_str,
            "history_summary": [
                {"role": t["role"], "content": t["content"][:200]}
                for t in memory.history[-6:]
            ],
        }

        # Parse customer_id to UUID if available
        import uuid as _uuid
        parsed_customer_id = None
        if customer_id_str:
            try:
                parsed_customer_id = _uuid.UUID(customer_id_str)
            except (ValueError, AttributeError):
                pass

        record = Escalation(
            conversation_id=conversation_id,
            reason=reason,
            handoff_context=handoff_context,
            status="open",
            customer_id=parsed_customer_id,
            appointment_reference=appointment_reference,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)

        logger.info("Escalation created for session %s: %s", session_id, reason)

        try:
            await event_bus.emit(session_id, EscalationCreatedEvent(
                session_id=session_id,
                reason=reason,
                domain=handoff_context["domain"],
                sentiment=handoff_context["sentiment"],
                turn_count=handoff_context["turn_count"],
                customer_verified=handoff_context["customer_verified"],
            ))
        except Exception:
            pass

        return record

