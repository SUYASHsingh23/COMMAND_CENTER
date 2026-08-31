import asyncio
import os
from sqlalchemy import select
from app.database.session import async_session_factory
from app.models.customer import Customer
from app.core.security import get_password_hash

async def seed_passwords():
    async with async_session_factory() as db:
        result = await db.execute(select(Customer))
        customers = result.scalars().all()
        
        default_password = "Password123!"
        hashed_password = get_password_hash(default_password)
        
        count = 0
        for customer in customers:
            customer.password_hash = hashed_password
            customer.is_active = True
            count += 1
            print(f"Force updated password for: {customer.email}")
                
        await db.commit()
        print(f"\nSuccessfully forced '{default_password}' as the password for {count} users.")

if __name__ == "__main__":
    os.environ["PYTHONPATH"] = os.getcwd()
    asyncio.run(seed_passwords())
