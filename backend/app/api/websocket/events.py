from enum import Enum
from typing import Any
from pydantic import BaseModel
from datetime import datetime, timezone


class EventType(str, Enum):
    SESSION_CREATED = "session.created"
    SESSION_ENDED = "session.ended"
    TRANSCRIPT_PARTIAL = "transcript.partial"
    TRANSCRIPT_FINAL = "transcript.final"
    INTENT_DETECTED = "intent.detected"
    TOOL_STARTED = "tool.started"
    TOOL_COMPLETED = "tool.completed"
    RAG_RETRIEVED = "rag.retrieved"
    POLICY_DECISION = "policy.decision"
    WORKFLOW_STEP = "workflow.step"
    RESPONSE_GENERATED = "response.generated"
    SENTIMENT_UPDATED = "sentiment.updated"
    AUDIO_STARTED = "audio.started"
    AUDIO_COMPLETED = "audio.completed"
    ESCALATION_CREATED = "escalation.created"
    CALL_SUMMARY = "call.summary"
    ERROR = "error"
    CUSTOMER_UPDATED = "customer.updated"
    INVOICE_UPDATED = "invoice.updated"
    APPOINTMENT_UPDATED = "appointment.updated"


class BaseEvent(BaseModel):
    event: EventType
    session_id: str
    timestamp: str = ""

    def model_post_init(self, __context: Any):
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()


class SessionCreatedEvent(BaseEvent):
    event: EventType = EventType.SESSION_CREATED
    conversation_id: str
    customer_id: str | None = None
    channel: str = "web"


class SessionEndedEvent(BaseEvent):
    event: EventType = EventType.SESSION_ENDED
    duration_sec: int | None = None


class TranscriptPartialEvent(BaseEvent):
    event: EventType = EventType.TRANSCRIPT_PARTIAL
    text: str


class TranscriptFinalEvent(BaseEvent):
    event: EventType = EventType.TRANSCRIPT_FINAL
    text: str
    turn_index: int | None = None


class IntentDetectedEvent(BaseEvent):
    event: EventType = EventType.INTENT_DETECTED
    intents: list[str]
    entities: dict
    sentiment: str
    urgency: str
    confidence: float | None = None


class ToolStartedEvent(BaseEvent):
    event: EventType = EventType.TOOL_STARTED
    tool_name: str
    input_params: dict


class ToolCompletedEvent(BaseEvent):
    event: EventType = EventType.TOOL_COMPLETED
    tool_name: str
    status: str
    output: dict
    duration_ms: int


class RagRetrievedEvent(BaseEvent):
    event: EventType = EventType.RAG_RETRIEVED
    query: str
    passages: list[dict]
    doc_count: int


class PolicyDecisionEvent(BaseEvent):
    event: EventType = EventType.POLICY_DECISION
    policy_name: str
    action_proposed: str
    authorized: bool
    reason: str


class WorkflowStepEvent(BaseEvent):
    event: EventType = EventType.WORKFLOW_STEP
    workflow_name: str
    step_name: str
    step_status: str
    steps_completed: list[str]


class ResponseGeneratedEvent(BaseEvent):
    event: EventType = EventType.RESPONSE_GENERATED
    text: str


class SentimentUpdatedEvent(BaseEvent):
    event: EventType = EventType.SENTIMENT_UPDATED
    sentiment: str
    urgency: str | None = None


class ErrorEvent(BaseEvent):
    event: EventType = EventType.ERROR
    code: str
    message: str


class EscalationCreatedEvent(BaseEvent):
    event: EventType = EventType.ESCALATION_CREATED
    reason: str
    domain: str
    sentiment: str
    turn_count: int
    customer_verified: bool


class CallSummaryEvent(BaseEvent):
    event: EventType = EventType.CALL_SUMMARY
    summary_text: str
    resolution: str
    escalated: bool
    duration_sec: int
    tools_used: list[str]


class CustomerUpdatedEvent(BaseEvent):
    event: EventType = EventType.CUSTOMER_UPDATED
    customer_id: str


class InvoiceUpdatedEvent(BaseEvent):
    event: EventType = EventType.INVOICE_UPDATED
    customer_id: str
    invoice_id: str


class AppointmentUpdatedEvent(BaseEvent):
    event: EventType = EventType.APPOINTMENT_UPDATED
    customer_id: str
    appointment_id: str
