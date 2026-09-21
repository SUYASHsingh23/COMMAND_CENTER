import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.dependencies import get_db
from app.gateway.session import session_manager
from app.models.conversation import Conversation, Message
from app.api.v1.schemas.conversation import (
    CreateSessionRequest,
    SessionResponse,
    ConversationResponse,
    MessageResponse,
    WebRTCOfferRequest,
    ICECandidateRequest,
    CustomerConversationHistoryItem,
    HistoryMessageItem,
)
from app.gateway.webrtc import store_offer, add_ice_candidate, get_signaling_session

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    body: CreateSessionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    conversation = await session_manager.create_session(
        db=db,
        customer_id=body.customer_id,
        channel=body.channel,
        language=body.language,
    )
    return SessionResponse(
        session_id=conversation.session_id,
        conversation_id=str(conversation.conversation_id),
        status=conversation.status,
        started_at=conversation.started_at,
    )


@router.post("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    conversation = await session_manager.end_session(db=db, session_id=session_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "ended", "session_id": session_id}


@router.get("/sessions/{session_id}", response_model=ConversationResponse)
async def get_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    conversation = await session_manager.get_session(db=db, session_id=session_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Session not found")
    return conversation


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    conversation_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.turn_index)
    )
    return result.scalars().all()


@router.post("/sessions/{session_id}/offer")
async def webrtc_offer(session_id: str, body: WebRTCOfferRequest):
    store_offer(session_id, body.sdp, body.type)
    return {"status": "offer_stored", "session_id": session_id}


@router.post("/sessions/{session_id}/ice-candidate")
async def ice_candidate(session_id: str, body: ICECandidateRequest):
    add_ice_candidate(session_id, body.candidate, body.sdp_mid, body.sdp_m_line_index)
    return {"status": "candidate_added"}


@router.get("/sessions/{session_id}/signaling")
async def get_signaling(session_id: str):
    sig = get_signaling_session(session_id)
    if not sig:
        raise HTTPException(status_code=404, detail="No signaling session found")
    return {
        "session_id": sig.session_id,
        "has_offer": sig.offer is not None,
        "has_answer": sig.answer is not None,
        "ice_candidate_count": len(sig.ice_candidates),
    }


@router.get("/customer/{customer_id}/history", response_model=list[CustomerConversationHistoryItem])
async def get_customer_conversation_history(
    customer_id: uuid.UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 5,
):
    from app.models.summary import CallSummary
    from app.models.conversation import Intent
    from sqlalchemy.orm import selectinload

    # Fetch latest conversations for this customer
    query = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.customer_id == customer_id)
        .order_by(Conversation.started_at.desc())
        .limit(limit)
    )
    result = await db.execute(query)
    conversations = result.scalars().all()

    if not conversations:
        return []

    conv_ids = [c.conversation_id for c in conversations]

    # Fetch summaries for these conversations
    summaries_query = select(CallSummary).where(CallSummary.conversation_id.in_(conv_ids))
    summaries_res = await db.execute(summaries_query)
    summary_map = {s.conversation_id: s for s in summaries_res.scalars().all()}

    # Fetch intents for these conversations (for message-level and conversation-level sentiment)
    intents_query = select(Intent).where(Intent.conversation_id.in_(conv_ids))
    intents_res = await db.execute(intents_query)
    intents = intents_res.scalars().all()

    # Map intents by message_id and conversation_id
    msg_intent_map = {it.message_id: it for it in intents if it.message_id}
    conv_intents_map = {}
    for it in intents:
        conv_intents_map.setdefault(it.conversation_id, []).extend(it.detected_intents or [])

    history_items = []
    for conv in conversations:
        sm = summary_map.get(conv.conversation_id)
        conv_intents = list(set(conv_intents_map.get(conv.conversation_id, [])))

        # Calculate duration
        duration_sec = sm.duration_sec if (sm and sm.duration_sec is not None) else None
        if duration_sec is None and conv.started_at and conv.ended_at:
            duration_sec = max(0, int((conv.ended_at - conv.started_at).total_seconds()))

        # Determine overall sentiment
        sentiment = conv.sentiment or "neutral"
        if sentiment == "neutral" and sm and sm.resolution == "escalated":
            sentiment = "frustrated"

        # Build messages list
        msg_items = []
        for m in sorted(conv.messages, key=lambda x: (x.turn_index if x.turn_index is not None else 0, x.timestamp)):
            intent_for_msg = msg_intent_map.get(m.message_id)
            msg_sentiment = intent_for_msg.sentiment if intent_for_msg else None
            msg_items.append(
                HistoryMessageItem(
                    message_id=str(m.message_id),
                    role=m.role,
                    content=m.content,
                    turn_index=m.turn_index,
                    timestamp=m.timestamp.isoformat() if m.timestamp else "",
                    sentiment=msg_sentiment,
                )
            )

        history_items.append(
            CustomerConversationHistoryItem(
                conversation_id=str(conv.conversation_id),
                session_id=conv.session_id,
                started_at=conv.started_at.isoformat() if conv.started_at else "",
                ended_at=conv.ended_at.isoformat() if conv.ended_at else None,
                duration_sec=duration_sec,
                status=conv.status,
                sentiment=sentiment,
                resolution=sm.resolution if sm else None,
                summary=sm.summary_text if sm else None,
                intents=conv_intents,
                messages=msg_items,
            )
        )

    return history_items

