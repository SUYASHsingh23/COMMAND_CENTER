"""
Billing System API — all endpoints under /api/v1/billing/
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import async_session_factory
from app.core.config import get_settings
from app.models.customer import Customer, Account
from app.models.billing import (
    Invoice, BillingTransaction, RefundRequest,
    BillingAlert, BillingPlan,
)
from app.api.v1.schemas.billing import (
    InvoiceOut, InvoiceSummary, TransactionOut,
    RefundCreate, RefundReview, RefundOut,
    BillingAlertOut, BillingSummary,
)
from app.observability.bus import event_bus
from app.api.websocket.events import CustomerUpdatedEvent, InvoiceUpdatedEvent

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])
settings = get_settings()


# ─── Dependency ───────────────────────────────────────────────────────────────

async def get_db():
    async with async_session_factory() as session:
        yield session


# ─── Helper: compute billing summary ─────────────────────────────────────────

async def _compute_summary(customer_id: uuid.UUID, db: AsyncSession) -> BillingSummary:
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Primary account
    acct_row = await db.execute(
        select(Account).where(Account.customer_id == customer_id).order_by(Account.account_id).limit(1)
    )
    acct: Account | None = acct_row.scalar_one_or_none()

    # Invoice stats
    inv_stats = await db.execute(
        select(
            func.count(Invoice.invoice_id).label("total"),
            func.sum(case((Invoice.status == "paid", 1), else_=0)).label("paid"),
            func.sum(case((Invoice.status == "overdue", 1), else_=0)).label("overdue"),
            func.sum(case((Invoice.status == "partial", 1), else_=0)).label("partial"),
            func.coalesce(func.sum(
                case((Invoice.status.in_(["sent", "overdue", "partial"]),
                           Invoice.total_amount - Invoice.amount_paid), else_=0)
            ), 0).label("outstanding"),
        ).where(Invoice.customer_id == customer_id)
    )
    is_ = inv_stats.one()

    # Transaction stats
    txn_stats = await db.execute(
        select(
            func.count(BillingTransaction.transaction_id).label("total"),
            func.sum(case((and_(BillingTransaction.status == "success",
                                     BillingTransaction.transaction_type == "payment"), 1), else_=0)).label("paid_ok"),
            func.sum(case((BillingTransaction.status == "failed", 1), else_=0)).label("failed"),
            func.sum(case((BillingTransaction.transaction_type == "refund", 1), else_=0)).label("refunds"),
            func.coalesce(func.sum(
                case((BillingTransaction.transaction_type == "refund", BillingTransaction.amount), else_=0)
            ), 0).label("refund_amt"),
        ).where(BillingTransaction.customer_id == customer_id)
    )
    ts_ = txn_stats.one()

    # Last payment
    last_pay = await db.execute(
        select(BillingTransaction).where(
            and_(BillingTransaction.customer_id == customer_id,
                 BillingTransaction.transaction_type == "payment",
                 BillingTransaction.status == "success")
        ).order_by(BillingTransaction.created_at.desc()).limit(1)
    )
    lp = last_pay.scalar_one_or_none()

    # Pending refunds
    pending_ref = await db.scalar(
        select(func.count(RefundRequest.refund_id)).where(
            and_(RefundRequest.customer_id == customer_id,
                 RefundRequest.status.in_(["pending", "under_review"]))
        )
    ) or 0

    # Alerts
    alert_counts = await db.execute(
        select(
            func.count(BillingAlert.alert_id).label("total"),
            func.sum(case((BillingAlert.severity == "critical", 1), else_=0)).label("critical"),
        ).where(
            and_(BillingAlert.customer_id == customer_id, BillingAlert.is_read == False)
        )
    )
    ac_ = alert_counts.one()

    # Next due date (earliest unpaid invoice)
    next_due_row = await db.execute(
        select(Invoice.due_date).where(
            and_(Invoice.customer_id == customer_id,
                 Invoice.status.in_(["sent", "overdue", "partial"]))
        ).order_by(Invoice.due_date).limit(1)
    )
    next_due: date | None = next_due_row.scalar_one_or_none()

    today = date.today()
    days_until_due = (next_due - today).days if next_due else None

    credit_util = None
    if acct and acct.credit_limit and float(acct.credit_limit) > 0:
        bal = float(acct.balance or 0)
        limit = float(acct.credit_limit)
        credit_util = round((bal / limit) * 100, 1)

    return BillingSummary(
        customer_id=customer.customer_id,
        customer_name=customer.name,
        account_number=customer.account_number,
        customer_tier=customer.customer_tier,
        active_plan=acct.plan_name if acct else customer.plan,
        plan_status=acct.status if acct else "unknown",
        billing_cycle=acct.billing_cycle if acct else "monthly",
        plan_start_date=acct.plan_start_date if acct else None,
        plan_end_date=acct.plan_end_date if acct else None,
        auto_renew=acct.auto_renew if acct else True,
        next_due_date=next_due,
        days_until_due=days_until_due,
        current_balance=Decimal(str(acct.balance)) if acct else Decimal("0"),
        credit_limit=Decimal(str(acct.credit_limit)) if acct else Decimal("0"),
        credit_utilization_pct=credit_util,
        outstanding_amount=Decimal(str(is_.outstanding or 0)),
        currency="INR",
        payment_method=acct.payment_method if acct else "UPI",
        last_payment_amount=Decimal(str(lp.amount)) if lp else None,
        last_payment_date=lp.created_at if lp else None,
        total_invoices=int(is_.total or 0),
        paid_invoices=int(is_.paid or 0),
        overdue_invoices=int(is_.overdue or 0),
        partial_invoices=int(is_.partial or 0),
        total_transactions=int(ts_.total or 0),
        successful_payments=int(ts_.paid_ok or 0),
        failed_payments=int(ts_.failed or 0),
        total_refunds=int(ts_.refunds or 0),
        pending_refunds=pending_ref,
        total_refund_amount=Decimal(str(ts_.refund_amt or 0)),
        unread_alerts=int(ac_.total or 0),
        critical_alerts=int(ac_.critical or 0),
    )


# ─── Billing Summary ──────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/summary", response_model=BillingSummary)
async def get_billing_summary(customer_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Full billing snapshot for the dashboard header card."""
    return await _compute_summary(customer_id, db)


# ─── Customer List (billing view) ─────────────────────────────────────────────

@router.get("/customers")
async def list_billing_customers(
    q: str = Query("", description="Search name / phone / email / account number"),
    tier: str = Query("", description="Filter by customer_tier"),
    status: str = Query("", description="Filter by account status"),
    has_overdue: bool = Query(False),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Customer)
    filters = []
    if q:
        like = f"%{q}%"
        filters.append(or_(
            Customer.name.ilike(like),
            Customer.phone.ilike(like),
            Customer.email.ilike(like),
            Customer.account_number.ilike(like),
        ))
    if tier:
        filters.append(Customer.customer_tier == tier)
    if filters:
        stmt = stmt.where(and_(*filters))
    stmt = stmt.order_by(Customer.name).limit(limit).offset(offset)

    rows = (await db.execute(stmt)).scalars().all()

    result = []
    for c in rows:
        # Quick overdue check
        overdue_count = 0
        if has_overdue:
            overdue_count = await db.scalar(
                select(func.count(Invoice.invoice_id)).where(
                    and_(Invoice.customer_id == c.customer_id, Invoice.status == "overdue")
                )
            ) or 0
            if overdue_count == 0:
                continue

        result.append({
            "customer_id": str(c.customer_id),
            "name": c.name,
            "phone": c.phone,
            "email": c.email,
            "account_number": c.account_number,
            "customer_tier": c.customer_tier,
            "last_contact_at": c.last_contact_at.isoformat() if c.last_contact_at else None,
        })
    return result


# ─── Invoices ─────────────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/invoices", response_model=list[InvoiceSummary])
async def list_invoices(
    customer_id: uuid.UUID,
    status: str = Query("", description="Filter by invoice status"),
    limit: int = Query(24, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Invoice).where(Invoice.customer_id == customer_id)
    if status:
        stmt = stmt.where(Invoice.status == status)
    stmt = stmt.order_by(Invoice.due_date.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()

    # Compute outstanding manually (generated column may not be loaded)
    out = []
    for inv in rows:
        inv_dict = InvoiceSummary.model_validate(inv)
        inv_dict.outstanding_amount = inv.total_amount - inv.amount_paid
        out.append(inv_dict)
    return out




@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    result = InvoiceOut.model_validate(inv)
    result.outstanding_amount = inv.total_amount - inv.amount_paid
    return result


# ─── Receipt (printable HTML) ─────────────────────────────────────────────────

@router.get("/receipts/{invoice_number}")
async def get_receipt(invoice_number: str, db: AsyncSession = Depends(get_db)):
    """
    Generate a printable HTML receipt for any invoice by invoice number.
    Opens in browser and can be downloaded / printed as PDF.
    """
    from fastapi.responses import HTMLResponse
    from sqlalchemy import select as sa_select

    stmt = sa_select(Invoice).where(Invoice.invoice_number == invoice_number)
    inv = (await db.execute(stmt)).scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_number!r} not found")

    # Fetch customer and account info
    customer = await db.get(Customer, inv.customer_id)
    acct_row = await db.execute(
        sa_select(Account).where(Account.customer_id == inv.customer_id).limit(1)
    )
    acct = acct_row.scalar_one_or_none()

    cust_name = customer.name if customer else "—"
    cust_phone = customer.phone if customer else "—"
    cust_email = customer.email if customer else "—"
    plan_name = acct.plan_name if acct else "Insurance Policy"
    acct_num = str(acct.account_id).split('-')[0].upper() if acct else "—"
    payment_method = acct.payment_method if acct else "—"

    status_color = {
        "paid": "#16a34a", "overdue": "#dc2626", "partial": "#d97706",
        "sent": "#2563eb", "cancelled": "#6b7280",
    }.get(inv.status, "#374151")

    period_str = ""
    if inv.billing_period_start and inv.billing_period_end:
        period_str = f"{inv.billing_period_start.strftime('%d %b %Y')} — {inv.billing_period_end.strftime('%d %b %Y')}"

    line_items_html = ""
    for li in (inv.line_items or []):
        desc = li.get("description", plan_name)
        qty = li.get("quantity", 1)
        unit = float(li.get("unit_price", inv.subtotal))
        disc = float(li.get("discount", 0))
        tax = li.get("tax_pct", "18")
        amt = float(li.get("amount", inv.subtotal))
        line_items_html += f"""
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">{desc}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">{qty}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">₹{unit:,.2f}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;color:#16a34a">{f'−₹{disc:,.2f}' if disc > 0 else '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">{tax}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600">₹{amt:,.2f}</td>
        </tr>"""

    paid_note = f"<p style='color:#16a34a;font-weight:600;margin:0'>✓ Paid on {inv.paid_at.strftime('%d %b %Y, %H:%M') if inv.paid_at else 'N/A'} via {payment_method}</p>" if inv.status == "paid" else ""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Receipt — {invoice_number}</title>
  <style>
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:'Segoe UI',Arial,sans-serif;background:#f8f9fb;color:#1a1a2e;padding:32px 16px}}
    .page{{max-width:720px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.10);overflow:hidden}}
    .header{{background:linear-gradient(135deg,#0f766e 0%,#0e9a90 100%);padding:28px 32px;color:#fff}}
    .logo{{font-size:22px;font-weight:800;letter-spacing:-0.02em;margin-bottom:4px}}
    .logo span{{color:#5eead4}}
    .tagline{{font-size:12px;opacity:0.8;letter-spacing:0.08em}}
    .invoice-badge{{display:inline-block;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:6px;padding:4px 12px;font-size:11px;font-weight:700;letter-spacing:0.06em;margin-top:16px}}
    .body{{padding:28px 32px}}
    .meta-grid{{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #eee}}
    .meta-section h3{{font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px}}
    .meta-section p{{font-size:13px;color:#374151;line-height:1.6}}
    .meta-section p strong{{color:#111827}}
    .status-chip{{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.04em;color:{status_color};background:{status_color}18;border:1px solid {status_color}40}}
    table{{width:100%;border-collapse:collapse;margin-bottom:20px}}
    thead tr{{background:#f9fafb}}
    thead th{{padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase;border-bottom:2px solid #e5e7eb}}
    thead th:not(:first-child){{text-align:right}}
    thead th:nth-child(2),thead th:nth-child(5){{text-align:center}}
    .totals{{margin-left:auto;width:280px}}
    .totals table{{margin-bottom:0}}
    .totals td{{padding:5px 0;font-size:13px;color:#374151}}
    .totals td:last-child{{text-align:right;font-weight:500}}
    .totals .grand td{{font-size:15px;font-weight:700;color:#111827;padding-top:8px;border-top:2px solid #e5e7eb}}
    .footer{{padding:20px 32px;background:#f9fafb;border-top:1px solid #eee;font-size:11px;color:#9ca3af;text-align:center;line-height:1.8}}
    @media print{{body{{background:#fff;padding:0}}.page{{box-shadow:none;border-radius:0}}button{{display:none}}}}
  </style>
</head>
<body>
  <div style="text-align:right;max-width:720px;margin:0 auto 12px;padding-right:4px">
    <button onclick="window.print()" style="padding:8px 20px;background:#0f766e;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:0.02em">
      ⬇ Download / Print PDF
    </button>
  </div>
  <div class="page">
    <div class="header">
      <div class="logo">Insure<span>AI</span></div>
      <div class="tagline">AI-POWERED INSURANCE COMMAND CENTER</div>
      <div class="invoice-badge">OFFICIAL RECEIPT · {invoice_number}</div>
    </div>

    <div class="body">
      <div class="meta-grid">
        <div class="meta-section">
          <h3>Billed To</h3>
          <p><strong>{cust_name}</strong><br/>
          Account: {acct_num}<br/>
          Phone: {cust_phone}<br/>
          Email: {cust_email}</p>
        </div>
        <div class="meta-section">
          <h3>Invoice Details</h3>
          <p>
            <strong>Invoice:</strong> {invoice_number}<br/>
            <strong>Issued:</strong> {inv.issue_date.strftime('%d %b %Y') if inv.issue_date else '—'}<br/>
            <strong>Due:</strong> {inv.due_date.strftime('%d %b %Y')}<br/>
            <strong>Period:</strong> {period_str or '—'}<br/>
            <strong>Status:</strong> <span class="status-chip">{inv.status.upper()}</span>
          </p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="text-align:left">Description</th>
            <th>Qty</th>
            <th style="text-align:right">Unit Price</th>
            <th style="text-align:right">Discount</th>
            <th>Tax</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>{line_items_html or f'<tr><td colspan="6" style="padding:12px;color:#6b7280;text-align:center">{plan_name} — Quarterly Premium</td></tr>'}</tbody>
      </table>

      <div class="totals">
        <table>
          <tr><td>Subtotal</td><td>₹{float(inv.subtotal):,.2f}</td></tr>
          <tr><td>Discount</td><td style="color:#16a34a">{'−₹' + f'{float(inv.discount_amount):,.2f}' if inv.discount_amount else '—'}</td></tr>
          <tr><td>CGST (9%)</td><td>₹{float(inv.cgst_amount):,.2f}</td></tr>
          <tr><td>SGST (9%)</td><td>₹{float(inv.sgst_amount):,.2f}</td></tr>
          {'<tr><td>IGST</td><td>₹' + f"{float(inv.igst_amount):,.2f}" + '</td></tr>' if inv.igst_amount else ''}
          {'<tr><td style="color:#f59e0b">Late Fee</td><td style="color:#f59e0b">₹' + f"{float(inv.late_fee_amount):,.2f}" + '</td></tr>' if inv.late_fee_applied else ''}
          <tr class="grand"><td>Total</td><td>₹{float(inv.total_amount):,.2f}</td></tr>
          <tr><td style="color:#16a34a">Amount Paid</td><td style="color:#16a34a">₹{float(inv.amount_paid):,.2f}</td></tr>
          {'<tr><td style="color:#dc2626">Outstanding</td><td style="color:#dc2626">₹' + f"{float(inv.total_amount - inv.amount_paid):,.2f}" + '</td></tr>' if inv.status != 'paid' else ''}
        </table>
      </div>

      <div style="margin-top:24px;padding:14px 18px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
        {paid_note or '<p style="color:#6b7280;font-size:13px">Payment pending — please pay by due date to avoid policy lapse.</p>'}
      </div>
    </div>

    <div class="footer">
      InsureAI Insurance Services Pvt. Ltd. · GSTIN: 27AABCI1234F1Z5 · CIN: U66000MH2020PTC345678<br/>
      Registered Office: 14th Floor, BKC Tower, Bandra Kurla Complex, Mumbai – 400 051<br/>
      This is a computer-generated receipt and does not require a signature. · support@insureai.in
    </div>
  </div>
</body>
</html>"""

    return HTMLResponse(content=html, status_code=200)


# ─── Transactions ─────────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/transactions", response_model=list[TransactionOut])
async def list_transactions(
    customer_id: uuid.UUID,
    txn_type: str = Query("", description="payment/refund/credit/debit/adjustment"),
    status: str = Query("", description="pending/success/failed/reversed"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(BillingTransaction).where(BillingTransaction.customer_id == customer_id)
    if txn_type:
        stmt = stmt.where(BillingTransaction.transaction_type == txn_type)
    if status:
        stmt = stmt.where(BillingTransaction.status == status)
    stmt = stmt.order_by(BillingTransaction.created_at.desc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [TransactionOut.model_validate(r) for r in rows]


# ─── Refund Requests ──────────────────────────────────────────────────────────

@router.post("/refunds", response_model=RefundOut, status_code=201)
async def create_refund(payload: RefundCreate, db: AsyncSession = Depends(get_db)):
    """
    Submit a refund request.
    - Amounts ≤ REFUND_THRESHOLD_AMOUNT → auto-approved, transaction created immediately.
    - Amounts >  REFUND_THRESHOLD_AMOUNT → routed to supervisor (status=under_review).
    """
    threshold = Decimal(str(settings.refund_threshold_amount))
    exceeds = payload.requested_amount > threshold

    # Sequence number for refund_number
    count = await db.scalar(select(func.count(RefundRequest.refund_id))) or 0
    refund_number = f"{settings.refund_number_prefix}-{date.today().year}-{count + 1:05d}"

    sla_deadline = datetime.utcnow() + timedelta(hours=settings.refund_sla_hours) if exceeds else None

    refund = RefundRequest(
        refund_number=refund_number,
        customer_id=payload.customer_id,
        account_id=payload.account_id,
        transaction_id=payload.transaction_id,
        invoice_id=payload.invoice_id,
        requested_amount=payload.requested_amount,
        currency=settings.refund_currency,
        reason=payload.reason,
        reason_detail=payload.reason_detail,
        requested_by=payload.requested_by,
        requesting_agent_id=payload.requesting_agent_id,
        customer_consent=payload.customer_consent,
        refund_mode=payload.refund_mode,
        refund_upi_id=payload.refund_upi_id,
        priority=payload.priority,
        threshold_exceeded=exceeds,
        threshold_amount=threshold,
        sla_deadline=sla_deadline,
        status="under_review" if exceeds else "approved",
        auto_processed=not exceeds,
    )
    db.add(refund)

    if not exceeds:
        # Auto-process: create a refund transaction
        refund.approved_amount = payload.requested_amount
        refund.processed_at = datetime.utcnow()
        txn = BillingTransaction(
            customer_id=payload.customer_id,
            account_id=payload.account_id,
            invoice_id=payload.invoice_id,
            transaction_type="refund",
            transaction_sub_type="auto_approved",
            amount=payload.requested_amount,
            status="success",
            payment_method=payload.refund_mode or "original_source",
            initiated_by=payload.requested_by,
            agent_id=payload.requesting_agent_id,
            settled_at=datetime.utcnow(),
        )
        db.add(txn)
        # Alert
        db.add(BillingAlert(
            customer_id=payload.customer_id,
            alert_type="refund_processed",
            severity="info",
            title="Refund Processed",
            message=f"Refund of {settings.refund_currency} {payload.requested_amount} has been auto-approved and will be credited within 5-7 business days.",
            entity_type="refund",
        ))
    else:
        # Alert for supervisor
        db.add(BillingAlert(
            customer_id=payload.customer_id,
            alert_type="refund_pending_review",
            severity="warning",
            title="Refund Requires Supervisor Approval",
            message=f"Refund of {settings.refund_currency} {payload.requested_amount} exceeds auto-approval threshold of {threshold}. Routed for human review.",
            entity_type="refund",
        ))

    await db.commit()
    await db.refresh(refund)
    return RefundOut.model_validate(refund)


@router.get("/refunds", response_model=list[RefundOut])
async def list_all_refunds(
    status: str = Query("", description="pending/under_review/approved/rejected/processed/investigation"),
    threshold_only: bool = Query(False, description="Only show threshold-exceeded refunds"),
    investigation_only: bool = Query(False, description="Only show flagged investigation cases"),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Supervisor: view all refund requests."""
    stmt = select(RefundRequest)
    if status:
        stmt = stmt.where(RefundRequest.status == status)
    if threshold_only:
        stmt = stmt.where(RefundRequest.threshold_exceeded == True)
    if investigation_only:
        stmt = stmt.where(RefundRequest.status == "investigation")
    stmt = stmt.order_by(RefundRequest.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [RefundOut.model_validate(r) for r in rows]


@router.get("/customers/{customer_id}/refunds", response_model=list[RefundOut])
async def list_customer_refunds(
    customer_id: uuid.UUID,
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(RefundRequest)
        .where(RefundRequest.customer_id == customer_id)
        .order_by(RefundRequest.created_at.desc())
        .limit(limit)
    )).scalars().all()
    return [RefundOut.model_validate(r) for r in rows]


@router.patch("/refunds/{refund_id}", response_model=RefundOut)
async def review_refund(
    refund_id: uuid.UUID,
    payload: RefundReview,
    db: AsyncSession = Depends(get_db),
):
    """Supervisor approves or rejects a refund — including investigation cases."""
    refund = await db.get(RefundRequest, refund_id)
    if not refund:
        raise HTTPException(status_code=404, detail="Refund not found")

    refund.status = payload.status
    refund.reviewed_by = payload.reviewed_by
    refund.review_notes = payload.review_notes
    refund.rejection_reason = payload.rejection_reason
    refund.reviewed_at = datetime.utcnow()

    if payload.status == "approved":
        approved_amt = payload.approved_amount or refund.requested_amount
        refund.approved_amount = approved_amt
        refund.processed_at = datetime.utcnow()
        if payload.refund_mode:
            refund.refund_mode = payload.refund_mode

        # Fetch customer account and validate/deduct balance
        account = None
        if refund.account_id:
            account = await db.get(Account, refund.account_id)
        if not account:
            acc_result = await db.execute(
                select(Account).where(Account.customer_id == refund.customer_id).limit(1)
            )
            account = acc_result.scalar_one_or_none()

        if account:
            if float(approved_amt) > float(account.balance):
                raise HTTPException(
                    status_code=400,
                    detail=f"Approved refund amount INR {approved_amt} exceeds customer account balance INR {account.balance}. Adjust the amount."
                )
            account.balance = float(account.balance) - float(approved_amt)

        # Create the actual refund transaction
        txn = BillingTransaction(
            customer_id=refund.customer_id,
            account_id=refund.account_id,
            invoice_id=refund.invoice_id,
            transaction_type="refund",
            transaction_sub_type="supervisor_approved",
            amount=approved_amt,
            status="success",
            payment_method=refund.refund_mode or "original_source",
            initiated_by="supervisor",
            agent_id=payload.reviewed_by,
            settled_at=datetime.utcnow(),
        )
        db.add(txn)
        db.add(BillingAlert(
            customer_id=refund.customer_id,
            alert_type="refund_processed",
            severity="info",
            title="Refund Approved",
            message=f"Your refund of INR {approved_amt} has been approved by a supervisor and will be processed within 3-5 business days.",
            entity_type="refund",
        ))

    await db.commit()
    await db.refresh(refund)

    # Emit real-time WebSocket events so frontend refreshes immediately
    try:
        await event_bus.emit(
            "system",
            CustomerUpdatedEvent(session_id="system", customer_id=str(refund.customer_id))
        )
        if refund.invoice_id:
            await event_bus.emit(
                "system",
                InvoiceUpdatedEvent(session_id="system", customer_id=str(refund.customer_id), invoice_id=str(refund.invoice_id))
            )
    except Exception as ws_exc:
        logger.warning("WS emit error on refund review: %s", ws_exc)

    return RefundOut.model_validate(refund)


# ─── Alerts ───────────────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/alerts", response_model=list[BillingAlertOut])
async def list_alerts(
    customer_id: uuid.UUID,
    unread_only: bool = Query(False),
    limit: int = Query(30, le=100),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(BillingAlert).where(BillingAlert.customer_id == customer_id)
    if unread_only:
        stmt = stmt.where(BillingAlert.is_read == False)
    stmt = stmt.order_by(BillingAlert.created_at.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [BillingAlertOut.model_validate(r) for r in rows]


@router.patch("/alerts/{alert_id}/read")
async def mark_alert_read(alert_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    alert = await db.get(BillingAlert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    alert.read_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}


# ─── Dashboard stats ──────────────────────────────────────────────────────────

@router.get("/stats")
async def billing_stats(db: AsyncSession = Depends(get_db)):
    """Global billing statistics for the dashboard header."""
    total_customers = await db.scalar(select(func.count(Customer.customer_id))) or 0

    inv_data = await db.execute(
        select(
            func.count(Invoice.invoice_id).label("total"),
            func.sum(case((Invoice.status == "paid", 1), else_=0)).label("paid"),
            func.sum(case((Invoice.status == "overdue", 1), else_=0)).label("overdue"),
            func.coalesce(func.sum(Invoice.total_amount), 0).label("revenue"),
            func.coalesce(func.sum(case((Invoice.status.in_(["sent", "overdue", "partial"]),
                                              Invoice.total_amount - Invoice.amount_paid), else_=0)), 0).label("outstanding"),
        )
    )
    id_ = inv_data.one()

    ref_data = await db.execute(
        select(
            func.sum(case((RefundRequest.status.in_(["pending", "under_review"]), 1), else_=0)).label("pending"),
            func.sum(case((and_(RefundRequest.threshold_exceeded == True,
                                RefundRequest.status.in_(["pending", "under_review"])), 1), else_=0)).label("threshold_pending"),
            func.sum(case((RefundRequest.status == "investigation", 1), else_=0)).label("investigation_count"),
            func.coalesce(func.sum(case((RefundRequest.status.in_(["approved", "processed"]),
                                              RefundRequest.approved_amount), else_=0)), 0).label("approved_total"),
        )
    )
    rd_ = ref_data.one()

    failed_txns = await db.scalar(
        select(func.count(BillingTransaction.transaction_id)).where(
            BillingTransaction.status == "failed"
        )
    ) or 0

    return {
        "total_customers": total_customers,
        "total_invoices": int(id_.total or 0),
        "paid_invoices": int(id_.paid or 0),
        "overdue_invoices": int(id_.overdue or 0),
        "total_revenue": float(id_.revenue or 0),
        "outstanding_amount": float(id_.outstanding or 0),
        "pending_refunds": int(rd_.pending or 0),
        "threshold_pending_refunds": int(rd_.threshold_pending or 0),
        "investigation_count": int(rd_.investigation_count or 0),
        "total_refunds_approved": float(rd_.approved_total or 0),
        "failed_transactions": failed_txns,
        "refund_threshold": settings.refund_threshold_amount,
    }
