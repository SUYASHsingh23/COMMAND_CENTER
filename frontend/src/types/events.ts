export type EventType =
  | 'session.created'
  | 'session.ended'
  | 'transcript.partial'
  | 'transcript.final'
  | 'intent.detected'
  | 'tool.started'
  | 'tool.completed'
  | 'rag.retrieved'
  | 'policy.decision'
  | 'workflow.step'
  | 'response.generated'
  | 'sentiment.updated'
  | 'escalation.created'
  | 'call.summary'
  | 'audio.completed'
  | 'customer.updated'
  | 'invoice.updated'
  | 'appointment.updated'
  | 'error'

export interface BaseEvent {
  event: EventType
  session_id: string
  timestamp: string
}

export interface SessionCreatedEvent extends BaseEvent {
  event: 'session.created'
  conversation_id: string
  customer_id: string | null
  channel: string
}

export interface SessionEndedEvent extends BaseEvent {
  event: 'session.ended'
  duration_sec: number | null
}

export interface TranscriptPartialEvent extends BaseEvent {
  event: 'transcript.partial'
  text: string
}

export interface TranscriptFinalEvent extends BaseEvent {
  event: 'transcript.final'
  text: string
  turn_index: number | null
}

export interface IntentDetectedEvent extends BaseEvent {
  event: 'intent.detected'
  intents: string[]
  entities: Record<string, string>
  sentiment: string
  urgency: string
  confidence: number | null
}

export interface ToolStartedEvent extends BaseEvent {
  event: 'tool.started'
  tool_name: string
  input_params: Record<string, unknown>
}

export interface ToolCompletedEvent extends BaseEvent {
  event: 'tool.completed'
  tool_name: string
  status: string
  input_params?: Record<string, unknown>
  output: Record<string, unknown>
  duration_ms: number
}

export interface RagRetrievedEvent extends BaseEvent {
  event: 'rag.retrieved'
  query: string
  passages: Array<{ text: string; doc_id: string; score: number }>
  doc_count: number
}

export interface PolicyDecisionEvent extends BaseEvent {
  event: 'policy.decision'
  policy_name: string
  action_proposed: string
  authorized: boolean
  reason: string
}

export interface WorkflowStepEvent extends BaseEvent {
  event: 'workflow.step'
  workflow_name: string
  step_name: string
  step_status: string
  steps_completed: string[]
}

export interface ResponseGeneratedEvent extends BaseEvent {
  event: 'response.generated'
  text: string
}

export interface SentimentUpdatedEvent extends BaseEvent {
  event: 'sentiment.updated'
  sentiment: string
  urgency: string | null
}

export interface ErrorEvent extends BaseEvent {
  event: 'error'
  code: string
  message: string
}

export interface EscalationCreatedEvent extends BaseEvent {
  event: 'escalation.created'
  reason: string
  domain: string
  sentiment: string
  turn_count: number
  customer_verified: boolean
}

export interface CallSummaryEvent extends BaseEvent {
  event: 'call.summary'
  summary_text: string
  resolution: string
  escalated: boolean
  duration_sec: number
  tools_used: string[]
}

export interface CustomerUpdatedEvent extends BaseEvent {
  event: 'customer.updated'
  customer_id: string
}

export interface InvoiceUpdatedEvent extends BaseEvent {
  event: 'invoice.updated'
  customer_id: string
  invoice_id: string
}

export interface AppointmentUpdatedEvent extends BaseEvent {
  event: 'appointment.updated'
  customer_id: string
  appointment_id: string
}

export type AnyEvent =
  | SessionCreatedEvent
  | SessionEndedEvent
  | TranscriptPartialEvent
  | TranscriptFinalEvent
  | IntentDetectedEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | RagRetrievedEvent
  | PolicyDecisionEvent
  | WorkflowStepEvent
  | ResponseGeneratedEvent
  | SentimentUpdatedEvent
  | EscalationCreatedEvent
  | CallSummaryEvent
  | CustomerUpdatedEvent
  | InvoiceUpdatedEvent
  | AppointmentUpdatedEvent
  | ErrorEvent
