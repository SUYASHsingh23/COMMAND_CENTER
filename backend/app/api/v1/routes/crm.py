"""
CRM API Router — /api/v1/crm

Provides full customer profile management: search, create, update,
interaction history, and agent notes. All data is served from PostgreSQL
(with graceful error handling for missing migration columns).
"""
import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, desc, update as sa_update
from app.core.dependencies import get_db
from app.models.customer import Customer, Account, CustomerInteraction, CustomerNote
from app.api.v1.schemas.customer import (
    CustomerDetailResponse,
    CustomerResponse,
    CustomerSearchResult,
    CustomerCreateRequest,
    CustomerUpdateRequest,
    InteractionResponse,
    CustomerNoteResponse,
    CustomerNoteCreate,
    AccountResponse,
)
from app.observability.bus import event_bus
from app.api.websocket.events import CustomerUpdatedEvent

router = APIRouter(prefix="/crm", tags=["crm"])

DB = Annotated[AsyncSession, Depends(get_db)]


# ── helpers ───────────────────────────────────────────────────────────────────

def _customer_to_search(c: Customer) -> dict:
    return {
        "customer_id":    c.customer_id,
        "name":           c.name,
        "phone":          c.phone,
        "email":          c.email,
        "account_number": c.account_number,
        "customer_tier":  getattr(c, "customer_tier", "standard"),
        "last_contact_at":getattr(c, "last_contact_at", None),
    }


def _customer_to_detail(c: Customer, accounts: list[Account]) -> dict:
    acct_list = [
        {
            "account_id":    a.account_id,
            "customer_id":   a.customer_id,
            "plan_name":     a.plan_name,
            "status":        a.status,
            "balance":       float(a.balance),
            "billing_cycle": a.billing_cycle,
            "plan_start_date": getattr(a, "plan_start_date", None),
            "plan_end_date":   getattr(a, "plan_end_date", None),
            "auto_renew":      getattr(a, "auto_renew", True),
            "data_used_gb":    float(getattr(a, "data_used_gb", 0) or 0),
            "credit_limit":    float(getattr(a, "credit_limit", 0) or 0),
            "payment_method":  getattr(a, "payment_method", "UPI"),
            "custom_fields":   getattr(a, "custom_fields", {}) or {},
        }
        for a in accounts
    ]
    return {
        "customer_id":        c.customer_id,
        "name":               c.name,
        "phone":              c.phone,
        "email":              c.email,
        "account_number":     c.account_number,
        "plan":               c.plan,
        "date_of_birth":      getattr(c, "date_of_birth", None),
        "gender":             getattr(c, "gender", None),
        "address_line1":      getattr(c, "address_line1", None),
        "address_line2":      getattr(c, "address_line2", None),
        "city":               getattr(c, "city", None),
        "state":              getattr(c, "state", None),
        "pincode":            getattr(c, "pincode", None),
        "country":            getattr(c, "country", "India"),
        "customer_tier":      getattr(c, "customer_tier", "standard"),
        "customer_since":     getattr(c, "customer_since", None),
        "preferred_language": getattr(c, "preferred_language", "en"),
        "preferred_channel":  getattr(c, "preferred_channel", "voice"),
        "tags":               getattr(c, "tags", []) or [],
        "custom_fields":      getattr(c, "custom_fields", {}) or {},
        "notes":              getattr(c, "notes", None),
        "last_contact_at":    getattr(c, "last_contact_at", None),
        "created_at":         c.created_at,
        "updated_at":         getattr(c, "updated_at", None),
        "accounts":           acct_list,
    }


# ── search / list ─────────────────────────────────────────────────────────────

@router.get("/customers", response_model=list[CustomerSearchResult])
async def search_customers(
    db: DB,
    q: str | None = Query(None, description="Name, phone, email or account number"),
    tier: str | None = Query(None),
    limit: int = Query(40, le=200),
    offset: int = 0,
):
    """Search customers by name, phone, email, or account number."""
    stmt = select(Customer).order_by(desc(Customer.created_at)).limit(limit).offset(offset)

    if q:
        like = f"%{q}%"
        stmt = stmt.where(
            or_(
                Customer.name.ilike(like),
                Customer.phone.ilike(like),
                Customer.email.ilike(like),
                Customer.account_number.ilike(like),
            )
        )
    if tier:
        stmt = stmt.where(Customer.customer_tier == tier)

    result = await db.execute(stmt)
    customers = result.scalars().all()
    return [_customer_to_search(c) for c in customers]


# ── create ────────────────────────────────────────────────────────────────────

@router.post("/customers", response_model=CustomerDetailResponse, status_code=201)
async def create_customer(body: CustomerCreateRequest, db: DB):
    """Create a new customer profile."""
    customer = Customer(
        name=body.name,
        phone=body.phone,
        email=body.email,
        account_number=body.account_number,
        plan=body.plan,
        date_of_birth=body.date_of_birth,
        gender=body.gender,
        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        state=body.state,
        pincode=body.pincode,
        country=body.country,
        customer_tier=body.customer_tier,
        customer_since=body.customer_since,
        preferred_language=body.preferred_language,
        preferred_channel=body.preferred_channel,
        tags=body.tags,
        custom_fields=body.custom_fields,
        notes=body.notes,
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    return _customer_to_detail(customer, [])


# ── get full profile ──────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}", response_model=CustomerDetailResponse)
async def get_customer_detail(customer_id: uuid.UUID, db: DB):
    """Return the full customer profile including all accounts."""
    result = await db.execute(select(Customer).where(Customer.customer_id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    acct_result = await db.execute(select(Account).where(Account.customer_id == customer_id))
    accounts = acct_result.scalars().all()

    return _customer_to_detail(customer, accounts)


# ── quick lookups ─────────────────────────────────────────────────────────────

@router.get("/customers/by-phone/{phone}", response_model=CustomerDetailResponse)
async def get_by_phone(phone: str, db: DB):
    result = await db.execute(select(Customer).where(Customer.phone == phone))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    accts = (await db.execute(select(Account).where(Account.customer_id == customer.customer_id))).scalars().all()
    return _customer_to_detail(customer, accts)


@router.get("/customers/by-account/{account_number}", response_model=CustomerDetailResponse)
async def get_by_account(account_number: str, db: DB):
    result = await db.execute(select(Customer).where(Customer.account_number == account_number))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    accts = (await db.execute(select(Account).where(Account.customer_id == customer.customer_id))).scalars().all()
    return _customer_to_detail(customer, accts)


# ── update ────────────────────────────────────────────────────────────────────

@router.patch("/customers/{customer_id}", response_model=CustomerDetailResponse)
async def update_customer(customer_id: uuid.UUID, body: CustomerUpdateRequest, db: DB):
    """Partially update a customer profile. Only provided fields are changed."""
    result = await db.execute(select(Customer).where(Customer.customer_id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        if hasattr(customer, field):
            setattr(customer, field, value)

    # If plan was changed, sync to account table
    if "plan" in update_data:
        await db.execute(
            sa_update(Account)
            .where(Account.customer_id == customer_id)
            .values(plan_name=update_data["plan"])
        )

    await db.commit()
    await db.refresh(customer)
    accts = (await db.execute(select(Account).where(Account.customer_id == customer_id))).scalars().all()

    # Broadcast real-time update to CRM dashboard
    await event_bus.emit(
        session_id="system",
        event=CustomerUpdatedEvent(session_id="system", customer_id=str(customer_id))
    )

    return _customer_to_detail(customer, accts)


# ── interactions ──────────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/interactions", response_model=list[InteractionResponse])
async def get_interactions(customer_id: uuid.UUID, db: DB, limit: int = 20):
    """Return recent interaction history for a customer."""
    result = await db.execute(
        select(CustomerInteraction)
        .where(CustomerInteraction.customer_id == customer_id)
        .order_by(desc(CustomerInteraction.started_at))
        .limit(limit)
    )
    return result.scalars().all()


# ── notes ─────────────────────────────────────────────────────────────────────

@router.get("/customers/{customer_id}/notes", response_model=list[CustomerNoteResponse])
async def get_notes(customer_id: uuid.UUID, db: DB):
    """Return all agent notes for a customer, newest first."""
    result = await db.execute(
        select(CustomerNote)
        .where(CustomerNote.customer_id == customer_id)
        .order_by(desc(CustomerNote.created_at))
    )
    return result.scalars().all()


@router.post("/customers/{customer_id}/notes", response_model=CustomerNoteResponse, status_code=201)
async def add_note(customer_id: uuid.UUID, body: CustomerNoteCreate, db: DB):
    """Add an agent note to a customer profile."""
    result = await db.execute(select(Customer).where(Customer.customer_id == customer_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Customer not found")

    note = CustomerNote(
        customer_id=customer_id,
        author=body.author,
        content=body.content,
        note_type=body.note_type,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


# ── stats (used by CRM dashboard header) ─────────────────────────────────────

@router.get("/stats")
async def get_crm_stats(db: DB):
    """Aggregate stats for the CRM dashboard header."""
    total = await db.scalar(select(func.count()).select_from(Customer))
    by_tier = await db.execute(
        select(Customer.customer_tier, func.count().label("count"))
        .group_by(Customer.customer_tier)
    )
    tier_dist = {row.customer_tier: row.count for row in by_tier}

    active_accounts = await db.scalar(
        select(func.count()).select_from(Account).where(Account.status == "active")
    )
    return {
        "total_customers":  total or 0,
        "active_accounts":  active_accounts or 0,
        "tier_distribution": tier_dist,
    }
