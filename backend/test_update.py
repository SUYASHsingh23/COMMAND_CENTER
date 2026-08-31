import asyncio
from app.enterprise.crm.service import CRMService
from app.database.session import async_session_factory
from sqlalchemy import select
from app.models.customer import Customer

async def main():
    service = CRMService()
    async with async_session_factory() as db:
        cust = (await db.execute(select(Customer).limit(1))).scalar_one_or_none()
        if not cust:
            print("No customers")
            return
        cid = str(cust.customer_id)
        print("Customer:", cid, cust.city)
    
    res = await service.update_customer(cid, {"city": "New City"})
    print("Result:", res)

asyncio.run(main())
