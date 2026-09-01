"""
fix_billing_consistency.py
--------------------------
Audits every customer's invoices against their actual plan_name and
corrects the following issues:

1. Invoices with wrong subtotal/tax/total vs the plan_name (happens when
   a plan was changed after seeding or the seeder used wrong rates).
2. Sets a realistic account.balance (prepaid credit buffer) for each customer
   based on their tier:
   - premium  → 2x quarterly premium  (generous prepaid buffer)
   - gold     → 1x quarterly premium
   - basic    → 0.5x quarterly premium
3. Updates billing_cycle to 'quarterly' for all accounts (insurance billing
   is quarterly per PLAN_BILLING definitions).
4. Ensures the line_items description exactly matches the plan name.
5. Recomputes all tax splits (CGST = SGST = tax/2, IGST = 0).

Run: python fix_billing_consistency.py
"""
import asyncio
from decimal import Decimal, ROUND_HALF_UP
from datetime import date, datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.models.billing import Invoice

# ─── Master plan rates (quarterly premium, tax 18% GST) ──────────────────────
PLAN_BILLING = {
    "Health Shield Basic":      Decimal("3999.00"),
    "Health Shield Gold":       Decimal("7499.00"),
    "Health Shield Premium":    Decimal("14999.00"),
    "Motor Comprehensive":      Decimal("8999.00"),
    "Motor Third Party":        Decimal("2499.00"),
    "Motor Comprehensive Plus": Decimal("11999.00"),
    "Home Protector Basic":     Decimal("4999.00"),
    "Home Protector Elite":     Decimal("8499.00"),
}
TAX_RATE = Decimal("18.00")

def compute_amounts(plan_name: str):
    """Return (subtotal, tax_amount, total_amount) for a given plan."""
    subtotal = PLAN_BILLING.get(plan_name, Decimal("3999.00"))
    tax = (subtotal * TAX_RATE / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    total = subtotal + tax
    return subtotal, tax, total

def balance_for_tier(tier: str, quarterly_total: Decimal) -> float:
    """Assign a prepaid balance buffer based on customer tier."""
    multipliers = {
        "premium": Decimal("2.0"),
        "gold":    Decimal("1.0"),
        "basic":   Decimal("0.5"),
    }
    m = multipliers.get(tier, Decimal("0.5"))
    return float((quarterly_total * m).quantize(Decimal("0.01")))


async def fix():
    async with async_session_factory() as db:
        customers = (await db.execute(select(Customer))).scalars().all()
        accounts  = (await db.execute(select(Account))).scalars().all()
        invoices  = (await db.execute(select(Invoice))).scalars().all()

        acct_by_cid = {str(a.customer_id): a for a in accounts}
        inv_by_cid: dict[str, list] = {}
        for inv in invoices:
            inv_by_cid.setdefault(str(inv.customer_id), []).append(inv)

        total_invoices_fixed = 0
        total_accounts_fixed = 0

        print(f"\n{'='*70}")
        print("BILLING CONSISTENCY FIX")
        print(f"{'='*70}\n")

        for customer in customers:
            cid = str(customer.customer_id)
            acct = acct_by_cid.get(cid)
            if not acct:
                print(f"  ⚠  {customer.name}: no account found — skipping")
                continue

            plan = acct.plan_name or customer.plan or "Health Shield Basic"
            subtotal, tax, total = compute_amounts(plan)
            tier = customer.customer_tier or "basic"

            print(f"\n  Customer:  {customer.name}")
            print(f"  Plan:      {plan}")
            print(f"  Subtotal:  ₹{subtotal}  |  Tax: ₹{tax}  |  Total: ₹{total}")

            # ── Fix account ────────────────────────────────────────────────────
            old_cycle = acct.billing_cycle
            old_balance = acct.balance
            new_balance = balance_for_tier(tier, total)

            acct.billing_cycle = "quarterly"
            acct.balance = new_balance
            db.add(acct)
            total_accounts_fixed += 1

            if old_cycle != "quarterly" or old_balance != new_balance:
                print(f"  ✔ Account updated: cycle={old_cycle}→quarterly, balance={old_balance}→{new_balance}")

            # ── Fix invoices ───────────────────────────────────────────────────
            cust_invs = inv_by_cid.get(cid, [])
            for inv in cust_invs:
                needs_fix = (
                    inv.subtotal != subtotal
                    or inv.tax_amount != tax
                    or inv.total_amount != total
                )
                if not needs_fix:
                    continue

                old_sub = inv.subtotal
                old_total = inv.total_amount

                inv.subtotal        = subtotal
                inv.taxable_amount  = subtotal
                inv.tax_amount      = tax
                inv.cgst_amount     = (tax / 2).quantize(Decimal("0.01"))
                inv.sgst_amount     = (tax / 2).quantize(Decimal("0.01"))
                inv.igst_amount     = Decimal("0.00")
                inv.other_tax_amount= Decimal("0.00")
                inv.total_amount    = total

                # Fix amount_paid for paid invoices
                if inv.status == "paid":
                    inv.amount_paid = total
                elif inv.status == "partial":
                    inv.amount_paid = (total / 2).quantize(Decimal("0.01"))
                else:
                    inv.amount_paid = Decimal("0.00")

                # Fix line_items description
                inv.line_items = [{
                    "description": f"{plan} insurance premium — quarterly",
                    "amount": float(subtotal)
                }]

                db.add(inv)
                total_invoices_fixed += 1
                print(f"  ✔ Invoice {inv.invoice_number} ({inv.status}): "
                      f"subtotal {old_sub}→{subtotal}, total {old_total}→{total}, paid→{inv.amount_paid}")

        await db.commit()
        print(f"\n{'='*70}")
        print(f"  DONE — Fixed {total_invoices_fixed} invoices, {total_accounts_fixed} accounts")
        print(f"{'='*70}\n")


asyncio.run(fix())
