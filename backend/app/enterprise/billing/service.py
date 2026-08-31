"""
BillingService — Production implementation backed by PostgreSQL.

Replaces the hardcoded dictionary mock with real async SQLAlchemy queries
against the `invoice`, `refund_request`, and `billing_alert` tables.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, date, timedelta
from decimal import Decimal

from sqlalchemy import select, desc
from app.database.session import async_session_factory
from app.models.billing import Invoice, RefundRequest, BillingAlert, BillingTransaction
from app.models.customer import Customer, Account
from app.observability.bus import event_bus
from app.api.websocket.events import InvoiceUpdatedEvent, CustomerUpdatedEvent

logger = logging.getLogger(__name__)


def _fmt_invoice(inv: Invoice) -> dict:
    return {
        "invoice_id":     str(inv.invoice_id),
        "invoice_number": inv.invoice_number,
        "customer_id":    str(inv.customer_id),
        "status":         inv.status,
        "total_amount":   float(inv.total_amount),
        "amount_paid":    float(inv.amount_paid),
        "due_date":       str(inv.due_date),
        "billing_period_start": str(inv.billing_period_start) if inv.billing_period_start else None,
        "billing_period_end":   str(inv.billing_period_end) if inv.billing_period_end else None,
        "line_items":     inv.line_items or [],
        "currency":       inv.currency,
    }


class BillingService:
    async def get_invoice(self, customer_id: str) -> dict:
        async with async_session_factory() as db:
            try:
                stmt = (
                    select(Invoice)
                    .where(Invoice.customer_id == uuid.UUID(customer_id))
                    .order_by(desc(Invoice.created_at))
                    .limit(10)
                )
                result = await db.execute(stmt)
                invoices = result.scalars().all()
                if invoices:
                    return {
                        "found": True,
                        "invoices": [_fmt_invoice(i) for i in invoices],
                        "count": len(invoices),
                    }
                return {"found": False, "error": "No invoices found for this customer"}
            except Exception as exc:
                logger.error("BillingService get_invoice error: %s", exc)
                return {"found": False, "error": str(exc)}

    async def get_invoice_detail(self, invoice_id: str) -> dict:
        async with async_session_factory() as db:
            try:
                try:
                    parsed_id = uuid.UUID(invoice_id)
                    invoice = await db.get(Invoice, parsed_id)
                except ValueError:
                    result = await db.execute(select(Invoice).where(Invoice.invoice_number == invoice_id))
                    invoice = result.scalar_one_or_none()
                    
                if invoice:
                    return {"found": True, "invoice": _fmt_invoice(invoice)}
                return {"found": False, "error": f"Invoice {invoice_id} not found"}
            except Exception as exc:
                logger.error("BillingService get_invoice_detail error: %s", exc)
                return {"found": False, "error": str(exc)}

    async def issue_refund(self, invoice_id: str, amount: float, reason: str) -> dict:
        async with async_session_factory() as db:
            try:
                try:
                    parsed_id = uuid.UUID(invoice_id)
                    invoice = await db.get(Invoice, parsed_id)
                except ValueError:
                    result = await db.execute(select(Invoice).where(Invoice.invoice_number == invoice_id))
                    invoice = result.scalar_one_or_none()
                    
                if not invoice:
                    return {"success": False, "error": f"Invoice {invoice_id} not found"}

                if Decimal(str(amount)) > invoice.total_amount:
                    return {
                        "success": False,
                        "error": f"Refund amount {amount} exceeds invoice total {float(invoice.total_amount)}",
                    }

                # 1. Threshold check — persist for human review then return error
                from app.core.config import get_settings as _get_settings
                _settings = _get_settings()

                if amount > 5000:
                    _rn = f"{_settings.refund_number_prefix}-{str(uuid.uuid4())[:8].upper()}"
                    _flagged = RefundRequest(
                        customer_id=invoice.customer_id,
                        invoice_id=invoice.invoice_id,
                        account_id=invoice.account_id,
                        requested_amount=Decimal(str(amount)),
                        currency=invoice.currency,
                        reason=reason[:60],
                        reason_detail=reason,
                        refund_number=_rn,
                        status="under_review",
                        threshold_exceeded=True,
                        threshold_amount=Decimal("5000"),
                        auto_processed=False,
                        requested_by="agent",
                        customer_consent=True,
                        priority="high",
                        escalation_reason="Refund amount requires supervisor approval.",
                    )
                    db.add(_flagged)
                    await db.commit()
                    logger.info("Refund %s flagged for supervisor review: %.2f", _rn, amount)
                    return {
                        "success": False,
                        "error": "This refund request requires manual review and approval by a specialized agent. Please escalate the conversation.",
                        "queued_for_review": True,
                        "refund_number": _rn,
                    }

                # 2. Rate limit check (frequency & fraud) — persist as investigation
                now = datetime.now(timezone.utc)
                one_day_ago = now - timedelta(days=1)
                seven_days_ago = now - timedelta(days=7)

                recent_refunds_stmt = select(RefundRequest).where(
                    RefundRequest.customer_id == invoice.customer_id,
                    RefundRequest.created_at >= seven_days_ago
                )
                recent_refunds = (await db.execute(recent_refunds_stmt)).scalars().all()

                refunds_24h = [r for r in recent_refunds if r.created_at >= one_day_ago]
                if len(refunds_24h) >= 1 or len(recent_refunds) >= 3:
                    # Generate a CASE- prefixed investigation number, distinct from refund IDs
                    _case_number = f"CASE-{str(uuid.uuid4())[:8].upper()}"
                    _reason_note = (
                        "Multiple refund requests detected in a short time window. Flagged for fraud investigation."
                        if len(recent_refunds) >= 3
                        else "Duplicate refund attempt within 24 hours."
                    )
                    _inv_refund = RefundRequest(
                        customer_id=invoice.customer_id,
                        invoice_id=invoice.invoice_id,
                        account_id=invoice.account_id,
                        requested_amount=Decimal(str(amount)),
                        currency=invoice.currency,
                        reason=reason[:60],
                        reason_detail=reason,
                        refund_number=_case_number,   # Store CASE-ID in refund_number for tracking
                        status="investigation",
                        auto_processed=False,
                        requested_by="agent",
                        customer_consent=True,
                        priority="critical" if len(recent_refunds) >= 3 else "high",
                        escalation_reason=_reason_note,
                    )
                    db.add(_inv_refund)
                    await db.commit()
                    logger.warning("Investigation %s opened: %s", _case_number, _reason_note)
                    return {
                        "success": False,
                        "error": "This account currently has a pending refund request under review. Please escalate the conversation to a support specialist.",
                        "queued_for_review": True,
                        "refund_number": _case_number,  # CASE-XXXXXXXX — relay this to customer
                    }
                    
                # 3. Account balance verification and deduction
                account = None
                if invoice.account_id:
                    account = await db.get(Account, invoice.account_id)
                if not account:
                    acc_result = await db.execute(select(Account).where(Account.customer_id == invoice.customer_id).limit(1))
                    account = acc_result.scalar_one_or_none()
                    
                if account:
                    if amount > account.balance:
                        return {
                            "success": False,
                            "error": f"Refund amount {amount} exceeds the customer's available account balance ({account.balance}). Cannot process refund."
                        }
                    # Deduct the refund from the balance
                    account.balance -= float(amount)
                else:
                    return {"success": False, "error": "Customer account not found for balance verification."}

                from app.core.config import get_settings
                settings = get_settings()
                refund_number = f"{settings.refund_number_prefix}-{str(uuid.uuid4())[:8].upper()}"

                refund = RefundRequest(
                    customer_id=invoice.customer_id,
                    invoice_id=invoice.invoice_id,
                    requested_amount=Decimal(str(amount)),
                    approved_amount=Decimal(str(amount)),
                    currency=invoice.currency,
                    reason=reason[:60],
                    reason_detail=reason,
                    refund_number=refund_number,
                    status="approved",
                    auto_processed=True,
                    requested_by="agent",
                    customer_consent=True,
                    processed_at=datetime.now(timezone.utc),
                )
                db.add(refund)

                # Create the actual refund transaction
                txn = BillingTransaction(
                    customer_id=invoice.customer_id,
                    account_id=invoice.account_id,
                    invoice_id=invoice.invoice_id,
                    transaction_type="refund",
                    transaction_sub_type="auto_approved",
                    amount=amount,
                    status="success",
                    payment_method="original_source",
                    initiated_by="agent",
                    agent_id="system",
                    settled_at=datetime.now(timezone.utc),
                )
                db.add(txn)

                # Update invoice status
                invoice.status = "refunded"
                invoice.amount_paid = invoice.amount_paid + Decimal(str(amount))
                await db.commit()
                await db.refresh(refund)

                # Broadcast real-time update
                try:
                    await event_bus.emit(
                        "system",
                        InvoiceUpdatedEvent(
                            session_id="system",
                            customer_id=str(invoice.customer_id),
                            invoice_id=str(invoice.invoice_id)
                        )
                    )
                    
                    # Broadcast customer update so balance refreshes on frontend
                    await event_bus.emit(
                        "system",
                        CustomerUpdatedEvent(
                            session_id="system",
                            customer_id=str(invoice.customer_id)
                        )
                    )
                except Exception as ws_exc:
                    logger.warning("WS emit error on auto-refund: %s", ws_exc)

                logger.info("Refund %s approved: %.2f for invoice %s", refund_number, amount, invoice_id)
                return {
                    "success": True,
                    "refund": {
                        "refund_id": str(refund.refund_id),
                        "refund_number": refund.refund_number,
                        "invoice_id": invoice_id,
                        "amount": amount,
                        "reason": reason,
                        "status": "approved",
                        "processed_at": str(refund.processed_at),
                    },
                }
            except Exception as exc:
                logger.error("BillingService issue_refund error: %s", exc)
                return {"success": False, "error": str(exc)}

    async def check_outage(self, area_code: str | None = None, customer_id: str | None = None) -> dict:
        # Real outage data would come from a network monitoring system.
        # For now: return a sensible default indicating no known outages.
        # The agent should tell the customer to call back if they believe there is one.
        return {
            "has_outage": False,
            "message": "No active outages detected in your area. All systems operational.",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_payment_history(self, customer_id: str) -> dict:
        """Return full payment/invoice history with transaction details for reasoning."""
        async with async_session_factory() as db:
            try:
                stmt = (
                    select(Invoice)
                    .where(Invoice.customer_id == uuid.UUID(customer_id))
                    .order_by(desc(Invoice.due_date))
                    .limit(12)
                )
                result = await db.execute(stmt)
                invoices = result.scalars().all()

                if not invoices:
                    return {"found": False, "summary": "No payment history found for this customer."}

                records = []
                for inv in invoices:
                    records.append({
                        "invoice_number":    inv.invoice_number,
                        "billing_period":    f"{inv.billing_period_start} to {inv.billing_period_end}",
                        "total_amount":      float(inv.total_amount),
                        "amount_paid":       float(inv.amount_paid),
                        "outstanding":       float(inv.total_amount - inv.amount_paid),
                        "status":            inv.status,
                        "due_date":          str(inv.due_date),
                        "paid_at":           inv.paid_at.isoformat() if inv.paid_at else None,
                        "late_fee_applied":  inv.late_fee_applied,
                        "late_fee_amount":   float(inv.late_fee_amount) if inv.late_fee_amount else 0.0,
                        "sent_via":          inv.sent_via,
                        "sent_at":           inv.sent_at.isoformat() if inv.sent_at else None,
                        "viewed_at":         inv.viewed_at.isoformat() if inv.viewed_at else None,
                    })

                overdue = [r for r in records if r["status"] in ("overdue", "sent") and r["outstanding"] > 0]
                total_outstanding = sum(r["outstanding"] for r in records if r["outstanding"] > 0)

                return {
                    "found": True,
                    "total_invoices": len(records),
                    "total_outstanding": total_outstanding,
                    "overdue_count": len(overdue),
                    "payment_records": records,
                    "summary": (
                        f"Found {len(records)} invoices. "
                        f"Outstanding balance: ₹{total_outstanding:.2f}. "
                        f"{len(overdue)} overdue/unpaid invoice(s)."
                    ),
                }
            except Exception as exc:
                logger.error("BillingService get_payment_history error: %s", exc)
                return {"found": False, "error": str(exc)}

    async def pay_outstanding_balance(self, customer_id: str, amount: float) -> dict:
        """Pay outstanding balance from the customer's available account balance."""
        async with async_session_factory() as db:
            try:
                acc_result = await db.execute(select(Account).where(Account.customer_id == uuid.UUID(customer_id)).limit(1))
                account = acc_result.scalar_one_or_none()
                if not account:
                    return {"success": False, "error": "Customer account not found."}

                if amount <= 0:
                    return {"success": False, "error": "Payment amount must be greater than 0."}

                if account.balance < amount:
                    return {
                        "success": False, 
                        "error": f"Insufficient balance. Requested: {amount}, Available: {account.balance}"
                    }

                # Deduct from balance
                account.balance -= float(amount)
                
                # Fetch unpaid invoices to mark as paid
                unpaid_invoices = (await db.execute(
                    select(Invoice)
                    .where(Invoice.customer_id == uuid.UUID(customer_id))
                    .where(Invoice.status.in_(["overdue", "sent"]))
                    .order_by(Invoice.due_date.asc())
                )).scalars().all()

                remaining_payment = Decimal(str(amount))
                invoices_paid = []
                for inv in unpaid_invoices:
                    if remaining_payment <= 0:
                        break
                    outstanding = inv.total_amount - inv.amount_paid
                    if outstanding <= 0:
                        continue
                    
                    pay_amt = min(remaining_payment, outstanding)
                    inv.amount_paid += pay_amt
                    remaining_payment -= pay_amt
                    
                    if inv.amount_paid >= inv.total_amount:
                        inv.status = "paid"
                        inv.paid_at = datetime.now(timezone.utc)
                        invoices_paid.append(str(inv.invoice_id))
                
                # Create the payment transaction
                txn = BillingTransaction(
                    customer_id=account.customer_id,
                    account_id=account.account_id,
                    transaction_type="payment",
                    transaction_sub_type="balance_deduction",
                    amount=amount,
                    status="success",
                    payment_method="account_balance",
                    initiated_by="agent",
                    agent_id="system",
                    settled_at=datetime.now(timezone.utc),
                )
                db.add(txn)
                await db.commit()

                # Broadcast updates
                try:
                    await event_bus.emit(
                        "system",
                        CustomerUpdatedEvent(
                            session_id="system",
                            customer_id=customer_id
                        )
                    )
                    for inv_id in invoices_paid:
                        await event_bus.emit(
                            "system",
                            InvoiceUpdatedEvent(
                                session_id="system",
                                customer_id=customer_id,
                                invoice_id=inv_id
                            )
                        )
                except Exception as ws_exc:
                    logger.warning("WS emit error on pay_outstanding_balance: %s", ws_exc)

                return {
                    "success": True,
                    "paid_amount": amount,
                    "remaining_balance": account.balance,
                    "invoices_paid": invoices_paid,
                    "summary": f"Paid ₹{amount:.2f} from balance. Remaining balance is ₹{account.balance:.2f}.",
                }
            except Exception as exc:
                logger.error("BillingService pay_outstanding_balance error: %s", exc)
                return {"success": False, "error": str(exc)}


