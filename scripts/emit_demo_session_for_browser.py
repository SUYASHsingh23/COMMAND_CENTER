"""
Emits a complete multi-turn demo session over the running backend WebSocket bus
for live Supervisor UI testing.
"""
import asyncio
import json
import uuid
import websockets

BACKEND_WS_URL = "ws://127.0.0.1:8000/events/stream"

async def emit_demo():
    sid = "demo-session-live-001"
    cid = "demo-conv-live-001"
    
    print(f"Connecting to {BACKEND_WS_URL}...")
    # Connect directly to backend FastAPI WebSocket
    # We will send events to the manager or use event_bus inside backend
    from app.observability.bus import event_bus
    from app.api.websocket.events import (
        SessionCreatedEvent, TranscriptPartialEvent, TranscriptFinalEvent,
        IntentDetectedEvent, ToolStartedEvent, ToolCompletedEvent,
        RagRetrievedEvent, PolicyDecisionEvent, WorkflowStepEvent,
        ResponseGeneratedEvent, SentimentUpdatedEvent
    )

    print("Emitting rich demo events...")
    await event_bus.emit(sid, SessionCreatedEvent(session_id=sid, conversation_id=cid, channel="web"))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, TranscriptFinalEvent(session_id=sid, text="Hello, my name is Rahul Sharma and my account number is ACC-2024-001. I want to check my invoice charges.", turn_index=0))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, IntentDetectedEvent(session_id=sid, intents=["billing_inquiry", "invoice_check"], entities={"account": "ACC-2024-001", "name": "Rahul Sharma"}, sentiment="neutral", urgency="medium", confidence=0.96))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, ToolStartedEvent(session_id=sid, tool_name="get_customer", input_params={"account_number": "ACC-2024-001"}))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, ToolCompletedEvent(session_id=sid, tool_name="get_customer", status="success", output={"customer": {"name": "Rahul Sharma", "plan": "ConnectPlus Fiber 200", "account_number": "ACC-2024-001"}}, duration_ms=42))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, ToolStartedEvent(session_id=sid, tool_name="get_invoice", input_params={"customer_id": "c001"}))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, ToolCompletedEvent(session_id=sid, tool_name="get_invoice", status="success", output={"invoices": [{"invoice_id": "INV-2024-001-01", "amount": 1350.0, "status": "paid"}]}, duration_ms=56))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, RagRetrievedEvent(session_id=sid, query="invoice charges billing breakdown", passages=[{"title": "Broadband Billing FAQ", "score": 0.91, "category": "billing"}, {"title": "Router Rental Fee Policy", "score": 0.85, "category": "billing"}], doc_count=2))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, PolicyDecisionEvent(session_id=sid, policy_name="customer_verification", action_proposed="retrieve_invoice_details", authorized=True, reason="Customer profile verified successfully"))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, WorkflowStepEvent(session_id=sid, workflow_name="billing_inquiry_workflow", step_name="fetch_invoices", step_status="completed", steps_completed=["verify_identity", "fetch_invoices"]))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, ResponseGeneratedEvent(session_id=sid, text="Hello Rahul! I see your invoice INV-2024-001-01 for ₹1,350 which includes your base Fiber 200 plan and a ₹150 router rental."))
    await asyncio.sleep(0.3)
    
    await event_bus.emit(sid, SentimentUpdatedEvent(session_id=sid, sentiment="positive", urgency="low"))
    print("Demo session emitted successfully!")

if __name__ == "__main__":
    asyncio.run(emit_demo())
