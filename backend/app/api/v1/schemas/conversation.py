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


class HistoryMessageItem(BaseModel):
    message_id: str
    role: str
    content: str
    turn_index: int | None = None
    timestamp: str
    sentiment: str | None = None


class CustomerConversationHistoryItem(BaseModel):
    conversation_id: str
    session_id: str
    started_at: str
    ended_at: str | None = None
    duration_sec: int | None = None
    status: str
    sentiment: str
    resolution: str | None = None
    summary: str | None = None
    intents: list[str] = []
    messages: list[HistoryMessageItem] = []

