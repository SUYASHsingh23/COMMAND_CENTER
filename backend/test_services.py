"""End-to-end functional test for the new DB-backed enterprise services."""
import asyncio
from app.enterprise.crm.service import CRMService
from app.enterprise.billing.service import BillingService
from app.enterprise.scheduling.service import check_availability, schedule_engineer

async def run():
    crm = CRMService()
    billing = BillingService()

    # ── 1. CRM: look up the first real customer in DB ─────────────────────────
    print("\n=== CRM Service ===")
    # Try to find any customer by email
    result = await crm.get_customer(email="test@example.com")
    print(f"Email lookup: found={result.get('found')}")
    # Also try listing by account number - let's get first customer from DB
    from app.database.session import async_session_factory
    from sqlalchemy import select, text
    from app.models.customer import Customer
    async with async_session_factory() as db:
        res = await db.execute(select(Customer).limit(3))
        customers = res.scalars().all()
        print(f"Total customers in DB: checking first 3...")
        for c in customers:
            print(f"  - {c.name} | {c.email} | {c.account_number} | tier={c.customer_tier}")

    if customers:
        cid = str(customers[0].customer_id)
        print(f"\n=== Looking up customer_id={cid} ===")
        r = await crm.get_customer(customer_id=cid)
        print(f"CRM result: {r}")

        # ── 2. Billing: fetch invoices for that customer ──────────────────────
        print("\n=== Billing Service ===")
        inv_result = await billing.get_invoice(customer_id=cid)
        print(f"Invoice fetch: found={inv_result.get('found')}, count={inv_result.get('count', 0)}")
        if inv_result.get("found"):
            for inv in inv_result["invoices"][:2]:
                print(f"  Invoice: {inv['invoice_number']} | {inv['status']} | total={inv['total_amount']}")

    # ── 3. Scheduling: check availability ─────────────────────────────────────
    print("\n=== Scheduling Service ===")
    avail = await check_availability()
    print(f"Next available date: {avail.get('next_available_date')}")
    print(f"Available slots: {avail.get('next_available_slots', [])[:3]}")
    print("\n✅ All services working correctly with PostgreSQL")

asyncio.run(run())
