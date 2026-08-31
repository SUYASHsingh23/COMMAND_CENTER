"""
Auth API — /api/v1/auth/

POST /register     — create a new customer account
POST /login        — email + password → access + refresh tokens
POST /refresh      — rotate a refresh token → new token pair
POST /logout       — revoke a refresh token
GET  /me           — return the authenticated customer profile
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    generate_refresh_token,
    hash_refresh_token,
)
from app.core.config import get_settings
from app.models.customer import Customer, RefreshToken, Account
from app.api.v1.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    CustomerProfile,
)
from app.api.deps import get_current_customer

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/auth", tags=["auth"])

DB = Annotated[AsyncSession, Depends(get_db)]


# ─── Helper ──────────────────────────────────────────────────────────────────

async def _issue_token_pair(customer: Customer, db: AsyncSession, request: Request | None = None) -> TokenResponse:
    """
    Create a fresh access + refresh token pair for `customer`.
    The refresh token is stored as a SHA-256 hash.
    """
    access_token = create_access_token(subject=str(customer.customer_id))

    raw_refresh = generate_refresh_token()
    hashed = hash_refresh_token(raw_refresh)
    expires = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)

    rt = RefreshToken(
        customer_id=customer.customer_id,
        token_hash=hashed,
        expires_at=expires,
        user_agent=request.headers.get("user-agent") if request else None,
        ip_address=request.client.host if request and request.client else None,
    )
    db.add(rt)
    await db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
    )


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: DB, request: Request):
    """
    Register a new customer.
    Returns an access + refresh token pair immediately so the user is
    signed-in right after registration without a second round-trip.
    """
    # Email uniqueness check
    existing = await db.execute(
        select(Customer).where(Customer.email == payload.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    customer = Customer(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        password_hash=get_password_hash(payload.password),
        is_active=True,
        # Default CRM fields
        city="Mumbai",
        state="Maharashtra",
        customer_tier="standard",
        plan="Basic Connectivity",
    )
    db.add(customer)
    await db.flush()   # get customer_id without full commit

    # Create default Account for the customer
    account = Account(
        customer_id=customer.customer_id,
        plan_name="Basic Connectivity",
        status="active",
        balance=0.0,
        billing_cycle="monthly",
        credit_limit=1000.0,
        data_used_gb=0.0,
    )
    db.add(account)

    tokens = await _issue_token_pair(customer, db, request)
    logger.info("New customer registered: %s", customer.email)
    return tokens


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: DB, request: Request):
    """
    Authenticate via email + password.
    Returns an access + refresh token pair on success.
    """
    result = await db.execute(select(Customer).where(Customer.email == payload.email))
    customer: Customer | None = result.scalar_one_or_none()

    # Constant-time comparison even when customer not found (prevent timing attacks)
    if not customer or not customer.password_hash:
        # Perform a dummy hash to consume the same time
        get_password_hash("dummy_timing_protection")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not verify_password(payload.password, customer.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not customer.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is inactive")

    # Update last_login_at timestamp
    customer.last_login_at = datetime.now(timezone.utc)
    tokens = await _issue_token_pair(customer, db, request)
    logger.info("Customer logged in: %s", customer.email)
    return tokens


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(payload: RefreshRequest, db: DB, request: Request):
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    The old refresh token is revoked immediately (rotation).
    """
    hashed = hash_refresh_token(payload.refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hashed))
    rt: RefreshToken | None = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)
    if not rt or rt.revoked_at is not None or rt.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalid or expired")

    # Revoke old token (rotation)
    rt.revoked_at = now
    await db.flush()

    customer: Customer | None = await db.get(Customer, rt.customer_id)
    if not customer or not customer.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found or inactive")

    tokens = await _issue_token_pair(customer, db, request)
    logger.info("Tokens refreshed for customer: %s", customer.email)
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(payload: RefreshRequest, db: DB):
    """
    Revoke a refresh token, effectively logging the user out.
    The access token remains valid until it naturally expires (~30 min),
    which is acceptable for a stateless JWT system.
    """
    hashed = hash_refresh_token(payload.refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hashed))
    rt: RefreshToken | None = result.scalar_one_or_none()
    if rt and rt.revoked_at is None:
        rt.revoked_at = datetime.now(timezone.utc)
        await db.commit()


@router.get("/me", response_model=CustomerProfile)
async def get_me(current_customer: Customer = Depends(get_current_customer)):
    """
    Return the authenticated customer's profile.
    Used by the frontend on startup to pre-load customer context
    for the Command Center voice agent.
    """
    return current_customer
