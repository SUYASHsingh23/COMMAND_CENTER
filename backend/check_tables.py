import asyncio
from app.database.session import async_session_factory
from sqlalchemy import text

async def run():
    async with async_session_factory() as db:
        res = await db.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        ))
        tables = [r[0] for r in res.fetchall()]
        print('Tables in DB:', tables)

asyncio.run(run())
