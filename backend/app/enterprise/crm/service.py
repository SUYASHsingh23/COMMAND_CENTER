"""
CRMService — Production implementation backed by PostgreSQL.

All methods use async SQLAlchemy, querying the real `customer` and `account`
tables. No more hardcoded dictionaries.
"""
from __future__ import annotations

import logging
import uuid
from sqlalchemy import select, or_, update
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.observability.bus import event_bus
from app.api.websocket.events import CustomerUpdatedEvent

logger = logging.getLogger(__name__)


def _fmt_customer(c: Customer) -> dict:
    return {
        "customer_id":    str(c.customer_id),
        "name":           c.name,
        "phone":          c.phone,
        "email":          c.email,
        "account_number": c.account_number,
        "plan":           c.plan,
        "city":           c.city,
        "state":          c.state,
        "customer_tier":  c.customer_tier or "standard",
        "customer_since": str(c.customer_since) if c.customer_since else None,
        "preferred_language": c.preferred_language,
        "created_at":     str(c.created_at),
    }


def _fmt_account(a: Account) -> dict:
    return {
        "account_id":    str(a.account_id),
        "customer_id":   str(a.customer_id),
        "plan_name":     a.plan_name,
        "status":        a.status,
        "balance":       float(a.balance) if a.balance is not None else 0.0,
        "billing_cycle": a.billing_cycle,
        "data_used_gb":  float(a.data_used_gb) if a.data_used_gb is not None else 0.0,
        "payment_method": a.payment_method,
        "auto_renew":    a.auto_renew,
    }


class CRMService:
    async def get_customer(
        self,
        customer_id: str | None = None,
        phone: str | None = None,
        email: str | None = None,
        account_number: str | None = None,
    ) -> dict:
        async with async_session_factory() as db:
            try:
                stmt = select(Customer)
                if customer_id:
                    stmt = stmt.where(Customer.customer_id == uuid.UUID(customer_id))
                elif phone:
                    stmt = stmt.where(Customer.phone == phone)
                elif email:
                    stmt = stmt.where(Customer.email == email)
                elif account_number:
                    stmt = stmt.where(Customer.account_number == account_number)
                else:
                    return {"found": False, "error": "No search criteria provided"}

                result = await db.execute(stmt)
                customer = result.scalar_one_or_none()

                if customer:
                    logger.info("CRM: customer found — %s (%s)", customer.name, customer.customer_id)
                    return {"found": True, "customer": _fmt_customer(customer)}
                return {"found": False, "error": "Customer not found"}
            except Exception as exc:
                logger.error("CRM get_customer error: %s", exc)
                return {"found": False, "error": str(exc)}

    async def update_customer(self, customer_id: str, updates: dict) -> dict:
        """Update customer details in database and emit websocket event."""
        async with async_session_factory() as db:
            try:
                if not updates:
                    return {"success": False, "error": "No updates provided"}

                # Validate fields against the model
                valid_customer_fields = {
                    "name", "phone", "email", "plan", "city", "state",
                    "address_line1", "address_line2", "pincode", "country",
                    "preferred_language", "preferred_channel", "customer_tier",
                    "date_of_birth", "gender", "notes"
                }
                customer_updates = {k: v for k, v in updates.items() if k in valid_customer_fields}
                
                if not customer_updates:
                    return {"success": False, "error": f"No valid fields to update. Supported: {valid_customer_fields}"}

                stmt = (
                    update(Customer)
                    .where(Customer.customer_id == uuid.UUID(customer_id))
                    .values(**customer_updates)
                    .returning(Customer)
                )
                result = await db.execute(stmt)
                updated_customer = result.scalar_one_or_none()

                # If plan was updated, sync it to the account table
                if "plan" in customer_updates:
                    await db.execute(
                        update(Account)
                        .where(Account.customer_id == uuid.UUID(customer_id))
                        .values(plan_name=customer_updates["plan"])
                    )

                await db.commit()

                if updated_customer:
                    # Broadcast to CRM Dashboard
                    await event_bus.emit(
                        session_id="system",
                        event=CustomerUpdatedEvent(session_id="system", customer_id=customer_id)
                    )
                    return {
                        "success": True,
                        "message": f"Updated: {', '.join(customer_updates.keys())}",
                        "updated_fields": list(customer_updates.keys()),
                        "customer": _fmt_customer(updated_customer),
                    }
                return {"success": False, "error": "Customer not found"}
            except Exception as exc:
                logger.error("CRM update_customer error: %s", exc)
                return {"success": False, "error": str(exc)}


    async def get_account(self, customer_id: str) -> dict:
        async with async_session_factory() as db:
            try:
                stmt = (
                    select(Account)
                    .where(Account.customer_id == uuid.UUID(customer_id))
                    .limit(1)
                )
                result = await db.execute(stmt)
                account = result.scalar_one_or_none()
                if account:
                    return {"found": True, "account": _fmt_account(account)}
                return {"found": False, "error": "No account found for this customer"}
            except Exception as exc:
                logger.error("CRM get_account error: %s", exc)
                return {"found": False, "error": str(exc)}
