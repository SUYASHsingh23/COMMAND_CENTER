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
        return await _billing.get_invoice_detail(invoice_id=params["invoice_id"])
    if tool_name == "issue_refund":
        return await _billing.issue_refund(
            invoice_id=params["invoice_id"],
            amount=float(params["amount"]),
            reason=params.get("reason", "Customer dispute"),
        )
    if tool_name == "pay_outstanding_balance":
        return await _billing.pay_outstanding_balance(
            customer_id=params["customer_id"],
            amount=float(params["amount"]),
        )

    if tool_name == "check_outage":
        return await _billing.check_outage(
            area_code=params.get("area_code"),
            customer_id=params.get("customer_id"),
        )
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
        return f"Customer: {c.get('name', 'Unknown')}, Plan: {c.get('plan', 'N/A')}" if output.get("found") else "Customer not found"
    if tool_name == "get_account":
        a = output.get("account", {})
        return f"Account status: {a.get('status', 'N/A')}, Balance: {a.get('balance', 0)}" if output.get("found") else "Account not found"
    if tool_name == "get_invoice":
        return f"{output.get('count', 0)} invoice(s) found" if output.get("found") else "No invoices found"
    if tool_name == "get_invoice_detail":
        inv = output.get("invoice", {})
        return f"Invoice {inv.get('invoice_id', '')}: {inv.get('amount', 0)} ({inv.get('status', 'N/A')})" if output.get("found") else "Invoice not found"
    if tool_name == "issue_refund":
        if output.get("success"):
            r = output.get("refund", {})
            return f"Refund {r.get('refund_number', r.get('refund_id', ''))} approved for Rs.{r.get('amount', 0)}"
        # Blocked — provide clean summary with reference ID if available
        ref = output.get("refund_number", "")
        queued = output.get("queued_for_review", False)
        is_investigation = ref and ref.startswith("CASE-")
        if queued and is_investigation:
            return (
                f"This refund request has been flagged for specialist investigation. "
                f"Case reference number: {ref}. "
                f"Inform the customer of their case reference number and that a specialist will contact them shortly."
            )
        elif queued:
            return (
                f"This refund request requires specialist review and has been queued. "
                f"Reference number: {ref}. "
                f"Inform the customer their request is under review with reference {ref}."
            )
        # Hard block (balance check, invoice mismatch, etc.) — do not expose reason
        return "Refund request could not be processed at this time. Please ask the customer to contact support."
    if tool_name == "pay_outstanding_balance":
        if output.get("success"):
            return output.get("summary", "Payment successful")
        return f"Payment failed: {output.get('error', 'Unknown error')}"
    if tool_name == "check_outage":
        return "Active outage detected" if output.get("has_outage") else "No active outages"
    if tool_name == "create_ticket":
        return f"Ticket {output.get('ticket_id', '')} created" if output.get("success") else "Ticket creation failed"
    if tool_name == "schedule_engineer":
        return output.get("confirmation", "Engineer scheduled") if output.get("success") else "Scheduling failed"
    if tool_name == "get_payment_history":
        if output.get("found"):
            return output.get("summary", "Payment history retrieved")
        return "No payment history found"
    if tool_name == "escalate_to_human":
        if output.get("success"):
            ref = output.get("appointment_number", "")
            return f"Human agent escalation created. Reference: {ref}"
        return output.get("error", "Escalation failed")
    if tool_name == "update_customer_details":
        return output.get("message", "Customer details updated") if output.get("success") else output.get("error", "Update failed")
    return str(output)[:100]




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
