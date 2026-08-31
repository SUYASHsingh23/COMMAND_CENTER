"""
Pydantic schemas for the Authentication API.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, UUID4


# ─── Request Models ───────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=20)
    password: str = Field(..., min_length=8, max_length=128, description="Min 8 chars")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── Response Models ──────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # access token lifetime in seconds


class CustomerProfile(BaseModel):
    """Minimal profile returned on /auth/me — enough for the UI and agent pre-loading."""
    customer_id: UUID4
    name: str
    email: Optional[str]
    phone: Optional[str]
    account_number: Optional[str]
    plan: Optional[str]
    customer_tier: str
    preferred_language: str
    is_active: bool
    last_login_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True
