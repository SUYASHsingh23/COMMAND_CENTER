import asyncio
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from sqlalchemy import select

async def check():
    async with async_session_factory() as db:
        custs = (await db.execute(select(Customer))).scalars().all()
        for c in custs:
            a = (await db.execute(select(Account).where(Account.customer_id == c.customer_id))).scalars().first()
            print(f"Name: {c.name:15} | Email: {c.email:25} | Plan: {c.plan:24} | AcctStatus: {getattr(a, 'status', 'N/A'):10} | Balance: {getattr(a, 'balance', 0)}")

if __name__ == '__main__':
    asyncio.run(check())
