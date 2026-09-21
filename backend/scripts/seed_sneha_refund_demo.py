"""
seed_sneha_refund_demo.py
=========================
Creates demo-ready financial evidence for Sneha Reddy two refund scenarios.

Scenario A — Overcharge Rs.1,000   (AI auto-approves live during demo)
  Invoice: INV-2026-SROVER-01 | Period: Aug 2026
  Story:   Customer was charged Rs.1,000 for a Home Security Add-on she never subscribed to.
  Total:   Rs.10,999.12  |  Paid: Rs.10,999.12  (full invoice paid, but has erroneous add-on)
  Ask AI:  'I was charged Rs.1,000 for Home Security Add-on I never signed up for.'

Scenario B — Accidental Overpayment Rs.6,000  (escalated to supervisor live during demo)
  Invoice: INV-2026-SROVERPAY-01 | Period: Sep 2026
  Story:   Regular premium is Rs.10,028.82. Due to banking portal prefill glitch, customer
           paid Rs.16,028.82 - exactly Rs.6,000 extra.
  Total:   Rs.10,028.82  |  Paid: Rs.16,028.82  (Rs.6,000 overpayment)
  Ask AI:  'I accidentally paid Rs.6,000 extra on my September invoice INV-2026-SROVERPAY-01.'

Run from backend/:
    python scripts/seed_sneha_refund_demo.py
    python scripts/seed_sneha_refund_demo.py --reset   (reset/clean test data + re-seed)
"""

import asyncio
import sys
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select, delete

from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.models.billing import Invoice, BillingTransaction, RefundRequest

SNEHA_EMAIL = "sneha.reddy@example.com"
CORRECT_PLAN = "Home Protector Elite"

INV_A_ID     = uuid.UUID("aaaaaaaa-1111-4111-a111-aaaaaaaaaaaa")
TXN_A_ID     = uuid.UUID("aaaaaaaa-2222-4222-a222-aaaaaaaaaaaa")
INV_A_NUMBER = "INV-2026-SROVER-01"

INV_B_ID     = uuid.UUID("bbbbbbbb-1111-4111-b111-bbbbbbbbbbbb")
TXN_B_ID     = uuid.UUID("bbbbbbbb-2222-4222-b222-bbbbbbbbbbbb")
INV_B_NUMBER = "INV-2026-SROVERPAY-01"

STANDARD_PREMIUM = Decimal("10028.82")


async def reset_demo_data(db, customer_id, account):
    print("Resetting demo data...")
    existing_refunds = (await db.execute(select(RefundRequest).where(RefundRequest.customer_id == customer_id))).scalars().all()
    for r in existing_refunds:
        await db.delete(r)
    print(f"  Deleted {len(existing_refunds)} RefundRequest(s)")
    refund_txns = (await db.execute(select(BillingTransaction).where(BillingTransaction.customer_id == customer_id, BillingTransaction.transaction_type == "refund"))).scalars().all()
    for t in refund_txns:
        await db.delete(t)
    print(f"  Deleted {len(refund_txns)} refund BillingTransaction(s)")
    inv_a = await db.get(Invoice, INV_A_ID)
    if inv_a:
        inv_a.status = "paid"
        inv_a.amount_paid = inv_a.total_amount
        print(f"  Reset {INV_A_NUMBER}: status=paid, amount_paid={inv_a.total_amount}")
    inv_b = await db.get(Invoice, INV_B_ID)
    if inv_b:
        await db.delete(inv_b)
        print(f"  Deleted {INV_B_NUMBER} (will be recreated)")
    txn_b = await db.get(BillingTransaction, TXN_B_ID)
    if txn_b:
        await db.delete(txn_b)
        print(f"  Deleted TXN_B (will be recreated)")
    if account:
        account.balance = Decimal("7000.00")
        print(f"  Reset account balance -> Rs.7,000.00")
    await db.flush()
    print("Reset complete.\n")


async def main():
    do_reset = "--reset" in sys.argv
    async with async_session_factory() as db:
        r = await db.execute(select(Customer).where(Customer.email == SNEHA_EMAIL))
        sneha = r.scalar_one_or_none()
        if not sneha:
            r2 = await db.execute(select(Customer).where(Customer.name.ilike("%sneha%")))
            sneha = r2.scalar_one_or_none()
        if not sneha:
            print("ERROR: Sneha Reddy not found.")
            return
        customer_id = sneha.customer_id
        print(f"Customer: {sneha.name}  ({customer_id})")
        if sneha.plan != CORRECT_PLAN:
            sneha.plan = CORRECT_PLAN
            print(f"Updated plan -> {CORRECT_PLAN}")
        acc_r = await db.execute(select(Account).where(Account.customer_id == customer_id).limit(1))
        account = acc_r.scalar_one_or_none()
        if account:
            account.plan_name = CORRECT_PLAN
            account_id = account.account_id
            print(f"Account ID: {account_id} | Balance: {account.balance}")
        else:
            account_id = None
            print("WARNING: No account found.")
        if do_reset:
            await reset_demo_data(db, customer_id, account)
        existing_a = await db.get(Invoice, INV_A_ID)
        if existing_a:
            print(f"Invoice {INV_A_NUMBER} already exists - skipping Scenario A creation.")
        else:
            total_amount_a = Decimal("10999.12")
            inv_a = Invoice(
                invoice_id=INV_A_ID, customer_id=customer_id, account_id=account_id,
                invoice_number=INV_A_NUMBER, status="paid",
                billing_period_start=date(2026, 8, 1), billing_period_end=date(2026, 8, 31),
                due_date=date(2026, 8, 20), issue_date=date(2026, 8, 1),
                subtotal=Decimal("9474.00"), discount_amount=Decimal("0.00"),
                taxable_amount=Decimal("9474.00"), cgst_amount=Decimal("762.66"),
                sgst_amount=Decimal("762.66"), igst_amount=Decimal("0.00"),
                other_tax_amount=Decimal("0.00"), tax_amount=Decimal("1525.32"),
                total_amount=total_amount_a, amount_paid=total_amount_a, currency="INR",
                paid_at=datetime(2026, 8, 5, 10, 23, 0, tzinfo=timezone.utc),
                sent_via="email", sent_at=datetime(2026, 8, 1, 9, 0, 0, tzinfo=timezone.utc),
                internal_notes="Contains erroneous Home Security Add-on charge of Rs.1,000 - customer never subscribed.",
                customer_notes="August 2026 premium with Home Security Add-on.",
                line_items=[
                    {"description": "Home Protector Elite - Monthly Premium (August 2026)", "plan_code": "HOME_ELITE_MONTHLY", "quantity": 1, "unit_price": "8474.00", "discount": "0", "tax_pct": "18.00", "amount": 8474.00},
                    {"description": "Home Security Add-on (August 2026)", "plan_code": "HOME_SEC_ADDON", "quantity": 1, "unit_price": "1000.00", "discount": "0", "tax_pct": "0.00", "amount": 1000.00, "note": "Customer did NOT subscribe to this add-on. Billing error - charge should be reversed."},
                ],
            )
            db.add(inv_a)
            txn_a = BillingTransaction(
                transaction_id=TXN_A_ID, customer_id=customer_id, account_id=account_id,
                invoice_id=INV_A_ID, transaction_type="payment", transaction_sub_type="monthly_premium",
                amount=total_amount_a, currency="INR", status="success", payment_method="upi",
                payment_method_detail="sneha@ybl", payment_gateway="Razorpay",
                gateway_ref="TXN-SR-AUG2026-001", bank_ref="HDFC-2026-08-SR001", initiated_by="customer",
                txn_metadata={"note": "August 2026 premium. Includes erroneous Home Security Add-on of Rs.1,000."},
                settled_at=datetime(2026, 8, 5, 10, 25, 0, tzinfo=timezone.utc),
            )
            db.add(txn_a)
            print(f"Created Scenario A: {INV_A_NUMBER} | Rs.{float(total_amount_a):,.2f}")
        existing_b = await db.get(Invoice, INV_B_ID)
        if existing_b:
            print(f"Invoice {INV_B_NUMBER} already exists - skipping Scenario B creation.")
        else:
            total_sep = STANDARD_PREMIUM
            overpaid_amount = STANDARD_PREMIUM + Decimal("6000.00")
            inv_b = Invoice(
                invoice_id=INV_B_ID, customer_id=customer_id, account_id=account_id,
                invoice_number=INV_B_NUMBER, status="paid",
                billing_period_start=date(2026, 9, 1), billing_period_end=date(2026, 9, 30),
                due_date=date(2026, 9, 20), issue_date=date(2026, 9, 1),
                subtotal=Decimal("8500.00"), discount_amount=Decimal("0.00"),
                taxable_amount=Decimal("8500.00"), cgst_amount=Decimal("765.00"),
                sgst_amount=Decimal("763.82"), igst_amount=Decimal("0.00"),
                other_tax_amount=Decimal("0.00"), tax_amount=Decimal("1528.82"),
                total_amount=total_sep, amount_paid=overpaid_amount, currency="INR",
                paid_at=datetime(2026, 9, 3, 14, 45, 0, tzinfo=timezone.utc),
                sent_via="email", sent_at=datetime(2026, 9, 1, 9, 0, 0, tzinfo=timezone.utc),
                internal_notes=f"Customer overpaid by Rs.6,000. Invoice total Rs.{float(total_sep):,.2f} but paid Rs.{float(overpaid_amount):,.2f} via HDFC NetBanking prefill glitch.",
                customer_notes="September 2026 standard monthly premium.",
                line_items=[
                    {"description": "Home Protector Elite - Monthly Premium (September 2026)", "plan_code": "HOME_ELITE_MONTHLY", "quantity": 1, "unit_price": "8500.00", "discount": "0", "tax_pct": "18.00", "amount": 8500.00},
                ],
            )
            db.add(inv_b)
            txn_b = BillingTransaction(
                transaction_id=TXN_B_ID, customer_id=customer_id, account_id=account_id,
                invoice_id=INV_B_ID, transaction_type="payment", transaction_sub_type="monthly_premium",
                amount=overpaid_amount, currency="INR", status="success",
                payment_method="net_banking", payment_method_detail="HDFC Bank Net Banking",
                payment_gateway="Razorpay", gateway_ref="TXN-SR-SEP2026-001",
                bank_ref="HDFC-2026-09-SR001",
                status_reason=f"Accidental overpayment. Paid Rs.{float(overpaid_amount):,.2f} instead of Rs.{float(total_sep):,.2f}. Excess: Rs.6,000.",
                initiated_by="customer",
                txn_metadata={"intended_amount": float(total_sep), "actual_amount": float(overpaid_amount), "excess_amount": 6000.00},
                settled_at=datetime(2026, 9, 3, 14, 47, 0, tzinfo=timezone.utc),
            )
            db.add(txn_b)
            print(f"Created Scenario B: {INV_B_NUMBER} | Invoice: Rs.{float(total_sep):,.2f} | Paid: Rs.{float(overpaid_amount):,.2f} | Excess: Rs.6,000")
        await db.commit()
        print("\n" + "="*65)
        print("DEMO SETUP COMPLETE")
        print("="*65)
        print(f"Scenario A: {INV_A_NUMBER} | Total=Rs.10,999.12 | Overcharge=Rs.1,000 (AI auto-approves)")
        print(f"Scenario B: {INV_B_NUMBER} | Total=Rs.10,028.82 | Paid=Rs.16,028.82 | Excess=Rs.6,000 (Supervisor review)")
        print(f"Account Balance: Rs.7,000")
        print("To reset between tests: python scripts/seed_sneha_refund_demo.py --reset")
        print("="*65)

if __name__ == "__main__":
    asyncio.run(main())
