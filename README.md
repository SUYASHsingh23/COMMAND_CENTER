# InsureAI Command Center 3.0 & Customer Self-Service Portal

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111.0-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.3.1-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-Vector_Store-orange?style=flat)](https://www.trychroma.com)
[![Groq](https://img.shields.io/badge/Groq-LPU_Inference-f55036?style=flat)](https://groq.com)
[![Sarvam AI](https://img.shields.io/badge/Sarvam_AI-Indian_Voice_AI-6C5CE7?style=flat)](https://www.sarvam.ai)

An enterprise-grade, full-stack AI contact center and customer self-service platform built for the Indian insurance sector. Features **real-time bi-directional voice streaming (WebRTC / PCM audio)**, **low-latency multilingual Speech-to-Text & Text-to-Speech (Sarvam AI & EdgeTTS)**, **autonomous agent reasoning & plan execution (Groq Llama-3-70B)**, **Hybrid RAG knowledge retrieval (ChromaDB + FAISS + Redis)**, a **real-time Supervisor Command Center** with diagnostic tracing and queue evaluation, and a **Customer Self-Service Portal**.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Client Layer
        CP[Customer Self-Service Portal :5173]
        CC[Supervisor Command Center :5173]
    end

    subgraph API & Gateway Layer
        F驱API[FastAPI Gateway :8000]
        WS[WebSocket & WebRTC Voice Streamer]
        AUTH[JWT Authentication & RBAC]
    end

    subgraph Intelligence & Orchestration
        PLAN[Dynamic Planner & Tool Orchestrator]
        RAG[Hybrid RAG Engine: ChromaDB + FAISS]
        KB[(Insurance Policies & FAQs)]
        GROQ[Groq Llama 3 70B LLM]
        SARVAM[Sarvam AI / Edge-TTS Voice Engine]
    end

    subgraph Enterprise Data Layer
        PG[(PostgreSQL 14+)]
        REDIS[(Redis State & Event Bus)]
    end

    CP -->|REST & WebSockets| F驱API
    CC -->|REST & WebSockets| F驱API
    F驱API --> AUTH
    F驱API --> WS
    WS --> SARVAM
    WS --> PLAN
    PLAN --> GROQ
    PLAN --> RAG
    RAG --> KB
    PLAN --> PG
    F驱API --> REDIS
    F驱API --> PG
```

---

## 📋 Prerequisites

Before starting, ensure your system has:
- **Python**: Python 3.11 or 3.12 (Recommended: 3.12).
- **Node.js**: Node.js v18+ and `npm` v9+.
- **PostgreSQL**: PostgreSQL 14+ running on `localhost:5432` with a `postgres` superuser or valid credentials.
- **Redis**: Redis 6+ running on `localhost:6379` (optional but recommended for state pub/sub & semantic caching).
- **API Keys**:
  - `GROQ_API_KEY`: Obtain from [Groq Console](https://console.groq.com/) (Required for live AI agent reasoning).
  - `SARVAM_API_KEY`: Obtain from [Sarvam AI](https://www.sarvam.ai/) (Optional: required for Sarvam multilingual Indian voice STT/TTS; system falls back gracefully to Edge-TTS / WebRTC speech).

---

## 🚀 Quickstart Guide (5-Minute Setup)

### Step 1: Clone Repository & Checkout Branch

```bash
git clone https://github.com/SUYASHsingh23/COMMAND_CENTER.git
cd COMMAND_CENTER
git checkout Updated_code_21/9/2026
```

---

### Step 2: Backend Environment Configuration

1. Create a Python virtual environment and install dependencies:
```bash
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate

# Linux/macOS:
source venv/bin/activate

# Install Python requirements
pip install -r requirements.txt
```

2. Configure environment variables:
```bash
# Windows:
copy .env.example .env

# Linux/macOS:
cp .env.example .env
```

Open `backend/.env` and update your PostgreSQL credentials and API keys:
```ini
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/command_center
REDIS_URL=redis://localhost:6379/0
GROQ_API_KEY=gsk_your_groq_api_key_here
SARVAM_API_KEY=your_sarvam_api_key_here
SECRET_KEY=supersecretkey_for_development_change_in_prod
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
LOG_LEVEL=INFO
```

---

### Step 3: Complete Database & Knowledge Base Initialization (1 Command)

From the project root directory (with your backend virtual environment active):

```bash
python scripts/seed_all.py
```

> **What this command automatically does:**
> 1. Verifies/creates the `command_center` PostgreSQL database.
> 2. Executes all schema migrations (`001_initial_schema.sql` through `004_scheduling.sql`).
> 3. Ingests the complete relational seed dataset (`scripts/seed_database.sql`):
>    - **10 Customers** with realistic Indian profiles, contact details, and policy tiers.
>    - **10 Accounts** linked to active insurance policies.
>    - **48 Invoices** (paid, unpaid, overdue, and partial).
>    - **42 Billing Transactions** & ledger records.
>    - **26 Billing Alerts** & payment reminders.
>    - **21 Scheduled Appointments** (surveyor visits, health claims, policy upgrades).
>    - **8 Refund Requests** & supervisor queue items.
>    - **136 Historical Conversations** with 671 messages and diagnostic execution logs.
> 4. Embeds and indexes the complete Insurance Knowledge Base (`knowledge/policies/` and `knowledge/faqs/`) into local ChromaDB (`.chroma_db/`).
> 5. Verifies and prints the full table of ready-to-use customer credentials.

*(Alternative Direct SQL Restore)*:
If you prefer direct SQL execution:
```bash
psql -U postgres -d command_center -f scripts/seed_database.sql
```

---

### Step 4: Start Backend API & Voice Gateway

From the `backend/` directory:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
- **API Documentation (Swagger UI)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health Check**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

### Step 5: Start Frontend Application

In a new terminal, navigate to the `frontend/` directory:
```bash
cd frontend
npm install
npm run dev
```
Open your browser and navigate to: **[http://localhost:5173](http://localhost:5173)**.

---

## 👥 Seeded Customer Accounts & Login Credentials

All 10 test accounts are pre-seeded in the database with verified password hashes. You can log into the **Customer Self-Service Portal** using any of these credentials (or click on any profile badge on the login screen):

| Customer Name | Email (Username) | Password | Active Policy Plan | Customer Tier | City | Outstanding Balance |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Sneha Reddy** | `sneha.reddy@email.com` | `SnehaPass123!` | Home Protector Elite | Elite | Hyderabad | ₹0.00 (Demo Ready) |
| **Anita Desai** | `anita.desai@example.com` | `AnitaPass123!` | Home Protector Elite | Premium | Mumbai | ₹35,397.64 (Overdue) |
| **Rahul Sharma** | `rahul.sharma@email.com` | `RahulPass123!` | Motor Comprehensive | Premium | Mumbai | ₹28,317.64 |
| **Priya Sharma** | `priya.sharma@example.com` | `PriyaPass123!` | Health Shield Gold | Gold | Delhi | ₹4,718.82 |
| **Rajan Mehta** | `rajan.mehta@example.com` | `RajanPass123!` | Health Shield Gold | Premium | Bangalore | ₹17,697.64 |
| **Priya Nair** | `priya.nair@email.com` | `PriyaPass123!` | Health Shield Gold | Gold | Bangalore | ₹10,618.82 |
| **Kavitha Nair** | `kavitha.nair@example.com` | `KavithaPass123!` | Health Shield Premium | Gold | Kochi | ₹10,618.82 |
| **Amit Patel** | `amit.patel@email.com` | `AmitPass123!` | Health Shield Basic | Basic | Ahmedabad | ₹2,359.41 |
| **Suresh Kumar** | `suresh.kumar@example.com` | `SureshPass123!` | Motor Comprehensive | Basic | Chennai | ₹2,359.41 |
| **Vikram Singh** | `vikram.singh@email.com` | `VikramPass123!` | Health Shield Basic | Elite | Delhi | ₹2,359.41 |

---

## 🎯 Key Capabilities & Interactive Demo Scenarios

### 1. Customer Self-Service Portal
- Log in at `http://localhost:5173` using any customer credentials above.
- **Billing & Invoices**: View invoice PDF breakdowns, outstanding GST amounts, and make instant mock payments via UPI/Card.
- **Appointments**: View active appointments, cancel, reschedule, or book a surveyor visit / claim consultation.
- **Claims & Policy Overview**: Inspect active coverage limits, room rent caps, deductibles, and claim histories.
- **Direct Agent Call**: Launch an AI voice call directly from within the customer account with pre-authenticated session context.

---

### 2. Supervisor Command Center & Agent Timeline
- Access the Command Center directly via the **Supervisor Dashboard / Agent View** toggle.
- **Real-Time Audio & Transcript Streaming**:
  - WebRTC / WebSocket low-latency audio.
  - Live interim transcript streaming with word-level confidence and turn-taking.
- **Diagnostic Trace Panel & Customer Trace Panel**:
  - Real-time visibility into intent detection, tool calls (`get_customer`, `fetch_invoice`, `process_refund`, `schedule_appointment`), and workflow execution status.
  - Inspect latency breakdowns (STT ms, LLM reasoning ms, TTS ms).
- **Conversation History Modal**:
  - Filter and inspect past sessions, audio replays, sentiment trends, and resolution states.

---

### 3. Sneha Reddy Financial Refund Demos

InsureAI incorporates enterprise refund policy rules:
- **Refunds $\le$ ₹5,000**: Autonomously verified and approved by the AI Agent in real-time.
- **Refunds > ₹5,000**: Require human supervisor evaluation and are automatically routed to the **Supervisor Evaluation Queue**.

To run these live scenarios:
```bash
# Seed Sneha Reddy's demo invoices:
python backend/scripts/seed_sneha_refund_demo.py
```

#### Scenario A: Live AI Auto-Approved Refund (₹1,000)
1. In the Voice Interface, initiate a call for **Sneha Reddy**.
2. Speak or type:
   > *"I was charged Rs.1,000 for a Home Security Add-on on invoice INV-2026-SROVER-01 that I never subscribed to. Can I get a refund?"*
3. **Agent Action**:
   - Fetches invoice `INV-2026-SROVER-01`.
   - Verifies the ₹1,000 erroneous add-on charge against policy rules.
   - Automatically executes `process_refund(amount=1000.0, reason="Erroneous add-on charge")`.
   - Live confirmation provided to customer with refund reference number (`REF-...`).

#### Scenario B: Live Supervisor Escalation (> ₹5,000 Threshold)
1. Speak or type:
   > *"I accidentally paid Rs.6,000 extra on my September invoice INV-2026-SROVERPAY-01. Please issue a refund."*
2. **Agent Action**:
   - Detects the refund amount exceeds the ₹5,000 automatic limit.
   - Triggers `escalate_refund_to_supervisor`.
   - Creates a pending refund record and notifies the customer of the 48-hour SLA.
3. **Supervisor Command Center**:
   - Click the **Supervisor Queue / Queue Evaluation Modal**.
   - Review Sneha Reddy's pending ₹6,000 claim with attached financial evidence.
   - Click **Approve** or **Reject** with audit notes.

---

### 4. Hybrid RAG Policy Retrieval
The system uses a hybrid retrieval engine combining ChromaDB dense vector embeddings (`all-MiniLM-L6-v2`) with FAISS semantic indexing and keyword reranking across:
- `health_shield_basic_policy.md`
- `health_shield_gold_policy.md`
- `health_shield_premium_policy.md`
- `motor_comprehensive_policy.md`
- `motor_third_party_policy.md`
- `home_protector_elite_policy.md`
- Policy FAQs & claims guidance.

Ask questions such as:
> *"What is the waiting period for pre-existing diseases under Health Shield Gold?"*
> *"Is zero depreciation included in my motor comprehensive plan?"*
> *"What is the coverage limit for jewelry under Home Protector Elite?"*

---

## 📂 Project Structure

```
COMMAND_CENTER/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/routes/        # REST endpoints (auth, billing, crm, scheduling, analytics)
│   │   │   └── websocket/        # Real-time event broadcasting and WebRTC streaming
│   │   ├── core/                 # Config, security, JWT auth
│   │   ├── database/             # PostgreSQL session, asyncpg engine, SQL migrations
│   │   ├── enterprise/billing/   # Enterprise billing, GL ledger, invoice generation
│   │   ├── gateway/              # Audio streaming, session management
│   │   ├── models/               # SQLAlchemy ORM models (customer, billing, conversation)
│   │   ├── orchestrator/         # Agent loop, dynamic planner, tool registry, workflows
│   │   ├── orchestrator/rag/     # Hybrid RAG (ChromaDB + FAISS + document loaders)
│   │   └── speech/               # Sarvam AI STT & TTS client, EdgeTTS fallback
│   ├── scripts/                  # Scenario-specific demo seeders
│   ├── main.py                   # FastAPI application entrypoint
│   └── requirements.txt          # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/             # Login & registration portal with 1-click test logins
│   │   │   ├── billing/          # Billing dashboard & Queue Evaluation modal
│   │   │   ├── command-center/   # Supervisor dashboard & live agent timeline
│   │   │   ├── conversation/     # WebRTC voice interface, transcripts, diagnostic trace panels
│   │   │   └── portal/           # Customer Self-Service Portal
│   │   ├── contexts/             # AuthContext, session state
│   │   ├── hooks/                # WebRTC, EventStream, SupervisorStream hooks
│   │   └── services/             # REST and WebSocket API client layer
│   ├── package.json
│   └── vite.config.ts
├── knowledge/
│   ├── policies/                 # Complete insurance policy wording documents (Markdown)
│   └── faqs/                     # Structured insurance QA datasets (JSON)
├── scripts/
│   ├── seed_all.py               # Master 1-command database & RAG knowledge base seeder
│   ├── seed_database.sql         # Standalone portable SQL dump (all 10 customers + fixtures)
│   └── export_seed_data.py       # Exporter utility to generate SQL seed fixtures
├── architecture_report.md        # Detailed technical architecture specification
├── workflow_report.md            # End-to-end conversation and execution workflow analysis
├── explanation_report.md         # Component-by-component implementation report
└── README.md                     # Project documentation
```

---

## 🔧 Useful Development Commands

| Task | Command | Directory |
| :--- | :--- | :--- |
| **Run Master Seed** | `python scripts/seed_all.py` | Root |
| **Export Database Fixtures** | `python scripts/export_seed_data.py` | Root |
| **Reset Sneha Demo Data** | `python scripts/seed_sneha_refund_demo.py --reset` | `backend/` |
| **Check Customer Accounts** | `python check_accounts.py` | `backend/` |
| **Start Backend Dev Server** | `uvicorn main:app --port 8000 --reload` | `backend/` |
| **Start Frontend Dev Server** | `npm run dev` | `frontend/` |
| **Build Frontend Production** | `npm run build` | `frontend/` |

---

## 🔒 Security & Best Practices

- **Zero Secrets Committed**: API keys and database passwords are kept strictly out of version control via `.gitignore`.
- **Idempotent Seeding**: All database seed statements use `ON CONFLICT DO NOTHING` to prevent key collisions on re-runs.
- **Generated Column Safety**: Database fixtures respect PostgreSQL `GENERATED ALWAYS` columns.
- **JWT & Password Hashing**: Customer and agent passwords are encrypted using `bcrypt` (12 rounds). Session tokens utilize standard `HS256` signed JWTs.

---

## 📄 License
This project is proprietary and confidential. Developed for the InsureAI Enterprise Command Center platform.
