"""
enrich_transactions.py
----------------------
Updates all existing billing_transaction rows to populate:
- payment_gateway: Indian PG name (Razorpay, PayU, BillDesk, HDFC NACH, SBI ePay)
- upi_txn_id: For UPI payments
- bank_ref: For NEFT/NACH payments
- auth_code: For card payments
- gl_code: Insurance GL codes (INS-PREM-IN, INS-PREM-REF)
- receipt_url: /api/v1/billing/receipts/{invoice_number}

Run: python enrich_transactions.py
"""
import asyncio
import random
import string
from datetime import datetime, timezone
from sqlalchemy import select
from app.database.session import async_session_factory
from app.models.billing import BillingTransaction, Invoice

# ─── Payment gateway mapping ────────────────────────────────────────────────────
METHOD_GATEWAY = {
    "UPI":         "Razorpay",
    "NEFT":        "BillDesk",
    "NACH":        "HDFC NACH",
    "Net Banking": "PayU",
    "Credit Card": "PayU",
    "Debit Card":  "SBI ePay",
    "Card":        "PayU",
    "account_balance": "InsureAI Wallet",
    "original_source": "Razorpay",
}

# Realistic UPI VPAs per customer payment method
UPI_VPA_SUFFIXES = ["@okicici", "@oksbi", "@okaxis", "@ybl", "@paytm", "@ibl", "@okhdfcbank"]

# Indian banks for NEFT/NACH
BANKS_NEFT = ["HDFC", "SBI", "ICICI", "AXIS", "KOTAK", "PNB", "BOB"]
BANKS_NACH = ["HDFC", "SBI", "ICICI", "AXIS"]

# GL codes
GL_PAYMENT = "INS-PREM-IN"       # Premium inflow
GL_REFUND  = "INS-PREM-REF"      # Premium refund
GL_CREDIT  = "INS-CRED-IN"       # Credit adjustment
GL_PENALTY = "INS-LATE-FEE"      # Late fee / penalty


def rand_digits(n: int) -> str:
    return ''.join(random.choices(string.digits, k=n))

def rand_alphanum(n: int) -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))

def make_upi_txn_id(created_at: datetime, suffix: str) -> str:
    dt_str = created_at.strftime("%Y%m%d")
    return f"{dt_str}{rand_digits(12)}{suffix}"

def make_bank_ref(bank: str, txn_type: str) -> str:
    if txn_type == "NACH":
        return f"NACH-{bank}-{rand_digits(10)}"
    return f"NEFT-{bank}-{rand_digits(10)}"

def make_auth_code() -> str:
    return rand_alphanum(6)

def make_receipt_url(invoice_number: str | None) -> str:
    if invoice_number:
        return f"/api/v1/billing/receipts/{invoice_number}"
    return f"/api/v1/billing/receipts/TXN-{rand_digits(8)}"


async def enrich():
    async with async_session_factory() as db:
        transactions = (await db.execute(select(BillingTransaction))).scalars().all()
        invoices_map: dict[str, Invoice] = {}
        inv_rows = (await db.execute(select(Invoice))).scalars().all()
        for inv in inv_rows:
            invoices_map[str(inv.invoice_id)] = inv

        updated = 0
        print(f"=== Enriching {len(transactions)} transactions ===\n")

        # Seed random with a fixed seed for reproducible deterministic data
        random.seed(42)

        for txn in transactions:
            method = txn.payment_method or "UPI"
            txn_type = txn.transaction_type
            created = txn.created_at or datetime.now(timezone.utc)

            # Gateway
            txn.payment_gateway = METHOD_GATEWAY.get(method, "Razorpay")

            # UPI txn ID
            if method in ("UPI", "original_source", "account_balance") or txn.payment_gateway == "Razorpay":
                suffix = random.choice(UPI_VPA_SUFFIXES)
                txn.upi_txn_id = make_upi_txn_id(created, suffix)
                # For UPI: gateway_ref already set as UPI..., complement with proper format
                if txn.gateway_ref and txn.gateway_ref.startswith("UPI"):
                    txn.gateway_ref = f"RZP{rand_digits(10)}"

            # Bank ref for NEFT/NACH
            if method in ("NEFT", "NACH", "Net Banking"):
                bank = random.choice(BANKS_NEFT if method == "NEFT" else BANKS_NACH)
                txn.bank_ref = make_bank_ref(bank, method)
                if txn.gateway_ref and (txn.gateway_ref.startswith("NEFT") or txn.gateway_ref.startswith("NACH")):
                    txn.gateway_ref = txn.bank_ref

            # Auth code for card payments
            if method in ("Credit Card", "Debit Card", "Card"):
                txn.auth_code = make_auth_code()

            # GL codes
            if txn_type == "payment":
                txn.gl_code = GL_PAYMENT
            elif txn_type == "refund":
                txn.gl_code = GL_REFUND
            elif txn_type == "credit":
                txn.gl_code = GL_CREDIT
            elif txn_type == "penalty":
                txn.gl_code = GL_PENALTY
            else:
                txn.gl_code = GL_PAYMENT

            # Receipt URL (from linked invoice)
            inv_num = None
            if txn.invoice_id:
                inv = invoices_map.get(str(txn.invoice_id))
                inv_num = inv.invoice_number if inv else None
            txn.receipt_url = make_receipt_url(inv_num)

            # Cost center for insurance
            txn.cost_center = "INSURANCE-PREMIUM"

            db.add(txn)
            updated += 1

        await db.commit()
        print(f"  ✅ Enriched {updated} transactions")

        # Verification sample
        sample = await db.execute(
            select(BillingTransaction).limit(5)
        )
        print("\nSample enriched transactions:")
        print(f"  {'Type':<10} {'Method':<14} {'Gateway':<22} {'UPI/BankRef':<30} {'GL':<15} {'Receipt'}")
        print("-" * 110)
        for t in sample.scalars():
            ref = t.upi_txn_id or t.bank_ref or t.auth_code or "—"
            print(f"  {t.transaction_type:<10} {(t.payment_method or '—'):<14} {(t.payment_gateway or '—'):<22} {str(ref):<30} {(t.gl_code or '—'):<15} {t.receipt_url or '—'}")


asyncio.run(enrich())
