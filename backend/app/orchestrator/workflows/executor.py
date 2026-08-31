import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Awaitable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.execution import WorkflowExecution
from app.api.websocket.events import WorkflowStepEvent
from app.observability.bus import event_bus
from app.database.session import async_session_factory

logger = logging.getLogger(__name__)


@dataclass
class WorkflowState:
    workflow_name: str
    session_id: str
    conversation_id: object
    steps_completed: list[str] = field(default_factory=list)
    context: dict = field(default_factory=dict)
    status: str = "running"


class WorkflowExecutor:
    async def run(
        self,
        workflow_name: str,
        session_id: str,
        conversation_id,
        context: dict,
    ) -> dict:
        state = WorkflowState(
            workflow_name=workflow_name,
            session_id=session_id,
            conversation_id=conversation_id,
            context=context,
        )

        async with async_session_factory() as db:
            wf_record = WorkflowExecution(
                conversation_id=conversation_id,
                workflow_name=workflow_name,
                state="running",
                steps_completed=[],
            )
            db.add(wf_record)
            await db.commit()
            await db.refresh(wf_record)

        try:
            if workflow_name == "refund_workflow":
                result = await self._refund_workflow(state)
            elif workflow_name == "cancellation_workflow":
                result = await self._cancellation_workflow(state)
            elif workflow_name == "upgrade_workflow":
                result = await self._upgrade_workflow(state)
            elif workflow_name == "technical_support_workflow":
                result = await self._technical_support_workflow(state)
            else:
                result = {"status": "error", "message": f"Unknown workflow: {workflow_name}"}

            state.status = "completed"
        except Exception as exc:
            logger.error("Workflow %s error: %s", workflow_name, exc)
            result = {"status": "error", "message": str(exc)}
            state.status = "failed"

        async with async_session_factory() as db:
            from sqlalchemy import select
            rec = await db.get(WorkflowExecution, wf_record.wf_exec_id)
            if rec:
                rec.state = state.status
                rec.steps_completed = state.steps_completed
                rec.completed_at = datetime.now(timezone.utc)
                await db.commit()

        return result

    async def _emit_step(self, state: WorkflowState, step_name: str, step_status: str) -> None:
        state.steps_completed.append(step_name)
        await event_bus.emit(state.session_id, WorkflowStepEvent(
            session_id=state.session_id,
            workflow_name=state.workflow_name,
            step_name=step_name,
            step_status=step_status,
            steps_completed=list(state.steps_completed),
        ))

    async def _refund_workflow(self, state: WorkflowState) -> dict:
        await self._emit_step(state, "verify_invoice", "completed")
        invoice_id = state.context.get("invoice_id")
        amount = state.context.get("amount", 0.0)

        if not invoice_id:
            await self._emit_step(state, "check_invoice_id", "failed")
            return {"status": "error", "message": "No invoice_id provided for refund workflow"}

        await self._emit_step(state, "policy_check", "completed")
        await self._emit_step(state, "process_refund", "completed")
        await self._emit_step(state, "notify_customer", "completed")

        return {
            "status": "completed",
            "workflow": "refund_workflow",
            "invoice_id": invoice_id,
            "amount": amount,
            "steps": state.steps_completed,
            "message": f"Refund of INR {amount} for invoice {invoice_id} processed successfully",
        }

    async def _cancellation_workflow(self, state: WorkflowState) -> dict:
        await self._emit_step(state, "verify_account", "completed")
        await self._emit_step(state, "check_contract_status", "completed")

        in_contract = state.context.get("in_contract", False)
        if in_contract:
            await self._emit_step(state, "calculate_etf", "completed")
            etf = 2000.0
            return {
                "status": "requires_confirmation",
                "workflow": "cancellation_workflow",
                "early_termination_fee": etf,
                "message": f"Early termination fee of INR {etf} applies. Please confirm to proceed.",
                "steps": state.steps_completed,
            }

        await self._emit_step(state, "schedule_cancellation", "completed")
        await self._emit_step(state, "send_confirmation", "completed")

        return {
            "status": "completed",
            "workflow": "cancellation_workflow",
            "notice_period_days": 30,
            "message": "Cancellation scheduled. Service will end in 30 days.",
            "steps": state.steps_completed,
        }

    async def _upgrade_workflow(self, state: WorkflowState) -> dict:
        await self._emit_step(state, "verify_eligibility", "completed")
        target_plan = state.context.get("target_plan", "Unknown Plan")
        await self._emit_step(state, "calculate_proration", "completed")
        await self._emit_step(state, "apply_plan_change", "completed")
        await self._emit_step(state, "send_confirmation", "completed")

        return {
            "status": "completed",
            "workflow": "upgrade_workflow",
            "new_plan": target_plan,
            "effective": "within 2 hours",
            "message": f"Plan upgraded to {target_plan}. Takes effect within 2 hours.",
            "steps": state.steps_completed,
        }

    async def _technical_support_workflow(self, state: WorkflowState) -> dict:
        await self._emit_step(state, "check_outage", "completed")
        issue_type = state.context.get("issue_type", "general")

        if state.context.get("outage_detected"):
            await self._emit_step(state, "log_outage_complaint", "completed")
            return {
                "status": "completed",
                "workflow": "technical_support_workflow",
                "resolution": "outage_acknowledged",
                "message": "Active outage detected in your area. Expected resolution in 4 hours. Credit will be applied.",
                "steps": state.steps_completed,
            }

        await self._emit_step(state, "remote_diagnostics", "completed")
        await self._emit_step(state, "create_ticket", "completed")

        return {
            "status": "completed",
            "workflow": "technical_support_workflow",
            "resolution": "ticket_created",
            "issue_type": issue_type,
            "message": "Support ticket created. A technician will contact you within 4 hours.",
            "steps": state.steps_completed,
        }
