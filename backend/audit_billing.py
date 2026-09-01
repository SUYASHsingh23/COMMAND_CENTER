import asyncio
from app.database.session import async_session_factory
from sqlalchemy import text

async def full_audit():
    async with async_session_factory() as db:
        # 1. Transaction + invoice count per customer
        rows = await db.execute(text("""
            SELECT c.name, c.customer_tier, a.plan_name,
                   COUNT(DISTINCT bt.transaction_id) as txn_count,
                   COUNT(DISTINCT i.invoice_id) as inv_count,
                   SUM(CASE WHEN i.status='paid' THEN 1 ELSE 0 END) as paid_inv
            FROM customer c
            JOIN account a ON a.customer_id = c.customer_id
            LEFT JOIN invoice i ON i.customer_id = c.customer_id
            LEFT JOIN billing_transaction bt ON bt.customer_id = c.customer_id
            GROUP BY c.name, c.customer_tier, a.plan_name
            ORDER BY c.name
        """))
        print("Customer         Tier     Plan                     TxnCnt  InvCnt  PaidInv")
        print("-"*85)
        for r in rows:
            print(f"{r[0]:<16} {r[1]:<8} {r[2]:<24} {r[3]:>6}  {r[4]:>6}  {r[5]:>7}")

        # 2. Billing alerts
        print()
        alerts = await db.execute(text("SELECT customer_id, alert_type, severity, title, message FROM billing_alert LIMIT 15"))
        print("Billing Alerts:")
        rows2 = alerts.fetchall()
        if not rows2:
            print("  (none)")
        for r in rows2:
            print(f"  [{r[2]}] {r[1]}: {r[3]} -- {str(r[4])[:60]}")

        # 3. Account payment_method and custom_fields
        print()
        cf = await db.execute(text("""
            SELECT c.name, a.payment_method, a.custom_fields, a.billing_cycle, a.balance
            FROM customer c JOIN account a ON a.customer_id=c.customer_id
            ORDER BY c.name
        """))
        print("Account payment_method / billing_cycle / balance:")
        for r in cf:
            print(f"  {r[0]:<16} method={r[1]:<14} cycle={r[3]:<12} balance={r[4]}")

        # 4. Transactions - check amounts vs invoice totals
        print()
        txn_detail = await db.execute(text("""
            SELECT c.name, bt.transaction_type, bt.status, bt.amount, bt.payment_method,
                   bt.gateway_ref, bt.created_at::date
            FROM billing_transaction bt
            JOIN customer c ON c.customer_id = bt.customer_id
            ORDER BY c.name, bt.created_at
        """))
        print("All transactions:")
        for r in txn_detail:
            print(f"  {r[0]:<16} {r[1]:<10} {r[2]:<8} {float(r[3]):>10,.2f}  {r[4]:<14} {r[5]:<20} {r[6]}")

asyncio.run(full_audit())
