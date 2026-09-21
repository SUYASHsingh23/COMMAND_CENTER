import uuid
import asyncio
import logging
import time
from app.orchestrator.tools.registry import ToolRegistry
from app.enterprise.crm.service import CRMService
from app.enterprise.billing.service import BillingService
from app.enterprise.ticketing.service import TicketingService
from app.enterprise.scheduling.service import (
    schedule_engineer as svc_schedule_engineer,
    check_availability as svc_check_availability,
    escalate_to_human_agent as svc_escalate,
)
from app.orchestrator.rag.search_engine import rag_engine

from app.api.websocket.events import ToolStartedEvent, ToolCompletedEvent
from app.observability.bus import event_bus
from app.database.session import async_session_factory
from app.models.execution import ToolExecution

logger = logging.getLogger(__name__)

TOOL_TIMEOUT_SEC = 5.0

_crm = CRMService()
_billing = BillingService()
_ticketing = TicketingService()


async def _dispatch(tool_name: str, params: dict) -> dict:
    if tool_name == "get_customer":
        return await _crm.get_customer(**{k: v for k, v in params.items() if v is not None})
    if tool_name == "get_account":
        return await _crm.get_account(customer_id=params["customer_id"])
    if tool_name == "get_invoice":
        return await _billing.get_invoice(customer_id=params["customer_id"])
    if tool_name == "get_invoice_detail":
        # Accept either invoice_id (UUID) or invoice_number (e.g. INV-2026-SROVER-01)
        inv_ref = params.get("invoice_id") or params.get("invoice_number")
        return await _billing.get_invoice_detail(invoice_id=inv_ref)
    if tool_name == "issue_refund":
        # Accept either invoice_id (UUID) or invoice_number (string like INV-2026-...)
        inv_ref = params.get("invoice_id") or params.get("invoice_number")
        return await _billing.issue_refund(
            invoice_id=inv_ref,
            amount=float(params["amount"]),
            reason=params.get("reason", "Customer dispute"),
        )
    if tool_name == "pay_outstanding_balance":
        return await _billing.pay_outstanding_balance(
            customer_id=params["customer_id"],
            amount=float(params["amount"]),
        )

    if tool_name == "get_claim_status":
        reference = params.get("reference_number", "")
        customer_id = params.get("customer_id")
        # Look up refund/claim by reference number via billing service
        try:
            result = await _billing.get_claim_status(
                reference_number=reference,
                customer_id=customer_id,
            )
        except AttributeError:
            # Fallback: search invoices for matching refund reference
            result = {"found": False, "reference": reference, "status": "not_found",
                      "message": f"No claim found with reference {reference}"}
        return result
    if tool_name == "get_policy_coverage":
        customer_id = params.get("customer_id")
        plan = params.get("plan")
        query = params.get("query", "coverage details inclusions exclusions deductibles")

        # Step 1: Resolve plan name from account if not passed explicitly
        plan_name = plan
        account_result = await _crm.get_account(customer_id=customer_id)
        if account_result.get("found"):
            account = account_result.get("account", {})
            plan_name = plan_name or account.get("plan") or account.get("plan_name") or "unknown"
        else:
            account = {}

        # Step 2: Build a RAG search query from plan name + user question
        # Map plan name to RAG domain filter for precision
        plan_lower = (plan_name or "").lower()
        if "health" in plan_lower or "shield" in plan_lower:
            domain_filter = "health_insurance"
        elif "motor" in plan_lower or "vehicle" in plan_lower or "car" in plan_lower or "third party" in plan_lower:
            domain_filter = "motor_insurance"
        elif "home" in plan_lower or "property" in plan_lower or "protector" in plan_lower:
            domain_filter = "home_insurance"
        else:
            domain_filter = None  # Search across all domains

        rag_query = f"{plan_name} {query}".strip()

        # Step 3: Search the knowledge base
        try:
            search_results = await rag_engine.search(rag_query, top_k=4, domain=domain_filter)
        except Exception as exc:
            logger.error("RAG search failed for get_policy_coverage: %s", exc)
            search_results = []

        # Step 4: Format passages for the LLM context
        passages = []
        for r in search_results:
            passages.append({
                "title": r.section_title,
                "domain": r.domain,
                "content": r.content,
                "score": round(r.score, 3),
                "source": r.source,
            })

        if passages:
            return {
                "found": True,
                "customer_id": customer_id,
                "plan": plan_name,
                "passages": passages,
                "passage_count": len(passages),
                "message": f"Policy coverage details retrieved for {plan_name} from knowledge base.",
            }

        # Fallback: return account data if RAG returns nothing
        if account_result.get("found"):
            return {
                "found": True,
                "customer_id": customer_id,
                "plan": plan_name,
                "coverage_summary": account,
                "message": f"Coverage summary for plan: {plan_name} (knowledge base returned no results).",
            }
        return {"found": False, "error": "Customer account not found and knowledge base returned no results"}
    if tool_name == "create_ticket":
        return await _ticketing.create_ticket(
            customer_id=params["customer_id"],
            issue_type=params.get("issue_type", "general"),
            description=params.get("description", ""),
            priority=params.get("priority", "medium"),
        )
    if tool_name == "schedule_engineer":
        pref_date = params.get("preferred_date")
        customer_id = params.get("customer_id")
        account_number = params.get("account_number", customer_id or "ACC-UNKNOWN")
        avail = await svc_check_availability(pref_date)
        slots = avail.get("available_slots", [])
        # If requested date has no slots, use the next available date
        if not slots and not pref_date:
            pref_date = avail.get("next_available_date")
            slots = avail.get("next_available_slots", [])
        slot = slots[0] if slots else "10:00"
        if not pref_date:
            from datetime import date, timedelta
            pref_date = str(date.today() + timedelta(days=1))
        appt = await svc_schedule_engineer(
            account_number=account_number,
            date_str=pref_date,
            time_slot=slot,
            issue_description=params.get("issue_type", "Technical Support Field Visit"),
            customer_id=customer_id,
        )
        return {
            "success": appt.get("success", False),
            "appointment": appt,
            "slot_id": appt.get("appointment_id") or appt.get("appointment_number"),
            "confirmation": appt.get("confirmation_sms", "Appointment booked."),
        }
    if tool_name == "get_payment_history":
        return await _billing.get_payment_history(customer_id=params["customer_id"])
    if tool_name == "escalate_to_human":
        result = await svc_escalate(
            customer_id=params.get("customer_id", ""),
            reason=params.get("reason", "Customer requested human agent"),
            sentiment=params.get("sentiment", "neutral"),
            conversation_history=params.get("conversation_history", []),
            customer_profile=params.get("customer_profile"),
            customer_context=params.get("customer_context"),
            session_id=params.get("session_id"),
            conversation_id=params.get("conversation_id"),
        )
        return result
    if tool_name == "update_customer_details":
        customer_id = params.pop("customer_id")
        # Remove any empty or null values
        updates = {k: v for k, v in params.items() if v}
        return await _crm.update_customer(customer_id, updates)
    return {"error": f"No handler for tool: {tool_name}"}





def _make_summary(tool_name: str, output: dict) -> str:
    if tool_name == "get_customer":
        c = output.get("customer", {})
        if output.get("found"):
            name = c.get("name", "Unknown")
            plan = c.get("plan", "Standard")
            city = c.get("city", "")
            loc = f" · {city}" if city else ""
            return f"Policyholder: {name} (Plan: {plan}{loc})"
        return "Customer record not found"

    if tool_name == "get_account":
        a = output.get("account", {})
        if output.get("found"):
            st = a.get("status", "Active")
            bal = float(a.get("balance", 0))
            plan = a.get("plan_name", a.get("plan", "Standard"))
            return f"Account verified: Plan {plan} · Status: {st} · Balance: Rs.{bal:,.2f}"
        return "Account record not found"

    if tool_name == "get_invoice":
        invoices = output.get("invoices", [])
        if invoices:
            inv_summaries = [
                f"{i.get('invoice_number', i.get('invoice_id', ''))[:16]} (Rs.{float(i.get('total_amount', 0)):,.2f} · {i.get('status', '').upper()})"
                for i in invoices[:2]
            ]
            return f"Found {len(invoices)} invoice(s): {', '.join(inv_summaries)}" + ("…" if len(invoices) > 2 else "")
        return "No invoices found for account"

    if tool_name == "get_invoice_detail":
        inv = output.get("invoice", {})
        if output.get("found") and inv:
            num = inv.get("invoice_number", inv.get("invoice_id", ""))
            tot = float(inv.get("total_amount", 0))
            paid = float(inv.get("amount_paid", 0))
            st = inv.get("status", "sent").upper()
            return f"Verified Invoice {num}: Total Rs.{tot:,.2f} · Paid Rs.{paid:,.2f} · Status: {st}"
        return output.get("error", "Invoice not found")

    if tool_name == "issue_refund":
        if output.get("success"):
            r = output.get("refund", {})
            ref = r.get("refund_number", r.get("refund_id", ""))
            amt = float(r.get("amount", 0))
            return f"Refund {ref} approved for Rs.{amt:,.2f}. Credit processed."
        ref = output.get("refund_number", "")
        queued = output.get("queued_for_review", False)
        if queued and ref and ref.startswith("CASE-"):
            return f"Dispute flagged for fraud review (Case: {ref}). Routed to specialist queue."
        elif queued and ref:
            return f"Dispute exceeds approval threshold (Ref: {ref}). Queued for supervisor authorization."
        return output.get("error", "Refund request could not be processed automatically.")

    if tool_name == "pay_outstanding_balance":
        if output.get("success"):
            return output.get("summary", "Payment settled successfully")
        return f"Payment failed: {output.get('error', 'Unknown error')}"

    if tool_name == "get_claim_status":
        if output.get("found"):
            ref = output.get("reference", "")
            st = str(output.get("status", "unknown")).upper()
            return f"Claim Status {ref}: {st}"
        return output.get("message", "Claim not found")

    if tool_name == "get_policy_coverage":
        if output.get("found"):
            plan = output.get("plan", "Policy")
            passages = output.get("passages", [])
            if passages:
                titles = [p.get("title", "") for p in passages if p.get("title")][:2]
                titles_str = f" ({', '.join(titles)})" if titles else ""
                return f"Policy terms retrieved for {plan}: {len(passages)} clause(s) verified{titles_str}"
            return f"Coverage summary retrieved for plan: {plan}"
        return output.get("error", "Policy coverage lookup failed")

    if tool_name == "create_ticket":
        tid = output.get("ticket_id", "")
        return f"Ticket {tid} created successfully" if output.get("success") else "Ticket creation failed"

    if tool_name == "schedule_engineer":
        if output.get("success"):
            num = output.get("appointment_number", output.get("slot_id", ""))
            date = output.get("date", "")
            time = output.get("time", "")
            return f"Surveyor visit confirmed ({num}) for {date} at {time}."
        return output.get("confirmation", output.get("error", "Scheduling failed"))

    if tool_name == "get_payment_history":
        if output.get("found"):
            return output.get("summary", "Payment history records retrieved")
        return "No payment history found"

    if tool_name == "escalate_to_human":
        if output.get("success"):
            ref = output.get("appointment_number", "")
            return f"Escalation ticket {ref} created. Assigned to specialist queue."
        return output.get("error", "Escalation failed")

    if tool_name == "update_customer_details":
        return output.get("message", "Customer profile updated") if output.get("success") else output.get("error", "Update failed")

    return str(output)[:120]




class ToolOrchestrator:
    def __init__(self):
        self.registry = ToolRegistry()

    async def execute(self, session_id: str, conversation_id, tool_name: str, params: dict) -> dict:
        valid, err = self.registry.validate(tool_name, params)
        if not valid:
            logger.warning("Tool validation failed: %s — %s", tool_name, err)
            return {"status": "error", "output": {}, "summary": err}

        await event_bus.emit(session_id, ToolStartedEvent(
            session_id=session_id, tool_name=tool_name, input_params=params
        ))

        start = time.monotonic()
        try:
            output = await asyncio.wait_for(_dispatch(tool_name, params), timeout=TOOL_TIMEOUT_SEC)
            status = "success"
        except asyncio.TimeoutError:
            output = {"error": f"Tool {tool_name} timed out"}
            status = "timeout"
            logger.error("Tool %s timed out for session %s", tool_name, session_id)
        except Exception as exc:
            output = {"error": str(exc)}
            status = "failed"
            logger.error("Tool %s error for session %s: %s", tool_name, session_id, exc)

        duration_ms = int((time.monotonic() - start) * 1000)
        summary = _make_summary(tool_name, output)

        await event_bus.emit(session_id, ToolCompletedEvent(
            session_id=session_id,
            tool_name=tool_name,
            status=status,
            output=output,
            duration_ms=duration_ms,
            input_params=params,
        ))

        asyncio.create_task(self._persist(conversation_id, tool_name, params, output, status, duration_ms))

        return {"status": status, "output": output, "summary": summary}

    async def _persist(self, conversation_id, tool_name: str, params: dict, output: dict, status: str, duration_ms: int):
        try:
            async with async_session_factory() as db:
                record = ToolExecution(
                    conversation_id=conversation_id,
                    tool_name=tool_name,
                    input_params=params,
                    output=output,
                    status=status,
                    duration_ms=duration_ms,
                )
                db.add(record)
                await db.commit()
        except Exception as exc:
            logger.error("Failed to persist tool execution: %s", exc)
