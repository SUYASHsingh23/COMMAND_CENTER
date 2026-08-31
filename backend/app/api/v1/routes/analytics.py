from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from app.core.dependencies import get_db
from app.models.conversation import Conversation, Message, Intent
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
    limit: int = 20,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    result = await db.execute(
        select(Conversation)
        .order_by(Conversation.started_at.desc())
        .limit(limit)
    )
    convs = result.scalars().all()
    return [
        {
            "conversation_id": str(c.conversation_id),
            "session_id": c.session_id,
            "channel": c.channel,
            "status": c.status,
            "sentiment": c.sentiment,
            "language": c.language,
            "started_at": c.started_at.isoformat() if c.started_at else None,
            "ended_at": c.ended_at.isoformat() if c.ended_at else None,
        }
        for c in convs
    ]


@router.get("/conversations/{conversation_id}/detail")
async def get_conversation_detail(
    conversation_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from uuid import UUID
    cid = UUID(conversation_id)

    messages = await db.execute(
        select(Message)
        .where(Message.conversation_id == cid)
        .order_by(Message.turn_index)
    )
    msgs = messages.scalars().all()

    tools = await db.execute(
        select(ToolExecution)
        .where(ToolExecution.conversation_id == cid)
        .order_by(ToolExecution.timestamp)
    )
    tool_list = tools.scalars().all()

    intents = await db.execute(
        select(Intent)
        .where(Intent.conversation_id == cid)
        .order_by(Intent.intent_id.desc())
        .limit(10)
    )
    intent_list = intents.scalars().all()

    summaries = await db.execute(
        select(CallSummary).where(CallSummary.conversation_id == cid)
    )
    summary = summaries.scalar_one_or_none()

    workflows = await db.execute(
        select(WorkflowExecution).where(WorkflowExecution.conversation_id == cid)
    )
    wf_list = workflows.scalars().all()

    policies = await db.execute(
        select(PolicyDecision)
        .where(PolicyDecision.conversation_id == cid)
        .order_by(PolicyDecision.timestamp)
    )
    policy_list = policies.scalars().all()

    return {
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


@router.get("/escalations")
async def list_escalations(
    limit: int = 20,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    result = await db.execute(
        select(Escalation)
        .order_by(Escalation.timestamp.desc())
        .limit(limit)
    )
    escs = result.scalars().all()
    return [
        {
            "escalation_id": str(e.escalation_id),
            "conversation_id": str(e.conversation_id),
            "reason": e.reason,
            "agent_id": e.agent_id,
            "handoff_context": e.handoff_context,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
        }
        for e in escs
    ]
