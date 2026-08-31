import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Text, Boolean, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.session import Base


class Conversation(Base):
    __tablename__ = "conversation"

    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="SET NULL"), nullable=True)
    session_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    channel: Mapped[str] = mapped_column(String(20), default="web")
    status: Mapped[str] = mapped_column(String(20), default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sentiment: Mapped[str] = mapped_column(String(20), default="neutral")
    intent_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="en")

    customer: Mapped["Customer"] = relationship("Customer", back_populates="conversations", foreign_keys=[customer_id])
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="conversation", order_by="Message.turn_index")
    state: Mapped["ConversationState"] = relationship("ConversationState", back_populates="conversation", uselist=False)
    intents: Mapped[list["Intent"]] = relationship("Intent", back_populates="conversation")


class Message(Base):
    __tablename__ = "message"

    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation.conversation_id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    turn_index: Mapped[int | None] = mapped_column(Integer, nullable=True)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
    intents: Mapped[list["Intent"]] = relationship("Intent", back_populates="message")


class ConversationState(Base):
    __tablename__ = "conversation_state"

    state_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation.conversation_id", ondelete="CASCADE"), nullable=False)
    current_workflow: Mapped[str | None] = mapped_column(String(80), nullable=True)
    customer_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    task_status: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="state")


class Intent(Base):
    __tablename__ = "intent"

    intent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation.conversation_id", ondelete="CASCADE"), nullable=False)
    message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("message.message_id", ondelete="SET NULL"), nullable=True)
    detected_intents: Mapped[list] = mapped_column(JSONB, default=list)
    entities: Mapped[dict] = mapped_column(JSONB, default=dict)
    sentiment: Mapped[str | None] = mapped_column(String(20), nullable=True)
    urgency: Mapped[str] = mapped_column(String(10), default="medium")
    confidence: Mapped[float | None] = mapped_column(nullable=True)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="intents")
    message: Mapped["Message"] = relationship("Message", back_populates="intents")
