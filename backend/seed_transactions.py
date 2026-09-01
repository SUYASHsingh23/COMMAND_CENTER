"""
seed_transactions.py
--------------------
Seeds realistic BillingTransaction records for every customer based on their
PAID invoices. For each paid invoice, creates a matching 'payment' transaction
with correct amount, method, and timestamps.

Also cleans up stale transactions that have wrong amounts (from pre-migration era).

Run: python seed_transactions.py
"""
import asyncio
import uuid
import random
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.models.billing import Invoice, BillingTransaction

# Realistic payment methods per customer tier
PAYMENT_METHODS = {
    "premium": ["NEFT", "Net Banking", "Credit Card"],
    "gold":    ["UPI", "Net Banking", "NEFT"],
    "basic":   ["UPI", "NACH", "Debit Card"],
}

# UPI IDs that look real
UPI_IDS = {
    "UPI": ["customer@upi", "holder@paytm", "user@gpay", "pay@phonepe"],
}


async def seed():
    async with async_session_factory() as db:
        customers = (await db.execute(select(Customer))).scalars().all()
        accounts  = (await db.execute(select(Account))).scalars().all()
        invoices  = (await db.execute(select(Invoice))).scalars().all()

        acct_by_cid = {str(a.customer_id): a for a in accounts}
        inv_by_cid: dict[str, list] = {}
        for inv in invoices:
            inv_by_cid.setdefault(str(inv.customer_id), []).append(inv)

        # Step 1: Remove all old transactions (they have wrong amounts from pre-migration era)
        print("=== Clearing stale transactions ===")
        deleted = await db.execute(delete(BillingTransaction))
        print(f"  Deleted all existing transactions.")
        await db.flush()

        print("\n=== Seeding transactions from paid invoices ===")
        total_created = 0

        for customer in customers:
            cid = str(customer.customer_id)
            acct = acct_by_cid.get(cid)
            if not acct:
                continue

            tier = customer.customer_tier or "basic"
            methods = PAYMENT_METHODS.get(tier, PAYMENT_METHODS["basic"])
            cust_invoices = sorted(
                inv_by_cid.get(cid, []),
                key=lambda x: x.billing_period_start or x.issue_date or x.due_date
            )

            for inv in cust_invoices:
                if inv.status == "paid" and inv.amount_paid and inv.amount_paid > 0:
                    # Choose payment method (consistent per customer)
                    method = methods[hash(cid) % len(methods)]

                    # Payment timestamp: same day as paid_at or a few days before due
                    if inv.paid_at:
                        paid_ts = inv.paid_at
                    else:
                        # Estimate: paid 2 days before due
                        due = inv.due_date
                        paid_ts = datetime(due.year, due.month, min(due.day - 2, 28), 
                                         10, 30, tzinfo=timezone.utc)

                    # Build a realistic gateway ref
                    ref_prefix = {"UPI": "UPI", "NEFT": "NEFT", "NACH": "NACH",
                                  "Net Banking": "NETBNK", "Credit Card": "CC",
                                  "Debit Card": "DC"}.get(method, "TXN")
                    gateway_ref = f"{ref_prefix}{random.randint(100000000, 999999999)}"

                    txn = BillingTransaction(
                        transaction_id=uuid.uuid4(),
                        customer_id=customer.customer_id,
                        account_id=acct.account_id,
                        invoice_id=inv.invoice_id,
                        transaction_type="payment",
                        transaction_sub_type="premium_payment",
                        amount=inv.amount_paid,
                        currency="INR",
                        status="success",
                        payment_method=method,
                        payment_method_detail=f"{method} payment for {inv.invoice_number}",
                        gateway_ref=gateway_ref,
                        initiated_by="customer",
                        tax_collected=inv.tax_amount,
                        net_amount=inv.subtotal,
                        created_at=paid_ts,
                        settled_at=paid_ts + timedelta(minutes=random.randint(2, 30)),
                    )
                    db.add(txn)
                    total_created += 1

                elif inv.status == "partial" and inv.amount_paid and inv.amount_paid > 0:
                    # Partial payment transaction
                    method = methods[hash(cid) % len(methods)]
                    due = inv.due_date
                    paid_ts = datetime(due.year, due.month, min(due.day - 5, 28),
                                      9, 0, tzinfo=timezone.utc)
                    gateway_ref = f"UPI{random.randint(100000000, 999999999)}"

                    txn = BillingTransaction(
                        transaction_id=uuid.uuid4(),
                        customer_id=customer.customer_id,
                        account_id=acct.account_id,
                        invoice_id=inv.invoice_id,
                        transaction_type="payment",
                        transaction_sub_type="partial_payment",
                        amount=inv.amount_paid,
                        currency="INR",
                        status="success",
                        payment_method="UPI",
                        payment_method_detail=f"Partial UPI payment for {inv.invoice_number}",
                        gateway_ref=gateway_ref,
                        initiated_by="customer",
                        net_amount=inv.amount_paid,
                        created_at=paid_ts,
                        settled_at=paid_ts + timedelta(minutes=5),
                    )
                    db.add(txn)
                    total_created += 1

                elif inv.status in ("overdue", "sent"):
                    # Add one failed payment attempt for overdue invoices (realistic)
                    if inv.status == "overdue":
                        due = inv.due_date
                        attempt_ts = datetime(due.year, due.month, min(due.day + 1, 28),
                                             8, 0, tzinfo=timezone.utc)
                        method = methods[hash(cid) % len(methods)]
                        txn = BillingTransaction(
                            transaction_id=uuid.uuid4(),
                            customer_id=customer.customer_id,
                            account_id=acct.account_id,
                            invoice_id=inv.invoice_id,
                            transaction_type="payment",
                            transaction_sub_type="auto_debit_failed",
                            amount=inv.total_amount,
                            currency="INR",
                            status="failed",
                            payment_method=method,
                            payment_method_detail="Auto-debit failed - insufficient funds",
                            failure_code="INSUFFICIENT_FUNDS",
                            failure_reason="Account balance insufficient for premium debit",
                            initiated_by="system",
                            retry_count=1,
                            created_at=attempt_ts,
                        )
                        db.add(txn)
                        total_created += 1

            print(f"  {customer.name} ({tier}): transactions created")

        await db.commit()
        print(f"\n=== DONE — {total_created} transactions seeded ===")

        # Verification summary
        async with async_session_factory() as db2:
            from sqlalchemy import text, func
            counts = await db2.execute(
                select(BillingTransaction.status, func.count(BillingTransaction.transaction_id))
                .group_by(BillingTransaction.status)
            )
            print("\nTransaction breakdown by status:")
            for row in counts:
                print(f"  {row[0]}: {row[1]}")


asyncio.run(seed())
