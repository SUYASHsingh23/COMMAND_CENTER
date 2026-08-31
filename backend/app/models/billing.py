import uuid
from datetime import datetime, date
from typing import Optional
from decimal import Decimal
from sqlalchemy import (
    String, DateTime, Date, Boolean, Text, Integer, Numeric,
    func, ForeignKey, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.session import Base


class BillingPlan(Base):
    """Reusable plan catalogue — domain-agnostic."""
    __tablename__ = "billing_plan"

    plan_id:             Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_code:           Mapped[str]          = mapped_column(String(40), unique=True, nullable=False)
    name:                Mapped[str]          = mapped_column(String(120), nullable=False)
    description:         Mapped[str | None]   = mapped_column(Text)
    category:            Mapped[str]          = mapped_column(String(40), default="general")
    subcategory:         Mapped[str | None]   = mapped_column(String(40))
    base_amount:         Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    billing_cycle:       Mapped[str]          = mapped_column(String(20), default="monthly")
    currency:            Mapped[str]          = mapped_column(String(5), default="INR")
    tax_rate_pct:        Mapped[Decimal]      = mapped_column(Numeric(5, 2), default=18)
    setup_fee:           Mapped[Decimal]      = mapped_column(Numeric(10, 2), default=0)
    data_cap_gb:         Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    speed_mbps:          Mapped[int | None]   = mapped_column(Integer)
    min_contract_months: Mapped[int]          = mapped_column(Integer, default=0)
    trial_days:          Mapped[int]          = mapped_column(Integer, default=0)
    is_active:           Mapped[bool]         = mapped_column(Boolean, default=True)
    sort_order:          Mapped[int]          = mapped_column(Integer, default=0)
    tags:                Mapped[list]         = mapped_column(JSONB, default=list)
    custom_fields:       Mapped[dict]         = mapped_column(JSONB, default=dict)
    created_at:          Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:          Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())


class Invoice(Base):
    """One invoice per billing cycle per account."""
    __tablename__ = "invoice"

    invoice_id:           Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id:          Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    account_id:           Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("account.account_id", ondelete="SET NULL"))
    invoice_number:       Mapped[str]          = mapped_column(String(40), unique=True, nullable=False)
    status:               Mapped[str]          = mapped_column(String(20), default="sent")

    billing_period_start: Mapped[date | None]  = mapped_column(Date)
    billing_period_end:   Mapped[date | None]  = mapped_column(Date)
    due_date:             Mapped[date]         = mapped_column(Date, nullable=False)
    issue_date:           Mapped[date | None]  = mapped_column(Date)

    # Amounts
    subtotal:             Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    discount_amount:      Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    taxable_amount:       Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    cgst_amount:          Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    sgst_amount:          Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    igst_amount:          Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    other_tax_amount:     Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    tax_amount:           Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    total_amount:         Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    amount_paid:          Mapped[Decimal]      = mapped_column(Numeric(12, 2), default=0)
    currency:             Mapped[str]          = mapped_column(String(5), default="INR")

    line_items:           Mapped[list]         = mapped_column(JSONB, default=list)

    # Delivery
    sent_via:             Mapped[str]          = mapped_column(String(20), default="email")
    sent_at:              Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    viewed_at:            Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at:              Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # References
    previous_invoice_id:  Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoice.invoice_id", ondelete="SET NULL"))
    dispute_reason:       Mapped[str | None]  = mapped_column(Text)
    internal_notes:       Mapped[str | None]  = mapped_column(Text)
    customer_notes:       Mapped[str | None]  = mapped_column(Text)

    # Late fees
    late_fee_applied:     Mapped[bool]         = mapped_column(Boolean, default=False)
    late_fee_amount:      Mapped[Decimal]      = mapped_column(Numeric(10, 2), default=0)
    late_fee_date:        Mapped[date | None]  = mapped_column(Date)

    custom_fields:        Mapped[dict]         = mapped_column(JSONB, default=dict)
    created_at:           Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:           Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    customer:       Mapped["Customer"] = relationship("Customer")
    transactions:   Mapped[list["BillingTransaction"]] = relationship("BillingTransaction", back_populates="invoice")
    refund_requests:Mapped[list["RefundRequest"]] = relationship("RefundRequest", back_populates="invoice")


class BillingTransaction(Base):
    """Every financial movement — payment, refund, credit, penalty, etc."""
    __tablename__ = "billing_transaction"

    transaction_id:       Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id:          Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    account_id:           Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("account.account_id", ondelete="SET NULL"))
    invoice_id:           Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoice.invoice_id", ondelete="SET NULL"))

    # Classification
    transaction_type:     Mapped[str]          = mapped_column(String(20), nullable=False)
    transaction_sub_type: Mapped[str | None]   = mapped_column(String(30))
    amount:               Mapped[Decimal]      = mapped_column(Numeric(12, 2), nullable=False)
    currency:             Mapped[str]          = mapped_column(String(5), default="INR")

    # Status
    status:               Mapped[str]          = mapped_column(String(20), default="pending")
    status_reason:        Mapped[str | None]   = mapped_column(Text)

    # Payment details
    payment_method:       Mapped[str | None]   = mapped_column(String(40))
    payment_method_detail:Mapped[str | None]   = mapped_column(String(60))
    payment_gateway:      Mapped[str | None]   = mapped_column(String(40))
    gateway_ref:          Mapped[str | None]   = mapped_column(String(80))
    bank_ref:             Mapped[str | None]   = mapped_column(String(80))
    upi_txn_id:           Mapped[str | None]   = mapped_column(String(80))
    auth_code:            Mapped[str | None]   = mapped_column(String(30))

    # Failure
    failure_code:         Mapped[str | None]   = mapped_column(String(20))
    failure_reason:       Mapped[str | None]   = mapped_column(Text)
    retry_count:          Mapped[int]          = mapped_column(Integer, default=0)
    next_retry_at:        Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Accounting
    gl_code:              Mapped[str | None]   = mapped_column(String(20))
    cost_center:          Mapped[str | None]   = mapped_column(String(40))
    tax_collected:        Mapped[Decimal]      = mapped_column(Numeric(10, 2), default=0)
    net_amount:           Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    gateway_fee:          Mapped[Decimal]      = mapped_column(Numeric(10, 2), default=0)

    # Traceability
    initiated_by:         Mapped[str]          = mapped_column(String(20), default="system")
    agent_id:             Mapped[str | None]   = mapped_column(String(80))
    ip_address:           Mapped[str | None]   = mapped_column(String(45))
    device_fingerprint:   Mapped[str | None]   = mapped_column(String(80))

    receipt_url:          Mapped[str | None]   = mapped_column(Text)
    txn_metadata:         Mapped[dict]         = mapped_column("metadata", JSONB, default=dict)
    created_at:           Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    settled_at:           Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at:           Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer")
    invoice:  Mapped["Invoice | None"] = relationship("Invoice", back_populates="transactions")


class RefundRequest(Base):
    """Refund lifecycle with AI-agent threshold gate and supervisor escalation."""
    __tablename__ = "refund_request"

    refund_id:           Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    refund_number:       Mapped[str | None]   = mapped_column(String(40), unique=True)
    customer_id:         Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    account_id:          Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("account.account_id", ondelete="SET NULL"))
    transaction_id:      Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("billing_transaction.transaction_id", ondelete="SET NULL"))
    invoice_id:          Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoice.invoice_id", ondelete="SET NULL"))

    # Amounts
    requested_amount:    Mapped[Decimal]      = mapped_column(Numeric(12, 2), nullable=False)
    approved_amount:     Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency:            Mapped[str]          = mapped_column(String(5), default="INR")

    # Reason
    reason:              Mapped[str]          = mapped_column(String(60), nullable=False)
    reason_detail:       Mapped[str | None]   = mapped_column(Text)
    supporting_docs:     Mapped[list]         = mapped_column(JSONB, default=list)

    # Status
    status:              Mapped[str]          = mapped_column(String(20), default="pending")
    priority:            Mapped[str]          = mapped_column(String(10), default="medium")

    # Threshold gate
    threshold_exceeded:  Mapped[bool]         = mapped_column(Boolean, default=False)
    threshold_amount:    Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    auto_processed:      Mapped[bool]         = mapped_column(Boolean, default=False)

    # Requestor
    requested_by:        Mapped[str]          = mapped_column(String(20), default="agent")
    requesting_agent_id: Mapped[str | None]   = mapped_column(String(80))
    customer_consent:    Mapped[bool]         = mapped_column(Boolean, default=False)

    # Reviewer
    reviewed_by:         Mapped[str | None]   = mapped_column(String(80))
    review_notes:        Mapped[str | None]   = mapped_column(Text)
    rejection_reason:    Mapped[str | None]   = mapped_column(Text)
    escalation_reason:   Mapped[str | None]   = mapped_column(Text)

    # Refund delivery
    refund_mode:         Mapped[str | None]   = mapped_column(String(40))
    refund_bank_account: Mapped[str | None]   = mapped_column(String(80))
    refund_upi_id:       Mapped[str | None]   = mapped_column(String(80))

    # SLA
    sla_deadline:        Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sla_breached:        Mapped[bool]          = mapped_column(Boolean, default=False)

    # Timestamps
    created_at:          Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at:         Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    processed_at:        Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at:        Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at:          Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    custom_fields:       Mapped[dict]         = mapped_column(JSONB, default=dict)

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer")
    invoice:  Mapped["Invoice | None"] = relationship("Invoice", back_populates="refund_requests")


class BillingAlert(Base):
    """Notification feed for agents and supervisors."""
    __tablename__ = "billing_alert"

    alert_id:    Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"))
    alert_type:  Mapped[str]          = mapped_column(String(50), nullable=False)
    severity:    Mapped[str]          = mapped_column(String(10), default="info")
    title:       Mapped[str | None]   = mapped_column(String(120))
    message:     Mapped[str]          = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None]   = mapped_column(String(20))
    entity_id:   Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_read:     Mapped[bool]         = mapped_column(Boolean, default=False)
    read_by:     Mapped[str | None]   = mapped_column(String(80))
    read_at:     Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    action_url:  Mapped[str | None]   = mapped_column(Text)
    alert_metadata: Mapped[dict]       = mapped_column("metadata", JSONB, default=dict)
    created_at:  Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
