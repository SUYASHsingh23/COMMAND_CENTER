"""
Security utilities: password hashing (bcrypt via passlib) and JWT creation/validation.
Industry-grade: HS256 signing, bcrypt cost factor 12, refresh token hashing.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
import bcrypt

from app.core.config import get_settings

settings = get_settings()

# ─── Password Hashing ────────────────────────────────────────────────────────
# bcrypt with cost-factor 12: ~250ms/hash – industry standard balance
# of security vs latency.

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if plain_password matches hashed_password."""
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """Return a bcrypt hash of the provided password."""
    # Salt with rounds=12
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


# ─── Access JWT ──────────────────────────────────────────────────────────────
def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    """
    Create a short-lived JWT access token.
    `subject` is the customer_id (UUID string).
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,           # identity
        "iat": now,               # issued at
        "exp": expire,            # expiry
        "type": "access",         # token type guard
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate an access token.
    Raises JWTError on any failure (expired, bad sig, wrong type).
    """
    payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    if payload.get("type") != "access":
        raise JWTError("Invalid token type")
    return payload


# ─── Refresh Token ───────────────────────────────────────────────────────────
def generate_refresh_token() -> str:
    """Generate a cryptographically secure opaque refresh token (256-bit)."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """SHA-256 hash the raw refresh token for safe DB storage."""
    return hashlib.sha256(token.encode()).hexdigest()


# ─── Legacy session-token helpers (kept for backwards compatibility) ──────────
def generate_session_token(session_id: str) -> str:
    return hmac.new(
        settings.secret_key.encode(),
        session_id.encode(),
        hashlib.sha256,
    ).hexdigest()


def verify_session_token(session_id: str, token: str) -> bool:
    expected = generate_session_token(session_id)
    return hmac.compare_digest(expected, token)
