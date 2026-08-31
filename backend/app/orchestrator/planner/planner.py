import json
import logging
import re
from dataclasses import dataclass, field
from groq import AsyncGroq
from app.core.config import get_settings
from app.orchestrator.context.assembler import AgentContext, ContextAssembler

logger = logging.getLogger(__name__)
settings = get_settings()

PLANNER_SYSTEM = """You are an AI agent planner for a telecom customer service system.

Given a customer context, generate an ordered action plan.

Available tools:
- get_customer: look up customer profile (phone, email, account_number, name)
- get_account: get account status, plan details, and balance
- get_invoice: get recent invoices for a customer
- get_invoice_detail: get full details of a specific invoice
- get_payment_history: get full payment transaction history with receipts
- issue_refund: issue a refund for an invoice (requires invoice_id and amount)
- check_outage: check if there is a service outage in the customer's area
- create_ticket: create a technical support ticket
- schedule_engineer: schedule a field engineer visit
- update_customer_details: update customer profile fields (email, phone, city, address, plan, etc.)
- escalate_to_human: connect customer to a human agent

Rules:
- Use tools ONLY when the answer cannot be derived from already-present [CUSTOMER]/[ACCOUNT]/[INVOICES] context
- If [CUSTOMER] data already contains phone/email/name, set direct_answer=true — no tool needed
- For update requests (change city, email, phone, plan etc.): use update_customer_details immediately
- For billing disputes or refunds: get_invoice first
- For technical issues: check_outage first
- For payment receipts: get_payment_history
- For escalation requests: escalate_to_human
- For simple greetings or questions answerable from context: direct_answer=true
- Max 2 tools per plan

Respond ONLY with valid JSON in this exact format:
{"plan": [{"step": 1, "tool": "tool_name", "reason": "why this tool", "params": {"key": "value"}}, ...], "direct_answer": false}

If no tools are needed, respond:
{"plan": [], "direct_answer": true}"""


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
    return json.loads(text)


@dataclass
class PlanStep:
    step: int
    tool: str
    reason: str
    params: dict = field(default_factory=dict)


@dataclass
class AgentPlan:
    steps: list[PlanStep] = field(default_factory=list)
    direct_answer: bool = False


class AgentPlanner:
    def __init__(self):
        self._client = AsyncGroq(api_key=settings.groq_api_key)
        self._assembler = ContextAssembler()

    async def plan(self, context: AgentContext) -> AgentPlan:
        context_block = self._assembler.build_llm_context_block(context)

        messages = [
            {"role": "system", "content": PLANNER_SYSTEM},
            {"role": "user", "content": context_block},
        ]

        try:
            response = await self._client.chat.completions.create(
                model="qwen/qwen3.8-27b",
                messages=messages,
                max_tokens=400,
                temperature=0.1,
            )
            raw = response.choices[0].message.content or "{}"
            data = _extract_json(raw)

            steps = [
                PlanStep(
                    step=s.get("step", i + 1),
                    tool=s["tool"],
                    reason=s.get("reason", ""),
                    params=s.get("params", {}),
                )
                for i, s in enumerate(data.get("plan", []))
                if s.get("tool")
            ]
            return AgentPlan(steps=steps, direct_answer=data.get("direct_answer", not steps))
        except Exception as exc:
            logger.error("Planner error: %s", exc)
            return AgentPlan(direct_answer=True)
