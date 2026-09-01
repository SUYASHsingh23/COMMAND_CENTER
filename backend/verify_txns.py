import asyncio
from app.database.session import async_session_factory
from sqlalchemy import text, func, select, case, and_
from app.models.billing import BillingTransaction, Invoice
from app.models.customer import Customer

async def verify():
    async with async_session_factory() as db:
        customers = (await db.execute(select(Customer))).scalars().all()
        print("Customer         Total  Success  Failed  LastAmt      LastDate")
        print("-"*80)
        for c in customers:
            txn_stats = await db.execute(
                select(
                    func.count(BillingTransaction.transaction_id).label("total"),
                    func.sum(case((and_(BillingTransaction.status == "success", BillingTransaction.transaction_type == "payment"), 1), else_=0)).label("paid_ok"),
                    func.sum(case((BillingTransaction.status == "failed", 1), else_=0)).label("failed"),
                ).where(BillingTransaction.customer_id == c.customer_id)
            )
            ts = txn_stats.one()
            last_pay = await db.execute(
                select(BillingTransaction).where(
                    and_(BillingTransaction.customer_id == c.customer_id,
                         BillingTransaction.transaction_type == "payment",
                         BillingTransaction.status == "success")
                ).order_by(BillingTransaction.created_at.desc()).limit(1)
            )
            lp = last_pay.scalar_one_or_none()
            amt = f"INR {float(lp.amount):,.2f}" if lp else "None"
            dt = str(lp.created_at.date()) if lp else "None"
            total = int(ts.total or 0)
            ok = int(ts.paid_ok or 0)
            fail = int(ts.failed or 0)
            print(f"{c.name:<16} {total:>5}  {ok:>7}  {fail:>6}  {amt:>13}  {dt}")

asyncio.run(verify())
