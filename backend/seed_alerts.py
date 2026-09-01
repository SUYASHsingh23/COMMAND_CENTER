"""
seed_alerts.py
--------------
Clears all stale billing_alert rows (which had wrong telecom-era amounts like
INR 588.82, INR 14160, etc.) and re-seeds insurance-accurate, terminology-correct
alerts for every customer based on their actual invoice status and premium amounts.

Run: python seed_alerts.py
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy import select, delete, text
from app.database.session import async_session_factory
from app.models.customer import Customer, Account
from app.models.billing import Invoice, BillingAlert

# Insurance GL-correct alert messages per scenario
def overdue_msg(plan: str, amount: Decimal, inv_num: str, due_date) -> tuple[str, str, str]:
    """Returns (alert_type, title, message) for overdue invoice."""
    return (
        "invoice_overdue",
        f"Premium Overdue — {inv_num}",
        f"Your {plan} insurance premium of ₹{amount:,.2f} (Invoice {inv_num}) was due on "
        f"{due_date.strftime('%d %b %Y')} and remains unpaid. "
        f"Please pay immediately to avoid policy lapse and loss of coverage.",
    )

def partial_msg(plan: str, outstanding: Decimal, inv_num: str, due_date) -> tuple[str, str, str]:
    return (
        "payment_reminder",
        f"Partial Payment — Balance Due ₹{outstanding:,.2f}",
        f"A partial payment was received against {plan} premium (Invoice {inv_num}). "
        f"Outstanding balance of ₹{outstanding:,.2f} is due by "
        f"{due_date.strftime('%d %b %Y')}. Please clear the balance to ensure uninterrupted coverage.",
    )

def sent_msg(plan: str, amount: Decimal, inv_num: str, due_date) -> tuple[str, str, str]:
    return (
        "payment_due",
        f"Premium Due — {inv_num}",
        f"Your {plan} insurance premium of ₹{amount:,.2f} (Invoice {inv_num}) is due on "
        f"{due_date.strftime('%d %b %Y')}. Pay on time to keep your policy active and avoid late fees.",
    )

def renewal_msg(plan: str, amount: Decimal, next_due) -> tuple[str, str, str]:
    return (
        "renewal_reminder",
        f"Policy Renewal — Upcoming Premium",
        f"Your {plan} policy is up for renewal. The next quarterly premium of ₹{amount:,.2f} "
        f"will be due on {next_due.strftime('%d %b %Y')}. Ensure your payment method is active.",
    )

def suspended_msg(plan: str, amount: Decimal) -> tuple[str, str, str]:
    return (
        "account_suspended",
        "Policy Coverage Suspended",
        f"Your {plan} policy coverage has been temporarily suspended due to non-payment of premium "
        f"(₹{amount:,.2f}). Claims will not be processed until your account is reinstated. "
        f"Please make payment immediately or contact your agent.",
    )

def claim_tip_msg(plan: str) -> tuple[str, str, str]:
    return (
        "claim_reminder",
        "Claim Filing Window",
        f"Reminder: Under your {plan} policy, claims must be filed within 30 days of the incident. "
        f"Keep your policy documents handy. Contact our claims desk at claims@insureai.in.",
    )


async def seed():
    async with async_session_factory() as db:
        # Step 1: Clear ALL stale alerts
        deleted = await db.execute(delete(BillingAlert))
        print(f"Cleared all existing billing alerts.")
        await db.flush()

        # Fetch all data
        customers = (await db.execute(select(Customer))).scalars().all()
        accounts  = {str(a.customer_id): a for a in (await db.execute(select(Account))).scalars().all()}
        invoices  = (await db.execute(select(Invoice))).scalars().all()

        inv_by_cid: dict[str, list[Invoice]] = {}
        for inv in invoices:
            inv_by_cid.setdefault(str(inv.customer_id), []).append(inv)

        total_created = 0
        now = datetime.now(timezone.utc)

        print("\n=== Seeding insurance-accurate billing alerts ===\n")

        for customer in customers:
            cid = str(customer.customer_id)
            acct = accounts.get(cid)
            plan = (acct.plan_name if acct else None) or customer.plan or "Insurance Policy"
            cust_invs = sorted(inv_by_cid.get(cid, []), key=lambda x: x.due_date)
            tier = customer.customer_tier or "basic"

            alerts_to_add: list[BillingAlert] = []

            # Find invoice states
            overdue_invs = [i for i in cust_invs if i.status == "overdue"]
            partial_invs = [i for i in cust_invs if i.status == "partial"]
            sent_invs    = [i for i in cust_invs if i.status == "sent"]
            paid_invs    = sorted([i for i in cust_invs if i.status == "paid"], key=lambda x: x.due_date, reverse=True)

            # 1. Overdue alerts (CRITICAL)
            for inv in overdue_invs:
                atype, title, msg = overdue_msg(plan, inv.total_amount, inv.invoice_number, inv.due_date)
                alerts_to_add.append(BillingAlert(
                    alert_id=uuid.uuid4(),
                    customer_id=customer.customer_id,
                    alert_type=atype,
                    severity="critical",
                    title=title,
                    message=msg,
                    entity_type="invoice",
                    entity_id=inv.invoice_id,
                    is_read=False,
                    created_at=now - timedelta(days=3),
                ))

            # 2. Suspended account alert (if account suspended)
            if acct and acct.status == "suspended":
                atype, title, msg = suspended_msg(plan, cust_invs[0].total_amount if cust_invs else Decimal("0"))
                alerts_to_add.append(BillingAlert(
                    alert_id=uuid.uuid4(),
                    customer_id=customer.customer_id,
                    alert_type=atype,
                    severity="critical",
                    title=title,
                    message=msg,
                    entity_type="account",
                    is_read=False,
                    created_at=now - timedelta(days=2),
                ))

            # 3. Partial payment alerts (WARNING)
            for inv in partial_invs:
                outstanding = inv.total_amount - inv.amount_paid
                atype, title, msg = partial_msg(plan, outstanding, inv.invoice_number, inv.due_date)
                alerts_to_add.append(BillingAlert(
                    alert_id=uuid.uuid4(),
                    customer_id=customer.customer_id,
                    alert_type=atype,
                    severity="warning",
                    title=title,
                    message=msg,
                    entity_type="invoice",
                    entity_id=inv.invoice_id,
                    is_read=False,
                    created_at=now - timedelta(days=1),
                ))

            # 4. Sent / pending payment alerts (INFO)
            for inv in sent_invs:
                atype, title, msg = sent_msg(plan, inv.total_amount, inv.invoice_number, inv.due_date)
                alerts_to_add.append(BillingAlert(
                    alert_id=uuid.uuid4(),
                    customer_id=customer.customer_id,
                    alert_type=atype,
                    severity="info",
                    title=title,
                    message=msg,
                    entity_type="invoice",
                    entity_id=inv.invoice_id,
                    is_read=False,
                    created_at=now - timedelta(hours=12),
                ))

            # 5. Renewal reminder for paid-up customers (INFO — upcoming cycle)
            if paid_invs and not overdue_invs and not partial_invs:
                latest = paid_invs[0]
                # Next due = approximately 90 days after last period end
                if latest.billing_period_end:
                    from datetime import date
                    next_due = latest.billing_period_end + timedelta(days=92)
                    atype, title, msg = renewal_msg(plan, latest.total_amount, next_due)
                    alerts_to_add.append(BillingAlert(
                        alert_id=uuid.uuid4(),
                        customer_id=customer.customer_id,
                        alert_type=atype,
                        severity="info",
                        title=title,
                        message=msg,
                        entity_type="invoice",
                        is_read=tier in ("premium", "elite"),  # Premium/Elite see pre-read
                        created_at=now - timedelta(days=7),
                    ))

            # 6. Claim tip for premium/elite customers (INFO)
            if tier in ("premium", "elite"):
                atype, title, msg = claim_tip_msg(plan)
                alerts_to_add.append(BillingAlert(
                    alert_id=uuid.uuid4(),
                    customer_id=customer.customer_id,
                    alert_type=atype,
                    severity="info",
                    title=title,
                    message=msg,
                    entity_type="account",
                    is_read=True,
                    created_at=now - timedelta(days=14),
                ))

            for a in alerts_to_add:
                db.add(a)

            total_created += len(alerts_to_add)
            print(f"  {customer.name:<18} ({tier:<8}) → {len(alerts_to_add)} alerts")

        await db.commit()
        print(f"\n=== DONE — {total_created} alerts created ===")

        # Verify
        async with async_session_factory() as db2:
            counts = await db2.execute(text("""
                SELECT severity, COUNT(*) FROM billing_alert GROUP BY severity ORDER BY severity
            """))
            print("\nAlert breakdown by severity:")
            for r in counts:
                print(f"  {r[0]}: {r[1]}")


asyncio.run(seed())
