import asyncio
from app.database.session import async_session_factory
from sqlalchemy import text

async def clear_db():
    async with async_session_factory() as db:
        await db.execute(text('DELETE FROM knowledge_document'))
        await db.commit()
        print('Cleared Postgres knowledge_document table')

asyncio.run(clear_db())
