# System Root-Cause Analysis Report

I have conducted a deep architectural review of the entire Command Center codebase (Frontend, Backend APIs, WebRTC Gateway, and the AI Orchestrator). Below is a detailed breakdown of precisely **why** the 6 issues you highlighted are occurring.

---

### 1. Authentication, Profile Flow, & Command Center Integration
**The Issue:** Logged-in users' details are not passed to the command center; the agent repeatedly asks for identity verification.
**Root Cause:**
- **Frontend Disconnect:** While the JWT Auth system successfully authenticates the user and creates a PostgreSQL record, the `VoiceInterface.tsx` component completely ignores this. When you click to start the call, the `useConversation.ts` hook calls the backend `POST /sessions` endpoint **anonymously** (it passes `customer_id: null`).
- **Backend Consequence:** Because the Orchestrator receives no `customer_id`, the `ContextAssembler` fails to query the PostgreSQL CRM tables. The AI receives the context `[CUSTOMER]: Identity not yet verified`, forcing the LLM to repeatedly ask "Who am I speaking with?".

### 2. STT Inaccuracy, Memory Amnesia, & TTS Latency
**The Issue:** Speech transcription is inaccurate, the agent forgets context after a few turns, and there is a 3-4 second latency delay on responses.
**Root Causes:**
- **STT (Speech-to-Text):** The backend relies on `SarvamSTTClient` which posts audio chunks to `api.sarvam.ai`. Sarvam is heavily optimized for Indic languages (Hindi, etc.). If a user speaks English with a non-Indic accent, the transcription quality drops significantly. Furthermore, it is not a real-time WebSocket stream—it buffers the audio until you stop speaking (VAD silence limit) and then uploads it, adding immediate delay.
- **Memory Amnesia:** In `context/assembler.py` and `redis_store.py`, the system is hardcoded with `MAX_HISTORY_TURNS = 6`. After exactly 3 exchanges (3 user messages + 3 agent responses), the oldest messages are permanently deleted from the context window. There is no background "summarization" memory, meaning the agent gets total amnesia of early conversation turns.
- **TTS Latency:** The `AgentOrchestrator` uses `await _groq.chat.completions.create(...)` **synchronously**. It waits for the Groq LLM to generate the *entire 300-word paragraph* before it sends a single character to the `SarvamTTSClient`. It should be streaming tokens to the TTS engine in real-time. This architectural flaw is responsible for 90% of the 3-4 second delay.

### 3 & 4. CRM and Billing Systems Showing "Fake" Data
**The Issue:** The dashboards show artificial data that the Command Center cannot verify or manipulate.
**Root Cause:**
- **Mock Seeding:** During initialization, a script named `002_seed_mock_data.sql` dumped dozens of synthetic rows into the PostgreSQL `customer` and `account` tables. 
- **Lack of Linkage:** When you create a *real* account via the Auth page, you get a pristine, empty profile. However, the CRM and Billing dashboards are pulling the top 50 rows of the *fake* seeded data instead of filtering by the currently logged-in user. The Command Center can't modify this data because it doesn't know which account you belong to (Issue #1).

### 5. Supervisor Page Logging & Summaries
**The Issue:** Conversations are not being logged correctly and summaries are missing.
**Root Cause:**
- **Race Condition on Disconnect:** The summary generation is triggered in `AgentOrchestrator.end_session()` which calls a background LLM `CallSummaryGenerator`. However, when the user hangs up, the WebRTC socket closes instantly, often terminating the Uvicorn request context before the 3-5 second LLM summarization call can complete and write to the database.

### 6. Scheduling System Synthetic Data
**The Issue:** Scheduling shows fake data and the agent doesn't properly verify or book real appointments.
**Root Cause:**
- **Mock Tool Output:** The LLM's `schedule_engineer` tool in the Orchestrator does not execute a real SQL `INSERT` into an `appointment` table. Instead, the Python tool execution layer simply returns a hardcoded mock JSON dictionary like `{"status": "scheduled", "time": "tomorrow"}` back to the LLM. 
- **Missing Table:** There isn't even an `appointments` table defined in the PostgreSQL schema to persist past/future bookings.

---

## Next Steps

To transform this from a prototype to a production-ready system, we must resolve these core architectural flaws. 

### Proposed Action Plan:
1. **Frontend Wiring:** Inject the `customer_id` from `AuthContext` directly into the WebRTC session payload.
2. **Streaming Pipeline:** Rewrite the `AgentOrchestrator` to use `stream=True` on Groq, piping tokens immediately to the TTS engine for sub-second latency.
3. **STT Replacement:** Migrate from Sarvam STT to Deepgram (or Whisper) via WebSockets for real-time, highly accurate English transcription.
4. **Memory:** Implement LangGraph with a summarization node so the context window never exceeds limits but never forgets long-term details.
5. **Database Realism:** Wipe the `002_seed_mock_data.sql` fake data, build a real `appointments` schema, and wire the LLM tools directly to PostgreSQL async calls.

> [!IMPORTANT]
> **User Review Request:** 
> Do you agree with this root-cause analysis? If so, I will prepare a step-by-step implementation plan (starting with the Latency & STT/TTS pipeline, as it requires the heaviest architectural changes) to resolve all of these issues. 
> *(Click "Proceed" if you would like me to draft the fix implementation plan).*
