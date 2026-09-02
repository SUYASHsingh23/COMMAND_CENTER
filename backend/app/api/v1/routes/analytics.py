from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, update
from app.core.dependencies import get_db
from app.models.conversation import Conversation, Message, Intent, ConversationState
from app.models.execution import ToolExecution, WorkflowExecution, PolicyDecision
from app.models.summary import CallSummary, Escalation

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
async def get_dashboard_metrics(db: Annotated[AsyncSession, Depends(get_db)]):
    total_convs = await db.scalar(select(func.count()).select_from(Conversation))
    active_convs = await db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.status == "active")
    )
    total_summaries = await db.scalar(select(func.count()).select_from(CallSummary))
    resolved = await db.scalar(
        select(func.count()).select_from(CallSummary).where(CallSummary.resolution == "resolved")
    )
    escalated_count = await db.scalar(
        select(func.count()).select_from(Escalation)
    )
    total_tools = await db.scalar(select(func.count()).select_from(ToolExecution))

    containment_rate = round((resolved / total_summaries * 100), 1) if total_summaries else 0.0
    escalation_rate = round((escalated_count / total_convs * 100), 1) if total_convs else 0.0

    sentiment_rows = await db.execute(
        select(Conversation.sentiment, func.count().label("count"))
        .group_by(Conversation.sentiment)
    )
    sentiment_dist = {row.sentiment: row.count for row in sentiment_rows}

    tool_rows = await db.execute(
        select(ToolExecution.tool_name, func.count().label("count"))
        .group_by(ToolExecution.tool_name)
        .order_by(func.count().desc())
        .limit(8)
    )
    top_tools = [{"tool": row.tool_name, "count": row.count} for row in tool_rows]

    return {
        "total_conversations": total_convs or 0,
        "active_conversations": active_convs or 0,
        "containment_rate": containment_rate,
        "escalation_rate": escalation_rate,
        "total_tool_executions": total_tools or 0,
        "sentiment_distribution": sentiment_dist,
        "top_tools": top_tools,
    }


@router.get("/conversations")
async def list_conversations(
    limit: int = 500,
    status: str = "all",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    from app.models.customer import Customer
    query = select(
        Conversation,
        func.count(Message.message_id).label("msg_count"),
        Customer.name.label("customer_name"),
    ).outerjoin(Message, Message.conversation_id == Conversation.conversation_id
    ).outerjoin(Customer, Customer.customer_id == Conversation.customer_id
    ).group_by(Conversation.conversation_id, Customer.name
    ).order_by(Conversation.started_at.desc()).limit(limit)

    if status != "all":
        query = query.where(Conversation.status == status)

    result = await db.execute(query)
    rows = result.all()

    # Also get tool counts per conversation
    tool_counts_raw = await db.execute(
        select(ToolExecution.conversation_id, func.count().label("cnt"))
        .group_by(ToolExecution.conversation_id)
    )
    tool_counts = {str(r.conversation_id): r.cnt for r in tool_counts_raw}

    return [
        {
            "conversation_id": str(row.Conversation.conversation_id),
            "session_id": row.Conversation.session_id,
            "channel": row.Conversation.channel,
            "status": row.Conversation.status,
            "sentiment": row.Conversation.sentiment,
            "language": row.Conversation.language,
            "customer_name": row.customer_name,
            "message_count": row.msg_count,
            "tool_count": tool_counts.get(str(row.Conversation.conversation_id), 0),
            "started_at": row.Conversation.started_at.isoformat() if row.Conversation.started_at else None,
            "ended_at": row.Conversation.ended_at.isoformat() if row.Conversation.ended_at else None,
        }
        for row in rows
    ]


@router.get("/conversations/{conversation_id}/detail")
async def get_conversation_detail(
    conversation_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from uuid import UUID
    from app.models.customer import Customer
    cid = UUID(conversation_id)

    # Fetch conversation + customer
    conv_result = await db.execute(
        select(Conversation, Customer.name.label("customer_name"), Customer.customer_id.label("cust_id"))
        .outerjoin(Customer, Customer.customer_id == Conversation.customer_id)
        .where(Conversation.conversation_id == cid)
    )
    conv_row = conv_result.one_or_none()
    conv = conv_row.Conversation if conv_row else None
    customer_name = conv_row.customer_name if conv_row else None

    messages = await db.execute(
        select(Message).where(Message.conversation_id == cid).order_by(Message.turn_index, Message.timestamp)
    )
    msgs = messages.scalars().all()

    tools = await db.execute(
        select(ToolExecution).where(ToolExecution.conversation_id == cid).order_by(ToolExecution.timestamp)
    )
    tool_list = tools.scalars().all()

    intents = await db.execute(
        select(Intent).where(Intent.conversation_id == cid).order_by(Intent.intent_id.desc()).limit(10)
    )
    intent_list = intents.scalars().all()

    summaries = await db.execute(select(CallSummary).where(CallSummary.conversation_id == cid))
    summary = summaries.scalar_one_or_none()

    workflows = await db.execute(select(WorkflowExecution).where(WorkflowExecution.conversation_id == cid))
    wf_list = workflows.scalars().all()

    policies = await db.execute(
        select(PolicyDecision).where(PolicyDecision.conversation_id == cid).order_by(PolicyDecision.timestamp)
    )
    policy_list = policies.scalars().all()

    # Build rich timeline: merge messages, tools, intents, policies, workflows into chronological events
    timeline_events = []

    # Session started event
    if conv and conv.started_at:
        timeline_events.append({
            "type": "session_started",
            "timestamp": conv.started_at.isoformat(),
            "label": f"Session Started",
            "detail": f"Customer: {customer_name or 'Unknown'} · Channel: {conv.channel if conv else 'web'}",
        })

    # Messages
    for m in msgs:
        timeline_events.append({
            "type": "message_user" if m.role == "user" or m.role == "customer" else "message_agent",
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "label": "Customer" if m.role in ("user", "customer") else "Agent Response",
            "detail": m.content[:120] + ("…" if len(m.content) > 120 else ""),
            "turn_index": m.turn_index,
        })

    # Tool executions
    for t in tool_list:
        timeline_events.append({
            "type": "tool_completed",
            "timestamp": t.timestamp.isoformat() if t.timestamp else None,
            "label": f"Tool: {t.tool_name}",
            "detail": f"{t.status} · {t.duration_ms}ms",
            "status": t.status,
            "input_params": t.input_params,
        })

    # Intent detections
    for i in intent_list:
        # Try to get timestamp from linked message
        ts = None
        if i.message_id:
            linked_msg = next((m for m in msgs if m.message_id == i.message_id), None)
            if linked_msg and linked_msg.timestamp:
                ts = linked_msg.timestamp.isoformat()
        if not ts and msgs:
            ts = msgs[0].timestamp.isoformat()
        timeline_events.append({
            "type": "intent",
            "timestamp": ts,
            "label": f"Intent: {', '.join(i.detected_intents[:2]) if i.detected_intents else 'detected'}",
            "detail": f"Sentiment: {i.sentiment} · Urgency: {i.urgency}",
        })

    # Policy decisions
    for p in policy_list:
        timeline_events.append({
            "type": "policy",
            "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            "label": f"Policy: {p.policy_name}",
            "detail": p.reason,
            "status": "allowed" if p.authorized else "blocked",
        })

    # Workflow steps
    for w in wf_list:
        timeline_events.append({
            "type": "workflow_step",
            "timestamp": w.started_at.isoformat() if w.started_at else None,
            "label": f"Workflow: {w.workflow_name}",
            "detail": f"State: {w.state} · Steps: {len(w.steps_completed or [])} completed",
            "status": w.state,
        })

    # Session ended
    if conv and conv.ended_at:
        timeline_events.append({
            "type": "session_ended",
            "timestamp": conv.ended_at.isoformat(),
            "label": "Session Ended",
            "detail": f"Resolution: {summary.resolution if summary else 'unknown'}",
        })

    # Sort all events by timestamp
    timeline_events.sort(key=lambda e: e.get("timestamp") or "")

    return {
        "conversation_id": conversation_id,
        "customer_name": customer_name,
        "status": conv.status if conv else "unknown",
        "channel": conv.channel if conv else "web",
        "started_at": conv.started_at.isoformat() if conv and conv.started_at else None,
        "ended_at": conv.ended_at.isoformat() if conv and conv.ended_at else None,
        "messages": [
            {
                "message_id": str(m.message_id),
                "role": m.role,
                "content": m.content,
                "turn_index": m.turn_index,
                "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            }
            for m in msgs
        ],
        "tool_executions": [
            {
                "exec_id": str(t.exec_id),
                "tool_name": t.tool_name,
                "status": t.status,
                "duration_ms": t.duration_ms,
                "input_params": t.input_params,
                "output": t.output,
                "timestamp": t.timestamp.isoformat() if t.timestamp else None,
            }
            for t in tool_list
        ],
        "intents": [
            {
                "detected_intents": i.detected_intents,
                "entities": i.entities,
                "sentiment": i.sentiment,
                "urgency": i.urgency,
                "confidence": float(i.confidence) if i.confidence else None,
            }
            for i in intent_list
        ],
        "workflows": [
            {
                "workflow_name": w.workflow_name,
                "state": w.state,
                "steps_completed": w.steps_completed,
                "started_at": w.started_at.isoformat() if w.started_at else None,
                "completed_at": w.completed_at.isoformat() if w.completed_at else None,
            }
            for w in wf_list
        ],
        "policy_decisions": [
            {
                "policy_name": p.policy_name,
                "action_proposed": p.action_proposed,
                "authorized": p.authorized,
                "reason": p.reason,
                "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            }
            for p in policy_list
        ],
        "timeline": timeline_events,
        "summary": {
            "summary_text": summary.summary_text,
            "resolution": summary.resolution,
            "escalated": summary.escalated,
            "duration_sec": summary.duration_sec,
            "tools_used": summary.tools_used,
        } if summary else None,
    }


@router.get("/sentiment-timeline")
async def get_sentiment_timeline(
    limit: int = 50,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    result = await db.execute(
        select(
            Intent.conversation_id,
            Intent.sentiment,
            Intent.urgency,
            Message.timestamp,
        )
        .join(Message, Message.message_id == Intent.message_id, isouter=True)
        .order_by(Message.timestamp.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "conversation_id": str(r.conversation_id),
            "sentiment": r.sentiment,
            "urgency": r.urgency,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        }
        for r in rows
    ]


@router.get("/escalations/open-count")
async def get_open_escalation_count(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Returns count of open escalations — used by the Billing page badge."""
    count = await db.scalar(
        select(func.count()).select_from(Escalation).where(Escalation.status == "open")
    )
    return {"open_count": count or 0}


@router.get("/escalations")
async def list_escalations(
    limit: int = 50,
    status: str = "all",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """List escalations with customer name joined. Filter by status=open|assigned|resolved|all."""
    from app.models.customer import Customer
    query = (
        select(
            Escalation,
            Customer.name.label("customer_name"),
            Customer.email.label("customer_email"),
        )
        .outerjoin(Customer, Customer.customer_id == Escalation.customer_id)
        .order_by(Escalation.timestamp.desc())
        .limit(limit)
    )
    if status != "all":
        query = query.where(Escalation.status == status)

    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "escalation_id": str(row.Escalation.escalation_id),
            "conversation_id": str(row.Escalation.conversation_id),
            "reason": row.Escalation.reason,
            "status": row.Escalation.status,
            "customer_id": str(row.Escalation.customer_id) if row.Escalation.customer_id else None,
            "customer_name": row.customer_name,
            "customer_email": row.customer_email,
            "appointment_reference": row.Escalation.appointment_reference,
            "resolved_by": row.Escalation.resolved_by,
            "resolved_at": row.Escalation.resolved_at.isoformat() if row.Escalation.resolved_at else None,
            "handoff_context": row.Escalation.handoff_context,
            "timestamp": row.Escalation.timestamp.isoformat() if row.Escalation.timestamp else None,
        }
        for row in rows
    ]


@router.patch("/escalations/{escalation_id}")
async def update_escalation(
    escalation_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = None,
    resolved_by: str | None = None,
):
    """Update escalation status (open → assigned → resolved). resolved_by is the agent name."""
    from datetime import datetime, timezone
    from uuid import UUID
    eid = UUID(escalation_id)
    esc = (await db.execute(
        select(Escalation).where(Escalation.escalation_id == eid)
    )).scalar_one_or_none()

    if not esc:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Escalation not found")

    if status:
        esc.status = status
    if resolved_by:
        esc.resolved_by = resolved_by
    if status == "resolved" and not esc.resolved_at:
        esc.resolved_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(esc)
    return {
        "escalation_id": str(esc.escalation_id),
        "status": esc.status,
        "resolved_by": esc.resolved_by,
        "resolved_at": esc.resolved_at.isoformat() if esc.resolved_at else None,
    }


# ── Session TTL & Admin Force-End ──────────────────────────────────────────────

SESSION_TTL_MINUTES = 15  # inactivity timeout in minutes


@router.post("/sessions/{session_id}/force-end")
async def admin_force_end_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Admin-only endpoint to forcibly end an active session.
    Marks the conversation as completed, generates a summary, and broadcasts
    a session.ended event to all connected supervisors and the customer's session.
    """
    from datetime import datetime, timezone
    from app.gateway.session import session_manager
    from app.orchestrator.agent import AgentOrchestrator

    # Validate session exists and is active
    conv = (await db.execute(
        select(Conversation).where(Conversation.session_id == session_id)
    )).scalar_one_or_none()

    if not conv:
        raise HTTPException(status_code=404, detail="Session not found")
    if conv.status == "completed":
        return {"status": "already_ended", "session_id": session_id}

    # Mark as completed in DB (the session_manager handles broadcast)
    ended_conv = await session_manager.end_session(db=db, session_id=session_id)

    # Generate summary asynchronously (don't block the response)
    import asyncio
    _agent = AgentOrchestrator()
    asyncio.create_task(
        _agent.end_session(session_id, str(conv.conversation_id), duration_sec=0)
    )

    return {
        "status": "ended",
        "session_id": session_id,
        "conversation_id": str(conv.conversation_id),
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "ended_by": "admin",
    }


@router.get("/sessions/ttl-status")
async def get_session_ttl_status(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Returns TTL info for all active sessions:
    - last activity timestamp (from conversation_state.updated_at)
    - seconds remaining before auto-expiry
    - whether the session is idle (past the warning threshold)
    Used by the frontend to show admins which sessions are about to time out.
    """
    from datetime import datetime, timezone, timedelta

    ttl_seconds = SESSION_TTL_MINUTES * 60
    now = datetime.now(timezone.utc)

    rows = await db.execute(
        select(
            Conversation.session_id,
            Conversation.conversation_id,
            Conversation.started_at,
            ConversationState.updated_at.label("last_activity"),
        )
        .outerjoin(ConversationState, ConversationState.conversation_id == Conversation.conversation_id)
        .where(Conversation.status == "active")
    )

    result = []
    for row in rows:
        last_activity = row.last_activity
        if last_activity is None:
            last_activity = row.started_at
        if last_activity and last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)

        inactive_seconds = int((now - last_activity).total_seconds()) if last_activity else 0
        remaining_seconds = max(0, ttl_seconds - inactive_seconds)
        is_idle = inactive_seconds >= (ttl_seconds * 0.75)  # warn at 75% (≈11min)
        is_expired = inactive_seconds >= ttl_seconds

        result.append({
            "session_id": row.session_id,
            "conversation_id": str(row.conversation_id),
            "last_activity": last_activity.isoformat() if last_activity else None,
            "inactive_seconds": inactive_seconds,
            "remaining_seconds": remaining_seconds,
            "is_idle": is_idle,
            "is_expired": is_expired,
        })

    return result


@router.post("/sessions/expire-idle")
async def expire_idle_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Server-side TTL enforcement: called periodically by the scheduler.
    Finds all sessions that have been inactive for >= SESSION_TTL_MINUTES
    and forces them to end, generating a summary for each.
    """
    from datetime import datetime, timezone, timedelta
    import asyncio
    from app.gateway.session import session_manager
    from app.orchestrator.agent import AgentOrchestrator

    ttl_cutoff = datetime.now(timezone.utc) - timedelta(minutes=SESSION_TTL_MINUTES)

    # Find active sessions where conversation_state.updated_at < cutoff
    idle_rows = await db.execute(
        select(Conversation.session_id, Conversation.conversation_id)
        .join(ConversationState, ConversationState.conversation_id == Conversation.conversation_id)
        .where(Conversation.status == "active")
        .where(ConversationState.updated_at < ttl_cutoff)
    )
    idle_sessions = idle_rows.all()

    if not idle_sessions:
        return {"expired": 0, "sessions": []}

    _agent = AgentOrchestrator()
    expired = []
    for row in idle_sessions:
        try:
            # DB: mark completed + broadcast session.ended
            async with db.begin_nested():
                await session_manager.end_session(db=db, session_id=row.session_id)
            # Generate summary (non-blocking)
            asyncio.create_task(
                _agent.end_session(row.session_id, str(row.conversation_id), duration_sec=0)
            )
            expired.append(row.session_id)
        except Exception as exc:
            pass  # log individually but don't fail the whole batch

    await db.commit()
    return {"expired": len(expired), "sessions": expired}
