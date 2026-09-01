"""
Scheduling System API — all endpoints under /api/v1/scheduling/
Provides appointment booking, agent routing, pre-call briefing snapshots,
and real-time queue management.
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_, case, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database.session import async_session_factory
from app.core.config import get_settings
from app.observability.bus import event_bus
from app.api.websocket.events import AppointmentUpdatedEvent
from app.models.customer import Customer, Account
from app.models.scheduling import (
    ServiceType, Agent, Appointment, AppointmentNote,
    AgentAvailabilityBlock,
)
from app.models.billing import Invoice, BillingTransaction
from app.api.v1.schemas.scheduling import (
    ServiceTypeOut, AgentOut, AgentSummary,
    AppointmentCreate, AppointmentUpdate,
    AppointmentNoteCreate, AppointmentNoteOut,
    AppointmentOut, AppointmentSummary,
    SchedulingStats,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scheduling", tags=["scheduling"])
settings = get_settings()


# ─── Dependency ───────────────────────────────────────────────────────────────

async def get_db():
    async with async_session_factory() as session:
        yield session


# ─── Internal helpers ─────────────────────────────────────────────────────────

async def _build_customer_snapshot(customer_id: uuid.UUID, db: AsyncSession) -> dict:
    """Freeze the full customer profile at appointment-creation time."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        return {}
    acct_row = await db.execute(
        select(Account).where(Account.customer_id == customer_id).limit(1)
    )
    acct = acct_row.scalar_one_or_none()
    return {
        "customer_id": str(customer.customer_id),
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "account_number": customer.account_number,
        "customer_tier": customer.customer_tier,
        "preferred_language": customer.preferred_language,
        "preferred_channel": customer.preferred_channel,
        "last_contact_at": customer.last_contact_at.isoformat() if customer.last_contact_at else None,
        "account": {
            "account_number": acct.account_number if acct else None,
            "plan_name": acct.plan_name if acct else customer.plan,
            "status": acct.status if acct else "unknown",
            "billing_cycle": acct.billing_cycle if acct else None,
            "payment_method": acct.payment_method if acct else None,
            "balance": str(acct.balance) if acct else "0",
        } if acct else {},
    }


async def _build_billing_snapshot(customer_id: uuid.UUID, db: AsyncSession) -> dict:
    """Freeze key billing position at appointment-creation time."""
    acct_row = await db.execute(
        select(Account).where(Account.customer_id == customer_id).limit(1)
    )
    acct = acct_row.scalar_one_or_none()

    # Outstanding invoices
    inv_stats = await db.execute(
        select(
            func.count(Invoice.invoice_id).label("total"),
            func.sum(case((Invoice.status == "overdue", 1), else_=0)).label("overdue"),
            func.coalesce(func.sum(
                case((Invoice.status.in_(["sent", "overdue", "partial"]),
                      Invoice.total_amount - Invoice.amount_paid), else_=0)
            ), 0).label("outstanding"),
        ).where(Invoice.customer_id == customer_id)
    )
    is_ = inv_stats.one()

    # Last payment
    last_pay = await db.execute(
        select(BillingTransaction).where(
            and_(BillingTransaction.customer_id == customer_id,
                 BillingTransaction.transaction_type == "payment",
                 BillingTransaction.status == "success")
        ).order_by(BillingTransaction.created_at.desc()).limit(1)
    )
    lp = last_pay.scalar_one_or_none()

    # Next due date
    next_due = await db.scalar(
        select(Invoice.due_date).where(
            and_(Invoice.customer_id == customer_id,
                 Invoice.status.in_(["sent", "overdue", "partial"]))
        ).order_by(Invoice.due_date).limit(1)
    )

    failed_txns = await db.scalar(
        select(func.count(BillingTransaction.transaction_id)).where(
            and_(BillingTransaction.customer_id == customer_id,
                 BillingTransaction.status == "failed")
        )
    ) or 0

    return {
        "balance": str(acct.balance) if acct else "0",
        "active_plan": acct.plan_name if acct else None,
        "plan_status": acct.status if acct else "unknown",
        "outstanding_amount": str(is_.outstanding or 0),
        "overdue_invoices": int(is_.overdue or 0),
        "total_invoices": int(is_.total or 0),
        "next_due_date": next_due.isoformat() if next_due else None,
        "last_payment_amount": str(lp.amount) if lp else None,
        "last_payment_date": lp.created_at.isoformat() if lp else None,
        "last_payment_method": lp.payment_method if lp else None,
        "failed_transactions": failed_txns,
    }


def _build_ai_summary(reason: str, reason_detail: str | None,
                      customer_snapshot: dict, billing_snapshot: dict,
                      urgency: str | None) -> str:
    """Construct a structured pre-call briefing paragraph for the agent."""
    name = customer_snapshot.get("name", "Customer")
    tier = customer_snapshot.get("customer_tier", "standard").upper()
    plan = billing_snapshot.get("active_plan") or customer_snapshot.get("account", {}).get("plan_name", "Unknown plan")
    outstanding = billing_snapshot.get("outstanding_amount", "0")
    overdue = billing_snapshot.get("overdue_invoices", 0)
    failed = billing_snapshot.get("failed_transactions", 0)
    next_due = billing_snapshot.get("next_due_date")

    summary_parts = [
        f"📋 PRE-CALL BRIEFING\n",
        f"Customer: {name} ({tier} tier) | Plan: {plan}",
    ]
    if float(outstanding) > 0:
        summary_parts.append(f"⚠ Outstanding: ₹{float(outstanding):,.2f} across {overdue} overdue invoice(s).")
    if failed > 0:
        summary_parts.append(f"⚠ {failed} failed payment transaction(s) on record.")
    if next_due:
        summary_parts.append(f"📅 Next due date: {next_due}.")
    if urgency in ("frustrated", "angry", "distressed"):
        summary_parts.append(f"🔴 Customer sentiment flagged as: {urgency.upper()}. Handle with care.")

    summary_parts.append(f"\nReason for contact: {reason}")
    if reason_detail:
        summary_parts.append(f"Details: {reason_detail}")

    return "\n".join(summary_parts)


async def _auto_assign_agent(
    service_type: ServiceType | None,
    customer_snapshot: dict,
    db: AsyncSession,
) -> Agent | None:
    """
    Smart routing:
    1. Match department to service_type.category
    2. Filter: available AND has capacity
    3. Prefer agents matching customer.preferred_language
    4. Sort by current_load ASC (lowest first)
    """
    now_utc = datetime.utcnow()
    stmt = select(Agent).where(
        and_(Agent.is_active == True,
             Agent.status == "available",
             Agent.current_load < Agent.max_concurrent_sessions)
    )
    if service_type:
        stmt = stmt.where(Agent.department == service_type.category)

    stmt = stmt.order_by(Agent.current_load.asc(), Agent.rating.desc())
    candidates = (await db.execute(stmt)).scalars().all()

    if not candidates:
        # Fallback: any available agent, any department
        fallback = await db.execute(
            select(Agent).where(
                and_(Agent.is_active == True,
                     Agent.status == "available",
                     Agent.current_load < Agent.max_concurrent_sessions)
            ).order_by(Agent.current_load.asc()).limit(1)
        )
        return fallback.scalar_one_or_none()

    preferred_lang = customer_snapshot.get("preferred_language", "en")
    # Prefer language match
    for agent in candidates:
        langs = agent.languages or []
        if preferred_lang in langs:
            return agent

    # No language match → return lowest-load
    return candidates[0]


async def _generate_appt_number(db: AsyncSession) -> str:
    count = await db.scalar(select(func.count(Appointment.appointment_id))) or 0
    return f"{settings.appointment_number_prefix}-{date.today().year}-{count + 1:05d}"


# ─── Service Types ────────────────────────────────────────────────────────────

@router.get("/service-types", response_model=list[ServiceTypeOut])
async def list_service_types(
    domain: str = Query("", description="Filter by domain"),
    category: str = Query("", description="Filter by category"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(ServiceType).where(ServiceType.is_active == True)
    if domain:
        stmt = stmt.where(ServiceType.domain == domain)
    if category:
        stmt = stmt.where(ServiceType.category == category)
    stmt = stmt.order_by(ServiceType.sort_order, ServiceType.priority_weight.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [ServiceTypeOut.model_validate(r) for r in rows]


# ─── Agents ───────────────────────────────────────────────────────────────────

@router.get("/agents", response_model=list[AgentSummary])
async def list_agents(
    status: str = Query("", description="available/busy/break/offline"),
    department: str = Query(""),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Agent).where(Agent.is_active == True)
    if status:
        stmt = stmt.where(Agent.status == status)
    if department:
        stmt = stmt.where(Agent.department == department)
    stmt = stmt.order_by(Agent.current_load.asc(), Agent.name)
    rows = (await db.execute(stmt)).scalars().all()

    result = []
    for a in rows:
        s = AgentSummary.model_validate(a)
        s.is_available = (a.status == "available" and
                          a.current_load < a.max_concurrent_sessions)
        result.append(s)
    return result


@router.get("/agents/{agent_id}", response_model=AgentOut)
async def get_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return AgentOut.model_validate(agent)


@router.patch("/agents/{agent_id}/status")
async def update_agent_status(
    agent_id: uuid.UUID,
    status: str = Query(..., description="available/busy/break/offline"),
    db: AsyncSession = Depends(get_db),
):
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    valid = {"available", "busy", "break", "training", "offline"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid}")
    agent.status = status
    await db.commit()

    await event_bus.emit(
        session_id="system",
        event=AppointmentUpdatedEvent(
            session_id="system",
            customer_id="system",
            appointment_id="system",
        )
    )

    return {"ok": True, "agent_id": str(agent_id), "status": status}


# ─── Appointments ─────────────────────────────────────────────────────────────

@router.post("/appointments", response_model=AppointmentOut, status_code=201)
async def create_appointment(payload: AppointmentCreate, db: AsyncSession = Depends(get_db)):
    """
    Book an appointment (called by AI orchestrator or manually).
    Auto-assigns the best available agent, builds customer + billing snapshots,
    and generates an AI pre-call briefing.
    """
    # Resolve service type
    svc: ServiceType | None = None
    if payload.service_type_code:
        svc = await db.scalar(
            select(ServiceType).where(ServiceType.code == payload.service_type_code)
        )

    # Build snapshots
    cust_snap = await _build_customer_snapshot(payload.customer_id, db)
    bill_snap = await _build_billing_snapshot(payload.customer_id, db)

    # Past appointment history (last 5)
    past = (await db.execute(
        select(Appointment).where(
            and_(Appointment.customer_id == payload.customer_id,
                 Appointment.status.in_(["completed", "cancelled", "no_show"]))
        ).order_by(Appointment.created_at.desc()).limit(5)
    )).scalars().all()

    prev_interactions = [
        {
            "date": a.created_at.isoformat(),
            "channel": a.channel,
            "reason": a.reason,
            "resolution": a.resolution_category,
            "duration_mins": a.duration_mins,
            "csat_score": a.csat_score,
        }
        for a in past
    ]

    # Auto-assign agent
    agent = await _auto_assign_agent(svc, cust_snap, db)

    # Build AI risk flags
    ai_risk_flags: list[dict] = []
    outstanding = float(bill_snap.get("outstanding_amount", 0))
    if outstanding > 5000:
        ai_risk_flags.append({"flag": "high_outstanding", "value": outstanding, "label": f"₹{outstanding:,.0f} outstanding"})
    if int(bill_snap.get("failed_transactions", 0)) >= 2:
        ai_risk_flags.append({"flag": "multiple_payment_failures", "value": bill_snap["failed_transactions"]})
    if payload.urgency_signal in ("angry", "distressed"):
        ai_risk_flags.append({"flag": "distressed_customer", "value": payload.urgency_signal})
    if cust_snap.get("customer_tier") in ("premium", "elite"):
        tier_val = cust_snap.get("customer_tier", "premium")
        ai_risk_flags.append({"flag": "vip_customer", "value": tier_val, "label": "Priority policyholder — escalate if needed"})

    # Build AI suggested actions
    ai_suggested_actions: list[dict] = []
    if payload.intent_category == "billing":
        if outstanding > 0:
            ai_suggested_actions.append({"action": "Review outstanding balance and overdue invoices", "priority": "high"})
        ai_suggested_actions.append({"action": "Offer payment plan if customer is struggling", "priority": "medium"})
    elif payload.intent_category == "technical":
        ai_suggested_actions.append({"action": "Review active policy coverage and exclusions with customer", "priority": "high"})
        ai_suggested_actions.append({"action": "Check pending or past claim history before resolving", "priority": "medium"})
    ai_suggested_actions.append({"action": "Confirm customer identity (DOB / account number)", "priority": "high"})

    ai_summary = _build_ai_summary(
        payload.reason, payload.reason_detail,
        cust_snap, bill_snap, payload.urgency_signal
    )

    appt_number = await _generate_appt_number(db)

    appt = Appointment(
        appointment_number=appt_number,
        customer_id=payload.customer_id,
        account_id=payload.account_id,
        agent_id=agent.agent_id if agent else None,
        service_type_id=svc.service_type_id if svc else None,
        conversation_id=payload.conversation_id,
        booked_via=payload.booked_via,
        status="assigned" if agent else "pending",
        priority=payload.priority,
        channel=payload.channel,
        channel_detail=payload.channel_detail,
        scheduled_at=payload.scheduled_at or datetime.utcnow() + timedelta(minutes=settings.scheduling_callback_sla_mins),
        reason=payload.reason,
        reason_detail=payload.reason_detail,
        intent_category=payload.intent_category,
        urgency_signal=payload.urgency_signal,
        sentiment_score=Decimal(str(payload.sentiment_score)) if payload.sentiment_score else None,
        ai_summary=ai_summary,
        ai_suggested_actions=ai_suggested_actions,
        ai_risk_flags=ai_risk_flags,
        customer_snapshot=cust_snap,
        billing_snapshot=bill_snap,
        conversation_transcript=payload.conversation_transcript,
        previous_interactions=prev_interactions,
        tags=payload.tags,
        custom_fields=payload.custom_fields,
    )
    db.add(appt)

    # Increment agent load
    if agent:
        agent.current_load = (agent.current_load or 0) + 1
        agent.total_sessions = (agent.total_sessions or 0) + 1
        agent.sessions_today = (agent.sessions_today or 0) + 1

    # Auto-note from system
    db.add(AppointmentNote(
        appointment_id=appt.appointment_id,
        author="System",
        author_role="system",
        note_type="observation",
        content=f"Appointment created via {payload.booked_via}. "
                f"{'Agent ' + agent.name + ' auto-assigned.' if agent else 'No agent available — queued for manual assignment.'}",
        is_internal=True,
    ))

    await db.commit()

    # Broadcast real-time update
    await event_bus.emit(
        session_id="system",
        event=AppointmentUpdatedEvent(
            session_id="system",
            customer_id=str(appt.customer_id),
            appointment_id=str(appt.appointment_id),
        )
    )

    # Reload with relationships
    result = await db.execute(
        select(Appointment)
        .where(Appointment.appointment_id == appt.appointment_id)
        .options(
            selectinload(Appointment.agent),
            selectinload(Appointment.service_type),
            selectinload(Appointment.notes),
        )
    )
    appt = result.scalar_one()
    return _appt_to_out(appt)


@router.get("/appointments", response_model=list[AppointmentSummary])
async def list_appointments(
    status: str = Query("", description="pending/assigned/in_progress/completed/cancelled"),
    priority: str = Query(""),
    agent_id: str = Query(""),
    intent_category: str = Query(""),
    date_from: str = Query("", description="ISO date YYYY-MM-DD"),
    date_to: str = Query("", description="ISO date YYYY-MM-DD"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Appointment).options(
        selectinload(Appointment.agent),
        selectinload(Appointment.service_type),
    )
    filters = []
    if status:
        filters.append(Appointment.status == status)
    if priority:
        filters.append(Appointment.priority == priority)
    if agent_id:
        filters.append(Appointment.agent_id == uuid.UUID(agent_id))
    if intent_category:
        filters.append(Appointment.intent_category == intent_category)
    if date_from:
        filters.append(Appointment.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        filters.append(Appointment.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))
    if filters:
        stmt = stmt.where(and_(*filters))

    # Priority order: critical > urgent > high > normal > low
    priority_order = case(
        (Appointment.priority == "critical", 1),
        (Appointment.priority == "urgent", 2),
        (Appointment.priority == "high", 3),
        (Appointment.priority == "normal", 4),
        else_=5,
    )
    stmt = stmt.order_by(priority_order, Appointment.created_at.asc()).limit(limit).offset(offset)
    rows = (await db.execute(stmt)).scalars().all()
    return [_appt_to_summary(a) for a in rows]


@router.get("/appointments/{appointment_id}", response_model=AppointmentOut)
async def get_appointment(appointment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Appointment)
        .where(Appointment.appointment_id == appointment_id)
        .options(
            selectinload(Appointment.agent),
            selectinload(Appointment.service_type),
            selectinload(Appointment.notes),
        )
    )
    appt = result.scalar_one_or_none()
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return _appt_to_out(appt)


@router.patch("/appointments/{appointment_id}", response_model=AppointmentOut)
async def update_appointment(
    appointment_id: uuid.UUID,
    payload: AppointmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    prev_status = appt.status

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(appt, field, value)

    # Timestamp helpers
    now = datetime.utcnow()
    if payload.status == "in_progress" and not appt.started_at:
        appt.started_at = now
    if payload.status in ("completed", "cancelled", "no_show"):
        if not appt.ended_at:
            appt.ended_at = now
        if appt.started_at and not appt.duration_mins:
            appt.duration_mins = max(1, int((now - appt.started_at).total_seconds() / 60))
        # Release agent load
        if appt.agent_id:
            agent = await db.get(Agent, appt.agent_id)
            if agent and agent.current_load > 0:
                agent.current_load -= 1
            # Update handle time average
            if agent and payload.status == "completed" and appt.duration_mins:
                total = agent.avg_handle_time_mins * max(agent.total_sessions - 1, 1)
                agent.avg_handle_time_mins = Decimal(
                    str((float(total) + appt.duration_mins) / max(agent.total_sessions, 1))
                )
            if payload.status == "completed":
                if not agent.status == "busy":
                    pass  # keep as is
                elif agent.current_load == 0:
                    agent.status = "available"

    await db.commit()

    await event_bus.emit(
        session_id="system",
        event=AppointmentUpdatedEvent(
            session_id="system",
            customer_id=str(appt.customer_id) if appt.customer_id else "system",
            appointment_id=str(appointment_id),
        )
    )

    result = await db.execute(
        select(Appointment)
        .where(Appointment.appointment_id == appointment_id)
        .options(
            selectinload(Appointment.agent),
            selectinload(Appointment.service_type),
            selectinload(Appointment.notes),
        )
    )
    return _appt_to_out(result.scalar_one())


@router.get("/customers/{customer_id}/appointments", response_model=list[AppointmentOut])
async def list_customer_appointments(
    customer_id: uuid.UUID,
    limit: int = Query(20, le=100),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Appointment)
        .where(Appointment.customer_id == customer_id)
        .options(
            selectinload(Appointment.agent), 
            selectinload(Appointment.service_type),
            selectinload(Appointment.notes)
        )
        .order_by(Appointment.created_at.desc())
        .limit(limit)
    )).scalars().all()
    return [_appt_to_out(a) for a in rows]


# ─── Notes ────────────────────────────────────────────────────────────────────

@router.post("/appointments/{appointment_id}/notes", response_model=AppointmentNoteOut, status_code=201)
async def add_note(
    appointment_id: uuid.UUID,
    payload: AppointmentNoteCreate,
    db: AsyncSession = Depends(get_db),
):
    appt = await db.get(Appointment, appointment_id)
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")
    note = AppointmentNote(
        appointment_id=appointment_id,
        author=payload.author,
        author_role=payload.author_role,
        note_type=payload.note_type,
        content=payload.content,
        is_internal=payload.is_internal,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    await event_bus.emit(
        session_id="system",
        event=AppointmentUpdatedEvent(
            session_id="system",
            customer_id=str(appt.customer_id) if appt.customer_id else "system",
            appointment_id=str(appointment_id),
        )
    )
    return AppointmentNoteOut.model_validate(note)


# ─── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=SchedulingStats)
async def scheduling_stats(db: AsyncSession = Depends(get_db)):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    appt_data = await db.execute(
        select(
            func.count(Appointment.appointment_id).label("total"),
            func.sum(case((Appointment.status == "pending", 1), else_=0)).label("pending"),
            func.sum(case((Appointment.status == "assigned", 1), else_=0)).label("assigned"),
            func.sum(case((Appointment.status == "in_progress", 1), else_=0)).label("in_progress"),
            func.sum(case((and_(Appointment.status == "completed",
                                Appointment.updated_at >= today_start), 1), else_=0)).label("completed_today"),
            func.sum(case((and_(Appointment.status == "cancelled",
                                Appointment.updated_at >= today_start), 1), else_=0)).label("cancelled_today"),
            func.avg(func.nullif(Appointment.duration_mins, 0)).label("avg_handle"),
            func.avg(Appointment.csat_score).label("csat_avg"),
        )
    )
    ad = appt_data.one()

    # Overdue: scheduled_at is in the past and still in pending/assigned
    overdue = await db.scalar(
        select(func.count(Appointment.appointment_id)).where(
            and_(Appointment.status.in_(["pending", "assigned"]),
                 Appointment.scheduled_at < datetime.utcnow())
        )
    ) or 0

    agent_data = await db.execute(
        select(
            func.count(Agent.agent_id).label("total"),
            func.sum(case((Agent.status == "available", 1), else_=0)).label("available"),
            func.sum(case((Agent.status.in_(["busy", "in_progress"]), 1), else_=0)).label("busy"),
            func.sum(case((Agent.status == "offline", 1), else_=0)).label("offline"),
        ).where(Agent.is_active == True)
    )
    agd = agent_data.one()

    return SchedulingStats(
        total_appointments=int(ad.total or 0),
        pending=int(ad.pending or 0),
        assigned=int(ad.assigned or 0),
        in_progress=int(ad.in_progress or 0),
        completed_today=int(ad.completed_today or 0),
        cancelled_today=int(ad.cancelled_today or 0),
        overdue=int(overdue),
        avg_wait_mins=None,
        avg_handle_mins=float(ad.avg_handle) if ad.avg_handle else None,
        agents_available=int(agd.available or 0),
        agents_busy=int(agd.busy or 0),
        agents_offline=int(agd.offline or 0),
        total_agents=int(agd.total or 0),
        csat_avg=round(float(ad.csat_avg), 2) if ad.csat_avg else None,
    )


# ─── Serialization helpers ────────────────────────────────────────────────────

def _appt_to_out(a: Appointment) -> AppointmentOut:
    agent_s = None
    if a.agent:
        agent_s = AgentSummary(
            agent_id=a.agent.agent_id,
            agent_code=a.agent.agent_code,
            name=a.agent.name,
            role=a.agent.role,
            department=a.agent.department,
            status=a.agent.status,
            current_load=a.agent.current_load,
            max_concurrent_sessions=a.agent.max_concurrent_sessions,
            languages=a.agent.languages or [],
            specializations=a.agent.specializations or [],
            rating=a.agent.rating,
            is_available=a.agent.status == "available" and a.agent.current_load < a.agent.max_concurrent_sessions,
        )
    svc_s = ServiceTypeOut.model_validate(a.service_type) if a.service_type else None

    return AppointmentOut(
        appointment_id=a.appointment_id,
        appointment_number=a.appointment_number,
        customer_id=a.customer_id,
        account_id=a.account_id,
        agent_id=a.agent_id,
        service_type_id=a.service_type_id,
        conversation_id=a.conversation_id,
        booked_via=a.booked_via,
        status=a.status,
        priority=a.priority,
        channel=a.channel,
        channel_detail=a.channel_detail,
        scheduled_at=a.scheduled_at,
        confirmed_at=a.confirmed_at,
        started_at=a.started_at,
        ended_at=a.ended_at,
        cancelled_at=a.cancelled_at,
        duration_mins=a.duration_mins,
        reason=a.reason,
        reason_detail=a.reason_detail,
        intent_category=a.intent_category,
        urgency_signal=a.urgency_signal,
        sentiment_score=float(a.sentiment_score) if a.sentiment_score else None,
        ai_summary=a.ai_summary,
        ai_suggested_actions=a.ai_suggested_actions or [],
        ai_risk_flags=a.ai_risk_flags or [],
        customer_snapshot=a.customer_snapshot or {},
        billing_snapshot=a.billing_snapshot or {},
        conversation_transcript=a.conversation_transcript or [],
        previous_interactions=a.previous_interactions or [],
        resolution_notes=a.resolution_notes,
        resolution_category=a.resolution_category,
        escalation_reason=a.escalation_reason,
        csat_score=a.csat_score,
        csat_feedback=a.csat_feedback,
        follow_up_required=a.follow_up_required,
        follow_up_date=a.follow_up_date,
        follow_up_notes=a.follow_up_notes,
        tags=a.tags or [],
        internal_notes=a.internal_notes,
        custom_fields=a.custom_fields or {},
        created_at=a.created_at,
        updated_at=a.updated_at,
        agent=agent_s,
        service_type=svc_s,
        notes=[AppointmentNoteOut.model_validate(n) for n in (a.notes or [])],
    )


def _appt_to_summary(a: Appointment) -> AppointmentSummary:
    snap = a.customer_snapshot or {}
    return AppointmentSummary(
        appointment_id=a.appointment_id,
        appointment_number=a.appointment_number,
        customer_id=a.customer_id,
        status=a.status,
        priority=a.priority,
        channel=a.channel,
        reason=a.reason,
        intent_category=a.intent_category,
        urgency_signal=a.urgency_signal,
        scheduled_at=a.scheduled_at,
        created_at=a.created_at,
        agent_id=a.agent_id,
        agent_name=a.agent.name if a.agent else None,
        customer_name=snap.get("name"),
        customer_tier=snap.get("customer_tier"),
        service_type_name=a.service_type.name if a.service_type else None,
        ai_risk_flags=a.ai_risk_flags or [],
    )
