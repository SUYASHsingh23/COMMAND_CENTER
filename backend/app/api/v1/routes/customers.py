import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.dependencies import get_db
from app.models.customer import Customer, Account
from app.api.v1.schemas.customer import CustomerResponse, AccountResponse

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Customer).where(Customer.customer_id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/by-account/{account_number}", response_model=CustomerResponse)
async def get_customer_by_account(
    account_number: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Customer).where(Customer.account_number == account_number))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/{customer_id}/accounts", response_model=list[AccountResponse])
async def get_customer_accounts(
    customer_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Account).where(Account.customer_id == customer_id))
    return result.scalars().all()
