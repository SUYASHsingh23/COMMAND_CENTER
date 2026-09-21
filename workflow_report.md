# Command Center 3.0 — Workflow Report
**Project:** InsureAI Voice-First Contact Center Platform  
**Version:** 3.0  
**Classification:** Final Draft — Operational Workflow Documentation  
**Date:** September 2026

---

## 1. Overview

This document traces every major operational workflow in Command Center 3.0 end-to-end, from the moment a customer initiates contact through to call completion, action execution, and post-call summarization. All flows are derived from the actual production source code.

---

## 2. Workflow 1: Complete Voice Call Lifecycle

This is the primary operational flow — a policy-holder connects via voice, asks questions, and the AI resolves them.

### 2.1 Customer Connects (WebSocket Handshake)

```
Browser                         FastAPI Backend
  │                                   │
  │── WebSocket: /sessions/{id}/audio ──▶│
  │                                   │
  │                         AudioRouter created
  │                         session_manager.get_session(db, session_id)
  │                         → fetch conversation_id from DB
  │                         → register on_transcript handler
  │                         → register on_barge_in handler
  │
  │◀── WebSocket ACCEPTED ─────────────│
```

**Concurrently**, the frontend opens a second WebSocket to `/sessions/{session_id}/events` to receive real-time pipeline events (intents detected, tools called, etc.).

---

### 2.2 Customer Speaks

```
Browser Microphone (16kHz PCM, 16-bit mono)
  │
  │── Binary WebSocket frames (20ms chunks) ──▶ AudioRouter.receive_chunk()
        │
        ├── TTS Active?
        │     └── YES → BargeInDetector.check(audio_bytes, tts_active=True)
        │                 → RMS > threshold AND TTS active → barge_in_detected = True
        │                 → Stops TTS streaming immediately
        │
        └── _is_speech(audio_bytes)?
              RMS calculation on 16-bit PCM samples
              Threshold: 80.0 (tuned for Indian accent)
              │
              ├── SPEECH → SarvamSTTClient.process_chunk(bytes)
              │             buffer PCM internally
              │             reset silence timer
              │
              └── SILENCE (after ≥1 speech chunk)
                    Start 0.45s VAD timer
                    On timeout → finalize_utterance()
```

---

### 2.3 Speech-to-Text

```
SarvamSTTClient.finalize_utterance()
  │
  ├── Concatenate all buffered PCM chunks
  ├── Minimum size check: 640 bytes (40ms) — prevents empty STT calls
  ├── Convert PCM → WAV (wave module: 16kHz, mono, 16-bit)
  │
  └── POST https://api.sarvam.ai/speech-to-text
        body: WAV file + language_code=en-IN + model=saarika:v2.5
        │
        ├── 200 OK → extract "transcript" field
        │             emit TranscriptEvent(text=transcript, is_final=True)
        │
        └── Error → log, return None (silent failure)
```

---

### 2.4 Transcript Arrives — Pipeline Kickoff

```
on_transcript(event) handler called in main.py
  │
  ├── event.is_final = True
  │     idx = turn_counter["n"]++
  │
  │     1. event_bus.emit(session_id, TranscriptFinalEvent)
  │        → UI shows customer utterance in real time
  │
  │     2. _save_message_with_id(session_id, "customer", text, idx)
  │        → INSERT INTO message (conversation_id, role, content, turn_index)
  │        → Returns Message row with message_id
  │
  │     3. asyncio.create_task(_run_response_pipeline(session_id, text, idx, ws, audio_router))
  │        → Non-blocking: pipeline runs while audio continues streaming
  │
  └── event.is_final = False
        event_bus.emit(TranscriptPartialEvent)
        → UI shows "typing..." indicator with partial words
```

---

### 2.5 AI Response Pipeline (`_run_response_pipeline`)

```
_run_response_pipeline(session_id, transcript, turn_index, websocket, audio_router)
  │
  └── response_text = await _agent.run_turn(...)
                              │
                              ▼
              ┌─── AgentOrchestrator.run_turn() ───────────────────────────┐
              │                                                              │
              │  STEP 1: Load Session Memory                                │
              │    Redis: state dict (customer_id, verified, profile, etc.) │
              │    Redis: history list (conversation turns)                  │
              │    PG: recent messages (last 8 from DB)                     │
              │    PG: prior intents (last 3)                                │
              │    PG: long-term customer facts                              │
              │                                                              │
              │  STEP 2: Extract Intent                                      │
              │    Groq API call (qwen3.8-27b, temp=0.0)                   │
              │    → intents[], entities{}, sentiment, urgency, confidence  │
              │                                                              │
              │  STEP 3: Route to Domain                                     │
              │    BusinessContextRouter.route(intent_result)               │
              │    → "billing" | "scheduling" | "crm" | "general"           │
              │                                                              │
              │  STEP 4: Emit Events                                         │
              │    event_bus → IntentDetectedEvent (UI: intent badges)      │
              │    event_bus → SentimentUpdatedEvent (UI: sentiment meter)  │
              │                                                              │
              │  STEP 5: Resolve Customer Profile                            │
              │    Read customer_profile from Redis session state           │
              │    If missing → CRMService.get_customer(customer_id)        │
              │                                                              │
              │  STEP 6: Assemble Context                                    │
              │    ContextAssembler.assemble() → AgentContext struct         │
              │    → Includes profile, account, invoices, appointments      │
              │                                                              │
              │  STEP 7: Plan                                                │
              │    Groq API call (qwen3.8-27b, temp=0.1)                   │
              │    → AgentPlan{steps: [PlanStep{tool, params}], direct}     │
              │                                                              │
              │  STEP 8: Policy Check (for each step)                       │
              │    PolicyEngine.evaluate_tool_use(tool, customer_verified)  │
              │    → Block if sensitive tool + unverified customer           │
              │    → Persist + broadcast PolicyDecisionEvent                 │
              │                                                              │
              │  STEP 9: Inject Real customer_id                            │
              │    Replace planner's placeholder "c001" with real UUID      │
              │    Inject conversation_id, session_id for escalation tools  │
              │                                                              │
              │  STEP 10: Execute Tools                                      │
              │    For each plan step:                                       │
              │      ToolStartedEvent → emit                                 │
              │      asyncio.wait_for(dispatch(tool, params), timeout=5s)   │
              │      ToolCompletedEvent → emit                               │
              │      Persist ToolExecution to PG (async fire-and-forget)    │
              │                                                              │
              │  STEP 11: Reassemble Context with Tool Results               │
              │    ContextAssembler.assemble() again with tool_results      │
              │                                                              │
              │  STEP 12: Check + Run Workflow                               │
              │    If refund_request + invoice_id → refund_workflow         │
              │    If cancellation_request → cancellation_workflow           │
              │    If plan_upgrade + target_plan → upgrade_workflow          │
              │    WorkflowStepEvent emitted per step                        │
              │                                                              │
              │  STEP 13: Generate Response                                  │
              │    Groq API call (qwen3.8-27b, max_tokens=500, temp=0.3)   │
              │    System prompt: empathetic, natural, no markdown           │
              │    Context: last 12 history turns + assembled context block  │
              │    → Natural language response string                        │
              │                                                              │
              │  STEP 14: Post-Turn Processing                               │
              │    ResponseGeneratedEvent → emit (UI shows response)         │
              │    EscalationHandler.should_escalate() check                │
              │    MemoryManager.after_turn():                               │
              │      Redis: append user + assistant turns to history         │
              │      Redis: update domain field                              │
              │      PG: INSERT intent record with full extraction data      │
              │    If escalation needed → EscalationHandler.escalate()       │
              │      → INSERT escalation row                                 │
              │      → EscalationCreatedEvent → emit                         │
              │                                                              │
              └─────────────────────────────────────────────────────────────┘
  │
  │  response_text is now ready
  │
  ├── asyncio.create_task(_save_message(session_id, "agent", response_text, idx))
  │     → INSERT INTO message (role="agent", content=response_text)
  │
  └── TTS Streaming Pipeline
        audio_router.set_tts_active(True)
        tts = EdgeTTSClient()
        │
        async for audio_chunk in tts.synthesize_streaming(response_text):
          │
          ├── barge_in_detected? → STOP streaming
          ├── WebSocket still connected? → STOP if disconnected
          └── await websocket.send_bytes(audio_chunk)
                → MP3 audio chunks stream to browser in real time
        │
        audio_router.set_tts_active(False)
```

---

### 2.6 Session End

```
WebSocketDisconnect raised (customer closes browser / hangs up)
  │
  ├── audio_router.close()
  │     → flush() any remaining audio buffer
  │     → finalize_utterance() if speech was in progress
  │
  ├── _audio_routers.pop(session_id)
  │
  └── asyncio.create_task(_agent.end_session(session_id, conv_id, duration_sec=0))
        │
        └── AgentOrchestrator.end_session()
              MemoryManager.load(session_id, db)
              tools_used = list(memory.state.get("task_status", {}).keys())
              │
              └── asyncio.shield(CallSummaryGenerator.generate())
                    Groq API call with full conversation history
                    → summary_text (3-5 sentences, specific with reference numbers)
                    → resolution: resolved | partially_resolved | unresolved | escalated
                    │
                    ├── INSERT call_summary (conv_id, summary_text, resolution, tools_used)
                    └── event_bus → CallSummaryEvent (UI: summary panel appears)
```

---

## 3. Workflow 2: Customer Authentication

### 3.1 New Customer Registration

```
POST /api/v1/auth/register
  body: {name, email, phone, password}
  │
  ├── Check email uniqueness in customer table
  ├── Customer(password_hash=bcrypt(password, rounds=12))
  ├── db.flush() → get customer_id without commit
  ├── Account(customer_id, plan="Basic Connectivity", balance=0)
  ├── _issue_token_pair(customer):
  │     create_access_token(subject=customer_id) → HS256 JWT (30 min)
  │     generate_refresh_token() → 32-byte urlsafe random
  │     hash_refresh_token() → SHA-256 hex digest
  │     INSERT refresh_token(customer_id, token_hash, expires_at)
  │     db.commit()
  └── return {access_token, refresh_token, expires_in: 1800}
```

### 3.2 Login

```
POST /api/v1/auth/login
  body: {email, password}
  │
  ├── SELECT customer WHERE email=?
  ├── bcrypt.checkpw(password, hash)
  │     If user not found → dummy hash call (timing attack prevention)
  ├── customer.last_login_at = now()
  └── _issue_token_pair(customer) → {access_token, refresh_token}
```

### 3.3 Session Restore (Frontend Startup)

```
Frontend App.tsx mounts
  │
  └── AuthContext.useEffect()
        localStorage.getItem("refresh_token")
        │
        ├── None → show AuthPage (login/register)
        └── Found → POST /api/v1/auth/refresh
                      If valid → store new tokens → authenticated
                      If expired/revoked → show AuthPage
```

### 3.4 Token Rotation

```
POST /api/v1/auth/refresh
  body: {refresh_token: "raw_opaque_token"}
  │
  ├── SHA-256 hash the raw token
  ├── SELECT refresh_token WHERE token_hash=?
  ├── Validate: not revoked, not expired
  ├── rt.revoked_at = now() → IMMEDIATELY invalidate old token
  ├── db.flush()
  └── _issue_token_pair(customer) → fresh pair
```

---

## 4. Workflow 3: Premium Refund Processing

This is the most complex business-critical workflow with multiple validation gates.

### 4.1 Full Refund Flow

```
Customer: "I want a refund for my premium"
  │
  ├── IntentExtractor → intents: [refund_request], sentiment: frustrated
  │
  ├── Planner → Plan:
  │     Step 1: get_invoice (customer_id: {real_uuid})
  │
  ├── get_invoice → BillingService.get_invoice(customer_id)
  │     SELECT invoice WHERE customer_id=? ORDER BY created_at DESC LIMIT 10
  │     → invoices: [{invoice_id, invoice_number, total_amount, status, ...}]
  │
  ├── Context reassembled with invoice data
  │
  └── Response: "I can help with that. Could you tell me the reason for your refund?"

Customer: "I was charged twice for my health premium"
  │
  ├── IntentExtractor → intents: [billing_dispute, refund_request], entities: {coverage_type: health}
  │
  ├── Planner → Plan:
  │     Step 1: get_invoice_detail (invoice_id: "{first invoice from context}")
  │
  ├── get_invoice_detail → BillingService.get_invoice_detail(invoice_id)
  │     SELECT invoice WHERE invoice_id=? (or invoice_number=?)
  │     → invoice with line_items: [{description, amount, ...}]
  │
  └── Response: "I can see the disputed premium of Rs.12000 on invoice INV-2024-001.
                 I will now raise a refund request for Rs.12000. Shall I proceed?"

Customer: "Yes, please proceed"
  │
  ├── IntentExtractor → intents: [refund_request], entities: {amount: "12000", invoice_id: "INV-2024-001"}
  │
  ├── _check_and_run_workflow():
  │     "refund_request" in intents AND invoice_id present AND amount > 0
  │     PolicyEngine.evaluate_refund(amount=12000, invoice_amount=18000)
  │       amount > REFUND_LIMIT_INR (5000) → authorized=False
  │       → workflow NOT triggered (amount too high for auto-processing)
  │
  ├── Planner → Plan:
  │     Step 1: issue_refund (invoice_id, amount=12000, reason="duplicate_charge")
  │
  ├── PolicyEngine.evaluate_tool_use("issue_refund", customer_verified=True) → authorized
  │
  ├── ToolOrchestrator.execute("issue_refund", params)
  │     BillingService.issue_refund(invoice_id, amount=12000, reason)
  │     │
  │     ├── Fetch invoice + validate invoice belongs to customer
  │     ├── Check: amount ≤ INR 5000? NO (12000 > 5000)
  │     │     → threshold_exceeded = True
  │     │     → RefundRequest.status = "pending_review"
  │     │     → RefundRequest.priority = "high"
  │     │     → auto_processed = False
  │     │     → sla_deadline = now + 48 hours
  │     │
  │     ├── INSERT refund_request (status="pending_review", threshold_exceeded=True)
  │     ├── INSERT billing_alert (severity="high", "Refund request over threshold")
  │     ├── INSERT billing_transaction (type="refund", status="pending")
  │     ├── event_bus → InvoiceUpdatedEvent
  │     └── return {success=False, queued_for_review=True, refund_number="REF-XXXX"}
  │
  ├── _make_summary() → "This refund request requires specialist review. Reference: REF-XXXX"
  │
  └── Response LLM uses STRICT GUARDRAILS:
       "Your refund request has been logged. Reference: REF-XXXX.
        A specialist will review it within 48 hours. Is there anything else I can help with?"
       (NEVER reveals the INR 5000 threshold to the customer)
```

### 4.2 Auto-Approved Refund (amount ≤ INR 5,000)

```
Customer: "I want a refund of Rs.500 for the processing fee"
  │
  ├── BillingService.issue_refund(invoice_id, amount=500, reason="processing_fee")
  │     amount ≤ 5000 → auto_approved = True
  │
  ├── INSERT refund_request(status="approved", auto_processed=True)
  ├── INSERT billing_transaction(type="refund", status="completed")
  ├── UPDATE invoice.amount_paid += 500
  └── return {success=True, refund={refund_number="REF-YYYY", amount=500}}

Response: "Your premium refund of Rs.500 has been processed successfully. Reference: REF-YYYY."
```

---

## 5. Workflow 4: Billing Dispute Investigation

```
Customer: "My invoice looks wrong"
  │
  ├── Intent: billing_dispute, billing_inquiry
  ├── Plan: [get_invoice]
  ├── Tool: get_invoice → returns last 10 invoices
  │
  └── Response: lists invoices with status badges
                "I can see Invoice INV-001 for Rs.12,000 is currently overdue..."

Customer: "Can you show me the line items for INV-001?"
  │
  ├── Intent: billing_inquiry, entities: {invoice_id: "INV-001"}
  ├── Plan: [get_invoice_detail(invoice_id="INV-001")]
  ├── Tool: get_invoice_detail → invoice with full line_items JSON array
  │         line_items: [
  │           {description: "Health Shield Gold Premium", amount: 10000},
  │           {description: "GST (18%)", amount: 1800},
  │           {description: "Processing Fee", amount: 200}
  │         ]
  │
  └── Response: "Invoice INV-001 for Rs.12,000 includes: Health Shield Gold premium 
                 Rs.10,000, GST Rs.1,800, and processing fee Rs.200."

Customer: "The processing fee seems wrong"
  │
  ├── Intent: billing_dispute, refund_request
  ├── Policy: validate claim against line items
  │            Processing fee Rs.200 IS present in line_items → claim supportable
  │
  └── Workflow: refund_workflow triggered (small amount)
                → auto-approved → REF-ZZZZ issued immediately
```

---

## 6. Workflow 5: Surveyor/Inspector Appointment Scheduling

```
Customer: "I need to schedule a home inspection for my claim"
  │
  ├── Intent: surveyor_request, entities: {}
  ├── Plan: [schedule_engineer(customer_id, issue_type="home inspection")]
  │
  ├── ToolOrchestrator → svc_check_availability(date_str=None)
  │     SchedulingService.check_availability()
  │     _generate_dates(14) → next 14 Mon-Sat dates
  │     COUNT appointments per date WHERE date=?
  │     → available_slots: ["09:00", "10:30", "12:00", "13:30", ...]
  │
  ├── _auto_assign_agent(department_category=None)
  │     SELECT agent WHERE is_active=True AND status IN ('available', 'busy')
  │     Sort by current_load ASC
  │     Best agent with capacity → wait_minutes = 0
  │     If all busy → estimate wait = current_load × avg_handle_time
  │
  ├── svc_schedule_engineer(account_number, date, time_slot, issue_description, customer_id)
  │     │
  │     ├── Fetch customer + primary account from DB
  │     ├── Generate appointment_number: APT-{date}-{UUID[:6].upper()}
  │     ├── INSERT appointment:
  │     │     appointment_number = "APT-20240210-A1B2C3"
  │     │     status = "pending"
  │     │     scheduled_at = 2024-02-10T09:00:00+05:30
  │     │     reason = "Home inspection for claim"
  │     │     booked_via = "ai_agent"
  │     │     customer_snapshot = {customer profile JSONB}
  │     │     billing_snapshot = {current invoices JSONB}
  │     │     conversation_transcript = [last 10 turns JSONB]
  │     │     ai_risk_flags = [] (populated by AI analysis)
  │     │
  │     ├── Agent load update: agent.current_load += 1
  │     ├── event_bus → AppointmentUpdatedEvent
  │     └── return {success=True, appointment_id, appointment_number, confirmation_sms}
  │
  └── Response: "I've scheduled your home inspection for February 10th at 9:00 AM.
                 Your appointment reference is APT-20240210-A1B2C3. Is there anything else?"
```

---

## 7. Workflow 6: Human Escalation

Human escalation is triggered in two ways: **implicit** (by the AI's EscalationHandler) or **explicit** (by the planner via `escalate_to_human` tool).

### 7.1 Implicit Escalation (Trigger-Based)

```
After each AI response, EscalationHandler.should_escalate() checks:
  │
  ├── sentiment == "angry" AND turn_count >= 3 → True
  ├── "cancellation_request" in intents AND sentiment in {frustrated, angry} → True
  ├── "complaint" in intents AND turn_count >= 5 → True
  └── not customer_verified AND turn_count >= 4 → True

If True:
  EscalationHandler.escalate(session_id, conversation_id, reason, memory, db)
    │
    ├── handoff_context = {
    │     session_id, sentiment, domain, turn_count, customer_verified,
    │     customer_id, history_summary: [last 6 turns truncated to 200 chars]
    │   }
    │
    ├── INSERT escalation(conversation_id, reason, handoff_context, status="open",
    │                     customer_id, appointment_reference=None)
    │
    └── event_bus → EscalationCreatedEvent → Supervisor dashboard shows new escalation
```

### 7.2 Explicit Escalation (Customer Request or Complex Case)

```
Customer: "I want to speak to a human agent"
  │
  ├── Intent: general_inquiry (or specific complaint)
  ├── Planner: Plan = [escalate_to_human(customer_id, reason, sentiment, ...)]
  │
  ├── Agent.run_turn() injects into step.params:
  │     reason = transcript
  │     sentiment = intent_result.sentiment
  │     session_id = session_id
  │     conversation_id = str(conversation_id)
  │     conversation_history = memory.history[-20:]
  │     customer_profile = customer_profile
  │     customer_context = customer_context
  │
  └── ToolOrchestrator → svc_escalate(...)
        SchedulingService.escalate_to_human_agent()
        │
        ├── Determine wait time: _auto_assign_agent()
        ├── appointment_number: APT-{date}-{UUID[:6].upper()}
        ├── INSERT appointment:
        │     reason = "Human Agent Escalation: <customer reason>"
        │     priority = "high" (if sentiment is angry/frustrated)
        │     channel = "voice_call"
        │     booked_via = "ai_agent"
        │     ai_summary = "AI handoff brief with full context"
        │     customer_snapshot = {customer profile}
        │     conversation_transcript = [last N turns]
        │     ai_risk_flags = ["high_frustration", "billing_dispute"] (derived from context)
        │
        ├── event_bus → AppointmentUpdatedEvent
        └── return {success=True, appointment_number="APT-XXXX", estimated_wait=15}

Response: "I'm connecting you with a claims specialist now.
           Your reference number is APT-20240210-X1Y2Z3.
           The estimated wait time is 15 minutes. Is there anything else?"
```

---

## 8. Workflow 7: RAG Knowledge Retrieval

### 8.1 Knowledge Base Initialization (Startup)

```
Application startup → seed_knowledge_base(db)
  │
  └── RAGSearchEngine.initialize()
        │
        ├── DocumentLoader.load_all()
        │     ├── Load knowledge/policies/*.md (8 markdown files)
        │     │     For each file:
        │     │       Parse H2/H3 sections as chunk boundaries
        │     │       Each section → KBChunk{id, content, domain, section_title, doc_type="section"}
        │     │
        │     └── Load knowledge/faqs/*.json (8 JSON files)
        │           Each FAQ entry → KBChunk{id, Q+A text, domain, doc_type="faq"}
        │           Each scenario → KBChunk{id, scenario text, domain, doc_type="scenario"}
        │
        ├── ChromaVectorStore.initialize()
        │     Connect to .chroma_db/ persistent directory
        │     If chunk_count < document_count → upsert_documents(chunks)
        │       SentenceTransformer.encode(chunk.content) → embedding vector
        │       chromadb_collection.upsert(id, embedding, document, metadata)
        │
        ├── FAISSIndex.build_index(embeddings, ids)
        │     vector_store.get_all_embeddings() → numpy array
        │     faiss.IndexFlatIP(dimension) → build
        │     IDs stored in parallel array for retrieval
        │
        └── RAGCache.initialize() → Redis connection
```

### 8.2 Runtime Knowledge Search

```
Customer: "What does my motor comprehensive policy cover for zero depreciation?"
  │
  ├── Intent: coverage_inquiry, entities: {coverage_type: motor}
  │
  ├── If plan requires knowledge lookup:
  │     RAGManager.retrieve(query="zero depreciation motor insurance coverage",
  │                          query_embedding=..., db, conversation_id, top_k=3)
  │       │
  │       └── rag_engine.search(query, top_k=3, domain="motor_insurance")
  │             │
  │             ├── RAGCache.get(query, domain) → cache hit? Return cached results
  │             │
  │             ├── ChromaVectorStore.search(query, top_k=6, domain_filter="motor_insurance")
  │             │     embed query → cosine similarity search in ChromaDB
  │             │     → [{id, content, metadata, score}] (over-fetch 2x for RRF)
  │             │
  │             ├── FAISSIndex.search(query_embedding, top_k=6)
  │             │     approximate nearest neighbor search
  │             │     filter by domain if specified
  │             │     → [(doc_id, score)]
  │             │
  │             ├── _reciprocal_rank_fusion(chroma_results, faiss_results)
  │             │     For each doc in each list:
  │             │       rrf_score += 1 / (60 + rank + 1)
  │             │     Sort by rrf_score desc → top 3
  │             │
  │             ├── RAGCache.set(query, results, domain) → store in Redis
  │             │
  │             └── Return List[RAGSearchResult]
  │
  ├── Convert to RetrievedPassage objects
  ├── Log KnowledgeRetrieval rows to PostgreSQL
  └── Inject into context block as [KNOWLEDGE BASE] section
```

---

## 9. Workflow 8: Customer Profile Update

```
Customer: "Can you update my email to newemail@gmail.com?"
  │
  ├── Intent: account_inquiry (update variant)
  ├── Entities: {email: "newemail@gmail.com"}
  │
  ├── Planner → Plan:
  │     Step 1: update_customer_details(customer_id="{uuid}", email="newemail@gmail.com")
  │
  ├── PolicyEngine.evaluate_tool_use("update_customer_details", verified=True) → authorized
  │
  ├── ToolOrchestrator → CRMService.update_customer(customer_id, {email: "newemail@gmail.com"})
  │     │
  │     ├── SELECT customer WHERE customer_id=?
  │     ├── customer.email = "newemail@gmail.com"
  │     ├── customer.updated_at = now()
  │     ├── db.commit()
  │     ├── db.refresh(customer)
  │     ├── event_bus → CustomerUpdatedEvent(customer_id=str(customer_id))
  │     └── return {success=True, customer: {updated profile dict}, message}
  │
  ├── Agent.run_turn() sees update_customer_details result with success=True:
  │     customer_profile.update(returned_profile)
  │     await self._memory.set_field(session_id, "customer_profile", customer_profile)
  │     → In-memory profile synced with DB value for rest of session
  │
  └── Response: "Your email has been updated successfully to newemail@gmail.com.
                 Is there anything else I can help with?"
```

---

## 10. Workflow 9: Session TTL Enforcement

```
Background Task: _ttl_loop() (started at application startup)
  │
  Every 60 seconds:
    async with async_session_factory() as db:
      expire_idle_sessions(db)
      │
      ├── SELECT conversation WHERE status='active'
      │           AND started_at < (now - 30 minutes)
      │           AND no message in last 30 minutes
      │
      ├── For each expired conversation:
      │     conversation.status = "ended"
      │     conversation.ended_at = now()
      │
      └── Return {expired: N, sessions: [session_ids]}

If expired > 0:
  logger.info("TTL Enforcer expired %d idle sessions", N)
```

---

## 11. Workflow 10: Supervisor Real-Time Monitoring

```
Supervisor opens browser → /supervisor path
  │
  ├── SupervisorNav renders (Dashboard | Policy Holders | Premium & Claims | Scheduling)
  │
  └── CommandCenter Dashboard mounts
        │
        ├── WebSocket connect: /events/stream
        │     ConnectionManager._supervisor_connections.append(websocket)
        │     All future events from ALL sessions → delivered here
        │
        ├── GET /api/v1/analytics/dashboard
        │     → total_conversations, active_conversations
        │     → containment_rate, escalation_rate
        │     → sentiment_distribution, top_tools
        │
        ├── GET /api/v1/analytics/conversations?limit=500
        │     → paginated conversation list with customer names, message counts, timestamps
        │
        └── Real-time WebSocket events (from any active call):
              transcript.partial → live transcript feed
              intent.detected → intent badges update
              sentiment.updated → sentiment gauge changes
              tool.started / tool.completed → tool execution timeline
              policy.decision → policy gates shown
              workflow.step → multi-step progress bars
              response.generated → agent response appears
              escalation.created → escalation queue updates
              call.summary → summary panel appears
```

### Supervisor Event Flow for an Active Call

```
Time 0s:  session.created → conversation card appears on supervisor dashboard
Time 2s:  transcript.partial → "I want to..." typed character by character
Time 3s:  transcript.final → "I want to check my invoice"
Time 3.1s: intent.detected → badges: [billing_inquiry] | sentiment: neutral
Time 3.2s: sentiment.updated → sentiment gauge: neutral (green)
Time 3.3s: tool.started → "get_invoice" tool badge appears (spinning)
Time 3.6s: tool.completed → tool badge turns green, duration: 312ms
Time 4.0s: response.generated → agent response shown in transcript
Time 12s:  transcript.final → "I want a refund of Rs.5000"
Time 12.1s: intent.detected → [billing_dispute, refund_request] | sentiment: frustrated
Time 12.2s: sentiment.updated → sentiment gauge: frustrated (amber)
Time 12.3s: tool.started → "issue_refund"
Time 12.9s: tool.completed → "Refund REF-001 approved for Rs.5000"
Time 45s:  session.ended → conversation card updates to "ended"
Time 46s:  call.summary → summary panel: "Customer Rajesh Kumar called regarding a billing
                           dispute. Premium refund of Rs.5,000 was processed. Resolution: resolved."
```

---

## 12. Workflow 11: Policy-Holder Self-Service (Customer Portal)

```
Customer visits https://app.insureai.com (/)
  │
  ├── AuthContext.useEffect() → check localStorage for refresh_token
  │     Found → POST /auth/refresh → restore session
  │     Not found → render AuthPage
  │
  ├── AuthPage renders login/register form
  │     POST /auth/login → {access_token, refresh_token}
  │     Store tokens in localStorage
  │     Set auth state: isAuthenticated=true, customer profile loaded
  │
  └── VoiceInterface renders
        │
        ├── Customer context pre-loaded (from /auth/me)
        │     customer_profile stored in Auth context
        │     Passed to session creation API
        │
        ├── Customer clicks "Connect" button
        │     POST /api/v1/conversations/sessions
        │       → INSERT conversation (session_id=uuid4, customer_id, status=active)
        │       → MemoryManager: store customer_profile in Redis session state
        │       → customer_verified = True (JWT already validated identity)
        │       → Return {session_id, conversation_id}
        │
        ├── Browser requests microphone permission
        ├── AudioContext created (16kHz sample rate)
        ├── WebSocket: /sessions/{session_id}/audio
        ├── WebSocket: /sessions/{session_id}/events
        │
        └── Conversation begins — voice pipeline active
```

---

## 13. Workflow 12: Claim Status Check

```
Customer: "What's the status of my refund request REF-2024-001?"
  │
  ├── Intent: claim_status, entities: {reference_number: "REF-2024-001"}
  │
  ├── Planner → Plan:
  │     Step 1: get_claim_status(customer_id, reference_number="REF-2024-001")
  │
  └── BillingService.get_claim_status(reference_number, customer_id)
        │
        ├── SELECT refund_request WHERE refund_number=? AND customer_id=?
        │
        ├── Found → return {
        │     found: True,
        │     reference: "REF-2024-001",
        │     status: "pending_review",
        │     amount: 12000,
        │     requested_at: "2024-01-15T10:30:00",
        │     sla_deadline: "2024-01-17T10:30:00",
        │     message: "Refund request is under specialist review. SLA: 48 hours."
        │   }
        │
        └── Not found → {found: False, message: "No claim found with reference REF-2024-001"}

Response: "Your refund request REF-2024-001 for Rs.12,000 is currently under specialist
           review. You should hear from us by January 17th. Is there anything else?"
```

---

## 14. Data Persistence Summary

### Per Conversation (every voice/chat session)

| Data | Storage | Timing |
|------|---------|--------|
| Session state | Redis | Every turn (immediate) |
| Conversation turns (history) | Redis | Every turn (immediate) |
| Conversation record | PostgreSQL | Session start |
| Each message (role + content) | PostgreSQL | After finalization |
| Intent extraction results | PostgreSQL | After each turn |
| Tool execution log | PostgreSQL | After each tool (async) |
| Policy decisions | PostgreSQL | If policy evaluated |
| Workflow execution records | PostgreSQL | Per workflow run |
| Knowledge retrieval log | PostgreSQL | Per RAG search |
| Call summary | PostgreSQL | Session end |
| Escalation record | PostgreSQL | If escalation triggered |

### Business Action Data (persisted immediately)

| Action | Table | Fields |
|--------|-------|--------|
| Refund approved | `refund_request`, `billing_transaction` | Amounts, status, reference |
| Refund queued | `refund_request`, `billing_alert` | Threshold flag, SLA deadline |
| Appointment booked | `appointment` | Full AI briefing snapshot |
| Customer updated | `customer` | Updated fields + timestamp |
| Invoice payment | `billing_transaction`, `invoice` | Payment method, amounts |

---

*Report compiled from full source code analysis of Command Center 3.0 — September 2026*
