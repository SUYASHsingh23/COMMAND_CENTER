import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Text, Boolean, func, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database.session import Base


class CallSummary(Base):
    __tablename__ = "call_summary"

    summary_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation.conversation_id", ondelete="CASCADE"), nullable=False)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution: Mapped[str] = mapped_column(String(40), default="unresolved")
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    duration_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tools_used: Mapped[list] = mapped_column(JSONB, default=list)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Escalation(Base):
    __tablename__ = "escalation"

    escalation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversation.conversation_id", ondelete="CASCADE"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    agent_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    handoff_context: Mapped[dict] = mapped_column(JSONB, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # ── Queue management fields ────────────────────────────────────────────────
    # status lifecycle: open → assigned → resolved
    status: Mapped[str] = mapped_column(String(30), default="open", server_default="open")
    # Direct link to customer for efficient queue queries (also in handoff_context)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customer.customer_id", ondelete="SET NULL"), nullable=True)
    # Reference from the escalate_to_human tool (appointment / ticket number)
    appointment_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Who resolved it and when
    resolved_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
