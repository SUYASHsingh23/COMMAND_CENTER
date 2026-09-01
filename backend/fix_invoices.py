import asyncio
from decimal import Decimal
from sqlalchemy import select
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.models.billing import Invoice

PLAN_BILLING = {
    "Health Shield Basic":      (3999.0,  18.0),
    "Health Shield Gold":       (7499.0,  18.0),
    "Health Shield Premium":    (14999.0, 18.0),
    "Motor Comprehensive":      (8999.0,  18.0),
    "Motor Third Party":        (2499.0,  18.0),
    "Motor Comprehensive Plus": (11999.0, 18.0),
    "Home Protector Basic":     (4999.0,  18.0),
    "Home Protector Elite":     (8499.0,  18.0),
}

async def fix_invoices():
    async with async_session_factory() as db:
        print("=== Fixing Invoices ===")
        invoices = (await db.execute(select(Invoice))).scalars().all()
        accounts = (await db.execute(select(Account))).scalars().all()
        customers = (await db.execute(select(Customer))).scalars().all()

        account_map = {a.account_id: a for a in accounts}
        customer_map = {c.customer_id: c for c in customers}

        updated_count = 0
        for inv in invoices:
            acct = account_map.get(inv.account_id)
            cust = customer_map.get(inv.customer_id)
            
            plan = None
            if acct and acct.plan_name:
                plan = acct.plan_name
            elif cust and cust.plan:
                plan = cust.plan

            if not plan or plan not in PLAN_BILLING:
                # Default if somehow missing
                plan = "Health Shield Basic"

            subtotal_rate, tax_rate = PLAN_BILLING[plan]
            subtotal = Decimal(str(subtotal_rate))
            tax_amount = (subtotal * Decimal(str(tax_rate)) / 100).quantize(Decimal("0.01"))
            total = subtotal + tax_amount

            inv.subtotal = subtotal
            inv.taxable_amount = subtotal
            inv.cgst_amount = tax_amount / 2
            inv.sgst_amount = tax_amount / 2
            inv.tax_amount = tax_amount
            inv.total_amount = total

            if inv.status == "paid":
                inv.amount_paid = total
            elif inv.status == "partial":
                inv.amount_paid = (total / 2).quantize(Decimal("0.01"))
            else:
                inv.amount_paid = Decimal("0.00")

            # Update line items amount
            new_items = []
            if inv.line_items:
                for item in inv.line_items:
                    # Overwrite amount/unit_price in line_items
                    new_item = {**item}
                    new_item["amount"] = float(subtotal)
                    new_item["unit_price"] = str(subtotal)
                    new_items.append(new_item)
            else:
                new_items = [{"description": f"{plan} insurance premium — quarterly", "amount": float(subtotal)}]
            
            inv.line_items = new_items
            db.add(inv)
            updated_count += 1
            print(f"Updated {inv.invoice_number}: Plan {plan}, Subtotal {inv.subtotal}, Total {inv.total_amount}")

        await db.commit()
        print(f"=== Successfully updated {updated_count} invoices ===")

if __name__ == "__main__":
    asyncio.run(fix_invoices())
