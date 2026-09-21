# Command Center 3.0 — Architecture Report
**Project:** InsureAI Voice-First Contact Center Platform  
**Version:** 3.0  
**Classification:** Final Draft — Production-Ready Architecture  
**Date:** September 2026

---

## 1. Executive Overview

Command Center 3.0 is a production-grade, AI-first voice contact center platform purpose-built for **InsureAI**, an Indian insurance company offering Health, Home, and Motor insurance products. The system enables policy-holders to interact with a sophisticated AI agent over voice or text, have their insurance queries answered, and take real business actions (raise claims, issue refunds, book surveyor visits, escalate to human specialists) — all without requiring a human agent for the vast majority of interactions.

The platform is architected as a **full-stack monorepo** split into a Python async backend and a React TypeScript frontend. The backend follows a clean **layered architecture** with strictly defined responsibility boundaries between layers, while the frontend serves dual roles: a **customer-facing voice portal** and a **supervisor back-office dashboard**.

---

## 2. System Topology

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vite + React 18 + TypeScript)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Voice Portal │  │  Supervisor  │  │  CRM         │  │  Billing /   │   │
│  │ (Customer UX) │  │  Dashboard   │  │  Dashboard   │  │  Scheduling  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │  HTTP REST + WebSocket (WS)
┌────────────────────────────────▼────────────────────────────────────────────┐
│                        BACKEND (FastAPI + Uvicorn ASGI)                         │
│                                                                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │   API Layer  ─  /api/v1/{auth, conversations, crm, billing,           │   │
│  │                           scheduling, analytics, customers}             │   │
│  │   WebSocket  ─  /sessions/{id}/audio    /sessions/{id}/events          │   │
│  │                 /events/stream (supervisor broadcast)                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Audio Gateway Layer  (PCM → VAD → STT → Orchestrator → TTS → WS)   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  AI Orchestration Layer                                                │   │
│  │  Intent → Route → Memory → Context → Plan → Policy → Tools →         │   │
│  │  Workflow → RAG → Response → Summary → Escalation                     │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Enterprise Services Layer  (Billing | CRM | Scheduling | Ticketing) │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Database Layer  (PostgreSQL async + Redis + ChromaDB + FAISS)        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

External Services:
  • Sarvam AI (STT — en-IN speech recognition)
  • Groq / Qwen-3.8-27B (LLM — intent, planning, response)
  • Microsoft Edge TTS (NeerjaNeural voice — en-IN)
```

---

## 3. Backend Architecture — Layer by Layer

### 3.1 Entry Point & Application Bootstrap (`main.py`)

The application bootstrap is handled by **FastAPI** with an `asynccontextmanager` lifespan hook that enforces a strict startup sequence:

| Step | Action |
|------|--------|
| 1 | Redis connection pool established |
| 2 | RAG knowledge base seeded (ChromaDB + FAISS from `knowledge/` directory) |
| 3 | SentenceTransformer embedding model pre-warmed to eliminate cold-start latency |
| 4 | Session TTL enforcement loop started (background `asyncio.Task`) |

Three **WebSocket routes** are registered directly on the ASGI app (not as FastAPI APIRouters) because they require low-level control over the message loop:

| Endpoint | Purpose |
|----------|---------|
| `/sessions/{id}/audio` | Bidirectional audio stream — receives PCM, sends MP3 TTS |
| `/sessions/{id}/events` | Server-sent event stream for session-specific UI updates |
| `/events/stream` | Supervisor broadcast — all sessions funneled to one stream |

A single `GET /health` endpoint is exposed for orchestration probes.

---

### 3.2 Core Configuration (`app/core/`)

**Settings** are managed via `pydantic_settings.BaseSettings` with `.env` file support and `@lru_cache` singleton retrieval. The configuration covers:

- **Database:** PostgreSQL async URL (`asyncpg` driver)
- **Cache:** Redis connection URL
- **AI Services:** Groq API key, Sarvam API key
- **Security:** JWT secret, algorithm (HS256), token TTLs
- **Billing Thresholds:** Configurable refund limit (INR 5,000), late fee amount (INR 100), grace period (7 days), SLA hours (48)
- **Scheduling:** Slot duration (30 min), max booking horizon (30 days), callback SLA (15 min)
- **CORS:** Comma-separated allowed origins

**Security module** (`app/core/security.py`) implements:
- `bcrypt` password hashing at cost factor 12 (~250ms per hash — industry-standard balance)
- `python-jose` HS256 JWT access tokens (30-minute expiry)
- 256-bit `secrets.token_urlsafe` opaque refresh tokens with SHA-256 storage (raw token never stored)
- Legacy HMAC session token helpers for backward compatibility

---

### 3.3 API Layer (`app/api/`)

#### 3.3.1 REST API Routes (`app/api/v1/routes/`)

All REST routes are versioned under `/api/v1/` with FastAPI `APIRouter`:

| Router | Prefix | Responsibility |
|--------|--------|----------------|
| `auth.py` | `/auth` | Register, login, refresh, logout, `/me` |
| `conversations.py` | `/conversations` | Session creation, history |
| `customers.py` | `/customers` | Customer lookup |
| `crm.py` | `/crm` | Policy-holder CRUD, interaction logs, notes, escalation queue |
| `billing.py` | `/billing` | Invoices, transactions, refunds, alerts, billing plans |
| `scheduling.py` | `/scheduling` | Appointments, agents, service types, availability |
| `analytics.py` | `/analytics` | Dashboard KPIs, conversation lists, session TTL expiry |

#### 3.3.2 Authentication Flow

The auth flow implements the **OAuth2-style refresh token rotation pattern**:

```
POST /auth/login
  → verify bcrypt password
  → create HS256 JWT access token (30 min)
  → generate 256-bit refresh token → SHA-256 hash → store in refresh_token table
  → return {access_token, refresh_token, expires_in}

POST /auth/refresh
  → hash inbound refresh token → look up in DB
  → validate: not revoked, not expired
  → revoke old refresh token (rotation)
  → issue new token pair

POST /auth/logout
  → hash + revoke refresh token in DB
```

The **JWT middleware** (`app/api/deps.py`) extracts and validates the Bearer token from `Authorization` header, loads the `Customer` row, and injects it as a FastAPI dependency.

#### 3.3.3 WebSocket Event System

The event system follows a **publish-broadcast pattern**:

- **`event_bus`** (in-process `asyncio`) is the internal publisher. Any subsystem can call `await event_bus.emit(session_id, event)`.
- **`ConnectionManager`** (`broadcast.py`) maintains a `dict[session_id → list[WebSocket]]` for per-session subscribers and a global list for supervisor connections.
- On emit, the event is serialized to JSON and sent to both session-specific and supervisor connections simultaneously via `asyncio.gather`.

**28 distinct event types** are defined in `events.py`:

```
session.created / session.ended
transcript.partial / transcript.final
intent.detected / sentiment.updated
tool.started / tool.completed
rag.retrieved / policy.decision
workflow.step / response.generated
escalation.created / call.summary
customer.updated / invoice.updated / appointment.updated
error
```

---

### 3.4 Audio Gateway Layer (`app/gateway/`)

The gateway processes raw PCM audio from the browser WebSocket connection through a complete voice pipeline:

#### `AudioRouter` (VAD + STT coordination)

```
Browser PCM chunks → AudioRouter.receive_chunk()
  │
  ├── TTS active? → BargeInDetector.check()
  │     └── RMS > threshold + TTS active → barge_in_detected = True
  │           └── Cancels in-progress TTS streaming
  │
  ├── _is_speech() → RMS calculation on 16-bit PCM
  │     VAD threshold: 80.0 RMS (tuned for Indian accents, soft voices)
  │
  ├── Speech detected → buffer chunk in SarvamSTTClient
  │     └── Reset silence timer
  │
  └── Silence detected (after MIN_SPEECH_CHUNKS_BEFORE_VAD=1)
        └── Start VAD_SILENCE_DURATION=0.45s timer
              └── On timeout → STT finalize_utterance()
```

**Key VAD tuning:**
- Silence threshold: `80.0 RMS` (was `200.0` — too high for Indian accents)
- Silence duration: `0.45s` (was `0.7s` — too slow)
- Min utterance: `640 bytes` at 16kHz = 40ms minimum speech

#### `SarvamSTTClient` — Speech-to-Text

- Accumulates PCM chunks in memory
- On `finalize_utterance()`: packages as WAV (16kHz mono 16-bit) using Python `wave` module
- POSTs to `https://api.sarvam.ai/speech-to-text` with model `saarika:v2.5`
- Fires `TranscriptEvent` (final) to registered handlers

#### `EdgeTTSClient` — Text-to-Speech

- Uses Microsoft Edge TTS via the `edge_tts` Python library
- Voice: `en-IN-NeerjaNeural` (Indian English female voice)
- Streaming mode: text is split into 180-char sentence chunks, synthesized sequentially
- Each chunk streams MP3 bytes back to the WebSocket as they become available
- Barge-in check before each chunk yield: if `audio_router.barge_in_detected`, TTS stops immediately

---

### 3.5 AI Orchestration Layer (`app/orchestrator/`)

This is the core intelligence layer. The `AgentOrchestrator` coordinates 10 sub-components in a strict pipeline for every conversation turn:

```
User Utterance (text/voice transcript)
       │
       ▼
1. MemoryManager.load()          — Redis state + PG conversation history
       │
       ▼
2. IntentExtractor.extract()     — LLM call: intents + entities + sentiment + urgency
       │
       ▼
3. BusinessContextRouter.route() — domain classification (billing/scheduling/crm/general)
       │
       ▼
4. Event Bus emit                — IntentDetectedEvent + SentimentUpdatedEvent → UI
       │
       ▼
5. ContextAssembler.assemble()   — Build AgentContext struct
       │
       ▼
6. AgentPlanner.plan()           — LLM call: ordered list of tool steps
       │
       ▼
7. PolicyEngine.evaluate()       — Gate each tool step against business rules
       │
       ▼
8. PlanExecutor / ToolOrchestrator.execute() — Run tools sequentially
       │
       ▼
9. WorkflowExecutor.run()        — Execute multi-step business workflows if triggered
       │
       ▼
10. AgentOrchestrator._generate_response() — Final LLM call: natural language response
       │
       ▼
11. EscalationHandler            — Check if escalation is needed after response
       │
       ▼
12. MemoryManager.after_turn()   — Persist turn to Redis + PG Intent table
```

#### 3.5.1 IntentExtractor

- Makes an async Groq API call with `qwen/qwen3.8-27b` model at `temperature=0.0` (maximum determinism)
- Extracts: `intents[]`, `entities{}`, `sentiment`, `urgency`, `confidence`
- Recognizes 16 insurance-specific intent types (claim_inquiry, refund_request, policy_renewal, etc.)
- Includes last 4 conversation turns as context for anaphora resolution
- Robust JSON extraction with regex fallback if LLM wraps JSON in markdown

#### 3.5.2 AgentPlanner

- Makes a Groq API call at `temperature=0.1` (near-deterministic planning)
- Receives the full assembled context block as input
- Returns an ordered plan with up to **2 tool steps** and a `direct_answer` flag
- Contains strict insurance-domain rules: e.g., "before issuing a refund, always get_invoice first"
- The planner can decide `direct_answer=true` to skip all tools when context already contains the answer

#### 3.5.3 PolicyEngine

Evaluates business rules **before** any tool executes:

| Policy | Rule |
|--------|------|
| `refund_limit` | Auto-approve ≤ INR 5,000; route to supervisor if exceeded |
| `refund_within_invoice` | Refund amount cannot exceed invoice total |
| `refund_positive_amount` | Refund must be > 0 |
| `identity_verification` | `issue_refund`, `schedule_engineer`, `get_invoice_detail` require verified customer |
| `cancellation_notice` | 30-day notice required if in-contract |
| `plan_change_limit` | Max 2 plan changes per billing cycle |

Policy decisions are **persisted** to `policy_decision` table and **broadcast** via WebSocket as `policy.decision` events.

#### 3.5.4 ToolOrchestrator

- **13 tools** registered and dispatched:
  - `get_customer`, `get_account`, `get_invoice`, `get_invoice_detail`
  - `get_payment_history`, `get_claim_status`, `get_policy_coverage`
  - `issue_refund`, `pay_outstanding_balance`
  - `create_ticket`, `schedule_engineer`
  - `escalate_to_human`, `update_customer_details`
- Every tool execution: `ToolStartedEvent` → `asyncio.wait_for(dispatch, timeout=5.0)` → `ToolCompletedEvent`
- Results persisted asynchronously to `tool_execution` table (fire-and-forget `asyncio.create_task`)
- `_make_summary()` generates human-readable summaries for the LLM context block

#### 3.5.5 WorkflowExecutor

Pre-defined multi-step business workflows triggered by intent detection:

| Workflow | Trigger | Steps |
|----------|---------|-------|
| `refund_workflow` | `refund_request` or `billing_dispute` + invoice_id | verify_invoice → policy_check → process_refund → notify_customer |
| `cancellation_workflow` | `cancellation_request` | verify_account → check_contract → [calculate_etf] → schedule_cancellation → send_confirmation |
| `upgrade_workflow` | `plan_upgrade` + target_plan | verify_eligibility → calculate_proration → apply_plan_change → send_confirmation |
| `technical_support_workflow` | technical issues | check_outage → [log_outage] OR remote_diagnostics → create_ticket |

Each workflow step emits `WorkflowStepEvent` to update the supervisor dashboard in real time.

#### 3.5.6 ContextAssembler

Builds the rich context block fed to both the Planner LLM and Response LLM:

```
[CUSTOMER TURN]: <transcript>
[DOMAIN]: billing
[INTENTS]: billing_dispute, refund_request
[SENTIMENT]: frustrated | [URGENCY]: high
[ENTITIES]: amount=5000, invoice_id=INV-2024-001
[CONVERSATION HISTORY]: last 30 messages
[CUSTOMER]: Rajesh Kumar | Account: ACC-001 | Plan: Health Shield Gold | ...
[STATUS]: Customer identity verified — do NOT ask for re-verification
[ACCOUNT]: Plan=Health Shield Gold | Status=active | Balance=Rs.0.00 | ...
[INVOICES]: ✅ INV-001: ₹12000.00 (paid) due 2024-01-15 | ⚠️ INV-002: ₹12000.00 (overdue) ...
[APPOINTMENTS]: APT-001 (confirmed): Surveyor visit at 2024-02-10T10:00:00
[TOOL RESULTS]:
  - get_invoice: 3 invoice(s) found
  - issue_refund: Refund REF-001 approved for Rs.5000
[WORKFLOW]: refund_workflow → Refund of INR 5000 for invoice INV-002 processed
[CUSTOMER NOTES]: previous_issue: billing_dispute; preferred_agent: tier-2
```

#### 3.5.7 MemoryManager — Dual-Store Architecture

```
Session State (Redis)         Conversation History (PostgreSQL)
├── customer_id               ├── Recent messages (last 8 turns)
├── customer_verified         ├── Prior intents (last 3)
├── customer_profile          ├── Long-term customer facts
├── customer_context          └── Conversation record
├── domain
├── task_status{}
└── sentiment
```

- **Redis** handles hot, in-session state with sub-millisecond reads
- **PostgreSQL** handles durable conversation history and long-term customer facts
- After each turn: Redis is updated synchronously; PG `intent` record is written if `conversation_id` and `message_id` are available

#### 3.5.8 CallSummaryGenerator & EscalationHandler

**Summary** is generated at session end via `end_session()` (shielded from asyncio cancellation):
- Groq LLM call with full conversation history
- Output: 3-5 sentence structured summary + resolution classification (resolved/partially_resolved/unresolved/escalated)
- Persisted to `call_summary` table

**Escalation triggers** (checked after every turn):
- `angry` sentiment + ≥ 3 turns
- `cancellation_request` + negative sentiment
- `complaint` intent + ≥ 5 turns
- Identity unverifiable after ≥ 4 turns

---

### 3.6 RAG Knowledge Engine (`app/orchestrator/rag/`)

A **production-grade hybrid retrieval system** combining three search backends:

```
Knowledge Base Files (knowledge/ directory)
  ├── policies/*.md   — 8 markdown policy documents (Health/Home/Motor)
  └── faqs/*.json     — 8 JSON knowledge base files (FAQs, scenarios, plans)
         │
         ▼
DocumentLoader — Smart chunking pipeline
  ├── Markdown: section-based chunking (H2/H3 headers as boundaries)
  └── JSON: FAQ Q&A pairs + scenario records
         │
         ▼
KBChunk (id, content, domain, section_id, section_title, doc_type, source_file)
         │
         ├──────────────────────────────────────────────────────┐
         ▼                                                      ▼
ChromaVectorStore (ChromaDB)              FAISSIndex (FAISS ANN)
  SentenceTransformer embeddings            Mirror of ChromaDB embeddings
  Metadata filtering by domain/doc_type    Ultra-fast approximate search
         │                                          │
         └─────────────── RRF Merge ────────────────┘
                                │
                                ▼
                    RAGCache (Redis TTL cache)
                                │
                                ▼
                     List[RAGSearchResult]
```

**Reciprocal Rank Fusion (RRF):**
- Score = Σ(1 / (60 + rank)) for each source where the document appears
- Balances ChromaDB and FAISS results without score normalization
- Top-K results returned

**Initialization sequence** (at startup):
1. Load and chunk all knowledge documents
2. Initialize ChromaDB collection; upsert if count < chunk count
3. Extract ChromaDB embeddings → build FAISS index
4. Connect Redis cache

**Backward compatibility:** The `RAGManager` wrapper exposes the legacy `search()` and `retrieve()` interface so `agent.py` requires zero changes.

---

### 3.7 Enterprise Services Layer (`app/enterprise/`)

#### BillingService (`enterprise/billing/service.py`)

Fully PostgreSQL-backed, replacing any mock data:

| Method | DB Tables | Business Logic |
|--------|-----------|----------------|
| `get_invoice()` | `invoice` | Latest 10 invoices by created_at desc |
| `get_invoice_detail()` | `invoice` | By UUID or invoice_number |
| `issue_refund()` | `refund_request`, `billing_transaction`, `billing_alert` | Policy check: ≤ INR 5,000 auto-approve; > INR 5,000 → `queued_for_review`; suspicious → `CASE-` reference |
| `get_payment_history()` | `billing_transaction` | All transactions for customer |
| `pay_outstanding_balance()` | `billing_transaction`, `invoice` | Deducts from account balance |
| `get_claim_status()` | `refund_request` | Lookup by reference number |

Emits `InvoiceUpdatedEvent` via event_bus on state changes.

#### CRMService (`enterprise/crm/service.py`)

| Method | Functionality |
|--------|---------------|
| `get_customer()` | Profile + account data |
| `get_account()` | Account status + balance |
| `update_customer()` | Field-level profile updates |

#### SchedulingService (`enterprise/scheduling/service.py`)

- Auto-assigns agent by department → sorts by `current_load` ascending
- `check_availability()` — returns available time slots for next 14 working days (Mon–Sat)
- Fixed time slots: 09:00, 10:30, 12:00, 13:30, 15:00, 16:30, 17:30, 18:30
- Max 8 appointments per day across all engineers
- `schedule_engineer()` — creates `Appointment` record with AI briefing snapshot (customer profile, billing context, conversation transcript, risk flags)
- `escalate_to_human_agent()` — creates appointment with priority escalation + AI handoff brief

#### TicketingService (`enterprise/ticketing/service.py`)

Creates support tickets with auto-generated ticket IDs, linking to customer and conversation.

---

### 3.8 Database Layer

#### PostgreSQL (SQLAlchemy 2.0 async + asyncpg)

**18 tables** across 8 model files:

| Domain | Tables |
|--------|--------|
| Identity | `customer`, `account`, `refresh_token` |
| Conversation | `conversation`, `message`, `conversation_state`, `intent` |
| Memory | `memory` |
| Execution Audit | `tool_execution`, `workflow_execution`, `policy_decision` |
| Knowledge | `knowledge_document`, `knowledge_retrieval` |
| Summary | `call_summary`, `escalation` |
| Billing | `billing_plan`, `invoice`, `billing_transaction`, `refund_request`, `billing_alert` |
| Scheduling | `service_type`, `agent`, `appointment`, `appointment_note`, `agent_availability_block` |

**Session management:**
- `async_session_factory` — async context manager wrapping `AsyncSession`
- All DB interactions are fully async (`await db.execute(...)`, `await db.commit()`)
- UUID primary keys throughout (`postgresql.UUID(as_uuid=True)`)
- JSONB columns for flexible metadata (`line_items`, `tags`, `custom_fields`, `ai_risk_flags`, etc.)

#### Redis

- Session state (hot memory): `session:{id}:state` → JSON blob
- Conversation history: `session:{id}:history` → JSON list
- RAG query cache: `rag:{hash}` → JSON results list (TTL-based)

#### ChromaDB (Vector Store)

- Persistent vector store in `.chroma_db/` directory
- SentenceTransformer embeddings (`sentence-transformers` library)
- Metadata filtering on `domain` and `doc_type` fields

#### FAISS (ANN Index)

- Built in-memory from ChromaDB embeddings at startup
- Approximate Nearest Neighbor search for high-speed retrieval
- Rebuilt on hot-reload of knowledge base

---

## 4. Frontend Architecture

### 4.1 Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18.3 + TypeScript 5.4 |
| Build Tool | Vite 5.3 |
| State Management | Zustand 4.5 |
| Styling | Vanilla CSS with CSS Variables |
| Auth | JWT + refresh token (localStorage persistence) |

### 4.2 Application Structure

```
frontend/src/
├── App.tsx              — Root router (path-based, no React Router)
├── main.tsx             — React DOM mount
├── index.css            — Global design tokens + animations
├── components/
│   ├── auth/            — AuthPage (login/register forms)
│   ├── conversation/    — VoiceInterface (customer portal)
│   ├── command-center/  — Supervisor Dashboard + sub-panels
│   ├── crm/             — CRM Dashboard (policy-holders)
│   ├── billing/         — Billing Dashboard
│   ├── scheduling/      — Scheduling Dashboard
│   └── shared/          — Reusable UI components
├── contexts/
│   └── AuthContext.tsx  — JWT auth state + refresh token rotation
├── hooks/               — Custom React hooks
├── services/            — API client wrappers
├── store/               — Zustand state stores
└── types/               — TypeScript type definitions
```

### 4.3 Routing Strategy

Path-based routing in `App.tsx` with no external router dependency:

| Path | Component | Auth Required |
|------|-----------|---------------|
| `/` | `VoiceInterface` | Yes (JWT) |
| `/supervisor` | `CommandCenter` | No |
| `/crm` | `CRMDashboard` | No |
| `/billing` | `BillingDashboard` | No |
| `/scheduling` | `SchedulingDashboard` | No |

Customer portal requires authentication; supervisor/back-office routes are accessible without auth (internal tool assumption).

### 4.4 Command Center Dashboard Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| `Dashboard.tsx` | 23,013 bytes | Main supervisor hub — live metrics, conversation list, filters |
| `AgentTimeline.tsx` | 8,646 bytes | Real-time step-by-step agent pipeline visualization |
| `MemoryPanel.tsx` | 10,155 bytes | Session state inspector — customer profile, verified status, history |
| `ConversationMonitor.tsx` | 6,493 bytes | Live conversation transcript viewer |
| `ToolExecutionView.tsx` | 4,702 bytes | Tool call details — input, output, duration, status |
| `CallSummary.tsx` | 5,606 bytes | Post-call AI-generated summary display |
| `EscalationQueue.tsx` | 2,995 bytes | Open escalations list for human agents |

---

## 5. External Service Integration

| Service | Purpose | Integration |
|---------|---------|-------------|
| **Sarvam AI** (`saarika:v2.5`) | Speech-to-Text (Indian English, en-IN) | REST API via `httpx`, WAV upload |
| **Groq API** (`qwen/qwen3.8-27b`) | LLM: Intent extraction, planning, response generation, call summarization | `AsyncGroq` Python SDK |
| **Microsoft Edge TTS** (`NeerjaNeural`) | Text-to-Speech (Indian English female voice) | `edge_tts` Python library |
| **PostgreSQL** | Primary relational data store | `asyncpg` + SQLAlchemy 2.0 async |
| **Redis** | Session cache + RAG query cache | `redis[hiredis]` async client |
| **ChromaDB** | Persistent vector store for RAG | `chromadb` Python package |
| **FAISS** | Fast ANN search for RAG | `faiss` via numpy |

---

## 6. Security Architecture

| Concern | Implementation |
|---------|---------------|
| **Password Storage** | bcrypt, cost factor 12 |
| **Access Token** | HS256 JWT, 30-minute expiry |
| **Refresh Token** | 256-bit opaque, SHA-256 hashed in DB, rotated on use |
| **Timing Attack Prevention** | Dummy `get_password_hash()` call when user not found |
| **CORS** | Configurable allowed origins list |
| **Sensitive Tool Gating** | `PolicyEngine.evaluate_tool_use()` blocks refunds/schedules for unverified customers |
| **Refund Threshold** | INR 5,000 auto-approve limit; supervisor escalation above |
| **Internal Information Leakage** | Agent system prompt explicitly forbids revealing thresholds, approval limits, or escalation reasons to customers |

---

## 7. Observability Architecture

### Event Bus (`app/observability/bus.py`)

Single in-process async event bus that connects:
- Internal orchestrator subsystems (sources)
- WebSocket broadcast manager (sink)

Every significant action in the pipeline fires an event, enabling real-time supervisor visibility into every step of every conversation.

### Database Audit Trail

Every tool call, workflow execution, and policy decision is persisted in immutable audit tables (`tool_execution`, `workflow_execution`, `policy_decision`). This provides full regulatory-grade traceability.

### Analytics API (`/api/v1/analytics/`)

Aggregated metrics computed directly from PostgreSQL:
- Dashboard KPIs: total/active conversations, containment rate, escalation rate
- Sentiment distribution across all conversations
- Top-8 tools by usage frequency
- Full conversation list with message counts, tool counts, timestamps

---

## 8. Key Architectural Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| **Layered Architecture** | Backend (API → Orchestrator → Enterprise → DB) | Clear responsibility separation, testability |
| **Event-Driven** | Event bus + WebSocket broadcast | Real-time supervisor visibility without polling |
| **CQRS-lite** | Separate read (analytics) vs. write (enterprise services) | Performance isolation |
| **Circuit Breaker (implicit)** | Tool 5s timeout, RAG graceful degradation | Resilience to external service failures |
| **Refresh Token Rotation** | Auth | Security: compromised token automatically invalidated on next use |
| **Singleton Pattern** | `get_settings()`, `rag_engine` | Configuration and heavy resources initialized once |
| **Decorator-as-Context** | `asynccontextmanager lifespan`, `async_session_factory()` | Clean resource lifecycle management |
| **Reciprocal Rank Fusion** | RAG search | Score-free fusion of heterogeneous retrieval sources |
| **Progressive Context Enrichment** | Context assembled → tools run → context reassembled | LLM always has freshest data before generating response |
| **Shield from Cancellation** | `asyncio.shield(generator.generate(...))` | Ensures call summary is always written even if WebSocket closes mid-generation |

---

## 9. Technology Stack Summary

### Backend

| Category | Library | Version |
|----------|---------|---------|
| Web Framework | FastAPI | 0.111.0 |
| ASGI Server | Uvicorn (standard) | 0.30.1 |
| WebSocket Protocol | websockets | 12.0 |
| ORM | SQLAlchemy (asyncio) | 2.0.30 |
| DB Driver | asyncpg | 0.29.0 |
| Migrations | Alembic | 1.13.1 |
| Cache | redis[hiredis] | 5.0.6 |
| Data Validation | Pydantic | 2.7.1 |
| LLM Client | groq | 0.9.0 |
| Embeddings | sentence-transformers | 3.0.1 |
| Text Chunking | langchain-text-splitters | ≥0.2.0 |
| Auth | passlib[bcrypt], python-jose | 1.7.4, 3.5.0 |
| WebRTC | aiortc | 1.9.0 |
| HTTP Client | httpx | 0.27.0 |
| Audio | av (PyAV) | 12.3.0 |
| Numeric | numpy | 1.26.4 |

### Frontend

| Category | Library | Version |
|----------|---------|---------|
| UI Framework | React | 18.3.1 |
| Language | TypeScript | 5.4.5 |
| Build Tool | Vite | 5.3.3 |
| State | Zustand | 4.5.4 |

---

*Report compiled from full source code analysis of Command Center 3.0 — September 2026*
