"""
export_seed_data.py
===================
Exports all tables from the active PostgreSQL database into a clean,
portable SQL script (scripts/seed_database.sql) with ON CONFLICT DO NOTHING clauses.

Excluded:
- refresh_token (contains ephemeral/active session tokens)
- vector / binary internals that are rebuilt by the RAG seeder
"""

import asyncio
import os
import sys
import json
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

import asyncpg

# Ordered tables respecting foreign key relationships
TABLE_ORDER = [
    "customer",
    "account",
    "billing_plan",
    "agent",
    "service_type",
    "invoice",
    "billing_transaction",
    "billing_alert",
    "refund_request",
    "appointment",
    "appointment_note",
    "conversation",
    "conversation_state",
    "message",
    "intent",
    "call_summary",
    "escalation",
    "plan_event",
    "tool_execution",
    "workflow_execution",
    "knowledge_document",
]

def sql_quote(val):
    if val is None:
        return "NULL"
    elif isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    elif isinstance(val, (int, float)):
        return str(val)
    elif isinstance(val, Decimal):
        return str(val)
    elif isinstance(val, (UUID,)):
        return f"'{str(val)}'::uuid"
    elif isinstance(val, (datetime, date)):
        return f"'{val.isoformat()}'"
    elif isinstance(val, (dict, list)):
        dumped = json.dumps(val).replace("'", "''")
        return f"'{dumped}'::jsonb"
    elif isinstance(val, str):
        escaped = val.replace("'", "''")
        return f"'{escaped}'"
    else:
        escaped = str(val).replace("'", "''")
        return f"'{escaped}'"


async def export_data():
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/command_center"
    ).replace("postgresql+asyncpg://", "postgresql://")

    print(f"Connecting to database to export seed fixtures...")
    conn = await asyncpg.connect(dsn=db_url)

    out_file = Path(__file__).parent / "seed_database.sql"
    
    with open(out_file, "w", encoding="utf-8") as f:
        f.write("-- =============================================================================\n")
        f.write("-- InsureAI Command Center 3.0 — Complete Database Seed Fixtures\n")
        f.write(f"-- Exported: {datetime.utcnow().isoformat()}Z\n")
        f.write("-- Tables: Customers, Accounts, Plans, Invoices, Transactions, Alerts, Appointments,\n")
        f.write("--         Refunds, Agents, Conversations, Messages, Summaries & Tool Executions\n")
        f.write("-- Safe to re-run: Uses ON CONFLICT DO NOTHING for idempotency.\n")
        f.write("-- =============================================================================\n\n")
        f.write("SET statement_timeout = 0;\n")
        f.write("SET lock_timeout = 0;\n")
        f.write("SET client_encoding = 'UTF8';\n")
        f.write("SET standard_conforming_strings = on;\n\n")

        for table in TABLE_ORDER:
            # Check if table exists
            exists = await conn.fetchval(
                "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
                table
            )
            if not exists:
                print(f"Skipping missing table: {table}")
                continue

            # Fetch columns (excluding generated columns like outstanding_amount)
            col_info = await conn.fetch(
                """
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema='public' AND table_name=$1 
                  AND (is_generated IS NULL OR is_generated != 'ALWAYS')
                ORDER BY ordinal_position
                """,
                table
            )
            cols = [c["column_name"] for c in col_info]
            col_str = ", ".join([f'"{c}"' for c in cols])

            # Fetch primary key columns for ON CONFLICT clause
            pk_rows = await conn.fetch(
                """
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_name = $1
                ORDER BY kcu.ordinal_position
                """,
                table
            )
            pk_cols = [p["column_name"] for p in pk_rows]
            conflict_clause = f'ON CONFLICT ("{pk_cols[0]}") DO NOTHING' if pk_cols else "ON CONFLICT DO NOTHING"

            # Fetch rows
            rows = await conn.fetch(f'SELECT * FROM "{table}"')
            print(f"Exporting table '{table}': {len(rows)} rows...")

            if not rows:
                continue

            f.write(f"\n-- -----------------------------------------------------------------------------\n")
            f.write(f"-- Data for table: {table} ({len(rows)} rows)\n")
            f.write(f"-- -----------------------------------------------------------------------------\n")

            for r in rows:
                val_strs = [sql_quote(r[c]) for c in cols]
                values_joined = ", ".join(val_strs)
                sql_line = f'INSERT INTO "{table}" ({col_str}) VALUES ({values_joined}) {conflict_clause};\n'
                f.write(sql_line)

        f.write("\n-- End of seed fixtures\n")

    await conn.close()
    print(f"\n[OK] Export completed successfully! Saved to: {out_file}")
    file_size_kb = out_file.stat().st_size / 1024
    print(f"Seed file size: {file_size_kb:.1f} KB")


if __name__ == "__main__":
    asyncio.run(export_data())
