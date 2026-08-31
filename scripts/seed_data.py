import asyncio
import os
import sys
import uuid
from pathlib import Path
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

import asyncpg


CUSTOMERS = [
    {
        "name": "Priya Sharma",
        "phone": "+91-9876543210",
        "email": "priya.sharma@example.com",
        "account_number": "ACC-001",
        "plan": "Fiber 100Mbps",
        "plan_name": "Fiber 100Mbps",
        "status": "active",
        "balance": 1200.00,
    },
    {
        "name": "Rajan Mehta",
        "phone": "+91-9812345678",
        "email": "rajan.mehta@example.com",
        "account_number": "ACC-002",
        "plan": "Broadband 50Mbps",
        "plan_name": "Broadband 50Mbps",
        "status": "active",
        "balance": 850.00,
    },
    {
        "name": "Anita Desai",
        "phone": "+91-9988776655",
        "email": "anita.desai@example.com",
        "account_number": "ACC-003",
        "plan": "Fiber 200Mbps",
        "plan_name": "Fiber 200Mbps",
        "status": "suspended",
        "balance": -500.00,
    },
    {
        "name": "Suresh Kumar",
        "phone": "+91-9001234567",
        "email": "suresh.kumar@example.com",
        "account_number": "ACC-004",
        "plan": "Mobile Postpaid Elite",
        "plan_name": "Mobile Postpaid Elite",
        "status": "active",
        "balance": 300.00,
    },
    {
        "name": "Kavitha Nair",
        "phone": "+91-9876001234",
        "email": "kavitha.nair@example.com",
        "account_number": "ACC-005",
        "plan": "Fiber 500Mbps",
        "plan_name": "Fiber 500Mbps",
        "status": "active",
        "balance": 2500.00,
    },
]

MOCK_INVOICE_SUMMARY = {
    "ACC-001": {"invoice_id": "INV-001-AUG26", "amount": 1303.00, "status": "unpaid", "period": "August 2026"},
    "ACC-002": {"invoice_id": "INV-002-AUG26", "amount": 649.00, "status": "paid", "period": "August 2026"},
    "ACC-003": {"invoice_id": "INV-003-AUG26", "amount": 1999.00, "status": "overdue", "period": "August 2026"},
    "ACC-004": {"invoice_id": "INV-004-AUG26", "amount": 1299.00, "status": "paid", "period": "August 2026"},
    "ACC-005": {"invoice_id": "INV-005-AUG26", "amount": 3776.00, "status": "unpaid", "period": "August 2026"},
}


async def seed():
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/command_center"
    )
    pg_dsn = database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(dsn=pg_dsn)
    try:
        for c in CUSTOMERS:
            customer_id = uuid.uuid4()
            account_id = uuid.uuid4()
            now = datetime.now(timezone.utc)

            await conn.execute(
                """
                INSERT INTO customer (customer_id, name, phone, email, account_number, plan, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (account_number) DO NOTHING
                """,
                customer_id, c["name"], c["phone"], c["email"],
                c["account_number"], c["plan"], now,
            )

            row = await conn.fetchrow(
                "SELECT customer_id FROM customer WHERE account_number = $1",
                c["account_number"]
            )
            actual_customer_id = row["customer_id"]

            await conn.execute(
                """
                INSERT INTO account (account_id, customer_id, plan_name, status, balance, billing_cycle)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT DO NOTHING
                """,
                account_id, actual_customer_id, c["plan_name"],
                c["status"], c["balance"], "monthly",
            )

            inv = MOCK_INVOICE_SUMMARY[c["account_number"]]
            print(
                f"[OK] Customer: {c['name']} ({c['account_number']}) | "
                f"Account: {c['status']} | "
                f"Invoice {inv['invoice_id']}: INR {inv['amount']} [{inv['status'].upper()}]"
            )

        print("\n[OK] Seed complete - 5 customers, 5 accounts, 5 invoice fixtures ready")
        print("\nInvoice data is served by backend/app/enterprise/billing/service.py")
        print("No separate invoice table — invoices are enterprise mock data (Week 2: tool layer).")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed())
