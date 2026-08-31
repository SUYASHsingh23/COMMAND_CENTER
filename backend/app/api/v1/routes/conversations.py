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
