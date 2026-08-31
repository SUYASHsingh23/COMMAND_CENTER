"""
Reusable FastAPI dependencies for authentication.
Import `get_current_customer` in any route to protect it.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.core.dependencies import get_db
from app.models.customer import Customer

# The tokenUrl here is the path clients post to in order to get a token.
# This enables the Swagger UI "Authorize" button to work correctly.
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

_CREDENTIALS_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

_INACTIVE_EXC = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="Account is inactive",
)


async def get_current_customer(
    token: str = Depends(_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Customer:
    """
    Decode the JWT access token, load the Customer from the DB.
    Raises 401 if the token is invalid/expired.
    Raises 403 if the account is deactivated.
    """
    try:
        payload = decode_access_token(token)
        customer_id: str = payload.get("sub", "")
        if not customer_id:
            raise _CREDENTIALS_EXC
    except JWTError:
        raise _CREDENTIALS_EXC

    import uuid
    customer = await db.get(Customer, uuid.UUID(customer_id))
    if customer is None:
        raise _CREDENTIALS_EXC
    if not customer.is_active:
        raise _INACTIVE_EXC
    return customer
