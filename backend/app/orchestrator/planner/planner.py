import json
import logging
import re
from dataclasses import dataclass, field
from groq import AsyncGroq
from app.core.config import get_settings
from app.orchestrator.context.assembler import AgentContext, ContextAssembler

logger = logging.getLogger(__name__)
settings = get_settings()

PLANNER_SYSTEM = """You are an AI agent planner for an insurance customer service system (InsureAI).

Given a customer context, generate an ordered action plan.

Available tools:
- get_customer: look up policy-holder profile (phone, email, policy_number, name)
- get_account: get policy status, plan details, coverage, and premium balance
- get_invoice: get recent premium invoices for a policy-holder
- get_invoice_detail: get full details of a specific premium invoice (line items, notes)
- get_payment_history: get full premium payment transaction history with receipts
- issue_refund: issue a premium refund or claim settlement credit (requires invoice_id and amount)
- check_outage: check claim processing delays or regional service disruptions
- create_ticket: create a claim support or technical ticket
- schedule_engineer: schedule an insurance surveyor or field inspector visit
- update_customer_details: update policy-holder profile fields (email, phone, city, address, plan, etc.)
- escalate_to_human: connect policy-holder to a human claims specialist
- pay_outstanding_balance: pay outstanding premium from the policy-holder's available account balance (requires amount)

Rules:
- Use tools ONLY when the answer cannot be derived from already-present [CUSTOMER]/[ACCOUNT]/[INVOICES] context
- If [CUSTOMER] data already contains phone/email/name, set direct_answer=true — no tool needed
- For update requests (change city, email, phone, policy, address etc.): use update_customer_details immediately
- For billing disputes or premium refunds: ALWAYS get_invoice first, then get_invoice_detail for the specific invoice
- For claim-related technical issues: check_outage first to see if there's a regional processing delay
- For payment receipts or premium history: get_payment_history
- For paying a premium or outstanding amount from existing balance: pay_outstanding_balance
- For surveyor/inspector scheduling: schedule_engineer
- For escalation requests or complex claims: escalate_to_human
- For simple greetings or questions answerable from context: direct_answer=true
- Max 2 tools per plan

CRITICAL — REFUND / CLAIM CREDIT VALIDATION RULES (NEVER skip these):
- Before issuing any premium refund, the conversation context must contain invoice data from get_invoice_detail confirming the disputed amount exists.
- If no invoice has been fetched yet: plan = [get_invoice]
- If invoice was fetched but details/line items are missing for validation: plan = [get_invoice_detail]
- If the customer confirms they want the refund or asks to proceed, and the invoice detail is ALREADY in context: YOU MUST call issue_refund. DO NOT call get_invoice_detail again.
- If the claim cannot be verified from invoice data, set direct_answer=true so the response agent can explain the issue.

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
