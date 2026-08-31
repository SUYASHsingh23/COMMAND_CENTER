import asyncio
import logging
from app.orchestrator.planner.planner import AgentPlan, PlanStep
from app.orchestrator.tools.orchestrator import ToolOrchestrator

logger = logging.getLogger(__name__)

INDEPENDENT_TOOLS = {
    "check_outage",
    "get_customer",
    "get_account",
    "get_invoice",
}


def _can_run_parallel(steps: list[PlanStep]) -> bool:
    if len(steps) < 2:
        return False
    tool_names = {s.tool for s in steps}
    return tool_names.issubset(INDEPENDENT_TOOLS)


def _group_steps(steps: list[PlanStep]) -> list[list[PlanStep]]:
    groups: list[list[PlanStep]] = []
    current_parallel: list[PlanStep] = []

    for step in steps:
        if step.tool in INDEPENDENT_TOOLS:
            current_parallel.append(step)
        else:
            if current_parallel:
                groups.append(current_parallel)
                current_parallel = []
            groups.append([step])

    if current_parallel:
        groups.append(current_parallel)

    return groups


class PlanExecutor:
    def __init__(self, tool_orchestrator: ToolOrchestrator):
        self._tools = tool_orchestrator

    async def execute(self, plan: AgentPlan, session_id: str, conversation_id) -> list[dict]:
        if plan.direct_answer or not plan.steps:
            return []

        results: list[dict] = []
        resolved_context: dict[str, str] = {}

        groups = _group_steps(plan.steps)

        for group in groups:
            if len(group) == 1:
                result = await self._execute_step(group[0], session_id, conversation_id, resolved_context)
                results.append(result)
                self._update_context(resolved_context, result)
            else:
                logger.info(
                    "Parallel execution: [%s] session=%s",
                    ", ".join(s.tool for s in group),
                    session_id,
                )
                tasks = [
                    self._execute_step(step, session_id, conversation_id, resolved_context)
                    for step in group
                ]
                group_results = await asyncio.gather(*tasks, return_exceptions=False)
                for r in group_results:
                    results.append(r)
                    self._update_context(resolved_context, r)

        return results

    async def _execute_step(
        self,
        step: PlanStep,
        session_id: str,
        conversation_id,
        resolved_context: dict[str, str],
    ) -> dict:
        params = dict(step.params)

        if "customer_id" not in params or not params.get("customer_id"):
            if "customer_id" in resolved_context:
                params["customer_id"] = resolved_context["customer_id"]
            else:
                params["customer_id"] = "c001"

        if not params.get("account_number") and "account_number" in resolved_context:
            params["account_number"] = resolved_context["account_number"]

        if not params.get("invoice_id") and "invoice_id" in resolved_context:
            params["invoice_id"] = resolved_context["invoice_id"]

        if step.tool == "create_ticket":
            if "issue" in params and "issue_type" not in params:
                params["issue_type"] = params.pop("issue")
            params.setdefault("issue_type", "technical")

        elif step.tool == "issue_refund":
            params.setdefault("reason", "Customer billing dispute")
            if not params.get("invoice_id") and "invoice_id" in resolved_context:
                params["invoice_id"] = resolved_context["invoice_id"]

        elif step.tool == "check_outage":
            if "location" in params and "area_code" not in params:
                params["area_code"] = params.pop("location")

        elif step.tool == "escalate_to_human":
            # Inject runtime context that the planner cannot access
            params.setdefault("reason", "Customer requested human agent support")
            params["session_id"] = session_id
            params["conversation_id"] = str(conversation_id) if conversation_id else None
            # customer_profile and customer_context will be populated by the tool handler
            # via the session state; we pass None and let escalate_to_human_agent fetch it

        logger.info(

            "Executing step %d: tool=%s params=%s session=%s",
            step.step, step.tool, params, session_id,
        )

        result = await self._tools.execute(
            session_id=session_id,
            conversation_id=conversation_id,
            tool_name=step.tool,
            params=params,
        )

        if result.get("status") == "error":
            logger.warning("Tool %s failed at step %d — continuing plan", step.tool, step.step)

        return {
            "tool": step.tool,
            "step": step.step,
            "reason": step.reason,
            "status": result.get("status", "unknown"),
            "output": result.get("output", {}),
            "summary": result.get("summary", ""),
        }

    @staticmethod
    def _update_context(ctx: dict, result: dict) -> None:
        output = result.get("output", {})
        if not isinstance(output, dict):
            return
        cust = output.get("customer")
        if isinstance(cust, dict):
            if cust.get("customer_id"):
                ctx["customer_id"] = cust["customer_id"]
            if cust.get("account_number"):
                ctx["account_number"] = cust["account_number"]
        invoices = output.get("invoices")
        if isinstance(invoices, list) and invoices:
            first = invoices[0]
            if isinstance(first, dict) and first.get("invoice_id"):
                ctx["invoice_id"] = first["invoice_id"]
