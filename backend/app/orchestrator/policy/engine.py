import logging
import uuid
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.execution import PolicyDecision as PolicyDecisionModel
from app.api.websocket.events import PolicyDecisionEvent
from app.observability.bus import event_bus

logger = logging.getLogger(__name__)

REFUND_LIMIT_INR = 5000.0
CANCELLATION_NOTICE_DAYS = 30


@dataclass
class PolicyResult:
    authorized: bool
    policy_name: str
    action_proposed: str
    reason: str


class PolicyEngine:
    def evaluate_refund(self, amount: float, invoice_amount: float, customer_tenure_days: int = 365) -> PolicyResult:
        action = f"issue_refund amount={amount}"

        if amount <= 0:
            return PolicyResult(False, "refund_positive_amount", action, "Refund amount must be positive")

        if amount > invoice_amount:
            return PolicyResult(False, "refund_within_invoice", action, f"Refund {amount} exceeds invoice total {invoice_amount}")

        if amount > REFUND_LIMIT_INR:
            return PolicyResult(
                False,
                "refund_limit",
                action,
                f"Refund of INR {amount} exceeds agent limit of INR {REFUND_LIMIT_INR}. Requires supervisor approval.",
            )

        return PolicyResult(True, "refund_limit", action, f"Refund of INR {amount} is within authorized limit")

    def evaluate_cancellation(self, notice_days: int, in_contract: bool, tenure_days: int) -> PolicyResult:
        action = "process_cancellation"

        if in_contract and notice_days < CANCELLATION_NOTICE_DAYS:
            return PolicyResult(
                False,
                "cancellation_notice",
                action,
                f"Cancellation requires {CANCELLATION_NOTICE_DAYS} days notice. Customer provided {notice_days} days.",
            )

        return PolicyResult(True, "cancellation_notice", action, "Cancellation request meets policy requirements")

    def evaluate_plan_change(self, current_plan: str, requested_plan: str, changes_this_cycle: int) -> PolicyResult:
        action = f"change_plan to={requested_plan}"

        if changes_this_cycle >= 2:
            return PolicyResult(
                False,
                "plan_change_limit",
                action,
                "Maximum 2 plan changes per billing cycle reached",
            )

        return PolicyResult(True, "plan_change_limit", action, "Plan change authorized")

    def evaluate_tool_use(self, tool_name: str, customer_verified: bool) -> PolicyResult:
        action = f"use_tool name={tool_name}"
        sensitive_tools = {"issue_refund", "schedule_engineer", "get_invoice_detail"}

        if tool_name in sensitive_tools and not customer_verified:
            return PolicyResult(
                False,
                "identity_verification",
                action,
                f"Tool '{tool_name}' requires verified customer identity",
            )

        return PolicyResult(True, "identity_verification", action, "Tool access authorized")

    async def emit_and_persist(
        self,
        session_id: str,
        conversation_id,
        result: PolicyResult,
        db: AsyncSession,
    ) -> None:
        try:
            record = PolicyDecisionModel(
                conversation_id=conversation_id,
                policy_name=result.policy_name,
                action_proposed=result.action_proposed,
                authorized=result.authorized,
                reason=result.reason,
            )
            db.add(record)
            await db.commit()
        except Exception as exc:
            logger.error("Policy persist error: %s", exc)

        await event_bus.emit(session_id, PolicyDecisionEvent(
            session_id=session_id,
            policy_name=result.policy_name,
            action_proposed=result.action_proposed,
            authorized=result.authorized,
            reason=result.reason,
        ))
