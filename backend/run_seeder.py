import asyncio
from app.database.session import async_session_factory
from app.orchestrator.rag.seeder import seed_knowledge_base

async def main():
    async with async_session_factory() as db:
        await seed_knowledge_base(db)

if __name__ == "__main__":
    asyncio.run(main())
