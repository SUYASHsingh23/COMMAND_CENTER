"""
CustomerContextLoader — eagerly fetches the full customer bundle at session start.

Loads customer profile, account, latest invoices, and open appointments into a
single dict and stores it in the in-memory session state. The agent then reads
this pre-loaded context instead of making individual DB calls on each turn.
"""
from __future__ import annotations

import logging
import uuid
from sqlalchemy import select
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.models.billing import Invoice
from app.models.scheduling import Appointment

logger = logging.getLogger(__name__)


async def load_customer_context(customer_id: str) -> dict | None:
    """
    Fetches a complete customer bundle from PostgreSQL.
    Returns a dict with keys: customer, account, invoices, appointments.
    Returns None if customer not found.
    """
    try:
        cid = uuid.UUID(customer_id)
    except (ValueError, AttributeError):
        logger.warning("CustomerContextLoader: invalid customer_id=%s", customer_id)
        return None

    try:
        async with async_session_factory() as db:
            # ── 1. Customer profile ───────────────────────────────────────────
            customer = await db.get(Customer, cid)
            if not customer:
                logger.warning("CustomerContextLoader: customer %s not found", customer_id)
                return None

            customer_dict = {
                "customer_id":    str(customer.customer_id),
                "name":           customer.name,
                "email":          customer.email,
                "phone":          customer.phone,
                "account_number": customer.account_number,
                "plan":           customer.plan,
                "city":           customer.city,
                "state":          customer.state,
                "customer_tier":  customer.customer_tier or "standard",
                "customer_since": str(customer.customer_since) if customer.customer_since else None,
                "preferred_language": customer.preferred_language,
            }

            # ── 2. Primary account ────────────────────────────────────────────
            acct_row = await db.execute(
                select(Account)
                .where(Account.customer_id == cid)
                .order_by(Account.account_id)
                .limit(1)
            )
            account = acct_row.scalar_one_or_none()
            account_dict = None
            if account:
                account_dict = {
                    "account_id":    str(account.account_id),
                    "plan_name":     account.plan_name,
                    "status":        account.status,
                    "balance":       float(account.balance) if account.balance is not None else 0.0,
                    "billing_cycle": account.billing_cycle,
                    "data_used_gb":  float(account.data_used_gb) if account.data_used_gb is not None else 0.0,
                    "payment_method": account.payment_method,
                    "auto_renew":    account.auto_renew,
                }

            # ── 3. Latest 3 invoices ──────────────────────────────────────────
            inv_rows = await db.execute(
                select(Invoice)
                .where(Invoice.customer_id == cid)
                .order_by(Invoice.due_date.desc())
                .limit(3)
            )
            invoices = []
            for inv in inv_rows.scalars().all():
                invoices.append({
                    "invoice_number": inv.invoice_number,
                    "status":         inv.status,
                    "total_amount":   float(inv.total_amount),
                    "amount_paid":    float(inv.amount_paid),
                    "outstanding":    float(inv.total_amount - inv.amount_paid),
                    "due_date":       str(inv.due_date),
                    "period":         f"{inv.billing_period_start} – {inv.billing_period_end}" if inv.billing_period_start else None,
                })

            # ── 4. Open appointments ──────────────────────────────────────────
            appt_rows = await db.execute(
                select(Appointment)
                .where(
                    Appointment.customer_id == cid,
                    Appointment.status.in_(["assigned", "in_progress", "scheduled"]),
                )
                .order_by(Appointment.scheduled_at.desc())
                .limit(3)
            )
            appointments = []
            for appt in appt_rows.scalars().all():
                appointments.append({
                    "appointment_number": appt.appointment_number,
                    "status":             appt.status,
                    "reason":             appt.reason,
                    "priority":           appt.priority,
                    "scheduled_at":       str(appt.scheduled_at) if appt.scheduled_at else None,
                    "intent_category":    appt.intent_category,
                })

            bundle = {
                "customer":     customer_dict,
                "account":      account_dict,
                "invoices":     invoices,
                "appointments": appointments,
            }
            logger.info(
                "CustomerContextLoader: loaded context for %s — "
                "invoices=%d, appointments=%d",
                customer.name, len(invoices), len(appointments),
            )
            return bundle

    except Exception as exc:
        logger.error("CustomerContextLoader failed for %s: %s", customer_id, exc)
        return None
