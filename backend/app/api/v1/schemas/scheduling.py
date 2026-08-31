"""
Pydantic schemas for the Scheduling System API.
"""
from __future__ import annotations
from datetime import datetime, date, time
from decimal import Decimal
from typing import Any, Optional
from pydantic import BaseModel, Field, UUID4


# ─── Service Type ──────────────────────────────────────────────────────────────

class ServiceTypeOut(BaseModel):
    service_type_id: UUID4
    code: str
    name: str
    description: Optional[str]
    category: str
    domain: str
    sub_domain: Optional[str]
    estimated_duration_mins: int
    requires_supervisor: bool
    requires_specialist: bool
    priority_weight: int
    sla_response_mins: int
    sla_resolution_mins: int
    preferred_channel: str
    auto_assign: bool
    is_active: bool
    tags: list[str]
    custom_fields: dict[str, Any]

    class Config:
        from_attributes = True


# ─── Agent ────────────────────────────────────────────────────────────────────

class AgentOut(BaseModel):
    agent_id: UUID4
    agent_code: str
    name: str
    display_name: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    role: str
    department: str
    team: Optional[str]
    employee_id: Optional[str]
    location: Optional[str]
    specializations: list[str]
    languages: list[str]
    certifications: list[Any]
    max_concurrent_sessions: int
    current_load: int
    status: str
    shift_start: Optional[time]
    shift_end: Optional[time]
    timezone: str
    working_days: list[int]
    rating: Decimal
    total_sessions: int
    sessions_today: int
    avg_handle_time_mins: Decimal
    first_call_resolution_pct: Decimal
    is_active: bool
    custom_fields: dict[str, Any]

    class Config:
        from_attributes = True


class AgentSummary(BaseModel):
    """Compact agent info for lists and assignment."""
    agent_id: UUID4
    agent_code: str
    name: str
    role: str
    department: str
    status: str
    current_load: int
    max_concurrent_sessions: int
    languages: list[str]
    specializations: list[str]
    rating: Decimal
    is_available: bool = False

    class Config:
        from_attributes = True


# ─── Appointment ──────────────────────────────────────────────────────────────

class AppointmentCreate(BaseModel):
    """Payload when orchestrator or agent books an appointment."""
    customer_id: UUID4
    account_id: Optional[UUID4] = None
    service_type_code: Optional[str] = None          # looked up by code
    conversation_id: Optional[str] = None
    booked_via: str = "ai_agent"
    priority: str = "normal"
    channel: str = "voice_call"
    channel_detail: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    reason: str
    reason_detail: Optional[str] = None
    intent_category: Optional[str] = None
    urgency_signal: Optional[str] = None
    sentiment_score: Optional[float] = None
    conversation_transcript: list[dict[str, Any]] = []
    tags: list[str] = []
    custom_fields: dict[str, Any] = {}


class AppointmentUpdate(BaseModel):
    """Used by agent to update status, add notes, resolution."""
    status: Optional[str] = None
    priority: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_mins: Optional[int] = None
    resolution_notes: Optional[str] = None
    resolution_category: Optional[str] = None
    csat_score: Optional[int] = Field(None, ge=1, le=5)
    csat_feedback: Optional[str] = None
    follow_up_required: Optional[bool] = None
    follow_up_date: Optional[date] = None
    follow_up_notes: Optional[str] = None
    tags: Optional[list[str]] = None
    internal_notes: Optional[str] = None
    agent_id: Optional[UUID4] = None               # for re-assignment


class AppointmentNoteCreate(BaseModel):
    author: str
    author_role: str = "agent"
    note_type: str = "observation"
    content: str
    is_internal: bool = True


class AppointmentNoteOut(BaseModel):
    note_id: UUID4
    appointment_id: UUID4
    author: str
    author_role: Optional[str]
    note_type: str
    content: str
    is_internal: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AppointmentOut(BaseModel):
    """Full appointment detail — used for the pre-call briefing card."""
    appointment_id: UUID4
    appointment_number: str
    customer_id: UUID4
    account_id: Optional[UUID4]
    agent_id: Optional[UUID4]
    service_type_id: Optional[UUID4]
    conversation_id: Optional[str]
    booked_via: str
    status: str
    priority: str
    channel: str
    channel_detail: Optional[str]
    scheduled_at: Optional[datetime]
    confirmed_at: Optional[datetime]
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    duration_mins: Optional[int]
    reason: str
    reason_detail: Optional[str]
    intent_category: Optional[str]
    urgency_signal: Optional[str]
    sentiment_score: Optional[float]

    # AI briefing
    ai_summary: Optional[str]
    ai_suggested_actions: list[Any]
    ai_risk_flags: list[Any]

    # Snapshots
    customer_snapshot: dict[str, Any]
    billing_snapshot: dict[str, Any]
    conversation_transcript: list[Any]
    previous_interactions: list[Any]

    # Resolution
    resolution_notes: Optional[str]
    resolution_category: Optional[str]
    escalation_reason: Optional[str]

    # CSAT
    csat_score: Optional[int]
    csat_feedback: Optional[str]

    # Follow-up
    follow_up_required: bool
    follow_up_date: Optional[date]
    follow_up_notes: Optional[str]

    tags: list[str]
    internal_notes: Optional[str]
    custom_fields: dict[str, Any]
    created_at: datetime
    updated_at: Optional[datetime]

    # Nested
    agent: Optional[AgentSummary] = None
    service_type: Optional[ServiceTypeOut] = None
    notes: list[AppointmentNoteOut] = []

    class Config:
        from_attributes = True


class AppointmentSummary(BaseModel):
    """Compact view for the appointment queue list."""
    appointment_id: UUID4
    appointment_number: str
    customer_id: UUID4
    status: str
    priority: str
    channel: str
    reason: str
    intent_category: Optional[str]
    urgency_signal: Optional[str]
    scheduled_at: Optional[datetime]
    created_at: datetime
    agent_id: Optional[UUID4]
    agent_name: Optional[str] = None
    customer_name: Optional[str] = None
    customer_tier: Optional[str] = None
    service_type_name: Optional[str] = None
    ai_risk_flags: list[Any]

    class Config:
        from_attributes = True


# ─── Stats ────────────────────────────────────────────────────────────────────

class SchedulingStats(BaseModel):
    total_appointments: int
    pending: int
    assigned: int
    in_progress: int
    completed_today: int
    cancelled_today: int
    overdue: int                    # scheduled_at in the past and still pending/assigned
    avg_wait_mins: Optional[float]
    avg_handle_mins: Optional[float]
    agents_available: int
    agents_busy: int
    agents_offline: int
    total_agents: int
    csat_avg: Optional[float]
