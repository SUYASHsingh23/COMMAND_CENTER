"""
Pydantic schemas for the Billing System API.
All responses are safe for JSON serialization.
"""
from __future__ import annotations
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Optional
from pydantic import BaseModel, Field, UUID4


# ─── Billing Plan ─────────────────────────────────────────────────────────────

class BillingPlanOut(BaseModel):
    plan_id: UUID4
    plan_code: str
    name: str
    description: Optional[str]
    category: str
    subcategory: Optional[str]
    base_amount: Decimal
    billing_cycle: str
    currency: str
    tax_rate_pct: Decimal
    setup_fee: Decimal
    data_cap_gb: Optional[Decimal]
    speed_mbps: Optional[int]
    min_contract_months: int
    trial_days: int
    is_active: bool
    tags: list[str]
    custom_fields: dict[str, Any]

    class Config:
        from_attributes = True


# ─── Invoice Line Item ─────────────────────────────────────────────────────────

class LineItem(BaseModel):
    description: str
    plan_code: Optional[str] = None
    quantity: float = 1
    unit_price: Decimal
    discount: Decimal = Decimal("0")
    tax_pct: Decimal = Decimal("0")
    amount: Decimal


# ─── Invoice ──────────────────────────────────────────────────────────────────

class InvoiceOut(BaseModel):
    invoice_id: UUID4
    customer_id: UUID4
    account_id: Optional[UUID4]
    invoice_number: str
    status: str
    billing_period_start: Optional[date]
    billing_period_end: Optional[date]
    due_date: date
    issue_date: Optional[date]
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    outstanding_amount: Optional[Decimal] = None
    currency: str
    line_items: list[Any]
    sent_via: str
    sent_at: Optional[datetime]
    paid_at: Optional[datetime]
    late_fee_applied: bool
    late_fee_amount: Decimal
    internal_notes: Optional[str]
    customer_notes: Optional[str]
    custom_fields: dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


class InvoiceSummary(BaseModel):
    """Compact view for list endpoints."""
    invoice_id: UUID4
    invoice_number: str
    status: str
    total_amount: Decimal
    amount_paid: Decimal
    outstanding_amount: Optional[Decimal] = None
    due_date: date
    billing_period_start: Optional[date]
    billing_period_end: Optional[date]
    paid_at: Optional[datetime]
    late_fee_applied: bool

    class Config:
        from_attributes = True


# ─── Billing Transaction ───────────────────────────────────────────────────────

class TransactionOut(BaseModel):
    transaction_id: UUID4
    customer_id: UUID4
    invoice_id: Optional[UUID4]
    transaction_type: str
    transaction_sub_type: Optional[str]
    amount: Decimal
    currency: str
    status: str
    status_reason: Optional[str]
    payment_method: Optional[str]
    payment_method_detail: Optional[str]
    payment_gateway: Optional[str]
    gateway_ref: Optional[str]
    bank_ref: Optional[str]
    upi_txn_id: Optional[str]
    auth_code: Optional[str]
    failure_code: Optional[str]
    failure_reason: Optional[str]
    retry_count: int
    net_amount: Optional[Decimal]
    gateway_fee: Decimal
    tax_collected: Decimal
    gl_code: Optional[str]
    initiated_by: str
    agent_id: Optional[str]
    receipt_url: Optional[str]
    metadata: dict[str, Any] = Field(validation_alias="txn_metadata", default_factory=dict)
    created_at: datetime
    settled_at: Optional[datetime]

    class Config:
        from_attributes = True


# ─── Refund Request ───────────────────────────────────────────────────────────

class RefundCreate(BaseModel):
    customer_id: UUID4
    account_id: Optional[UUID4] = None
    transaction_id: Optional[UUID4] = None
    invoice_id: Optional[UUID4] = None
    requested_amount: Decimal = Field(gt=0)
    reason: str
    reason_detail: Optional[str] = None
    requested_by: str = "agent"
    requesting_agent_id: Optional[str] = None
    customer_consent: bool = False
    refund_mode: Optional[str] = "original_source"
    refund_upi_id: Optional[str] = None
    priority: str = "medium"


class RefundReview(BaseModel):
    """Supervisor approve / reject."""
    status: str                   # approved / rejected / escalated
    approved_amount: Optional[Decimal] = None
    review_notes: Optional[str] = None
    rejection_reason: Optional[str] = None
    reviewed_by: str = "supervisor"
    refund_mode: Optional[str] = None


class RefundOut(BaseModel):
    refund_id: UUID4
    refund_number: Optional[str]
    customer_id: UUID4
    account_id: Optional[UUID4]
    transaction_id: Optional[UUID4]
    invoice_id: Optional[UUID4]
    requested_amount: Decimal
    approved_amount: Optional[Decimal]
    currency: str
    reason: str
    reason_detail: Optional[str]
    status: str
    priority: str
    threshold_exceeded: bool
    threshold_amount: Optional[Decimal]
    auto_processed: bool
    requested_by: str
    requesting_agent_id: Optional[str]
    reviewed_by: Optional[str]
    review_notes: Optional[str]
    rejection_reason: Optional[str]
    refund_mode: Optional[str]
    sla_deadline: Optional[datetime]
    sla_breached: bool
    created_at: datetime
    reviewed_at: Optional[datetime]
    processed_at: Optional[datetime]
    custom_fields: dict[str, Any]

    class Config:
        from_attributes = True


# ─── Billing Alert ────────────────────────────────────────────────────────────

class BillingAlertOut(BaseModel):
    alert_id: UUID4
    customer_id: Optional[UUID4]
    alert_type: str
    severity: str
    title: Optional[str]
    message: str
    entity_type: Optional[str]
    entity_id: Optional[UUID4]
    is_read: bool
    action_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ─── Billing Summary ──────────────────────────────────────────────────────────

class BillingSummary(BaseModel):
    """Full billing snapshot for a customer — shown at the top of the Billing Dashboard."""
    customer_id: UUID4
    customer_name: str
    account_number: Optional[str]
    customer_tier: str

    # Active plan
    active_plan: Optional[str]
    plan_status: str
    billing_cycle: str
    plan_start_date: Optional[date]
    plan_end_date: Optional[date]
    auto_renew: bool
    next_due_date: Optional[date]
    days_until_due: Optional[int]

    # Financial position
    current_balance: Decimal
    credit_limit: Decimal
    credit_utilization_pct: Optional[float]
    outstanding_amount: Decimal          # sum of all unpaid invoices
    currency: str
    payment_method: str
    last_payment_amount: Optional[Decimal]
    last_payment_date: Optional[datetime]

    # Invoice stats
    total_invoices: int
    paid_invoices: int
    overdue_invoices: int
    partial_invoices: int

    # Transaction stats
    total_transactions: int
    successful_payments: int
    failed_payments: int
    total_refunds: int
    pending_refunds: int
    total_refund_amount: Decimal

    # Alerts
    unread_alerts: int
    critical_alerts: int
