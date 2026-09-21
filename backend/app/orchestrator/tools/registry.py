from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolSchema:
    name: str
    description: str
    params: dict[str, str]
    required_params: list[str]
    requires_auth: bool = False


_REGISTRY: dict[str, ToolSchema] = {
    "get_customer": ToolSchema(
        name="get_customer",
        description="Look up a customer by phone, email, or account_number",
        params={"customer_id": "str", "phone": "str", "email": "str", "account_number": "str"},
        required_params=[],
    ),
    "get_account": ToolSchema(
        name="get_account",
        description="Get account status, plan, and balance for a customer",
        params={"customer_id": "str"},
        required_params=["customer_id"],
    ),
    "get_invoice": ToolSchema(
        name="get_invoice",
        description="Get recent invoices for a customer",
        params={"customer_id": "str"},
        required_params=["customer_id"],
    ),
    "get_invoice_detail": ToolSchema(
        name="get_invoice_detail",
        description="Get full detail of a specific invoice including all line items. Use invoice_id (UUID) or invoice_number.",
        params={"invoice_id": "str"},
        required_params=["invoice_id"],
    ),
    "issue_refund": ToolSchema(
        name="issue_refund",
        description=(
            "Issue a refund for a billing invoice. Use after validating the customer's claim. "
            "Accepts invoice_id (UUID) or invoice_number (e.g. INV-2026-SROVER-01). "
            "For overcharge: specify the overcharged amount. "
            "For accidental overpayment: specify the excess amount (amount_paid minus invoice total)."
        ),
        params={"invoice_id": "str", "invoice_number": "str", "amount": "float", "reason": "str"},
        required_params=["amount", "reason"],  # invoice_id OR invoice_number accepted; executor normalizes
        requires_auth=True,
    ),
    "get_claim_status": ToolSchema(
        name="get_claim_status",
        description="Look up the status of a claim, refund, or investigation by reference number",
        params={"reference_number": "str", "customer_id": "str"},
        required_params=["reference_number"],
    ),
    "get_policy_coverage": ToolSchema(
        name="get_policy_coverage",
        description="Search and get the insurance policy knowledge base for coverage details, inclusions, exclusions, deductibles, waiting periods, and claim limits for a customer's active plan. Use the customer's exact question as the query parameter.",
        params={"customer_id": "str", "plan": "str", "query": "str"},
        required_params=["customer_id"],
    ),
    "create_ticket": ToolSchema(
        name="create_ticket",
        description="Create a technical support ticket",
        params={"customer_id": "str", "issue_type": "str", "description": "str", "priority": "str"},
        required_params=["customer_id", "issue_type"],
    ),
    "schedule_engineer": ToolSchema(
        name="schedule_engineer",
        description="Schedule a field engineer visit for the customer",
        params={"customer_id": "str", "preferred_date": "str", "issue_type": "str"},
        required_params=["customer_id"],
    ),
    "get_payment_history": ToolSchema(
        name="get_payment_history",
        description="Get full payment transaction history for a customer including paid_at, late fees, and receipt details",
        params={"customer_id": "str"},
        required_params=["customer_id"],
    ),
    "escalate_to_human": ToolSchema(
        name="escalate_to_human",
        description="Connect the customer to a human agent and create a scheduling appointment",
        params={"customer_id": "str", "reason": "str", "sentiment": "str"},
        required_params=["customer_id"],
    ),
    "pay_outstanding_balance": ToolSchema(
        name="pay_outstanding_balance",
        description="Pay outstanding balance from the customer's available account balance",
        params={"customer_id": "str", "amount": "float"},
        required_params=["customer_id", "amount"],
        requires_auth=True,
    ),

    "update_customer_details": ToolSchema(
        name="update_customer_details",
        description="Update customer profile details like email, phone, plan, or address",
        params={
            "customer_id": "str",
            "email": "str",
            "phone": "str",
            "plan": "str",
            "address_line1": "str",
            "city": "str",
        },
        required_params=["customer_id"],
    ),
}




class ToolRegistry:
    def get(self, name: str) -> ToolSchema | None:
        return _REGISTRY.get(name)

    def list_tools(self) -> list[ToolSchema]:
        return list(_REGISTRY.values())

    def validate(self, name: str, params: dict) -> tuple[bool, str]:
        schema = self.get(name)
        if not schema:
            return False, f"Unknown tool: {name}"
        missing = [p for p in schema.required_params if p not in params or params[p] is None]
        if missing:
            return False, f"Tool {name} missing required params: {missing}"
        # Special check: issue_refund requires at least one invoice reference
        if name == "issue_refund":
            if not params.get("invoice_id") and not params.get("invoice_number"):
                return False, "Tool issue_refund requires either invoice_id or invoice_number"
        return True, ""
