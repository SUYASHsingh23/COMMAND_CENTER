import uuid
from datetime import datetime, date, time
from typing import Optional
from decimal import Decimal
from sqlalchemy import (
    String, DateTime, Date, Time, Boolean, Text, Integer, Numeric,
    func, ForeignKey, CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.session import Base


class ServiceType(Base):
    """Appointment catalogue — domain-agnostic service definitions."""
    __tablename__ = "service_type"

    service_type_id:          Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code:                     Mapped[str]          = mapped_column(String(40), unique=True, nullable=False)
    name:                     Mapped[str]          = mapped_column(String(120), nullable=False)
    description:              Mapped[str | None]   = mapped_column(Text)
    category:                 Mapped[str]          = mapped_column(String(40), default="general")
    domain:                   Mapped[str]          = mapped_column(String(40), default="general")
    sub_domain:               Mapped[str | None]   = mapped_column(String(40))
    estimated_duration_mins:  Mapped[int]          = mapped_column(Integer, default=30)
    requires_supervisor:      Mapped[bool]         = mapped_column(Boolean, default=False)
    requires_specialist:      Mapped[bool]         = mapped_column(Boolean, default=False)
    allow_self_schedule:      Mapped[bool]         = mapped_column(Boolean, default=True)
    max_per_day_per_agent:    Mapped[int]          = mapped_column(Integer, default=20)
    priority_weight:          Mapped[int]          = mapped_column(Integer, default=5)
    sla_response_mins:        Mapped[int]          = mapped_column(Integer, default=60)
    sla_resolution_mins:      Mapped[int]          = mapped_column(Integer, default=1440)
    preferred_channel:        Mapped[str]          = mapped_column(String(20), default="voice_call")
    fallback_channel:         Mapped[str]          = mapped_column(String(20), default="callback")
    auto_assign:              Mapped[bool]         = mapped_column(Boolean, default=True)
    is_active:                Mapped[bool]         = mapped_column(Boolean, default=True)
    sort_order:               Mapped[int]          = mapped_column(Integer, default=0)
    tags:                     Mapped[list]         = mapped_column(JSONB, default=list)
    custom_fields:            Mapped[dict]         = mapped_column(JSONB, default=dict)
    created_at:               Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:               Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())


class Agent(Base):
    """Human customer care agents — skills, capacity, performance."""
    __tablename__ = "agent"

    agent_id:                 Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_code:               Mapped[str]          = mapped_column(String(20), unique=True, nullable=False)
    name:                     Mapped[str]          = mapped_column(String(80), nullable=False)
    display_name:             Mapped[str | None]   = mapped_column(String(80))
    email:                    Mapped[str | None]   = mapped_column(String(120), unique=True)
    phone:                    Mapped[str | None]   = mapped_column(String(20))
    role:                     Mapped[str]          = mapped_column(String(30), default="agent")
    department:               Mapped[str]          = mapped_column(String(40), default="general")
    team:                     Mapped[str | None]   = mapped_column(String(40))
    employee_id:              Mapped[str | None]   = mapped_column(String(30))
    location:                 Mapped[str | None]   = mapped_column(String(60))
    specializations:          Mapped[list]         = mapped_column(JSONB, default=list)
    languages:                Mapped[list]         = mapped_column(JSONB, default=list)
    certifications:           Mapped[list]         = mapped_column(JSONB, default=list)
    max_concurrent_sessions:  Mapped[int]          = mapped_column(Integer, default=3)
    current_load:             Mapped[int]          = mapped_column(Integer, default=0)
    status:                   Mapped[str]          = mapped_column(String(20), default="offline")
    shift_start:              Mapped[time | None]  = mapped_column(Time)
    shift_end:                Mapped[time | None]  = mapped_column(Time)
    timezone:                 Mapped[str]          = mapped_column(String(50), default="Asia/Kolkata")
    working_days:             Mapped[list]         = mapped_column(JSONB, default=list)
    rating:                   Mapped[Decimal]      = mapped_column(Numeric(3, 2), default=0)
    total_sessions:           Mapped[int]          = mapped_column(Integer, default=0)
    sessions_today:           Mapped[int]          = mapped_column(Integer, default=0)
    avg_handle_time_mins:     Mapped[Decimal]      = mapped_column(Numeric(5, 2), default=0)
    first_call_resolution_pct:Mapped[Decimal]      = mapped_column(Numeric(5, 2), default=0)
    agent_portal_id:          Mapped[str | None]   = mapped_column(String(60))
    is_active:                Mapped[bool]         = mapped_column(Boolean, default=True)
    custom_fields:            Mapped[dict]         = mapped_column(JSONB, default=dict)
    created_at:               Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:               Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    appointments:  Mapped[list["Appointment"]]         = relationship("Appointment", back_populates="agent", foreign_keys="Appointment.agent_id")
    availability_blocks: Mapped[list["AgentAvailabilityBlock"]] = relationship("AgentAvailabilityBlock", back_populates="agent")


class Appointment(Base):
    """Core scheduling record — full AI briefing snapshot included."""
    __tablename__ = "appointment"

    appointment_id:           Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_number:       Mapped[str]          = mapped_column(String(40), unique=True, nullable=False)

    # Parties
    customer_id:              Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="CASCADE"), nullable=False)
    account_id:               Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("account.account_id", ondelete="SET NULL"))
    agent_id:                 Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agent.agent_id", ondelete="SET NULL"))
    service_type_id:          Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("service_type.service_type_id"))

    # Source
    conversation_id:          Mapped[str | None]   = mapped_column(String(80))
    booked_via:               Mapped[str]          = mapped_column(String(30), default="ai_agent")

    # Status
    status:                   Mapped[str]          = mapped_column(String(20), default="pending")
    priority:                 Mapped[str]          = mapped_column(String(10), default="normal")

    # Channel
    channel:                  Mapped[str]          = mapped_column(String(20), default="voice_call")
    channel_detail:           Mapped[str | None]   = mapped_column(String(80))

    # Times
    scheduled_at:             Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_start:             Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_end:               Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_at:             Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at:               Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at:                 Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at:             Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_mins:            Mapped[int | None]   = mapped_column(Integer)

    # Reason (from AI intent)
    reason:                   Mapped[str]          = mapped_column(String(120), nullable=False)
    reason_detail:            Mapped[str | None]   = mapped_column(Text)
    intent_category:          Mapped[str | None]   = mapped_column(String(40))
    urgency_signal:           Mapped[str | None]   = mapped_column(String(20))
    sentiment_score:          Mapped[Decimal | None] = mapped_column(Numeric(3, 2))

    # AI briefing
    ai_summary:               Mapped[str | None]   = mapped_column(Text)
    ai_suggested_actions:     Mapped[list]         = mapped_column(JSONB, default=list)
    ai_risk_flags:            Mapped[list]         = mapped_column(JSONB, default=list)

    # Context snapshots
    customer_snapshot:        Mapped[dict]         = mapped_column(JSONB, default=dict)
    billing_snapshot:         Mapped[dict]         = mapped_column(JSONB, default=dict)
    conversation_transcript:  Mapped[list]         = mapped_column(JSONB, default=list)
    previous_interactions:    Mapped[list]         = mapped_column(JSONB, default=list)

    # Resolution
    resolution_notes:         Mapped[str | None]   = mapped_column(Text)
    resolution_category:      Mapped[str | None]   = mapped_column(String(40))
    escalated_to_agent_id:    Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agent.agent_id", ondelete="SET NULL"))
    escalation_reason:        Mapped[str | None]   = mapped_column(Text)

    # CSAT
    csat_score:               Mapped[int | None]   = mapped_column(Integer)
    csat_feedback:            Mapped[str | None]   = mapped_column(Text)
    csat_collected_at:        Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Follow-up
    follow_up_required:       Mapped[bool]         = mapped_column(Boolean, default=False)
    follow_up_date:           Mapped[date | None]  = mapped_column(Date)
    follow_up_notes:          Mapped[str | None]   = mapped_column(Text)
    follow_up_appointment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("appointment.appointment_id", ondelete="SET NULL"))

    # Metadata
    tags:                     Mapped[list]         = mapped_column(JSONB, default=list)
    internal_notes:           Mapped[str | None]   = mapped_column(Text)
    custom_fields:            Mapped[dict]         = mapped_column(JSONB, default=dict)
    created_at:               Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:               Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    agent:          Mapped["Agent | None"]           = relationship("Agent", back_populates="appointments", foreign_keys=[agent_id])
    service_type:   Mapped["ServiceType | None"]     = relationship("ServiceType")
    notes:          Mapped[list["AppointmentNote"]]  = relationship("AppointmentNote", back_populates="appointment", order_by="AppointmentNote.created_at")


class AppointmentNote(Base):
    """Agent notes timeline for an appointment."""
    __tablename__ = "appointment_note"

    note_id:         Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    appointment_id:  Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("appointment.appointment_id", ondelete="CASCADE"), nullable=False)
    author:          Mapped[str]          = mapped_column(String(80), nullable=False)
    author_role:     Mapped[str | None]  = mapped_column(String(30))
    note_type:       Mapped[str]          = mapped_column(String(20), default="observation")
    content:         Mapped[str]          = mapped_column(Text, nullable=False)
    is_internal:     Mapped[bool]         = mapped_column(Boolean, default=True)
    attachments:     Mapped[list]         = mapped_column(JSONB, default=list)
    created_at:      Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    appointment: Mapped["Appointment"] = relationship("Appointment", back_populates="notes")


class AgentAvailabilityBlock(Base):
    """Agent schedule exceptions — breaks, training, leave, etc."""
    __tablename__ = "agent_availability_block"

    block_id:    Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id:    Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("agent.agent_id", ondelete="CASCADE"), nullable=False)
    start_at:    Mapped[datetime]     = mapped_column(DateTime(timezone=True), nullable=False)
    end_at:      Mapped[datetime]     = mapped_column(DateTime(timezone=True), nullable=False)
    block_type:  Mapped[str]          = mapped_column(String(20), default="break")
    notes:       Mapped[str | None]   = mapped_column(Text)
    created_at:  Mapped[datetime]     = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationship
    agent: Mapped["Agent"] = relationship("Agent", back_populates="availability_blocks")
