import asyncio
import os
import sys

sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent.parent / 'backend'))

from dotenv import load_dotenv
load_dotenv(__import__('pathlib').Path(__file__).parent.parent / 'backend' / '.env')

import asyncpg


async def main():
    db_url = os.environ['DATABASE_URL'].replace('postgresql+asyncpg://', 'postgresql://')
    conn = await asyncpg.connect(dsn=db_url)

    tables = await conn.fetch(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    )
    print('Tables:', [r['table_name'] for r in tables])

    try:
        await conn.execute('CREATE EXTENSION IF NOT EXISTS vector')
        print('pgvector extension: OK')
    except Exception as e:
        print(f'pgvector extension error: {e}')

    try:
        cols = await conn.fetch(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='knowledge_chunk' ORDER BY ordinal_position"
        )
        print('knowledge_chunk columns:', [(r['column_name'], r['data_type']) for r in cols])
    except Exception as e:
        print(f'knowledge_chunk check error: {e}')

    await conn.close()


asyncio.run(main())
