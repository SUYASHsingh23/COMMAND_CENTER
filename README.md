# COMMAND_CENTER — InsureAI Contact Center 3.0

An enterprise-grade AI-powered contact center platform featuring WebRTC voice streaming, real-time STT/TTS (Sarvam AI), LLM orchestration (Groq), Hybrid RAG knowledge retrieval, and a React supervisor command center dashboard.

---

## Prerequisites

Ensure you have the following installed on your system:
- **Python**: Python 3.12 (Python 3.12 is required; bleeding-edge Python 3.14/3.15 lack pre-compiled binary wheels for `asyncpg` & `av`).
- **`uv` Package Manager**: Install via `pip install uv` or official standalone installer (`uv --version` >= 0.10).
- **Node.js & npm**: Node.js v18+ and `npm` v9+.
- **PostgreSQL Database**: Running on `localhost:5432` with database `contact_center`.
- **Redis Server**: Running on `localhost:6379`.

---

## Quick Setup Instructions (For Developer & AI Agent)

> **Instructions for AI Assistant (Antigravity)**:
> Execute the terminal commands listed under Steps 1 through 5 sequentially.

### Step 1: Clone Repository & Branch

```bash
git clone -b Updated_Code_2/9/2026 https://github.com/SUYASHsingh23/COMMAND_CENTER.git .
```

---

### Step 2: Backend Environment & Dependencies

Navigate to the `backend/` directory, create a Python 3.12 virtual environment using `uv`, install dependencies, and configure `.env`:

```bash
cd backend

# 1. Create Python 3.12 virtual environment
uv venv --python 3.12

# 2. Install backend dependencies (with edge-tts)
uv pip install -r requirements.txt

# 3. Create .env from template
copy .env.example .env
```

#### `.env` Configuration
Verify or update `backend/.env` with your PostgreSQL database credentials and API keys:

```env
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=INFO
SECRET_KEY=supersecretkey_for_development_change_in_prod
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# PostgreSQL Database
DATABASE_URL=postgresql+asyncpg://postgres:postgre@localhost:5432/contact_center
POSTGRES_URL=postgresql+asyncpg://postgres:postgre@localhost:5432/contact_center
DB_USER=postgres
DB_PASSWORD=postgre
DB_HOST=localhost
DB_PORT=5432
DB_NAME=contact_center
USE_POSTGRES=true

# Redis
REDIS_URL=redis://localhost:6379/0

# Sarvam AI (STT & TTS)
SARVAM_API_KEY=your_sarvam_api_key_here
SARVAM_STT_MODEL=saarika:v2.5
SARVAM_TTS_MODEL=bulbul:v3

# Groq LLM
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=groq/compound-mini
```

---

### Step 3: Database Schema Migration & Seeding

Synchronize database tables and seed sample customers, accounts, invoices, appointments, billing alerts, and RAG knowledge base documents:

```bash
# 1. Ensure DB schema synchronization (fixes conversation_state table if upgrading)
uv run python -c "import asyncio, app.models; from app.database.session import engine, Base; from sqlalchemy import text; asyncio.run(engine.begin().then(lambda conn: conn.execute(text('DROP TABLE IF EXISTS conversation_state CASCADE;')))); asyncio.run(engine.begin().then(lambda conn: conn.run_sync(Base.metadata.create_all)))"

# 2. Seed realistic customer, invoice, and appointment data
uv run python seed_full_data.py

# 3. Seed insurance billing alerts
uv run python seed_alerts.py

# 4. Seed RAG Knowledge Base (Policies & FAQs into ChromaDB/FAISS)
uv run python run_seeder.py
```

---

### Step 4: Frontend Environment Setup

Navigate to the `frontend/` directory, install packages, and verify the production build:

```bash
cd ../frontend

# Install dependencies
npm install

# Verify TypeScript compilation and Vite build
npm run build
```

---

### Step 5: Run Development Servers

Run both backend and frontend servers:

#### 1. Backend FastAPI Server
```bash
cd backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
- **API Docs (Swagger UI)**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`

#### 2. Frontend React Dashboard (Command Center)
```bash
cd frontend
npm run dev
```
- **Supervisor Dashboard**: `http://localhost:5173`

---

## Important Fixes Applied to the Codebase

If setting up on a fresh machine, the following fixes are pre-applied in this branch:

1. **Pydantic Configuration Fix (`app/core/config.py`)**:
   Set `extra = "ignore"` under `Settings.Config` to prevent `ValidationError: extra_forbidden` when custom environment variables exist in `.env`.
2. **Missing `edge-tts` Dependency (`requirements.txt`)**:
   Added `edge-tts` to `requirements.txt` for Edge TTS voice synthesis fallback.
3. **PostgreSQL `conversation_state` Schema Migration**:
   Recreated `conversation_state` table schema (`state_id`, `conversation_id`, `current_workflow`, `customer_verified`, `task_status`, `updated_at`) to fix `UndefinedColumnError`.
4. **Windows Terminal Character Encoding**:
   Fixed unicode arrow printing in `seed_alerts.py` to prevent `UnicodeEncodeError` on Windows terminal `cp1252` encoding.

---

## Troubleshooting

- **Error: `Microsoft C++ Build Tools required` during `uv pip install`**:
  Make sure you create the virtual environment using Python 3.12 (`uv venv --python 3.12`). Bleeding edge Python 3.14 lacks pre-built wheels for `asyncpg` and `av`.
- **Error: `password authentication failed for user postgres`**:
  Ensure PostgreSQL is running locally and update `DATABASE_URL` in `backend/.env` with your correct PostgreSQL password.
- **Supervisor Dashboard shows 0 values**:
  Run `uv run python seed_full_data.py` and `uv run python seed_alerts.py` inside `backend/` to populate customer records and analytics data.
