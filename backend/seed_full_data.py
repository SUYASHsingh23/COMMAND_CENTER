"""
seed_full_data.py — Populate complete, realistic data for all 10 InsureAI policy-holders.

Fixes:
1. Fills in missing city/state/customer_since on existing policy-holders
2. Adds 3 premium invoices per policy-holder (paid, pending, overdue) — realistic Indian insurance billing
3. Adds appointments for policy-holders that don't have one
4. All data is consistent with real DB schema (uses total_amount, not amount)

Run: python seed_full_data.py
"""
import asyncio
import uuid
from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
from sqlalchemy import select, update, text
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.models.billing import Invoice
from app.models.scheduling import Appointment


# ─── Customer enrichment data ──────────────────────────────────────────────────
CUSTOMER_UPDATES = {
    # name -> {city, state, customer_since, tier}
    "Anita Desai":   {"city": "Mumbai",    "state": "Maharashtra", "customer_since": date(2021, 3, 15), "customer_tier": "premium"},
    "Priya Sharma":  {"city": "Delhi",     "state": "Delhi",       "customer_since": date(2020, 7, 1),  "customer_tier": "gold"},
    "Rajan Mehta":   {"city": "Bangalore", "state": "Karnataka",   "customer_since": date(2019, 11, 20),"customer_tier": "premium"},
    "Suresh Kumar":  {"city": "Chennai",   "state": "Tamil Nadu",  "customer_since": date(2022, 1, 10), "customer_tier": "basic"},
    "Kavitha Nair":  {"city": "Kochi",     "state": "Kerala",      "customer_since": date(2020, 5, 5),  "customer_tier": "gold"},
    "Amit Patel":    {"city": "Ahmedabad", "state": "Gujarat",     "customer_since": date(2023, 2, 28), "customer_tier": "basic"},
    "Priya Nair":    {"city": "Kochi",     "state": "Kerala",      "customer_since": date(2021, 8, 14), "customer_tier": "gold"},
    "Rahul Sharma":  {"city": "Pune",      "state": "Maharashtra", "customer_since": date(2022, 4, 1),  "customer_tier": "basic"},
    "Sneha Reddy":   {"city": "Hyderabad", "state": "Telangana",   "customer_since": date(2023, 6, 15), "customer_tier": "basic"},
    "Vikram Singh":  {"city": "Jaipur",    "state": "Rajasthan",   "customer_since": date(2021, 12, 1), "customer_tier": "gold"},
}

# ─── Insurance Premium templates per policy ───────────────────────────────────
# format: (subtotal, tax_rate)
# GST at 18% on insurance premiums
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

today = date.today()


def make_invoice(customer_id_str, account_id_str, invoice_num, period_months_ago, status, plan="Health Shield Basic"):
    """Create an Invoice ORM object for a given billing period."""
    cid = uuid.UUID(customer_id_str)
    aid = uuid.UUID(account_id_str)

    period_start = date(today.year, today.month, 1) - timedelta(days=30 * period_months_ago)
    period_start = date(period_start.year, period_start.month, 1)
    # Last day of that month
    next_month = date(period_start.year + (period_start.month // 12), ((period_start.month % 12) + 1), 1)
    period_end = next_month - timedelta(days=1)
    due = period_end + timedelta(days=15)
    issue = period_start + timedelta(days=2)

    subtotal_rate, tax_rate = PLAN_BILLING.get(plan, (699.0, 18.0))
    subtotal = Decimal(str(subtotal_rate))
    tax_amount = (subtotal * Decimal(str(tax_rate)) / 100).quantize(Decimal("0.01"))
    total = subtotal + tax_amount

    if status == "paid":
        amount_paid = total
        paid_at = datetime(due.year, due.month, min(due.day, 28), 10, 0, tzinfo=timezone.utc)
    elif status == "partial":
        amount_paid = (total / 2).quantize(Decimal("0.01"))
        paid_at = None
    else:
        amount_paid = Decimal("0.00")
        paid_at = None

    return Invoice(
        invoice_id=uuid.uuid4(),
        customer_id=cid,
        account_id=aid,
        invoice_number=invoice_num,
        status=status,
        billing_period_start=period_start,
        billing_period_end=period_end,
        due_date=due,
        issue_date=issue,
        subtotal=subtotal,
        discount_amount=Decimal("0.00"),
        taxable_amount=subtotal,
        cgst_amount=tax_amount / 2,
        sgst_amount=tax_amount / 2,
        igst_amount=Decimal("0.00"),
        other_tax_amount=Decimal("0.00"),
        tax_amount=tax_amount,
        total_amount=total,
        amount_paid=amount_paid,
        currency="INR",
        line_items=[{"description": f"{plan} insurance premium — quarterly", "amount": float(subtotal)}],
        sent_via="email",
        sent_at=datetime(issue.year, issue.month, issue.day, 9, 0, tzinfo=timezone.utc),
        paid_at=paid_at,
        late_fee_applied=False,
        late_fee_amount=Decimal("0.00"),
        custom_fields={},
    )


async def seed():
    async with async_session_factory() as db:
        print("=== Fetching customers and accounts ===")
        cust_rows = (await db.execute(select(Customer))).scalars().all()
        customers_by_name = {c.name: c for c in cust_rows}
        print(f"Found {len(customers_by_name)} customers")

        acct_rows = (await db.execute(select(Account))).scalars().all()
        accounts_by_customer = {}
        for a in acct_rows:
            cid = str(a.customer_id)
            if cid not in accounts_by_customer:
                accounts_by_customer[cid] = a

        # ── 1. Enrich customer profiles ──────────────────────────────────────
        print("\n=== Enriching customer profiles ===")
        for name, updates in CUSTOMER_UPDATES.items():
            if name in customers_by_name:
                c = customers_by_name[name]
                changed = []
                if not c.city:
                    c.city = updates["city"]
                    changed.append(f"city={c.city}")
                if not c.state:
                    c.state = updates["state"]
                    changed.append(f"state={c.state}")
                if not c.customer_since:
                    c.customer_since = updates["customer_since"]
                    changed.append(f"since={c.customer_since}")
                if not c.customer_tier or c.customer_tier == "basic":
                    c.customer_tier = updates.get("customer_tier", "basic")
                    changed.append(f"tier={c.customer_tier}")
                db.add(c)
                if changed:
                    print(f"  {name}: {', '.join(changed)}")
                else:
                    print(f"  {name}: already complete")
        await db.flush()

        # ── 2. Check existing invoices per customer ───────────────────────────
        print("\n=== Checking existing invoices ===")
        existing_inv = (await db.execute(select(Invoice))).scalars().all()
        inv_by_cid: dict[str, list] = {}
        for inv in existing_inv:
            k = str(inv.customer_id)
            inv_by_cid.setdefault(k, []).append(inv)
        for cid, invs in inv_by_cid.items():
            name = next((c.name for c in cust_rows if str(c.customer_id) == cid), cid)
            print(f"  {name}: {len(invs)} invoices")

        # ── 3. Add invoices for customers with fewer than 3 ──────────────────
        print("\n=== Seeding invoices ===")
        inv_counter = len(existing_inv) + 1
        for c in cust_rows:
            cid_str = str(c.customer_id)
            existing = inv_by_cid.get(cid_str, [])
            if len(existing) >= 3:
                print(f"  {c.name}: already has {len(existing)} invoices — skipping")
                continue

            acct = accounts_by_customer.get(cid_str)
            if not acct:
                print(f"  {c.name}: no account found — skipping")
                continue

            plan = acct.plan_name or c.plan or "Health Shield Basic"
            aid_str = str(acct.account_id)
            existing_months = {inv.billing_period_start.month for inv in existing if inv.billing_period_start}
            added = 0

            # We want paid (2 months ago), sent (last month), and one overdue/partial
            candidates = [
                (2, "paid"),
                (1, "sent"),
                (0, "overdue" if c.customer_tier in ("basic", "standard") else "partial"),
            ]
            for months_ago, status in candidates:
                period_start = date(today.year, today.month, 1) - timedelta(days=30 * months_ago)
                period_start = date(period_start.year, period_start.month, 1)
                if period_start.month in existing_months:
                    continue  # Skip if this period already has an invoice
                inv_num = f"INV-{today.year}-{inv_counter:05d}"
                inv_obj = make_invoice(cid_str, aid_str, inv_num, months_ago, status, plan)
                db.add(inv_obj)
                inv_counter += 1
                added += 1
                print(f"  {c.name}: +invoice {inv_num} ({status}) for period {period_start.strftime('%b %Y')}")

            if added == 0:
                print(f"  {c.name}: no new invoices needed")

        await db.flush()

        # ── 4. Ensure every customer has at least 1 appointment ──────────────
        print("\n=== Checking appointments ===")
        appt_rows = (await db.execute(select(Appointment))).scalars().all()
        appt_by_cid: dict[str, list] = {}
        for a in appt_rows:
            k = str(a.customer_id)
            appt_by_cid.setdefault(k, []).append(a)

        # Service types — just pick a consistent UUID for seeding
        # We'll use a fixed known service_type_id from existing appointments
        existing_service_ids = list({str(a.service_type_id) for a in appt_rows if a.service_type_id})
        existing_agent_ids = list({str(a.agent_id) for a in appt_rows if a.agent_id})

        if not existing_service_ids or not existing_agent_ids:
            print("  No existing service_type_ids or agent_ids found — skipping appointment seeding")
        else:
            service_id = uuid.UUID(existing_service_ids[0])
            agent_id = uuid.UUID(existing_agent_ids[0])
            appt_counter = len(appt_rows) + 1

            APPT_REASONS = {
                "Anita Desai":   ("Health claim reimbursement follow-up", "billing", "high"),
                "Priya Sharma":  ("Motor insurance renewal inquiry", "sales", "medium"),
                "Rajan Mehta":   ("Home insurance coverage enhancement", "sales", "low"),
                "Suresh Kumar":  ("New health policy enrollment assistance", "sales", "medium"),
                "Kavitha Nair":  ("Premium payment confirmation after UPI transfer", "billing", "low"),
                "Amit Patel":    ("Cashless hospitalization claim assistance", "billing", "urgent"),
                "Priya Nair":    ("Policy surrender — considering cancellation", "retention", "high"),
                "Rahul Sharma":  ("Motor vehicle surveyor visit scheduling", "technical", "medium"),
                "Sneha Reddy":   ("Add-on rider request for health policy", "sales", "low"),
                "Vikram Singh":  ("Home insurance claim for water damage", "billing", "medium"),
            }

            for c in cust_rows:
                cid_str = str(c.customer_id)
                if appt_by_cid.get(cid_str):
                    print(f"  {c.name}: already has {len(appt_by_cid[cid_str])} appointment(s)")
                    continue

                acct = accounts_by_customer.get(cid_str)
                reason_data = APPT_REASONS.get(c.name, ("General support call", "support", "medium"))
                reason, intent, priority = reason_data
                scheduled = datetime.now(timezone.utc) + timedelta(days=1, hours=9)

                appt = Appointment(
                    appointment_id=uuid.uuid4(),
                    appointment_number=f"APT-{today.year}-{appt_counter:05d}",
                    customer_id=c.customer_id,
                    account_id=acct.account_id if acct else None,
                    agent_id=agent_id,
                    service_type_id=service_id,
                    booked_via="ai_agent",
                    status="scheduled",
                    priority=priority,
                    channel="voice_call",
                    scheduled_at=scheduled,
                    reason=reason,
                    intent_category=intent,
                    urgency_signal="calm",
                    sentiment_score=Decimal("0.5"),
                    ai_summary=f"Customer {c.name} needs: {reason}",
                    ai_suggested_actions=[{"action": "Resolve enquiry promptly", "priority": "high"}],
                    ai_risk_flags=[],
                    customer_snapshot={
                        "name": c.name,
                        "email": c.email,
                        "phone": c.phone,
                        "customer_id": str(c.customer_id),
                        "account_number": c.account_number,
                        "customer_tier": c.customer_tier or "basic",
                    },
                    billing_snapshot={},
                    conversation_transcript=[],
                    previous_interactions=[],
                    follow_up_required=False,
                    tags=[intent],
                    custom_fields={},
                )
                db.add(appt)
                appt_counter += 1
                print(f"  {c.name}: +appointment APT-{today.year}-{appt_counter-1:05d} ({reason[:40]})")

        await db.commit()
        print("\n=== Seed complete! ===")

        # Final summary
        async with async_session_factory() as db2:
            inv_count = (await db2.execute(text("SELECT COUNT(*) FROM invoice"))).scalar()
            appt_count = (await db2.execute(text("SELECT COUNT(*) FROM appointment"))).scalar()
            cust_count = (await db2.execute(text("SELECT COUNT(*) FROM customer"))).scalar()
            print(f"  Customers: {cust_count}")
            print(f"  Invoices:  {inv_count}")
            print(f"  Appointments: {appt_count}")


asyncio.run(seed())
