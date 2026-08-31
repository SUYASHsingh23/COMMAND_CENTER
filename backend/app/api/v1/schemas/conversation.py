import uuid
from datetime import datetime
from pydantic import BaseModel


class CreateSessionRequest(BaseModel):
    customer_id: str | None = None
    channel: str = "web"
    language: str = "en"


class SessionResponse(BaseModel):
    session_id: str
    conversation_id: str
    status: str
    started_at: datetime

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    message_id: uuid.UUID
    conversation_id: uuid.UUID
    role: str
    content: str
    timestamp: datetime
    turn_index: int | None = None

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    conversation_id: uuid.UUID
    session_id: str
    customer_id: uuid.UUID | None
    channel: str
    status: str
    started_at: datetime
    ended_at: datetime | None
    sentiment: str
    language: str
    messages: list[MessageResponse] = []

    class Config:
        from_attributes = True


class EndSessionRequest(BaseModel):
    session_id: str


class WebRTCOfferRequest(BaseModel):
    sdp: str
    type: str


class ICECandidateRequest(BaseModel):
    candidate: str
    sdp_mid: str | None = None
    sdp_m_line_index: int | None = None
