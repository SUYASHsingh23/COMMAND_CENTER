import uuid
from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, DateTime, Date, Boolean, Text, Integer, Numeric, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.session import Base


class Customer(Base):
    __tablename__ = "customer"

    # ── Core identity ─────────────────────────────────────────────────────────
    customer_id:       Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name:              Mapped[str]             = mapped_column(String(120), nullable=False)
    phone:             Mapped[str | None]      = mapped_column(String(20))
    email:             Mapped[str | None]      = mapped_column(String(120))
    account_number:    Mapped[str | None]      = mapped_column(String(40), unique=True)
    plan:              Mapped[str | None]      = mapped_column(String(60))
    created_at:        Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    # ── Extended profile (migration 002) ──────────────────────────────────────
    date_of_birth:      Mapped[date | None]    = mapped_column(Date)
    gender:             Mapped[str | None]     = mapped_column(String(20))
    address_line1:      Mapped[str | None]     = mapped_column(Text)
    address_line2:      Mapped[str | None]     = mapped_column(Text)
    city:               Mapped[str | None]     = mapped_column(String(80))
    state:              Mapped[str | None]     = mapped_column(String(80))
    pincode:            Mapped[str | None]     = mapped_column(String(20))
    country:            Mapped[str | None]     = mapped_column(String(60), default="India")
    customer_tier:      Mapped[str]            = mapped_column(String(20), default="standard")
    customer_since:     Mapped[date | None]    = mapped_column(Date)
    preferred_language: Mapped[str]            = mapped_column(String(10), default="en")
    preferred_channel:  Mapped[str]            = mapped_column(String(20), default="voice")
    tags:               Mapped[list]           = mapped_column(JSONB, default=list)
    custom_fields:      Mapped[dict]           = mapped_column(JSONB, default=dict)
    last_contact_at:    Mapped[datetime | None]= mapped_column(DateTime(timezone=True))
    notes:              Mapped[str | None]     = mapped_column(Text)
    updated_at:         Mapped[datetime | None]= mapped_column(DateTime(timezone=True), onupdate=func.now())

    # ── Auth fields (migration 004) ───────────────────────────────────────────
    password_hash:      Mapped[str | None]     = mapped_column(String(255))
    is_active:          Mapped[bool]           = mapped_column(Boolean, default=True)
    last_login_at:      Mapped[datetime | None]= mapped_column(DateTime(timezone=True))

    # ── Relationships ──────────────────────────────────────────────────────────
    accounts:         Mapped[list["Account"]]             = relationship("Account", back_populates="customer", cascade="all, delete-orphan")
    conversations:    Mapped[list["Conversation"]]        = relationship("Conversation", back_populates="customer")
    interactions:     Mapped[list["CustomerInteraction"]] = relationship("CustomerInteraction", back_populates="customer", cascade="all, delete-orphan")
    customer_notes:   Mapped[list["CustomerNote"]]        = relationship("CustomerNote", back_populates="customer", cascade="all, delete-orphan")
    refresh_tokens:   Mapped[list["RefreshToken"]]        = relationship("RefreshToken", back_populates="customer", cascade="all, delete-orphan")


class Account(Base):
    __tablename__ = "account"

    # ── Core ──────────────────────────────────────────────────────────────────
    account_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id:   Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    plan_name:     Mapped[str | None]= mapped_column(String(80))
    status:        Mapped[str]       = mapped_column(String(20), default="active")
    balance:       Mapped[float]     = mapped_column(default=0.0)
    billing_cycle: Mapped[str]       = mapped_column(String(20), default="monthly")

    # ── Extended billing (migration 002) ──────────────────────────────────────
    plan_start_date:  Mapped[date | None]  = mapped_column(Date)
    plan_end_date:    Mapped[date | None]  = mapped_column(Date)
    auto_renew:       Mapped[bool]         = mapped_column(Boolean, default=True)
    data_used_gb:     Mapped[float]        = mapped_column(Numeric(10, 2), default=0)
    credit_limit:     Mapped[float]        = mapped_column(Numeric(12, 2), default=0)
    payment_method:   Mapped[str]          = mapped_column(String(40), default="UPI")
    custom_fields:    Mapped[dict]         = mapped_column(JSONB, default=dict)
    updated_at:       Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    customer: Mapped["Customer"] = relationship("Customer", back_populates="accounts")


class CustomerInteraction(Base):
    """One row per customer touchpoint — voice call, chat, email, ticket."""
    __tablename__ = "customer_interaction"

    interaction_id:  Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id:     Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation.conversation_id", ondelete="SET NULL"))
    channel:         Mapped[str]          = mapped_column(String(20), default="voice")
    direction:       Mapped[str]          = mapped_column(String(10), default="inbound")
    duration_sec:    Mapped[int]          = mapped_column(Integer, default=0)
    outcome:         Mapped[str]          = mapped_column(String(40), default="completed")
    sentiment:       Mapped[str]          = mapped_column(String(20), default="neutral")
    resolution:      Mapped[str]          = mapped_column(String(40), default="unresolved")
    agent_id:        Mapped[str | None]   = mapped_column(String(80))
    summary:         Mapped[str | None]   = mapped_column(Text)
    started_at:      Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at:        Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    customer: Mapped["Customer"] = relationship("Customer", back_populates="interactions")


class CustomerNote(Base):
    """Agent / supervisor free-text notes on a customer."""
    __tablename__ = "customer_note"

    note_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id:Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    author:     Mapped[str]       = mapped_column(String(80), default="agent")
    content:    Mapped[str]       = mapped_column(Text, nullable=False)
    note_type:  Mapped[str]       = mapped_column(String(20), default="general")
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), server_default=func.now())

    customer: Mapped["Customer"] = relationship("Customer", back_populates="customer_notes")


class RefreshToken(Base):
    """Database-backed refresh token for secure JWT rotation.
    The raw token is never stored — only its SHA-256 hash.
    """
    __tablename__ = "refresh_token"

    token_id:    Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID]       = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    token_hash:  Mapped[str]             = mapped_column(String(255), nullable=False, unique=True)
    issued_at:   Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at:  Mapped[datetime]        = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent:  Mapped[str | None]      = mapped_column(Text)
    ip_address:  Mapped[str | None]      = mapped_column(String(45))

    customer: Mapped["Customer"] = relationship("Customer", back_populates="refresh_tokens")
