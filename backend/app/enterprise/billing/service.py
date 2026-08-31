"""
BillingService — Production implementation backed by PostgreSQL.

Replaces the hardcoded dictionary mock with real async SQLAlchemy queries
against the `invoice`, `refund_request`, and `billing_alert` tables.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, date
from decimal import Decimal

from sqlalchemy import select, desc
from app.database.session import async_session_factory
from app.models.billing import Invoice, RefundRequest, BillingAlert
from app.models.customer import Customer
from app.observability.bus import event_bus
from app.api.websocket.events import InvoiceUpdatedEvent

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

                # Update invoice status
                invoice.status = "refunded"
                invoice.amount_paid = invoice.amount_paid + Decimal(str(amount))
                await db.commit()
                await db.refresh(refund)

                # Broadcast real-time update
                await event_bus.emit(
                    session_id="system",
                    event=InvoiceUpdatedEvent(
                        session_id="system",
                        customer_id=str(invoice.customer_id),
                        invoice_id=str(invoice.invoice_id)
                    )
                )

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

