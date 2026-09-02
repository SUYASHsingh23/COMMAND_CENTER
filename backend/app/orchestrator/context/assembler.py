from dataclasses import dataclass, field
from app.orchestrator.intent.extractor import IntentResult
from app.orchestrator.memory.manager import SessionMemory

MAX_HISTORY_TURNS = 30   # 10 full exchanges — fixes context amnesia
MAX_TOOL_RESULTS = 6


@dataclass
class AgentContext:
    session_id: str
    transcript: str
    domain: str
    intents: list[str]
    entities: dict
    sentiment: str
    urgency: str
    customer_verified: bool
    customer_profile: dict | None
    customer_context: dict | None   # Full bundle: profile + account + invoices + appointments
    recent_messages: list[dict]
    tool_results: list[dict]
    long_term_facts: dict[str, str]
    prior_intents: list[dict]
    workflow_result: dict | None


class ContextAssembler:
    def assemble(
        self,
        session_id: str,
        transcript: str,
        intent_result: IntentResult,
        domain: str,
        memory: SessionMemory,
        customer_profile: dict | None = None,
        customer_context: dict | None = None,
        tool_results: list[dict] | None = None,
        workflow_result: dict | None = None,
    ) -> AgentContext:
        return AgentContext(
            session_id=session_id,
            transcript=transcript,
            domain=domain,
            intents=intent_result.intents,
            entities=intent_result.entities,
            sentiment=intent_result.sentiment,
            urgency=intent_result.urgency,
            customer_verified=memory.state.get("customer_verified", False),
            customer_profile=customer_profile,
            customer_context=customer_context,
            recent_messages=memory.recent_messages[-MAX_HISTORY_TURNS:],
            tool_results=(tool_results or [])[-MAX_TOOL_RESULTS:],
            long_term_facts=memory.long_term,
            prior_intents=memory.prior_intents,
            workflow_result=workflow_result,
        )

    def build_llm_context_block(self, context: AgentContext) -> str:
        lines = [
            f"[CUSTOMER TURN]: {context.transcript}",
            f"[DOMAIN]: {context.domain}",
            f"[INTENTS]: {', '.join(context.intents)}",
            f"[SENTIMENT]: {context.sentiment} | [URGENCY]: {context.urgency}",
        ]

        if context.entities:
            ent_str = ", ".join(f"{k}={v}" for k, v in context.entities.items())
            lines.append(f"[ENTITIES]: {ent_str}")

        if context.recent_messages:
            lines.append("[CONVERSATION HISTORY]:")
            for msg in context.recent_messages:
                role = msg.get("role", "unknown").upper()
                content = msg.get("content", "")
                lines.append(f"  {role}: {content}")


        if context.customer_verified and context.customer_profile:
            p = context.customer_profile
            customer_line = (
                f"[CUSTOMER]: {p.get('name', 'Unknown')} | "
                f"Account: {p.get('account_number', 'N/A')} | "
                f"Plan: {p.get('plan', 'N/A')} | "
                f"Tier: {p.get('customer_tier', 'standard').title()} | "
                f"Language: {p.get('preferred_language', 'en').upper()}"
            )
            if p.get('phone'):
                customer_line += f" | Phone: {p['phone']}"
            if p.get('email'):
                customer_line += f" | Email: {p['email']}"
            if p.get('city'):
                customer_line += f" | City: {p['city']}"
            if p.get('state'):
                customer_line += f" | State: {p['state']}"
            if p.get('pincode'):
                customer_line += f" | Pincode: {p['pincode']}"
            if p.get('address_line1'):
                addr = p['address_line1']
                if p.get('address_line2'):
                    addr += f", {p['address_line2']}"
                customer_line += f" | Address: {addr}"
            if p.get('date_of_birth'):
                customer_line += f" | DOB: {p['date_of_birth']}"
            if p.get('gender'):
                customer_line += f" | Gender: {p['gender']}"
            if p.get('customer_since'):
                customer_line += f" | Customer since: {p['customer_since']}"
            lines.append(customer_line)
            lines.append("[STATUS]: Customer identity verified — do NOT ask for re-verification. Answer all profile questions directly from the above data.")

            # Inject account + billing context from pre-loaded bundle
            ctx = context.customer_context
            if ctx:
                acct = ctx.get("account")
                if acct:
                    lines.append(
                        f"[ACCOUNT]: Plan={acct.get('plan_name')} | "
                        f"Status={acct.get('status')} | "
                        f"Balance=Rs.{acct.get('balance', 0):.2f} | "
                        f"Billing={acct.get('billing_cycle')} | "
                        f"Payment={acct.get('payment_method')}"
                    )

                invoices = ctx.get("invoices", [])
                if invoices:
                    inv_lines = []
                    for inv in invoices[:3]:
                        status_emoji = "✅" if inv["status"] == "paid" else ("⚠️" if inv["status"] == "overdue" else "📄")
                        inv_lines.append(
                            f"{status_emoji} {inv['invoice_number']}: "
                            f"₹{inv['total_amount']:.2f} ({inv['status']}) "
                            f"due {inv['due_date']}"
                        )
                    lines.append("[INVOICES]: " + " | ".join(inv_lines))

                appointments = ctx.get("appointments", [])
                if appointments:
                    appt_lines = []
                    for appt in appointments:
                        appt_lines.append(
                            f"{appt['appointment_number']} ({appt['status']}): "
                            f"{appt.get('reason', 'N/A')} at {appt.get('scheduled_at', 'TBD')}"
                        )
                    lines.append("[APPOINTMENTS]: " + " | ".join(appt_lines))

        elif not context.customer_verified:
            lines.append("[CUSTOMER]: Identity not yet verified")

        if context.tool_results:
            lines.append("[TOOL RESULTS]:")
            for r in context.tool_results:
                lines.append(f"  - {r.get('tool')}: {r.get('summary', str(r.get('output', ''))[:120])}")

        if context.workflow_result:
            wf = context.workflow_result
            lines.append(f"[WORKFLOW]: {wf.get('workflow', '')} → {wf.get('message', wf.get('status', ''))}")

        if context.long_term_facts:
            facts = "; ".join(f"{k}: {v}" for k, v in list(context.long_term_facts.items())[:5])
            lines.append(f"[CUSTOMER NOTES]: {facts}")

        return "\n".join(lines)
