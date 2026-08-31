"""
seed_demo.py — Seeds 3 complete demo scenarios into the database.

Scenarios:
  1. Technical Issue — Router down, outage check, engineer scheduled
  2. Billing Dispute + Refund — Extra charge, invoice lookup, refund issued
  3. Cancellation Request — Retention attempt, escalation triggered
"""
import asyncio
import sys
import uuid
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "backend")

from dotenv import load_dotenv
load_dotenv("backend/.env")

from app.database.session import async_session_factory
from app.models.conversation import Conversation, Message, Intent
from app.models.execution import ToolExecution, WorkflowExecution
from app.models.summary import CallSummary, Escalation


def utc_now(offset_sec: int = 0):
    return datetime.now(timezone.utc) + timedelta(seconds=offset_sec)


SCENARIOS = [
    {
        "name": "Technical Issue — Router + Engineer",
        "session_id": f"demo-tech-{uuid.uuid4().hex[:8]}",
        "channel": "voice",
        "sentiment": "frustrated",
        "status": "completed",
        "duration": 187,
        "messages": [
            ("customer", "My router has been flashing red for two hours and I have no internet.", 0),
            ("agent",    "I'm sorry to hear that, let me check if there's an outage in your area right away.", 0),
            ("customer", "It's been going on since the morning. My account number is ACC-2024-003.", 1),
            ("agent",    "I can see there's a localised outage in your area that our team is actively working on. I'll also create a support ticket and schedule a field engineer visit for you tomorrow.", 1),
            ("customer", "Okay, what time will the engineer come?", 2),
            ("agent",    "The engineer is confirmed for tomorrow between 10:00–12:00. You'll receive an SMS confirmation shortly. Your ticket number is TKT-78234.", 2),
        ],
        "intents": ["technical_issue", "check_outage", "schedule_engineer"],
        "tools": [
            ("check_outage",      {"area_code": "MUM-400001"},               {"has_outage": True, "outage_id": "OUT-2024-221", "eta": "4 hours"},        "success", 312),
            ("get_customer",      {"account_number": "ACC-2024-003"},         {"found": True, "customer": {"name": "Priya Iyer", "customer_id": "c003"}}, "success", 180),
            ("create_ticket",     {"customer_id": "c003", "issue_type": "router_issue", "priority": "high"}, {"success": True, "ticket_id": "TKT-78234"}, "success", 220),
            ("schedule_engineer", {"account_number": "ACC-2024-003", "preferred_date": "2026-08-22"},        {"success": True, "slot": "10:00"},           "success", 410),
        ],
        "workflow": ("technical_support", ["check_outage", "remote_diagnostics", "create_ticket", "schedule_engineer"]),
        "summary": ("Customer Priya Iyer reported a router outage. An active network outage was confirmed for her area with an ETA of 4 hours. A field engineer was scheduled for the following day at 10:00.", "resolved", False),
    },
    {
        "name": "Billing Dispute + Refund",
        "session_id": f"demo-billing-{uuid.uuid4().hex[:8]}",
        "channel": "web",
        "sentiment": "frustrated",
        "status": "completed",
        "duration": 243,
        "messages": [
            ("customer", "I was charged 350 rupees extra on my last invoice. I never agreed to this.", 0),
            ("agent",    "I completely understand your frustration. Let me pull up your recent invoices now.", 0),
            ("customer", "My account is ACC-2024-001. Invoice from January 2026.", 1),
            ("agent",    "I can see invoice INV-2024-101 with an additional charge of ₹350 for a plan add-on. Since this appears to have been applied in error, I'll process a full refund for you.", 1),
            ("customer", "Thank you. How long will it take?", 2),
            ("agent",    "The refund of ₹350 will reflect in your account within 2 billing cycles. Your refund reference is REF-44892.", 2),
        ],
        "intents": ["billing_dispute", "refund_request"],
        "tools": [
            ("get_customer",      {"account_number": "ACC-2024-001"},         {"found": True, "customer": {"name": "Rahul Sharma", "customer_id": "c001"}}, "success", 190),
            ("get_invoice",       {"customer_id": "c001"},                    {"found": True, "count": 3, "invoices": [{"invoice_id": "INV-2024-101", "amount": 1350}]}, "success", 210),
            ("get_invoice_detail",{"invoice_id": "INV-2024-101"},             {"found": True, "invoice": {"invoice_id": "INV-2024-101", "amount": 1350, "status": "disputed"}}, "success", 165),
            ("issue_refund",      {"invoice_id": "INV-2024-101", "amount": 350, "reason": "Incorrect add-on charge"}, {"success": True, "refund_id": "REF-44892", "amount": 350}, "success", 380),
        ],
        "workflow": ("refund_workflow", ["verify_invoice", "policy_check", "process_refund", "notify_customer"]),
        "summary": ("Customer Rahul Sharma disputed an extra charge of ₹350 on invoice INV-2024-101. The charge was confirmed as an erroneous add-on. A full refund of ₹350 was processed with reference REF-44892.", "resolved", False),
    },
    {
        "name": "Cancellation Request — Retention + Escalation",
        "session_id": f"demo-cancel-{uuid.uuid4().hex[:8]}",
        "channel": "voice",
        "sentiment": "angry",
        "status": "escalated",
        "duration": 312,
        "messages": [
            ("customer", "I want to cancel my plan. Your service has been terrible and I'm fed up.", 0),
            ("agent",    "I'm truly sorry to hear you're unhappy. May I ask what specific issue has led to this decision?", 0),
            ("customer", "The network drops every single day. I've complained three times and nothing was fixed.", 1),
            ("agent",    "I understand, and I apologise for the repeated inconvenience. I'd like to offer you a plan upgrade at no extra cost and a month's credit as a gesture of goodwill.", 1),
            ("customer", "No, I don't want that. I've made up my mind. Cancel my plan now.", 2),
            ("agent",    "I hear you. I'm going to connect you with our customer retention specialist who will handle the cancellation process and ensure a smooth experience for you.", 2),
        ],
        "intents": ["cancellation_request", "complaint"],
        "tools": [
            ("get_customer", {"account_number": "ACC-2024-002"},         {"found": True, "customer": {"name": "Arjun Mehta", "customer_id": "c002"}}, "success", 175),
            ("get_account",  {"customer_id": "c002"},                    {"found": True, "account": {"status": "active", "plan": "Premium 5G", "contract_end": "2027-03"}}, "success", 210),
        ],
        "workflow": ("cancellation_workflow", ["verify_account", "check_contract", "retention_attempt"]),
        "summary": ("Customer Arjun Mehta called to cancel his Premium 5G plan due to repeated network issues. Retention offers were declined. The call was escalated to the human retention team for manual processing.", "escalated", True),
        "escalation": ("Cancellation request with negative sentiment — human agent recommended", {"domain": "cancellation", "sentiment": "angry", "turn_count": 3}),
    },
]


async def seed():
    async with async_session_factory() as db:
        for scenario in SCENARIOS:
            print(f"\n[+] Seeding: {scenario['name']}")

            conv_id = uuid.uuid4()
            started = utc_now(-scenario["duration"])
            ended = utc_now()

            conv = Conversation(
                conversation_id=conv_id,
                session_id=scenario["session_id"],
                channel=scenario["channel"],
                status=scenario["status"],
                sentiment=scenario["sentiment"],
                started_at=started,
                ended_at=ended,
                language="en",
            )
            db.add(conv)
            await db.flush()

            for i, (role, content, turn_index) in enumerate(scenario["messages"]):
                msg = Message(
                    conversation_id=conv_id,
                    role=role,
                    content=content,
                    turn_index=turn_index,
                    timestamp=started + timedelta(seconds=i * 25),
                )
                db.add(msg)

            intent = Intent(
                conversation_id=conv_id,
                detected_intents=scenario["intents"],
                entities={"channel": scenario["channel"]},
                sentiment=scenario["sentiment"],
                urgency="high" if scenario["sentiment"] == "angry" else "medium",
                confidence=0.91,
            )
            db.add(intent)

            for i, (tool_name, in_params, output, status, dur) in enumerate(scenario["tools"]):
                te = ToolExecution(
                    conversation_id=conv_id,
                    tool_name=tool_name,
                    input_params=in_params,
                    output=output,
                    status=status,
                    duration_ms=dur,
                    timestamp=started + timedelta(seconds=30 + i * 20),
                )
                db.add(te)

            wf_name, wf_steps = scenario["workflow"]
            wf = WorkflowExecution(
                conversation_id=conv_id,
                workflow_name=wf_name,
                state="completed",
                steps_completed=wf_steps,
                started_at=started + timedelta(seconds=40),
                completed_at=started + timedelta(seconds=scenario["duration"] - 20),
            )
            db.add(wf)

            summary_text, resolution, escalated = scenario["summary"]
            cs = CallSummary(
                conversation_id=conv_id,
                summary_text=summary_text,
                resolution=resolution,
                escalated=escalated,
                duration_sec=scenario["duration"],
                tools_used=[t[0] for t in scenario["tools"]],
            )
            db.add(cs)

            if "escalation" in scenario:
                esc_reason, esc_ctx = scenario["escalation"]
                esc = Escalation(
                    conversation_id=conv_id,
                    reason=esc_reason,
                    handoff_context={
                        **esc_ctx,
                        "session_id": scenario["session_id"],
                        "history_summary": [
                            {"role": r, "content": c[:200]} for r, c, _ in scenario["messages"][-4:]
                        ],
                    },
                )
                db.add(esc)

            await db.commit()
            print(f"  [OK] {scenario['name']} seeded -- conversation_id={conv_id}")

    print("\n[OK] All 3 demo scenarios seeded successfully")


if __name__ == "__main__":
    asyncio.run(seed())
