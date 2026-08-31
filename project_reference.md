# Command Center 3.0 — Project Reference

> Schema · Workflow · Timeline · Folder Structure

---

## 1. CANONICAL SYSTEM ARCHITECTURE

```
                         ┌───────────────────┐
                         │  CUSTOMER BROWSER  │
                         │ React + WebRTC     │
                         └─────────┬─────────┘
                                   │  WebRTC audio stream
                                   ▼
                         ┌───────────────────┐
                         │  SESSION GATEWAY  │
                         │  FastAPI/WebSocket│
                         └─────────┬─────────┘
                                   │  audio frames
                                   ▼
                         ┌───────────────────┐
                         │  STREAMING STT    │
                         │  Sarvam AI API    │
                         └─────────┬─────────┘
                                   │  transcript.final
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │             AI AGENT ORCHESTRATOR                │
        │                                                  │
        │  Intent / Entity Understanding                   │
        │  Conversation State                              │
        │  Memory Manager                                  │
        │  Context Manager                                 │
        │  LLM Planner / Reasoner                          │
        │  Tool Orchestrator                               │
        │  Workflow Executor                               │
        │  RAG Manager                                     │
        │  Policy / Guardrails                             │
        └───────────────┬───────────────┬──────────────────┘
                        │               │
              ┌─────────┘               └─────────┐
              ▼                                   ▼
       ┌──────────────┐                    ┌──────────────┐
       │ ENTERPRISE   │                    │ KNOWLEDGE    │
       │ TOOLS        │                    │ RAG          │
       │              │                    │              │
       │ CRM          │                    │ Policies     │
       │ Billing      │                    │ Manuals      │
       │ Ticketing    │                    │ FAQs         │
       │ Scheduling   │                    │ Products     │
       └──────┬───────┘                    └──────┬───────┘
              │                                   │
              └─────────────────┬─────────────────┘
                                │  context + action results
                                ▼
                       ┌──────────────────┐
                       │  RESPONSE LLM    │
                       └────────┬─────────┘
                                │  text response
                                ▼
                       ┌──────────────────┐
                       │  STREAMING TTS   │
                       │  Sarvam AI API   │
                       └────────┬─────────┘
                                │  audio stream
                                ▼
                          CUSTOMER VOICE


        ┌─────────────────────────────────────────────┐
        │             COMMAND CENTER                  │
        │         Supervisor Dashboard — React        │
        │                                             │
        │  Live conversations                         │
        │  Agent/Planner timeline                     │
        │  Memory                                     │
        │  Tool calls                                 │
        │  RAG sources                                │
        │  Workflow execution                         │
        │  Policy decisions                           │
        │  Analytics                                  │
        │  Call summaries                             │
        └─────────────────────────────────────────────┘
                     ▲
                     │
          Event / Observability Bus
          WebSocket — all system components emit events
                     ▲
                     │
             All system components
```

---

## 2. DATABASE SCHEMA (PostgreSQL)

### Entity Relationship Map

```
CUSTOMER ──< ACCOUNT
CUSTOMER ──< CONVERSATION ──< MESSAGE
                           ──< CONVERSATION_STATE
                           ──< MEMORY
                           ──< INTENT ──> MESSAGE
                           ──< TOOL_EXECUTION
                           ──< WORKFLOW_EXECUTION
                           ──< POLICY_DECISION
                           ──< KNOWLEDGE_RETRIEVAL ──> KNOWLEDGE_DOCUMENT
                           ──< CALL_SUMMARY
                           ──< ESCALATION
MEMORY ──> CUSTOMER
```

### Table Definitions

#### CUSTOMER
```sql
customer_id     UUID        PRIMARY KEY
name            VARCHAR(120) NOT NULL
phone           VARCHAR(20)
email           VARCHAR(120)
account_number  VARCHAR(40)  UNIQUE
plan            VARCHAR(60)
created_at      TIMESTAMPTZ DEFAULT now()
```

#### ACCOUNT
```sql
account_id      UUID        PRIMARY KEY
customer_id     UUID        REFERENCES customer(customer_id)
plan_name       VARCHAR(80)
status          VARCHAR(20)   -- active | suspended | cancelled
balance         NUMERIC(12,2)
billing_cycle   VARCHAR(20)
```

#### CONVERSATION
```sql
conversation_id UUID        PRIMARY KEY
customer_id     UUID        REFERENCES customer(customer_id)
session_id      VARCHAR(80)  UNIQUE NOT NULL
channel         VARCHAR(20)   -- web | phone | chat
status          VARCHAR(20)   -- active | completed | escalated
started_at      TIMESTAMPTZ DEFAULT now()
ended_at        TIMESTAMPTZ
sentiment       VARCHAR(20)   -- positive | neutral | frustrated | angry
intent_summary  TEXT
language        VARCHAR(10)  DEFAULT 'en'
```

#### MESSAGE
```sql
message_id      UUID        PRIMARY KEY
conversation_id UUID        REFERENCES conversation(conversation_id)
role            VARCHAR(10)   -- customer | agent
content         TEXT        NOT NULL
timestamp       TIMESTAMPTZ DEFAULT now()
turn_index      INTEGER
```

#### CONVERSATION_STATE
```sql
state_id           UUID        PRIMARY KEY
conversation_id    UUID        REFERENCES conversation(conversation_id)
current_workflow   VARCHAR(80)
customer_verified  BOOLEAN     DEFAULT false
task_status        JSONB        -- {"diagnostics": "complete", "booking": "pending"}
updated_at         TIMESTAMPTZ DEFAULT now()
```

#### MEMORY
```sql
memory_id       UUID        PRIMARY KEY
conversation_id UUID        REFERENCES conversation(conversation_id)
customer_id     UUID        REFERENCES customer(customer_id)
memory_type     VARCHAR(20)   -- short_term | long_term
key             VARCHAR(120) NOT NULL
value           TEXT
expires_at      TIMESTAMPTZ   -- NULL for long_term
```

#### INTENT
```sql
intent_id         UUID        PRIMARY KEY
conversation_id   UUID        REFERENCES conversation(conversation_id)
message_id        UUID        REFERENCES message(message_id)
detected_intents  JSONB         -- ["technical_issue", "billing_dispute"]
entities          JSONB         -- {"service": "internet", "time": "yesterday"}
sentiment         VARCHAR(20)
urgency           VARCHAR(10)   -- low | medium | high
confidence        NUMERIC(4,3)
```

#### TOOL_EXECUTION
```sql
exec_id         UUID        PRIMARY KEY
conversation_id UUID        REFERENCES conversation(conversation_id)
tool_name       VARCHAR(80)  NOT NULL
input_params    JSONB
output          JSONB
status          VARCHAR(20)   -- success | failed | timeout
duration_ms     INTEGER
timestamp       TIMESTAMPTZ DEFAULT now()
```

#### WORKFLOW_EXECUTION
```sql
wf_exec_id       UUID        PRIMARY KEY
conversation_id  UUID        REFERENCES conversation(conversation_id)
workflow_name    VARCHAR(80)  NOT NULL  -- refund | cancellation | escalation
state            VARCHAR(20)   -- running | completed | failed
steps_completed  JSONB         -- ["verify_identity", "check_eligibility"]
started_at       TIMESTAMPTZ DEFAULT now()
completed_at     TIMESTAMPTZ
```

#### POLICY_DECISION
```sql
decision_id      UUID        PRIMARY KEY
conversation_id  UUID        REFERENCES conversation(conversation_id)
policy_name      VARCHAR(80)
action_proposed  TEXT
authorized       BOOLEAN     NOT NULL
reason           TEXT
timestamp        TIMESTAMPTZ DEFAULT now()
```

#### KNOWLEDGE_DOCUMENT
```sql
doc_id          UUID        PRIMARY KEY
title           VARCHAR(200) NOT NULL
source          VARCHAR(200)
category        VARCHAR(60)   -- policy | manual | faq | product
content_hash    VARCHAR(64)  UNIQUE
embedding_model VARCHAR(60)
indexed_at      TIMESTAMPTZ DEFAULT now()
```

#### KNOWLEDGE_RETRIEVAL
```sql
retrieval_id    UUID        PRIMARY KEY
conversation_id UUID        REFERENCES conversation(conversation_id)
query           TEXT        NOT NULL
doc_id          UUID        REFERENCES knowledge_document(doc_id)
passage         TEXT
relevance_score NUMERIC(5,4)
timestamp       TIMESTAMPTZ DEFAULT now()
```

#### CALL_SUMMARY
```sql
summary_id      UUID        PRIMARY KEY
conversation_id UUID        REFERENCES conversation(conversation_id)
summary_text    TEXT
resolution      VARCHAR(40)   -- resolved | escalated | unresolved | callback
escalated       BOOLEAN     DEFAULT false
duration_sec    INTEGER
tools_used      JSONB
generated_at    TIMESTAMPTZ DEFAULT now()
```

#### ESCALATION
```sql
escalation_id    UUID        PRIMARY KEY
conversation_id  UUID        REFERENCES conversation(conversation_id)
reason           TEXT        NOT NULL
agent_id         VARCHAR(80)
handoff_context  JSONB         -- full conversation state snapshot
timestamp        TIMESTAMPTZ DEFAULT now()
```

---

## 3. END-TO-END WORKFLOW

### Per-Turn Processing Sequence

```
TURN START
│
├── [1] Sarvam AI STT emits transcript.final
│         event: { session_id, text, timestamp }
│
├── [2] Intent & Entity Extraction
│         output: { intents[], entities{}, sentiment, urgency }
│
├── [3] Business Context Router
│         selects domain: technical | billing | sales | complaint
│
├── [4] Memory Manager
│         Redis  → load working state (customer_verified, task_status)
│         PostgreSQL → load long-term history, prior tickets
│
├── [5] Context Manager
│         assembles: utterance + relevant history + task state
│                  + customer profile + previous tool results
│         goal: give LLM only what it needs, nothing more
│
├── [6] LLM Planner
│         input: assembled context + available tools + policies
│         output: ordered action plan
│         example: [get_customer, check_outage, get_invoice, rag_search]
│
├── [7] Tool Orchestrator (parallel where possible)
│         each tool: validate schema → execute → store result → emit event
│         CRM:        get_customer()     → customer profile
│         Billing:    get_invoice()      → invoice details
│         Outage:     check_outage()     → service status
│         Ticketing:  create_ticket()    → ticket ID
│         Scheduling: schedule_engineer()→ appointment slot
│
├── [8] RAG Manager
│         query pgvector with semantic search
│         return: passages + doc references + relevance scores
│
├── [9] Policy Engine
│         check each proposed action against policy rules
│         block: refund > 10000 without approval
│         allow: standard refund within limits
│         flag: fraud suspicion → escalate immediately
│
├── [10] Workflow Executor (if triggered)
│          runs deterministic sub-process
│          example refund flow:
│          verify_identity → check_transaction → check_eligibility
│          → check_threshold → approval_if_needed → issue_refund → send_sms
│
├── [11] Response Generator (LLM)
│          input: all tool results + RAG passages + policy decisions + task state
│          output: natural language response text
│
├── [12] Sarvam AI TTS
│          stream text → streaming audio
│          audio → Session Gateway → Customer Browser
│
├── [13] Memory Update
│          Redis: update working state
│          PostgreSQL: persist Message, Intent, ToolExecutions, PolicyDecisions
│
└── TURN END → Event Bus → Command Center updates all panels
```

### Workflow Definitions

#### Refund Workflow
```
verify_identity → check_transaction → check_refund_eligibility
→ check_amount_threshold → [manager_approval if >10000] → issue_refund → send_confirmation_sms
```

#### Cancellation / Retention Workflow
```
verify_identity → retrieve_account → check_contract_status
→ apply_retention_policy → present_retention_offer → [if_accepted: retain] → [if_rejected: initiate_cancellation]
```

#### Technical Escalation Workflow
```
run_diagnostics → check_outage → create_ticket
→ [if_unresolved: schedule_engineer] → [if_customer_angry: escalate_to_human]
```

#### Human Handoff Workflow
```
capture_conversation_state → generate_handoff_summary → assign_agent_queue
→ transfer_with_context → notify_customer
```

---

## 4. 3-WEEK DEVELOPMENT TIMELINE

### Week 1 — Foundation Layer
> Deliverable: Customer speaks → STT transcript → session created → audio plays back

| Day | Tasks | Owner Layer |
|---|---|---|
| 1 | Initialize repo, PostgreSQL schema + migrations, Redis setup, environment config | Infrastructure |
| 1 | Sarvam AI STT API integration, audio chunk streaming, transcript.final event | Speech |
| 2 | Session Gateway (FastAPI): WebRTC signaling, ConversationSession creation, session_id propagation | Gateway |
| 2 | Event schema definition: all event types, payload contracts, WebSocket broadcast | Observability |
| 3 | React frontend: WebRTC client, microphone capture, audio playback, connection UI | Frontend |
| 3 | Session Gateway WebSocket: event subscription, session auth, reconnect handling | Gateway |
| 4 | Frontend transcript display, connection status, call controls (start/end/mute) | Frontend |
| 4 | DB migration runner, seed data (5 mock customers, accounts, invoices) | Infrastructure |
| 5 | End-to-week integration: voice → STT → transcript → displayed in UI | All |
| 5 | Barge-in / interruption detection hook (detect customer speaking mid-response) | Speech |

**Week 1 Milestone:** Customer speaks → transcript appears → basic AI echo response plays back

---

### Week 2 — Intelligence Layer
> Deliverable: Multi-intent query → plan → CRM/Billing/RAG → policy checked → voice response

| Day | Tasks | Owner Layer |
|---|---|---|
| 6 | Intent & Entity extraction (LLM call with structured output), business context router | Orchestrator |
| 6 | Memory Manager: Redis working state, PostgreSQL long-term memory, session chat memory | Memory |
| 7 | Context Manager: history selection, profile assembly, tool result injection | Orchestrator |
| 7 | LLM Planner: dynamic plan generation, tool selection loop, plan mutation on tool results | Planner |
| 8 | Tool Orchestrator: tool registry, schema validation, execution engine, retry/timeout | Tools |
| 8 | Mock CRM API (get_customer, get_account) + Billing API (get_invoice, issue_refund) | Enterprise |
| 9 | Mock Ticketing API (create_ticket, update_ticket) + Scheduling API (schedule_engineer) | Enterprise |
| 9 | RAG Manager: pgvector extension, document ingestion pipeline, semantic search, reranking | RAG |
| 10 | Policy Engine: rule definitions, authorization check, guardrail enforcement | Policy |
| 10 | Workflow Executor: refund workflow, cancellation workflow, escalation trigger | Workflows |

**Week 2 Milestone:** Full voice query → multi-tool plan → CRM + Billing + RAG → policy applied → voice answer

---

### Week 3 — Command Center & Integration
> Deliverable: Live supervisor dashboard + complete demo scenarios

| Day | Tasks | Owner Layer |
|---|---|---|
| 11 | Command Center UI: Live Dashboard screen (active convos, AI containment, escalation rate metrics) | Frontend |
| 11 | WebSocket event subscription in frontend, real-time state updates per conversation | Frontend |
| 12 | Conversation Monitor screen: live transcript, intent, sentiment, customer context panel | Frontend |
| 12 | Agent/Planner Timeline screen: visual step-by-step execution timeline per turn | Frontend |
| 13 | Sarvam AI TTS integration: text → streaming audio, first-token latency optimization | Speech |
| 13 | Tool Execution View + RAG Sources View + Memory Panel in Command Center | Frontend |
| 14 | Call Summary generation (LLM post-call), analytics aggregation, sentiment timeline chart | Analytics |
| 14 | Human escalation flow: handoff context capture, agent queue, notification | Workflows |
| 15 | End-to-end integration: 3 polished demo scenarios (Technical / Billing+Refund / Cancellation) | Integration |
| 15 | Performance tuning: latency profiling, context window optimization, parallel tool calls | All |

**Week 3 Milestone:** Full demo — voice → plan → tools → RAG → policy → response + supervisor sees every step live

---

## 5. PROFESSIONAL FOLDER STRUCTURE

```
command_center_3.0/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── routes/
│   │   │   │   │   ├── conversations.py      # CRUD for conversations, messages
│   │   │   │   │   ├── customers.py           # Customer lookup endpoints
│   │   │   │   │   ├── knowledge.py           # Document upload, indexing, search
│   │   │   │   │   └── analytics.py           # Metrics, summaries, call history
│   │   │   │   └── schemas/
│   │   │   │       ├── conversation.py        # Pydantic request/response models
│   │   │   │       ├── customer.py
│   │   │   │       └── knowledge.py
│   │   │   └── websocket/
│   │   │       ├── events.py                  # Event type definitions and payloads
│   │   │       └── broadcast.py               # WebSocket connection manager
│   │   │
│   │   ├── core/
│   │   │   ├── config.py                      # Environment config (Sarvam keys, DB URLs, LLM keys)
│   │   │   ├── dependencies.py                # FastAPI dependency injection
│   │   │   └── security.py                    # Session auth, API key validation
│   │   │
│   │   ├── database/
│   │   │   ├── session.py                     # SQLAlchemy async session factory
│   │   │   ├── redis.py                       # Redis connection and helpers
│   │   │   └── migrations/
│   │   │       └── 001_initial_schema.sql     # Full schema DDL
│   │   │
│   │   ├── models/
│   │   │   ├── customer.py                    # SQLAlchemy ORM models
│   │   │   ├── conversation.py
│   │   │   ├── memory.py
│   │   │   ├── execution.py                   # ToolExecution, WorkflowExecution
│   │   │   ├── knowledge.py
│   │   │   └── summary.py                     # CallSummary, Escalation
│   │   │
│   │   ├── gateway/
│   │   │   ├── session.py                     # ConversationSession management
│   │   │   ├── webrtc.py                      # WebRTC signaling (SDP, ICE)
│   │   │   └── audio.py                       # Audio frame routing to STT
│   │   │
│   │   ├── speech/
│   │   │   ├── stt.py                         # Sarvam AI STT streaming client
│   │   │   └── tts.py                         # Sarvam AI TTS streaming client
│   │   │
│   │   ├── orchestrator/
│   │   │   ├── agent.py                       # Main orchestrator entrypoint — ties all sub-systems
│   │   │   ├── intent/
│   │   │   │   ├── extractor.py               # LLM-based intent & entity extraction
│   │   │   │   └── router.py                  # Business Context Router (domain selection)
│   │   │   ├── memory/
│   │   │   │   ├── manager.py                 # Unified memory interface
│   │   │   │   ├── redis_store.py             # Working state and short-term memory
│   │   │   │   └── pg_store.py                # Long-term memory, session chat history
│   │   │   ├── context/
│   │   │   │   └── assembler.py               # Context Manager — assembles LLM input
│   │   │   ├── planner/
│   │   │   │   ├── planner.py                 # LLM Planner — generates dynamic action plans
│   │   │   │   └── executor.py                # Executes plan steps, handles tool results
│   │   │   ├── tools/
│   │   │   │   ├── registry.py                # Tool registry with schemas and auth rules
│   │   │   │   ├── orchestrator.py            # Validates, dispatches, retries tool calls
│   │   │   │   └── definitions/
│   │   │   │       ├── crm_tools.py           # get_customer, get_account
│   │   │   │       ├── billing_tools.py       # get_invoice, issue_refund
│   │   │   │       ├── ticketing_tools.py     # create_ticket, update_ticket
│   │   │   │       ├── scheduling_tools.py    # schedule_engineer, check_availability
│   │   │   │       └── notification_tools.py  # send_sms, send_email
│   │   │   ├── workflows/
│   │   │   │   ├── executor.py                # Workflow Executor engine
│   │   │   │   ├── refund.py                  # Deterministic refund workflow
│   │   │   │   ├── cancellation.py            # Cancellation / retention workflow
│   │   │   │   └── escalation.py              # Human escalation + handoff workflow
│   │   │   ├── rag/
│   │   │   │   ├── manager.py                 # RAG Manager — query interface
│   │   │   │   ├── ingestion.py               # Document chunking, embedding, indexing
│   │   │   │   └── retrieval.py               # Semantic search, reranking, citation
│   │   │   ├── policy/
│   │   │   │   ├── engine.py                  # Policy Engine — action authorization
│   │   │   │   └── rules.py                   # Policy rule definitions
│   │   │   └── response/
│   │   │       └── generator.py               # Response LLM — natural language generation
│   │   │
│   │   ├── enterprise/
│   │   │   ├── crm/
│   │   │   │   └── service.py                 # Mock CRM API handlers
│   │   │   ├── billing/
│   │   │   │   └── service.py                 # Mock Billing API handlers
│   │   │   ├── ticketing/
│   │   │   │   └── service.py                 # Mock Ticketing API handlers
│   │   │   └── scheduling/
│   │   │       └── service.py                 # Mock Scheduling API handlers
│   │   │
│   │   └── observability/
│   │       ├── bus.py                         # Event Bus — emit and subscribe
│   │       ├── events.py                      # Typed event definitions
│   │       └── summary.py                     # Post-call summary generation
│   │
│   ├── main.py                                # FastAPI application entry point
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── command-center/
│   │   │   │   ├── Dashboard.tsx              # Live metrics: active convos, containment rate
│   │   │   │   ├── ConversationMonitor.tsx    # Live transcript, intent, sentiment panel
│   │   │   │   ├── AgentTimeline.tsx          # Step-by-step execution timeline per turn
│   │   │   │   ├── ToolExecutionView.tsx      # Tool calls with inputs/outputs
│   │   │   │   ├── RagSourcesView.tsx         # Retrieved documents and passages
│   │   │   │   ├── MemoryPanel.tsx            # Working memory and long-term memory view
│   │   │   │   └── CallSummary.tsx            # Post-call summary display
│   │   │   ├── conversation/
│   │   │   │   ├── VoiceInterface.tsx         # Customer-facing: mic button, audio playback
│   │   │   │   └── TranscriptDisplay.tsx      # Real-time transcript overlay
│   │   │   └── shared/
│   │   │       ├── SentimentBadge.tsx
│   │   │       ├── StatusIndicator.tsx
│   │   │       └── MetricCard.tsx
│   │   ├── hooks/
│   │   │   ├── useWebRTC.ts                   # WebRTC connection and audio stream
│   │   │   ├── useEventStream.ts              # WebSocket event subscription
│   │   │   └── useConversation.ts             # Active conversation state
│   │   ├── services/
│   │   │   ├── api.ts                         # HTTP API client
│   │   │   └── websocket.ts                   # WebSocket client wrapper
│   │   ├── store/
│   │   │   └── conversation.ts                # Global conversation state (Zustand/Redux)
│   │   └── types/
│   │       ├── conversation.ts                # Conversation, Message, Intent types
│   │       ├── events.ts                      # Event payload types
│   │       └── tools.ts                       # Tool execution types
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
│
├── knowledge/
│   ├── policies/
│   │   ├── refund_policy.md
│   │   ├── cancellation_policy.md
│   │   └── data_policy.md
│   ├── manuals/
│   │   └── troubleshooting_guide.md
│   └── faqs/
│       └── general_faqs.md
│
├── scripts/
│   ├── init_db.py                             # Run migrations, create tables
│   ├── seed_data.py                           # Insert mock customers, accounts, invoices
│   └── ingest_knowledge.py                    # Index knowledge documents into pgvector
│
└── docs/
    ├── schema_diagram.jpg                     # DB schema ER diagram
    ├── workflow_diagram.jpg                   # End-to-end call flow diagram
    └── timeline_gantt.jpg                     # 3-week Gantt chart
```

---

## 6. TECHNICAL SPECIFICATIONS PER WORKSTREAM

### Speech (STT/TTS) — Sarvam AI
- STT endpoint: streaming WebSocket or chunked HTTP
- Audio format: PCM 16kHz mono or WebM/Opus from WebRTC
- Emit `transcript.partial` during speech, `transcript.final` on end-of-utterance
- TTS: text-in, audio-stream-out, minimize time-to-first-audio-byte
- Both STT and TTS wrapped behind internal interface for provider-swappability

### Session Gateway
- FastAPI with WebSocket and HTTP endpoints
- `POST /sessions` — create ConversationSession, return session_id
- `WS /sessions/{session_id}/audio` — bidirectional audio WebSocket
- `WS /sessions/{session_id}/events` — outbound event stream to frontend
- Session authenticated by token in header

### AI Agent Orchestrator
- Stateful — each turn loads state from Redis before processing
- LLM calls use structured output (JSON mode) for intent extraction and planning
- Tool calls are logged to PostgreSQL before execution (for audit)
- Context window budget: max 8000 tokens for reasoning prompt
- Parallel tool execution where dependency graph allows

### RAG
- PostgreSQL with pgvector extension
- Embedding model: text-embedding-3-small (OpenAI) or equivalent
- Chunk size: 512 tokens, 10% overlap
- Retrieval: top-5 by cosine similarity, reranked by cross-encoder
- Citations stored in KNOWLEDGE_RETRIEVAL table per conversation turn

### Command Center WebSocket
- Frontend subscribes to `/events/stream`
- Backend broadcasts per-session events on every orchestrator action
- Frontend updates individual panels reactively (no full-page refresh)
- Event types: `intent.detected`, `tool.started`, `tool.completed`, `rag.retrieved`, `policy.decision`, `workflow.step`, `response.generated`, `sentiment.updated`

---

*All diagrams embedded below for reference.*
