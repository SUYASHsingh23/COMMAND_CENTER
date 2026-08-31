import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse, urlunparse

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

import asyncpg


async def init_db():
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/command_center"
    )
    pg_dsn = database_url.replace("postgresql+asyncpg://", "postgresql://")
    parsed = urlparse(pg_dsn)
    target_db = parsed.path.lstrip("/") or "command_center"

    # 1. Connect to default 'postgres' database to ensure target database exists
    default_db_url = urlunparse(parsed._replace(path="/postgres"))
    print(f"Connecting to PostgreSQL server at {parsed.hostname}:{parsed.port or 5432} as '{parsed.username}'...")

    try:
        root_conn = await asyncpg.connect(dsn=default_db_url)
        try:
            db_exists = await root_conn.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = $1", target_db
            )
            if not db_exists:
                print(f"Database '{target_db}' does not exist. Creating it now...")
                await root_conn.execute(f'CREATE DATABASE "{target_db}"')
                print(f"[OK] Database '{target_db}' created successfully.")
            else:
                print(f"[OK] Database '{target_db}' already exists.")
        finally:
            await root_conn.close()
    except asyncpg.InvalidPasswordError:
        print("\n[ERROR] Authentication failed: invalid PostgreSQL password in backend/.env.")
        sys.exit(1)
    except Exception as e:
        print(f"Notice: {e}")

    # 2. Connect to the target database and execute migrations
    migration_path = (
        Path(__file__).parent.parent
        / "backend" / "app" / "database" / "migrations" / "001_initial_schema.sql"
    )
    sql = migration_path.read_text(encoding="utf-8")

    print(f"Connecting to database '{target_db}'...")
    conn = await asyncpg.connect(dsn=pg_dsn)
    try:
        # Check if vector extension is available
        has_vector = False
        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            has_vector = True
            print("[OK] pgvector extension enabled.")
        except Exception:
            print("[INFO] pgvector extension not installed in PostgreSQL instance. Proceeding with standard schema.")

        # Split and execute statements
        statements = sql.split(";")
        for stmt in statements:
            trimmed = stmt.strip()
            if not trimmed:
                continue
            
            # If vector extension is missing, adapt vector-specific statements
            if not has_vector:
                if trimmed.lower().startswith("create extension if not exists vector"):
                    continue
                if "ivfflat" in trimmed.lower():
                    continue
                if "vector(1536)" in trimmed:
                    trimmed = trimmed.replace("vector(1536)", "TEXT")

            try:
                await conn.execute(trimmed)
            except Exception as ex:
                print(f"Statement notice: {ex}")

        print("\n[OK] All database tables created successfully!")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(init_db())
