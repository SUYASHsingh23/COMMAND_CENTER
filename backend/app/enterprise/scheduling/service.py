"""
SchedulingService — Production implementation backed by PostgreSQL.

Replaces the hardcoded availability dict and in-memory list with real
async SQLAlchemy queries. All appointments are persisted in the `appointment`
table and survive server restarts.

Availability is currently determined by checking how many appointments are
already booked per date (simple slot counting). For a full production system,
this would integrate with the `agent_availability_block` table.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta, date

from sqlalchemy import select, and_, func as sqlfunc, desc
from app.database.session import async_session_factory
from app.models.scheduling import Appointment, Agent, ServiceType
from app.models.customer import Customer, Account
from app.observability.bus import event_bus
from app.api.websocket.events import AppointmentUpdatedEvent

logger = logging.getLogger(__name__)

# Maximum appointments per day across all engineers (simple capacity model)
MAX_SLOTS_PER_DAY = 8
# Generate available slots for the next N days
ADVANCE_BOOKING_DAYS = 14
# Fixed time slots offered per day
_TIME_SLOTS = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "17:30", "18:30"]


def _generate_dates(n: int = ADVANCE_BOOKING_DAYS) -> list[str]:
    """Return the next N working days (Mon–Sat) as ISO date strings."""
    days = []
    cursor = date.today() + timedelta(days=1)
    while len(days) < n:
        if cursor.weekday() < 6:  # 0=Mon ... 5=Sat
            days.append(str(cursor))
        cursor += timedelta(days=1)
    return days


async def _auto_assign_agent(department_category: str | None, db) -> tuple[Agent | None, int]:
    """
    Finds the best available agent and returns (agent, estimated_wait_minutes).
    If an agent is available with capacity, wait time is 0.
    If all agents are busy, calculates wait time based on load and avg_handle_time.
    """
    stmt = select(Agent).where(and_(Agent.is_active == True, Agent.status.in_(["available", "busy"])))
    if department_category:
        stmt = stmt.where(Agent.department == department_category)

    agents = (await db.execute(stmt)).scalars().all()
    if not agents:
        # Fallback to any agent
        fallback_stmt = select(Agent).where(and_(Agent.is_active == True, Agent.status.in_(["available", "busy"])))
        agents = (await db.execute(fallback_stmt)).scalars().all()
        if not agents:
            return None, 0

    # Sort by current_load ascending
    agents.sort(key=lambda a: (a.current_load or 0))
    best_agent = agents[0]

    if best_agent.status == "available" and (best_agent.current_load or 0) < (best_agent.max_concurrent_sessions or 1):
        return best_agent, 0

    # If all busy or at capacity, calculate wait time
    avg_handle_time = float(best_agent.avg_handle_time_mins or 15)
    load = float(best_agent.current_load or 1)
    wait_minutes = max(5, int(load * avg_handle_time))
    
    return best_agent, wait_minutes



async def check_availability(date_str: str | None = None) -> dict:
    """Return available time slots for a given date or the next N dates."""
    async with async_session_factory() as db:
        try:
            target_dates = [date_str] if date_str else _generate_dates()
            result = {}
            for d in target_dates:
                # Parse string to Python date object (asyncpg requires proper date type)
                parsed_date = date.fromisoformat(d) if d else date.today()
                stmt = select(sqlfunc.count(Appointment.appointment_id)).where(
                    and_(
                        sqlfunc.date(Appointment.scheduled_at) == parsed_date,
                        Appointment.status.in_(["pending", "confirmed"]),
                    )
                )
                row = await db.execute(stmt)
                booked = row.scalar() or 0
                free = MAX_SLOTS_PER_DAY - booked
                if free > 0:
                    result[d] = _TIME_SLOTS[:free]

            if date_str:
                slots = result.get(date_str, [])
                return {
                    "date": date_str,
                    "available_slots": slots,
                    "has_availability": bool(slots),
                }
            available_dates = list(result.keys())
            next_date = available_dates[0] if available_dates else None
            return {
                "next_available_date": next_date,
                "next_available_slots": result.get(next_date, []) if next_date else [],
                "available_dates": available_dates,
            }
        except Exception as exc:
            logger.error("check_availability error: %s", exc)
            return {"has_availability": False, "error": str(exc)}




async def schedule_engineer(
    account_number: str,
    date_str: str,
    time_slot: str,
    issue_description: str,
    customer_id: str | None = None,
    conversation_id: str | None = None,
) -> dict:
    """Create a real appointment record in PostgreSQL."""
    async with async_session_factory() as db:
        try:
            # Resolve customer by account_number or customer_id
            cid_uuid: uuid.UUID | None = None
            account_id_uuid: uuid.UUID | None = None

            if customer_id:
                try:
                    cid_uuid = uuid.UUID(customer_id)
                except ValueError:
                    pass
            if not cid_uuid and account_number:
                result = await db.execute(
                    select(Customer).where(Customer.account_number == account_number)
                )
                c = result.scalar_one_or_none()
                if c:
                    cid_uuid = c.customer_id

            if cid_uuid:
                result = await db.execute(
                    select(Account).where(Account.customer_id == cid_uuid).limit(1)
                )
                acc = result.scalar_one_or_none()
                if acc:
                    account_id_uuid = acc.account_id

            if not cid_uuid:
                return {"success": False, "error": f"Customer not found for account {account_number}"}

            # Parse scheduled_at
            try:
                scheduled_at = datetime.strptime(f"{date_str} {time_slot}", "%Y-%m-%d %H:%M").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                scheduled_at = datetime.now(timezone.utc) + timedelta(days=1)

            # Auto-assign an agent
            agent, wait_mins = await _auto_assign_agent("field_visit", db)

            from app.core.config import get_settings
            settings = get_settings()
            apt_number = f"{settings.appointment_number_prefix}-{str(uuid.uuid4())[:8].upper()}"

            appointment = Appointment(
                appointment_number=apt_number,
                customer_id=cid_uuid,
                account_id=account_id_uuid,
                agent_id=agent.agent_id if agent else None,
                conversation_id=conversation_id,
                status="assigned" if agent else "confirmed",
                booked_via="ai_agent",
                channel="field_visit",
                scheduled_at=scheduled_at,
                confirmed_at=datetime.now(timezone.utc),
                reason=issue_description[:120],
                reason_detail=issue_description,
                intent_category="technical",
                duration_mins=settings.scheduling_default_slot_mins,
            )
            db.add(appointment)

            if agent:
                agent.current_load = (agent.current_load or 0) + 1
                agent.total_sessions = (agent.total_sessions or 0) + 1
                agent.sessions_today = (agent.sessions_today or 0) + 1

            await db.commit()
            await db.refresh(appointment)

            await event_bus.emit(
                session_id="system",
                event=AppointmentUpdatedEvent(
                    session_id="system",
                    customer_id=str(cid_uuid),
                    appointment_id=str(appointment.appointment_id),
                )
            )

            logger.info("Appointment %s confirmed for customer %s on %s %s", apt_number, cid_uuid, date_str, time_slot)
            return {
                "success": True,
                "appointment_id": str(appointment.appointment_id),
                "appointment_number": apt_number,
                "account_number": account_number,
                "date": date_str,
                "time": time_slot,
                "issue_description": issue_description,
                "engineer_name": agent.name if agent else "Field Engineer",
                "status": "assigned" if agent else "confirmed",
                "confirmation_sms": (
                    f"Your technician visit is confirmed for {date_str} at {time_slot}. "
                    f"Ref: {apt_number}"
                ),
                "booked_at": appointment.confirmed_at.isoformat(),
            }
        except Exception as exc:
            logger.error("schedule_engineer error: %s", exc)
            return {"success": False, "error": str(exc)}


async def get_appointments(account_number: str) -> list[dict]:
    """Fetch all appointments for an account from PostgreSQL."""
    async with async_session_factory() as db:
        try:
            # Resolve customer
            result = await db.execute(
                select(Customer).where(Customer.account_number == account_number)
            )
            c = result.scalar_one_or_none()
            if not c:
                return []
            stmt = (
                select(Appointment)
                .where(Appointment.customer_id == c.customer_id)
                .order_by(desc(Appointment.created_at))
            )
            rows = await db.execute(stmt)
            appts = rows.scalars().all()
            return [
                {
                    "appointment_id":     str(a.appointment_id),
                    "appointment_number": a.appointment_number,
                    "status":             a.status,
                    "scheduled_at":       a.scheduled_at.isoformat() if a.scheduled_at else None,
                    "reason":             a.reason,
                    "channel":            a.channel,
                    "created_at":         a.created_at.isoformat(),
                }
                for a in appts
            ]
        except Exception as exc:
            logger.error("get_appointments error: %s", exc)
            return []


async def cancel_appointment(appointment_id: str) -> dict:
    """Mark an appointment as cancelled in PostgreSQL."""
    async with async_session_factory() as db:
        try:
            appt = await db.get(Appointment, uuid.UUID(appointment_id))
            if not appt:
                return {"status": "not_found", "appointment_id": appointment_id}
            appt.status = "cancelled"
            appt.cancelled_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info("Appointment %s cancelled", appointment_id)
            return {"status": "cancelled", "appointment_id": appointment_id}
        except Exception as exc:
            logger.error("cancel_appointment error: %s", exc)
            return {"status": "error", "error": str(exc)}


async def escalate_to_human_agent(
    customer_id: str,
    reason: str,
    sentiment: str = "neutral",
    conversation_history: list[dict] | None = None,
    customer_profile: dict | None = None,
    customer_context: dict | None = None,
    session_id: str | None = None,
    conversation_id: str | None = None,
) -> dict:
    """
    Create a high-priority Appointment for a human agent callback.

    Populates customer_snapshot, conversation_transcript, ai_suggested_actions,
    and priority based on sentiment so the Scheduling Dashboard shows full context.
    """
    async with async_session_factory() as db:
        try:
            cid_uuid = uuid.UUID(customer_id)

            # Resolve account
            result = await db.execute(
                select(Account).where(Account.customer_id == cid_uuid).limit(1)
            )
            acc = result.scalar_one_or_none()
            account_id_uuid = acc.account_id if acc else None

            # Fetch customer if profile not passed
            if not customer_profile:
                c = await db.get(Customer, cid_uuid)
                if c:
                    customer_profile = {
                        "name": c.name,
                        "email": c.email,
                        "phone": c.phone,
                        "account_number": c.account_number,
                        "customer_id": str(c.customer_id),
                        "customer_tier": c.customer_tier or "standard",
                        "plan": c.plan,
                        "city": c.city,
                    }

            # Priority based on sentiment
            priority_map = {"angry": "urgent", "frustrated": "high", "neutral": "medium", "positive": "low"}
            priority = priority_map.get(sentiment, "high")

            # Auto-assign agent
            agent, wait_mins = await _auto_assign_agent("support", db)
            
            # Determine schedule time and status based on wait time
            now_utc = datetime.now(timezone.utc)
            if wait_mins == 0:
                scheduled_at = now_utc
                status = "in_progress"
            else:
                scheduled_at = now_utc + timedelta(minutes=wait_mins)
                status = "assigned"

            from app.core.config import get_settings

            from app.core.config import get_settings
            settings = get_settings()
            apt_number = f"ESC-{str(uuid.uuid4())[:8].upper()}"

            # Build billing snapshot from customer_context
            billing_snap = {}
            if customer_context:
                acct_data = customer_context.get("account", {})
                invoices = customer_context.get("invoices", [])
                billing_snap = {
                    "plan": acct_data.get("plan_name"),
                    "balance": acct_data.get("balance"),
                    "status": acct_data.get("status"),
                    "recent_invoices": [
                        {
                            "invoice_number": inv.get("invoice_number"),
                            "total_amount": inv.get("total_amount"),
                            "status": inv.get("status"),
                            "due_date": inv.get("due_date"),
                        }
                        for inv in invoices[:3]
                    ],
                }

            appointment = Appointment(
                appointment_number=apt_number,
                customer_id=cid_uuid,
                account_id=account_id_uuid,
                agent_id=agent.agent_id if agent else None,
                conversation_id=conversation_id if conversation_id else None,
                status=status if agent else "pending",
                booked_via="ai_agent",
                channel="voice_call",
                priority=priority,
                intent_category="escalation",
                urgency_signal=sentiment,
                scheduled_at=scheduled_at,
                reason=reason[:120],
                reason_detail=reason,
                customer_snapshot=customer_profile or {},
                billing_snapshot=billing_snap,
                conversation_transcript=conversation_history or [],
                ai_summary=f"Customer requested human agent. Reason: {reason}. Sentiment: {sentiment}.",
                ai_suggested_actions=[
                    {"action": "Review conversation transcript", "priority": "high"},
                    {"action": f"Address: {reason[:80]}", "priority": priority},
                    {"action": "Verify account status and billing", "priority": "medium"},
                ],
                ai_risk_flags=["escalated_from_ai"] + (["high_frustration"] if sentiment in ("angry", "frustrated") else []),
                follow_up_required=True,
                tags=["escalation", "human_requested", sentiment],
                custom_fields={"session_id": session_id or "", "escalated_at": now_utc.isoformat()},
            )
            db.add(appointment)

            if agent and status in ["assigned", "in_progress"]:
                agent.current_load = (agent.current_load or 0) + 1
                agent.total_sessions = (agent.total_sessions or 0) + 1
                agent.sessions_today = (agent.sessions_today or 0) + 1

            await db.commit()
            await db.refresh(appointment)

            await event_bus.emit(
                session_id="system",
                event=AppointmentUpdatedEvent(
                    session_id="system",
                    customer_id=str(cid_uuid),
                    appointment_id=str(appointment.appointment_id),
                )
            )

            logger.info("Human escalation appointment %s created for customer %s (sentiment: %s, agent: %s, wait: %sm)", 
                        apt_number, customer_id, sentiment, agent.name if agent else "none", wait_mins)
            
            if wait_mins == 0:
                msg = f"I've connected you with our support team immediately. Agent {agent.name} is reviewing your case now. Ref: {apt_number}."
            else:
                msg = f"I've escalated your case to our support team. An agent ({agent.name}) will connect with you in approximately {wait_mins} minutes. Ref: {apt_number}."

            return {
                "success": True,
                "appointment_id": str(appointment.appointment_id),
                "appointment_number": apt_number,
                "priority": priority,
                "scheduled_at": scheduled_at.isoformat(),
                "agent_assigned": agent.name if agent else None,
                "wait_minutes": wait_mins,
                "message": msg,
            }
        except Exception as exc:
            logger.error("escalate_to_human_agent error: %s", exc)
            return {"success": False, "error": str(exc)}

