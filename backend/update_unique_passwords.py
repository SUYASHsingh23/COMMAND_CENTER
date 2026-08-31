import asyncio
import os
import json
from sqlalchemy import select
from app.database.session import async_session_factory
from app.models.customer import Customer
from app.core.security import get_password_hash

async def seed_unique_passwords():
    async with async_session_factory() as db:
        result = await db.execute(select(Customer))
        customers = result.scalars().all()
        
        credentials = []
        for i, customer in enumerate(customers):
            # Extract first name to make a unique password
            first_name = customer.name.split()[0]
            unique_password = f"{first_name}Pass123!"
            
            customer.password_hash = get_password_hash(unique_password)
            customer.is_active = True
            
            credentials.append({
                "name": customer.name,
                "email": customer.email,
                "password": unique_password
            })
            
        await db.commit()
        print(json.dumps(credentials, indent=2))

if __name__ == "__main__":
    os.environ["PYTHONPATH"] = os.getcwd()
    asyncio.run(seed_unique_passwords())
