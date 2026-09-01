import asyncio
from app.database.session import async_session_factory
from sqlalchemy import text

async def show_account_balances():
    async with async_session_factory() as db:
        rows = await db.execute(text('''
            SELECT c.name, a.plan_name, a.balance, a.outstanding_amount, 
                   a.last_payment_date, a.next_due_date, a.billing_cycle,
                   a.account_status
            FROM customer c
            JOIN account a ON a.customer_id = c.customer_id
            ORDER BY c.name
        '''))
        print("Customer         Plan                       Balance  Outstanding  LastPaid    NextDue     Cycle   Status")
        print("-" * 110)
        for r in rows:
            print(f"{str(r[0]):<16} {str(r[1]):<25} {str(r[2]):>10} {str(r[3]):>12} {str(r[4]):>12} {str(r[5]):>12} {str(r[6]):<10} {str(r[7]):<10}")

asyncio.run(show_account_balances())
