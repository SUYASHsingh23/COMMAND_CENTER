# Command Center 3.0 — Day 13 (Week 3) Testing Plan & Deliverable Verification

## Executive Summary

This document provides the complete testing plan, verification methodology, and automated scorecards to track the implementation progress of **Command Center 3.0** up to **Day 13 (Week 3)** as planned in the workflow schedule.

---

## 1. Quick Verification: Instant One-Liners

Run these commands from the project root (`c:\Users\2862627\Desktop\command_center_3.0`):

```powershell
# 1. Day 13 Milestone Suite (Analytics API, WS Event Stream, Monitor & Timeline, Sarvam TTS Streaming, Frontend)
python scripts/test_day13_milestone.py

# 2. Week 2 Intelligence & Foundation Master Hardcore Suite (Days 1-10 + 5 Multi-Turn Scenarios)
python scripts/test_week2_master_hardcore.py

# 3. Live Voice Pipeline (Sarvam STT/TTS + Groq LLM + AudioRouter VAD)
python scripts/test_live_ws.py

# 4. Frontend Production Build Validation
cd frontend ; npm run build ; cd ..
```

---

## 2. Deliverables Matrix: Days 11, 12, 13 (Week 3)

| Day | Target Deliverables | Implementation Location | Test Verification |
|:---:|---|---|:---:|
| **Day 11** | **Live Supervisor Dashboard**<br>• Real-time metrics bar (Active Calls, Containment %, Escalation %, Total Calls)<br>• REST Analytics endpoints (`/dashboard`, `/conversations`, `/conversations/{id}/detail`, `/escalations`)<br>• Real-time WebSocket broadcast connection (`/events/stream`) | • [`backend/app/api/v1/routes/analytics.py`](file:///c:/Users/2862627/Desktop/command_center_3.0/backend/app/api/v1/routes/analytics.py)<br>• [`frontend/src/components/command-center/Dashboard.tsx`](file:///c:/Users/2862627/Desktop/command_center_3.0/frontend/src/components/command-center/Dashboard.tsx)<br>• [`frontend/src/hooks/useSupervisorStream.ts`](file:///c:/Users/2862627/Desktop/command_center_3.0/frontend/src/hooks/useSupervisorStream.ts) | **PASSED**<br>(Test 01 & 02) |
| **Day 12** | **Conversation Monitor & Agent Timeline**<br>• Live transcript bubble view with real-time customer partials & agent responses<br>• Customer context card (plan, account balance, status, verified flag)<br>• Intent tags, sentiment indicators, and urgency pills<br>• Visual step-by-step turn execution timeline (Intent $\rightarrow$ Tools $\rightarrow$ RAG $\rightarrow$ Policy $\rightarrow$ Workflow $\rightarrow$ Response) | • [`frontend/src/components/command-center/ConversationMonitor.tsx`](file:///c:/Users/2862627/Desktop/command_center_3.0/frontend/src/components/command-center/ConversationMonitor.tsx)<br>• [`frontend/src/components/command-center/AgentTimeline.tsx`](file:///c:/Users/2862627/Desktop/command_center_3.0/frontend/src/components/command-center/AgentTimeline.tsx)<br>• [`backend/app/orchestrator/agent.py`](file:///c:/Users/2862627/Desktop/command_center_3.0/backend/app/orchestrator/agent.py) | **PASSED**<br>(Test 03) |
| **Day 13** | **Deep Observability Panels & Streaming TTS**<br>• **Tool Execution View**: inspect inputs, outputs, status, and duration (ms) for all 8 enterprise tools<br>• **RAG Sources View**: retrieved knowledge passages, cosine relevance scores, category tags<br>• **Memory Panel**: session state, working memory, customer verification status, entities<br>• **Sarvam AI TTS Streaming**: sentence boundary chunking, first-chunk latency tracking (~1.0s), audio synthesis | • [`frontend/src/components/command-center/ToolExecutionView.tsx`](file:///c:/Users/2862627/Desktop/command_center_3.0/frontend/src/components/command-center/ToolExecutionView.tsx)<br>• [`frontend/src/components/command-center/RagSourcesView.tsx`](file:///c:/Users/2862627/Desktop/command_center_3.0/frontend/src/components/command-center/RagSourcesView.tsx)<br>• [`frontend/src/components/command-center/MemoryPanel.tsx`](file:///c:/Users/2862627/Desktop/command_center_3.0/frontend/src/components/command-center/MemoryPanel.tsx)<br>• [`backend/app/speech/tts.py`](file:///c:/Users/2862627/Desktop/command_center_3.0/backend/app/speech/tts.py) | **PASSED**<br>(Test 04 & 05) |

---

## 3. Granular Test Suite Breakdown

### Suite A: Day 13 Milestone Suite (`scripts/test_day13_milestone.py`)
Executes 5 end-to-end automated assertions:
1. **Analytics REST APIs**:
   - `GET /api/v1/analytics/dashboard`: Computes `total_conversations`, `containment_rate`, `escalation_rate`, `sentiment_distribution`, `top_tools`.
   - `GET /api/v1/analytics/conversations`: Returns paginated active/completed session list.
   - `GET /api/v1/analytics/conversations/{id}/detail`: Returns messages, tool execution logs, detected intents, policy decisions, workflow steps, and call summary.
   - `GET /api/v1/analytics/escalations`: Returns human escalation queue records.
2. **Supervisor WebSocket Broadcast Stream (`/events/stream`)**:
   - Connects mock supervisor client to `/events/stream`.
   - Emits 12 typed event types (`session.created`, `transcript.partial`, `transcript.final`, `intent.detected`, `tool.started`, `tool.completed`, `rag.retrieved`, `policy.decision`, `workflow.step`, `response.generated`, `sentiment.updated`, `session.ended`).
   - Verifies 100% in-order delivery and UTC timestamp serialization.
3. **Conversation Monitor & Timeline Event Sequence**:
   - Runs a live customer query turn (*"My fiber broadband is not working and there is red light on my router"*).
   - Validates that the orchestrator emits the complete pipeline: `intent.detected` $\rightarrow$ `sentiment.updated` $\rightarrow$ `rag.retrieved` $\rightarrow$ `tool.started` $\rightarrow$ `tool.completed` $\rightarrow$ `response.generated`.
4. **Sarvam Streaming TTS & Latency Optimization**:
   - Validates sentence chunking (`_split_into_chunks`).
   - Synthesizes streaming audio with `synthesize_streaming()`.
   - Measures first-chunk latency (1.00s–1.14s) and total streaming audio bytes.
5. **Frontend Component Architecture**:
   - Verifies existence and export integrity of `Dashboard.tsx`, `ConversationMonitor.tsx`, `AgentTimeline.tsx`, `ToolExecutionView.tsx`, `RagSourcesView.tsx`, `MemoryPanel.tsx`, `useSupervisorStream.ts`, and `supervisor.ts`.

---

## 4. Manual Browser UI Verification Guide

To test the Command Center visually in your web browser:

### Step 1: Start Backend Server
```powershell
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000
```
*Health Check: open `http://127.0.0.1:8000/docs` to see OpenAPI specifications.*

### Step 2: Start Frontend Server
```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

### Step 3: Open Browser Tabs
1. **Customer Voice Agent**: Open `http://localhost:5173/`
   - Click the blue microphone button (**Start Call**).
   - Use Push-to-Talk (PTT) or speak to generate a customer session.
2. **Supervisor Command Center**: Open `http://localhost:5173/supervisor`
   - **Header Bar**: Live active call count, containment rate %, escalation rate %, clock.
   - **Sidebar**: Real-time list of active and recent customer calls.
   - **Tab Navigation**:
     - **💬 Transcript**: Live customer/agent chat stream with sentiment badges.
     - **⏱ Timeline**: Turn-by-turn visual execution milestones.
     - **⚙️ Tools**: Enterprise tool executions (`get_customer`, `get_invoice`, `create_ticket`, etc.) with inputs/outputs.
     - **📚 RAG**: Retrieved policy passages and cosine relevance scores.
     - **🧠 Memory**: Session working state, customer verification flag, and extracted entities.

---

## 5. Complete Project Scorecard: Days 1–13

| Day | Layer | Deliverable Description | Status |
|:---:|---|---|:---:|
| 1 | Infrastructure | PostgreSQL 15 schema tables, migrations, session models | ✅ Complete |
| 1 | Speech | Sarvam AI STT client, audio chunking, WAV conversion | ✅ Complete |
| 2 | Gateway | Session Gateway (FastAPI), WebRTC SDP/ICE signaling store | ✅ Complete |
| 2 | Observability | 13 Typed Event models, payload contracts, WebSocket broadcast | ✅ Complete |
| 3 | Frontend | React WebRTC audio capture, playback, and connection UI | ✅ Complete |
| 3 | Gateway | Session WebSocket event subscription, reconnect handling | ✅ Complete |
| 4 | Frontend | Transcript display, connection badge, call controls | ✅ Complete |
| 4 | Infrastructure | Database seed fixtures (5 customers, accounts, invoices) | ✅ Complete |
| 5 | Speech | AudioRouter VAD (RMS >200), Barge-in interruption hook | ✅ Complete |
| 6 | Orchestrator | Groq Intent & Entity extraction, Business Context Router | ✅ Complete |
| 6 | Memory | Redis working state + PostgreSQL long-term memory | ✅ Complete |
| 7 | Orchestrator | Context Assembler, AgentPlanner dynamic plan generation | ✅ Complete |
| 7 | Planner | PlanExecutor with parameter chaining across tools | ✅ Complete |
| 8 | Tools | Tool Registry (8 tools), Tool Orchestrator with DB audit | ✅ Complete |
| 8 | Enterprise | Mock CRM (`get_customer`, `get_account`) + Billing Service | ✅ Complete |
| 9 | Enterprise | Mock Ticketing (`create_ticket`) + Scheduling Service | ✅ Complete |
| 9 | RAG | 384-dim TextEmbedder, Knowledge Base Seeder, Cosine Search | ✅ Complete |
| 10 | Policy | Policy Engine (10 guardrails, refund limits, auth checks) | ✅ Complete |
| 10 | Workflows | 4 Workflows (Refund, Cancellation, Upgrade, Support) | ✅ Complete |
| 10 | Analytics | Call Summary Generator, Escalation Handler | ✅ Complete |
| 11 | Frontend | Command Center Live Dashboard (metrics chips, KPI cards) | ✅ Complete |
| 11 | Gateway | Supervisor WebSocket broadcast bus (`/events/stream`) | ✅ Complete |
| 11 | Analytics | REST Analytics endpoints (`/dashboard`, `/conversations`) | ✅ Complete |
| 12 | Frontend | Conversation Monitor screen (live transcript, context card) | ✅ Complete |
| 12 | Frontend | Agent / Planner Timeline screen (visual execution sequence) | ✅ Complete |
| 13 | Speech | Sarvam TTS streaming synthesis with chunking & latency tracking | ✅ Complete |
| 13 | Frontend | Tool Execution View, RAG Sources View, Memory Panel | ✅ Complete |

---

## 6. Upcoming Deliverables: Days 14 & 15

- **Day 14**:
  - Advanced call analytics aggregation & sentiment timeline chart.
  - Human escalation handoff workflow: context capture, agent queue assignment, live notification.
- **Day 15**:
  - 3 Polished demo scenarios (Technical / Billing+Refund / Cancellation).
  - Performance profiling, context window optimization, parallel tool execution.
