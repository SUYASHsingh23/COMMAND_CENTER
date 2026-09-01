import asyncio
from sqlalchemy import text
from app.database.session import async_session_factory

async def update_tiers():
    async with async_session_factory() as db:
        await db.execute(text("UPDATE customer SET customer_tier = 'premium' WHERE customer_tier = 'gold'"))
        await db.execute(text("UPDATE customer SET customer_tier = 'gold' WHERE customer_tier = 'silver'"))
        await db.execute(text("UPDATE customer SET customer_tier = 'basic' WHERE customer_tier = 'standard'"))
        await db.execute(text("UPDATE customer SET customer_tier = 'elite' WHERE customer_tier = 'platinum'"))
        await db.commit()
        print("Database customer tiers updated.")

asyncio.run(update_tiers())
