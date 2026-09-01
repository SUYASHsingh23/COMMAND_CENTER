"""
db_migrate_insurance.py — Migrate existing database from telecom to insurance domain.

Updates:
1. account.plan_name: telecom plans → insurance policy names
2. account.plan: same mapping
3. invoice.line_items: "monthly subscription" → "insurance premium — quarterly"
4. appointment.reason: telecom reasons → insurance reasons
5. appointment.intent_category: telecom intents → insurance intents

Run: python db_migrate_insurance.py
"""
import asyncio
import json
from sqlalchemy import select, update, text
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.models.billing import Invoice
from app.models.scheduling import Appointment

# ── Plan mapping: old telecom → new insurance ────────────────────────────────
PLAN_MAP = {
    "ConnectPlus Basic":          "Health Shield Basic",
    "ConnectPlus Mobile Premium": "Health Shield Gold",
    "ConnectPlus Fiber 300":      "Motor Comprehensive",
    "Fiber 200Mbps":              "Health Shield Gold",
    "Fiber 100Mbps":              "Health Shield Basic",
    "Fiber Elite 500":            "Health Shield Premium",
    "Mobile Basic":               "Motor Third Party",
    # also handle any partial references
    "Fiber 200":                  "Health Shield Gold",
    "Fiber 100":                  "Health Shield Basic",
    "Fiber 500":                  "Health Shield Premium",
    "Basic":                      "Health Shield Basic",
}

# Insurance plan round-robin assignment for customers that don't match above
FALLBACK_PLANS = [
    "Health Shield Gold",
    "Motor Comprehensive",
    "Home Protector Basic",
    "Health Shield Premium",
    "Motor Third Party",
    "Health Shield Basic",
    "Motor Comprehensive Plus",
    "Home Protector Elite",
    "Health Shield Gold",
    "Motor Comprehensive",
]


async def migrate():
    async with async_session_factory() as db:
        print("=== InsureAI DB Migration ===\n")

        # ── 1. Update Account plan_name ──────────────────────────────────────
        print("--- Updating Account plan_name values ---")
        accounts = (await db.execute(select(Account))).scalars().all()
        for i, acct in enumerate(accounts):
            old_plan = acct.plan_name or ""
            # Try to find exact or partial match
            new_plan = None
            for old_key, new_val in PLAN_MAP.items():
                if old_key.lower() in old_plan.lower():
                    new_plan = new_val
                    break
            if not new_plan:
                new_plan = FALLBACK_PLANS[i % len(FALLBACK_PLANS)]

            if acct.plan_name != new_plan:
                print(f"  Account {str(acct.account_id)[:8]}...: '{acct.plan_name}' → '{new_plan}'")
                acct.plan_name = new_plan
                # Also update plan field on customer if linked
                if hasattr(acct, 'plan') and acct.plan:
                    acct.plan = new_plan
                db.add(acct)

        await db.flush()
        print(f"  ✓ Updated {len(accounts)} accounts\n")

        # ── 2. Update Customer.plan field ────────────────────────────────────
        print("--- Updating Customer plan field ---")
        customers = (await db.execute(select(Customer))).scalars().all()
        for i, c in enumerate(customers):
            if hasattr(c, 'plan') and c.plan:
                old_plan = c.plan
                new_plan = None
                for old_key, new_val in PLAN_MAP.items():
                    if old_key.lower() in old_plan.lower():
                        new_plan = new_val
                        break
                if not new_plan:
                    new_plan = FALLBACK_PLANS[i % len(FALLBACK_PLANS)]
                if c.plan != new_plan:
                    print(f"  Customer {c.name}: plan '{c.plan}' → '{new_plan}'")
                    c.plan = new_plan
                    db.add(c)

        await db.flush()
        print(f"  ✓ Updated customer plan fields\n")

        # ── 3. Update Invoice line_items descriptions ────────────────────────
        print("--- Updating Invoice line_items descriptions ---")
        invoices = (await db.execute(select(Invoice))).scalars().all()
        updated_inv = 0
        for inv in invoices:
            if inv.line_items and isinstance(inv.line_items, list):
                changed = False
                new_items = []
                for item in inv.line_items:
                    desc = item.get("description", "")
                    if "subscription" in desc.lower() or "connectplus" in desc.lower() or "fiber" in desc.lower() or "mobile" in desc.lower():
                        # Extract plan name from description or use generic
                        new_desc = desc
                        for old_key, new_val in PLAN_MAP.items():
                            if old_key.lower() in desc.lower():
                                new_desc = f"{new_val} insurance premium — quarterly"
                                break
                        if new_desc == desc:
                            new_desc = f"Insurance premium — quarterly"
                        item = {**item, "description": new_desc}
                        changed = True
                    new_items.append(item)
                if changed:
                    inv.line_items = new_items
                    db.add(inv)
                    updated_inv += 1

        await db.flush()
        print(f"  ✓ Updated {updated_inv} invoice line_items\n")

        # ── 4. Update Appointment reasons ────────────────────────────────────
        print("--- Updating Appointment reason fields ---")
        appt_reason_map = {
            "Billing query for overdue invoice":    "Health claim reimbursement follow-up",
            "Internet speed below subscribed plan": "Motor insurance renewal inquiry",
            "Plan upgrade consultation":            "Home insurance coverage enhancement",
            "New connection installation request":  "New health policy enrollment assistance",
            "Payment confirmation after UPI transfer": "Premium payment confirmation after UPI transfer",
            "Service restoration after payment":   "Cashless hospitalization claim assistance",
            "Retention — considering cancellation": "Policy surrender — considering cancellation",
            "WiFi router replacement":              "Motor vehicle surveyor visit scheduling",
            "Data pack add-on request":             "Add-on rider request for health policy",
            "Account migration to new address":     "Home insurance claim for water damage",
        }
        appt_intent_map = {
            "installation": "sales",
            "technical":    "technical",
        }

        appointments = (await db.execute(select(Appointment))).scalars().all()
        updated_appts = 0
        for appt in appointments:
            changed = False
            old_reason = appt.reason or ""
            for old_r, new_r in appt_reason_map.items():
                if old_r.lower() in old_reason.lower():
                    appt.reason = new_r
                    changed = True
                    break

            # Update intent_category if it was telecom-specific
            if appt.intent_category in appt_intent_map:
                # keep most as-is, just remap installation
                if appt.intent_category == "installation":
                    appt.intent_category = "sales"
                    changed = True

            # Update ai_summary
            if appt.ai_summary and ("Customer" in str(appt.ai_summary)):
                appt.ai_summary = str(appt.ai_summary).replace(
                    "needs:", "needs insurance help with:"
                )
                changed = True

            if changed:
                db.add(appt)
                updated_appts += 1

        await db.flush()
        print(f"  ✓ Updated {updated_appts} appointments\n")

        # ── 5. Clear old telecom content from knowledge_document audit table ─
        print("--- Clearing old telecom RAG audit records ---")
        result = await db.execute(text("DELETE FROM knowledge_document WHERE 1=1"))
        print(f"  ✓ Deleted RAG audit records (will re-seed with insurance content)\n")

        await db.commit()
        print("=== Migration Complete! ===")
        print("Next step: Run 'python run_seeder.py' to populate ChromaDB with insurance knowledge.")


asyncio.run(migrate())
