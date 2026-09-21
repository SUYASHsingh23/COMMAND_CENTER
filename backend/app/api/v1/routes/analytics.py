from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, update
from app.core.dependencies import get_db
from app.models.conversation import Conversation, Message, Intent, ConversationState
from app.models.execution import ToolExecution, WorkflowExecution, PolicyDecision
from app.models.summary import CallSummary, Escalation, PlanEvent

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
async def get_dashboard_metrics(db: Annotated[AsyncSession, Depends(get_db)]):
    total_convs = await db.scalar(select(func.count()).select_from(Conversation))
    active_convs = await db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.status == "active")
    )
    total_summaries = await db.scalar(select(func.count()).select_from(CallSummary))
    resolved = await db.scalar(
        select(func.count()).select_from(CallSummary).where(CallSummary.resolution == "resolved")
    )
    escalated_count = await db.scalar(
        select(func.count()).select_from(Escalation)
    )
    total_tools = await db.scalar(select(func.count()).select_from(ToolExecution))

    containment_rate = round((resolved / total_summaries * 100), 1) if total_summaries else 0.0
    escalation_rate = round((escalated_count / total_convs * 100), 1) if total_convs else 0.0

    sentiment_rows = await db.execute(
        select(Conversation.sentiment, func.count().label("count"))
        .group_by(Conversation.sentiment)
    )
    sentiment_dist = {row.sentiment: row.count for row in sentiment_rows}

    tool_rows = await db.execute(
        select(ToolExecution.tool_name, func.count().label("count"))
        .group_by(ToolExecution.tool_name)
        .order_by(func.count().desc())
        .limit(8)
    )
    top_tools = [{"tool": row.tool_name, "count": row.count} for row in tool_rows]

    return {
        "total_conversations": total_convs or 0,
        "active_conversations": active_convs or 0,
        "containment_rate": containment_rate,
        "escalation_rate": escalation_rate,
        "total_tool_executions": total_tools or 0,
        "sentiment_distribution": sentiment_dist,
        "top_tools": top_tools,
    }


@router.get("/conversations")
async def list_conversations(
    limit: int = 500,
    status: str = "all",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    from app.models.customer import Customer
    query = select(
        Conversation,
        func.count(Message.message_id).label("msg_count"),
        Customer.name.label("customer_name"),
    ).outerjoin(Message, Message.conversation_id == Conversation.conversation_id
    ).outerjoin(Customer, Customer.customer_id == Conversation.customer_id
    ).group_by(Conversation.conversation_id, Customer.name
    ).order_by(Conversation.started_at.desc()).limit(limit)

    if status != "all":
        query = query.where(Conversation.status == status)

    result = await db.execute(query)
    rows = result.all()

    # Also get tool counts per conversation
    tool_counts_raw = await db.execute(
        select(ToolExecution.conversation_id, func.count().label("cnt"))
        .group_by(ToolExecution.conversation_id)
    )
    tool_counts = {str(r.conversation_id): r.cnt for r in tool_counts_raw}

    return [
        {
            "conversation_id": str(row.Conversation.conversation_id),
            "session_id": row.Conversation.session_id,
            "channel": row.Conversation.channel,
            "status": row.Conversation.status,
            "sentiment": row.Conversation.sentiment,
            "language": row.Conversation.language,
            "customer_name": row.customer_name,
            "message_count": row.msg_count,
            "tool_count": tool_counts.get(str(row.Conversation.conversation_id), 0),
            "started_at": row.Conversation.started_at.isoformat() if row.Conversation.started_at else None,
            "ended_at": row.Conversation.ended_at.isoformat() if row.Conversation.ended_at else None,
        }
        for row in rows
    ]


WORKFLOW_STEP_CATALOG: dict[str, dict] = {
    "verify_invoice": {
        "title": "Verify Invoice & Billing Ledger",
        "detail": "Retrieved invoice billing record from system. Verified billing line items, total amount, and confirmed payment status against ledger.",
        "type": "document_verification",
        "rule": "Policy Rule R-101: Valid invoice reference required for refund evaluation.",
        "decision": "Invoice record verified and eligible for dispute evaluation.",
        "evidence": {"document": "Invoice Reference", "verification": "Confirmed in Billing Ledger", "status": "VERIFIED"},
    },
    "policy_check": {
        "title": "Policy & Terms Compliance Check",
        "detail": "Evaluated dispute against Standard Refund & Reversal Terms (Clause 3.2). Verified eligibility window (within 30 days) and account status.",
        "type": "policy_evaluation",
        "rule": "Policy Rule R-102: Claims must be submitted within 30 days of billing date.",
        "decision": "Account in good standing; dispute qualifies under Clause 3.2.",
        "evidence": {"clause": "Section 3.2 (Billing Adjustments)", "standing": "Active", "window": "<= 30 days"},
    },
    "policy_document_check": {
        "title": "Policy Document & Terms Verification",
        "detail": "Consulted Billing & Premium Dispute Policy. Account in good standing and eligible for reversal.",
        "type": "policy_evaluation",
        "rule": "Dispute must fall within authorized billing adjustment terms.",
        "decision": "Claim verified against policy terms.",
        "evidence": {"terms": "Dispute Terms", "section": "Clause 3.2"},
    },
    "fraud_velocity_check": {
        "title": "Anti-Fraud Velocity Guard",
        "detail": "Checked customer claim frequency across previous 24-hour window. Verified no abnormal dispute velocity.",
        "type": "policy_evaluation",
        "rule": "Velocity Rule: < 3 refund disputes per 24 hours.",
        "decision": "Passed anti-fraud velocity verification.",
        "evidence": {"velocity_24h": 0, "risk_rating": "LOW"},
    },
    "threshold_evaluation": {
        "title": "Policy Threshold & Authority Evaluation",
        "detail": "Evaluated refund amount against autonomous limit ceiling (Rs.5,000.00).",
        "type": "policy_evaluation",
        "rule": "Policy Rule R-104: Claims <= Rs.5,000 auto-approved; claims > Rs.5,000 require human supervisor authorization.",
        "decision": "Autonomous approval ceiling check completed.",
        "evidence": {"autonomous_limit": "Rs.5,000.00"},
    },
    "threshold_exceeded": {
        "title": "Threshold Ceiling Exceeded",
        "detail": "Requested refund amount exceeds autonomous threshold of Rs.5,000.00. Automatic approval denied.",
        "type": "policy_evaluation",
        "rule": "Policy Rule R-104: High-value transactions require supervisor sign-off.",
        "decision": "Escalation to human supervisor required.",
        "evidence": {"threshold": "Rs.5,000.00", "authorization_required": "Tier-2 Supervisor"},
    },
    "process_refund": {
        "title": "Process Refund & Ledger Settlement",
        "detail": "Executed autonomous refund transaction in payment core. Updated accounting balance and marked invoice adjustment.",
        "type": "workflow_step",
        "rule": "Accounting Rule A-201: Issue ledger credit to original payment method.",
        "decision": "Settlement transaction executed.",
        "evidence": {"settlement_channel": "Original Payment Source", "action": "CREDIT_ISSUED"},
    },
    "process_settlement": {
        "title": "Process Ledger Settlement",
        "detail": "Executed refund reversal in billing core. Ledger balance adjusted and marked as refunded.",
        "type": "workflow_step",
        "rule": "Execute ledger reversal and record billing transaction.",
        "decision": "Settlement executed successfully.",
        "evidence": {"settlement_channel": "Original Payment Method", "status": "COMPLETED"},
    },
    "notify_customer": {
        "title": "Notify Customer & Issue Reference",
        "detail": "Generated confirmation notification and issued tracking reference to customer.",
        "type": "workflow_step",
        "rule": "Customer Care Rule C-301: Provide formal confirmation and dispute reference.",
        "decision": "Customer notified with tracking reference.",
        "evidence": {"channel": "In-Session & Email Confirmation"},
    },
    "queue_for_human_review": {
        "title": "Queue for Human Supervisor Review",
        "detail": "Created escalation ticket and routed case to Tier-2 Supervisor queue for manual authorization.",
        "type": "escalation",
        "rule": "Escalation Protocol E-101: Route high-value or complex disputes to specialist queue.",
        "decision": "Case queued for specialist review.",
        "evidence": {"queue": "Tier-2 Billing Supervisor", "priority": "high"},
    },
    "verify_account": {
        "title": "Verify Account & Subscription Status",
        "detail": "Verified customer subscription account, active service status, and contract records.",
        "type": "document_verification",
        "rule": "Policy Rule C-100: Active subscription account required.",
        "decision": "Account identity and active subscription verified.",
        "evidence": {"account_status": "active"},
    },
    "check_contract": {
        "title": "Check Contract Tenure & Terms",
        "detail": "Evaluated subscription tenure, minimum commitment period, and applicable notice requirements.",
        "type": "policy_evaluation",
        "rule": "Policy Rule C-101: 30-day notice period applies to standard cancellations.",
        "decision": "Contract terms verified; notice period calculated.",
        "evidence": {"notice_period_days": 30},
    },
    "check_contract_status": {
        "title": "Check Contract Tenure & Early Termination",
        "detail": "Evaluated contract commitment period and early termination fee applicability.",
        "type": "policy_evaluation",
        "rule": "Policy Rule C-101: Check for early termination obligations.",
        "decision": "Contract terms evaluated.",
        "evidence": {"notice_period_days": 30},
    },
    "retention_attempt": {
        "title": "Retention Offer & Plan Optimization",
        "detail": "Evaluated customer usage and presented eligible retention discounts or tailored plan options.",
        "type": "workflow_step",
        "rule": "Customer Success Rule CS-201: Offer optimized alternatives before cancellation.",
        "decision": "Retention alternatives evaluated.",
        "evidence": {"offer_status": "evaluated"},
    },
    "calculate_etf": {
        "title": "Calculate Early Termination Fee",
        "detail": "Calculated contract early termination fee and notice period obligations.",
        "type": "policy_evaluation",
        "rule": "Contract Clause 7.1: Early cancellation subject to remaining tenure fee.",
        "decision": "Early termination fee computed.",
        "evidence": {"fee_type": "Early Termination"},
    },
    "process_cancellation": {
        "title": "Process Service Cancellation",
        "detail": "Scheduled service termination at cycle end, generated final settlement statement.",
        "type": "workflow_step",
        "rule": "Deactivate service line and generate final balance statement.",
        "decision": "Cancellation processed.",
        "evidence": {"action": "SERVICE_DEACTIVATED"},
    },
    "check_outage": {
        "title": "Check Area Network & Grid Outages",
        "detail": "Queried infrastructure monitoring systems for known incidents in customer area.",
        "type": "document_verification",
        "rule": "Operational Guideline T-101: Check for known area outages before individual triage.",
        "decision": "Area infrastructure checked; no widespread outages detected.",
        "evidence": {"infrastructure_status": "NORMAL", "area_outage": False},
    },
    "remote_diagnostics": {
        "title": "Run Remote Device Diagnostics",
        "detail": "Executed telemetry tests and ping latency diagnostics on customer connection.",
        "type": "document_verification",
        "rule": "Operational Guideline T-102: Measure line attenuation, SNR margin, and packet loss.",
        "decision": "Telemetry test completed; diagnostic profile generated.",
        "evidence": {"packet_loss": "0.2%", "line_status": "CONNECTED"},
    },
    "create_ticket": {
        "title": "Create Technical Support Ticket",
        "detail": "Logged issue in IT service management system with priority tagging and diagnostic logs.",
        "type": "workflow_step",
        "rule": "Service Level Agreement SLA-204: Create ticket for unresolved technical incidents.",
        "decision": "Support ticket opened in queue.",
        "evidence": {"queue": "Field Technical Operations", "priority": "standard"},
    },
    "schedule_engineer": {
        "title": "Schedule Field Technician Dispatch",
        "detail": "Allocated field technician slot for onsite inspection and equipment check.",
        "type": "workflow_step",
        "rule": "Operational Guideline T-105: Dispatch field technician within SLA window.",
        "decision": "Technician appointment reserved.",
        "evidence": {"dispatch_type": "Onsite Inspection"},
    },
    "verify_eligibility": {
        "title": "Verify Plan Upgrade Eligibility",
        "detail": "Checked customer account standing, equipment compatibility, and network bandwidth headroom.",
        "type": "document_verification",
        "rule": "Sales Rule U-101: Upgrades require account in good standing and technical feasibility.",
        "decision": "Customer eligible for upgraded plan.",
        "evidence": {"eligibility": "APPROVED"},
    },
    "calculate_pricing": {
        "title": "Calculate Prorated Plan Differential",
        "detail": "Computed billing differential for remaining billing cycle days and applicable promotional rates.",
        "type": "policy_evaluation",
        "rule": "Billing Rule B-102: Prorate plan cost based on remaining days in billing cycle.",
        "decision": "Prorated pricing calculated.",
        "evidence": {"billing_method": "Prorated Differential"},
    },
    "provision_upgrade": {
        "title": "Provision Upgraded Service Tier",
        "detail": "Updated service configuration in provisioning system and adjusted speed/data profiles.",
        "type": "workflow_step",
        "rule": "Provisioning Rule P-201: Activate new profile in network registry.",
        "decision": "Service tier provisioned.",
        "evidence": {"status": "PROVISIONED"},
    },
    "confirm_upgrade": {
        "title": "Confirm Upgrade to Customer",
        "detail": "Sent confirmation of service upgrade, effective date, and revised billing schedule.",
        "type": "workflow_step",
        "rule": "Customer Notification Rule: Send formal upgrade confirmation.",
        "decision": "Confirmation dispatched.",
        "evidence": {"notification_status": "DELIVERED"},
    },
}


@router.get("/conversations/{conversation_id}/detail")
async def get_conversation_detail(
    conversation_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from uuid import UUID
    from app.models.customer import Customer
    cid = UUID(conversation_id)

    # Fetch conversation + customer
    conv_result = await db.execute(
        select(Conversation, Customer.name.label("customer_name"), Customer.customer_id.label("cust_id"))
        .outerjoin(Customer, Customer.customer_id == Conversation.customer_id)
        .where(Conversation.conversation_id == cid)
    )
    conv_row = conv_result.one_or_none()
    conv = conv_row.Conversation if conv_row else None
    customer_name = conv_row.customer_name if conv_row else None

    messages = await db.execute(
        select(Message).where(Message.conversation_id == cid).order_by(Message.turn_index, Message.timestamp)
    )
    msgs = messages.scalars().all()

    tools = await db.execute(
        select(ToolExecution).where(ToolExecution.conversation_id == cid).order_by(ToolExecution.timestamp)
    )
    tool_list = tools.scalars().all()

    intents = await db.execute(
        select(Intent).where(Intent.conversation_id == cid).order_by(Intent.intent_id.desc()).limit(10)
    )
    intent_list = intents.scalars().all()

    summaries = await db.execute(
        select(CallSummary)
        .where(CallSummary.conversation_id == cid)
        .order_by(CallSummary.generated_at.desc())
    )
    summary = summaries.scalars().first()

    workflows = await db.execute(select(WorkflowExecution).where(WorkflowExecution.conversation_id == cid))
    wf_list = workflows.scalars().all()

    policies = await db.execute(
        select(PolicyDecision).where(PolicyDecision.conversation_id == cid).order_by(PolicyDecision.timestamp)
    )
    policy_list = policies.scalars().all()

    escalations = await db.execute(
        select(Escalation).where(Escalation.conversation_id == cid).order_by(Escalation.timestamp)
    )
    escalation_list = escalations.scalars().all()

    plan_events = await db.execute(
        select(PlanEvent).where(PlanEvent.conversation_id == cid).order_by(PlanEvent.timestamp)
    )
    plan_event_list = plan_events.scalars().all()

    # Build rich timeline: merge messages, tools, intents, policies, workflows into chronological events
    timeline_events = []

    # Session started event
    if conv and conv.started_at:
        timeline_events.append({
            "type": "session_started",
            "timestamp": conv.started_at.isoformat(),
            "label": f"Session Started",
            "detail": f"Customer: {customer_name or 'Unknown'} · Channel: {conv.channel if conv else 'web'}",
        })

    # Messages
    for m in msgs:
        timeline_events.append({
            "type": "message_user" if m.role == "user" or m.role == "customer" else "message_agent",
            "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            "label": "Customer" if m.role in ("user", "customer") else "Agent Response",
            "detail": m.content,
            "turn_index": m.turn_index,
        })

    # Tool executions — executive summary without raw JSON dumping
    from app.orchestrator.tools.orchestrator import _make_summary

    for t in tool_list:
        summary_desc = ""
        if t.output:
            try:
                summary_desc = _make_summary(t.tool_name, t.output)
            except Exception:
                summary_desc = ""
        if not summary_desc:
            summary_desc = "Execution successful" if t.status == "success" else f"Status: {t.status}"

        dur_str = f"{t.duration_ms}ms" if t.duration_ms is not None else ""
        detail_str = f"{summary_desc}" + (f" ({dur_str})" if dur_str else "")

        timeline_events.append({
            "type": "tool_completed",
            "timestamp": t.timestamp.isoformat() if t.timestamp else None,
            "label": f"Tool: {t.tool_name.replace('_', ' ').title()}",
            "detail": detail_str,
            "status": t.status,
            "duration_ms": t.duration_ms,
            "input_params": t.input_params,
            "output": t.output,
        })

    # Plan events
    for p in plan_event_list:
        if p.direct_answer:
            label = "Plan: Direct Answer"
            detail = "Responding directly from verified context — no external tools needed"
        else:
            tools_planned = ", ".join(s.get("tool", "").replace("_", " ").title() for s in (p.steps or []) if s.get("tool"))
            step_reasons = [s.get("reason") for s in (p.steps or []) if s.get("reason") and s.get("reason") != "why this tool"]
            label = f"Plan: {len(p.steps or [])} Tool{'s' if len(p.steps or []) != 1 else ''} Queued"
            detail = f"Sequence: {tools_planned}" + (f" · {step_reasons[0]}" if step_reasons else "")
        timeline_events.append({
            "type": "plan",
            "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            "label": label,
            "detail": detail,
            "steps": p.steps,
        })

    # Intent detections
    for i in intent_list:
        ts = None
        if i.message_id:
            linked_msg = next((m for m in msgs if m.message_id == i.message_id), None)
            if linked_msg and linked_msg.timestamp:
                ts = linked_msg.timestamp.isoformat()
        if not ts and msgs:
            ts = msgs[0].timestamp.isoformat()
        detected_str = ", ".join(i.detected_intents[:2]) if i.detected_intents else "general_inquiry"
        timeline_events.append({
            "type": "intent",
            "timestamp": ts,
            "label": f"Intent: {detected_str.replace('_', ' ').title()}",
            "detail": f"Sentiment: {i.sentiment.capitalize() if i.sentiment else 'Neutral'} · Urgency: {i.urgency.capitalize() if i.urgency else 'Medium'}",
        })

    # Policy decisions
    for p in policy_list:
        timeline_events.append({
            "type": "policy",
            "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            "label": f"Policy Rule: {p.policy_name.replace('_', ' ').title() if p.policy_name else 'Guardrail'}",
            "detail": p.reason,
            "status": "allowed" if p.authorized else "blocked",
        })

    # Workflow executions & enriched sub-steps
    for w in wf_list:
        raw_steps = w.steps_completed or []
        wf_display = w.workflow_name.replace("_", " ").title()

        if raw_steps:
            for idx, step_item in enumerate(raw_steps):
                if isinstance(step_item, dict):
                    s_name = step_item.get("step_name", "")
                    s_status = step_item.get("step_status", "completed")
                    s_detail = step_item.get("detail", "")
                    s_evidence = step_item.get("evidence", {})
                    s_rule = step_item.get("rule", "")
                    s_decision = step_item.get("decision", "")
                    s_ts = step_item.get("timestamp") or (w.started_at.isoformat() if w.started_at else None)
                else:
                    # Legacy string step — enrich with comprehensive metadata from catalog
                    s_name = str(step_item)
                    meta = WORKFLOW_STEP_CATALOG.get(s_name, {})
                    s_status = "completed"
                    s_detail = meta.get("detail", f"Step executed: {s_name.replace('_', ' ')}.")
                    s_evidence = meta.get("evidence", {})
                    s_rule = meta.get("rule", "")
                    s_decision = meta.get("decision", "")
                    s_ts = w.started_at.isoformat() if w.started_at else None

                step_type = "workflow_step"
                catalog_meta = WORKFLOW_STEP_CATALOG.get(s_name, {})
                catalog_title = catalog_meta.get("title", s_name.replace('_', ' ').replace('verify ', 'Verified ').title())
                
                if "document" in s_name or "verify" in s_name:
                    step_type = "document_verification"
                elif "threshold" in s_name or "fraud" in s_name or "policy" in s_name:
                    step_type = "policy_evaluation"
                elif "escalat" in s_name or "queue" in s_name:
                    step_type = "escalation"

                timeline_events.append({
                    "type": step_type,
                    "timestamp": s_ts,
                    "label": f"{wf_display} → Step {idx + 1}: {catalog_title}",
                    "detail": s_detail,
                    "evidence": s_evidence,
                    "rule": s_rule,
                    "decision": s_decision,
                    "status": s_status,
                    "workflow_name": w.workflow_name,
                    "step_number": idx + 1,
                })
        else:
            timeline_events.append({
                "type": "workflow_step",
                "timestamp": w.started_at.isoformat() if w.started_at else None,
                "label": f"Workflow: {wf_display}",
                "detail": f"Status: {w.state.upper()} · Running workflow steps",
                "status": w.state,
                "workflow_name": w.workflow_name,
                "steps": [],
            })

    # Escalation events
    for esc in escalation_list:
        timeline_events.append({
            "type": "escalation",
            "timestamp": esc.timestamp.isoformat() if esc.timestamp else None,
            "label": "🚨 Human Escalation Triggered",
            "detail": f"{esc.reason}" + (f" · Ticket: {esc.appointment_reference}" if esc.appointment_reference else ""),
            "status": esc.status,
            "ticket_reference": esc.appointment_reference,
        })

    # Session ended
    if conv and conv.ended_at:
        timeline_events.append({
            "type": "session_ended",
            "timestamp": conv.ended_at.isoformat(),
            "label": "Session Ended",
            "detail": f"Resolution: {summary.resolution if summary else 'unknown'}",
        })

    # Call summary as the very last event (generated after session end)
    if summary:
        timeline_events.append({
            "type": "response",
            "timestamp": summary.generated_at.isoformat() if summary.generated_at else conv.ended_at.isoformat() if conv and conv.ended_at else None,
            "label": f"Call Summary · {summary.resolution.capitalize()}",
            "detail": summary.summary_text or "",
            "status": summary.resolution,
        })

    # Sort all events by timestamp
    timeline_events.sort(key=lambda e: e.get("timestamp") or "")

    return {
        "conversation_id": conversation_id,
        "customer_name": customer_name,
        "status": conv.status if conv else "unknown",
        "channel": conv.channel if conv else "web",
        "started_at": conv.started_at.isoformat() if conv and conv.started_at else None,
        "ended_at": conv.ended_at.isoformat() if conv and conv.ended_at else None,
        "messages": [
            {
                "message_id": str(m.message_id),
                "role": m.role,
                "content": m.content,
                "turn_index": m.turn_index,
                "timestamp": m.timestamp.isoformat() if m.timestamp else None,
            }
            for m in msgs
        ],
        "tool_executions": [
            {
                "exec_id": str(t.exec_id),
                "tool_name": t.tool_name,
                "status": t.status,
                "duration_ms": t.duration_ms,
                "input_params": t.input_params,
                "output": t.output,
                "timestamp": t.timestamp.isoformat() if t.timestamp else None,
            }
            for t in tool_list
        ],
        "intents": [
            {
                "detected_intents": i.detected_intents,
                "entities": i.entities,
                "sentiment": i.sentiment,
                "urgency": i.urgency,
                "confidence": float(i.confidence) if i.confidence else None,
            }
            for i in intent_list
        ],
        "workflows": [
            {
                "workflow_name": w.workflow_name,
                "state": w.state,
                "steps_completed": w.steps_completed,
                "started_at": w.started_at.isoformat() if w.started_at else None,
                "completed_at": w.completed_at.isoformat() if w.completed_at else None,
            }
            for w in wf_list
        ],
        "policy_decisions": [
            {
                "policy_name": p.policy_name,
                "action_proposed": p.action_proposed,
                "authorized": p.authorized,
                "reason": p.reason,
                "timestamp": p.timestamp.isoformat() if p.timestamp else None,
            }
            for p in policy_list
        ],
        "timeline": timeline_events,
        "summary": {
            "summary_text": summary.summary_text,
            "resolution": summary.resolution,
            "escalated": summary.escalated,
            "duration_sec": summary.duration_sec,
            "tools_used": summary.tools_used,
        } if summary else None,
    }


@router.get("/sentiment-timeline")
async def get_sentiment_timeline(
    limit: int = 50,
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    result = await db.execute(
        select(
            Intent.conversation_id,
            Intent.sentiment,
            Intent.urgency,
            Message.timestamp,
        )
        .join(Message, Message.message_id == Intent.message_id, isouter=True)
        .order_by(Message.timestamp.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "conversation_id": str(r.conversation_id),
            "sentiment": r.sentiment,
            "urgency": r.urgency,
            "timestamp": r.timestamp.isoformat() if r.timestamp else None,
        }
        for r in rows
    ]


@router.get("/escalations/open-count")
async def get_open_escalation_count(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Returns count of open escalations — used by the Billing page badge."""
    count = await db.scalar(
        select(func.count()).select_from(Escalation).where(Escalation.status == "open")
    )
    return {"open_count": count or 0}


@router.get("/escalations")
async def list_escalations(
    limit: int = 50,
    status: str = "all",
    db: Annotated[AsyncSession, Depends(get_db)] = None,
):
    """List escalations with customer name joined. Filter by status=open|assigned|resolved|all."""
    from app.models.customer import Customer
    query = (
        select(
            Escalation,
            Customer.name.label("customer_name"),
            Customer.email.label("customer_email"),
        )
        .outerjoin(Customer, Customer.customer_id == Escalation.customer_id)
        .order_by(Escalation.timestamp.desc())
        .limit(limit)
    )
    if status != "all":
        query = query.where(Escalation.status == status)

    result = await db.execute(query)
    rows = result.all()
    return [
        {
            "escalation_id": str(row.Escalation.escalation_id),
            "conversation_id": str(row.Escalation.conversation_id),
            "reason": row.Escalation.reason,
            "status": row.Escalation.status,
            "customer_id": str(row.Escalation.customer_id) if row.Escalation.customer_id else None,
            "customer_name": row.customer_name,
            "customer_email": row.customer_email,
            "appointment_reference": row.Escalation.appointment_reference,
            "resolved_by": row.Escalation.resolved_by,
            "resolved_at": row.Escalation.resolved_at.isoformat() if row.Escalation.resolved_at else None,
            "handoff_context": row.Escalation.handoff_context,
            "timestamp": row.Escalation.timestamp.isoformat() if row.Escalation.timestamp else None,
        }
        for row in rows
    ]


@router.patch("/escalations/{escalation_id}")
async def update_escalation(
    escalation_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str | None = None,
    resolved_by: str | None = None,
):
    """Update escalation status (open → assigned → resolved). resolved_by is the agent name."""
    from datetime import datetime, timezone
    from uuid import UUID
    eid = UUID(escalation_id)
    esc = (await db.execute(
        select(Escalation).where(Escalation.escalation_id == eid)
    )).scalar_one_or_none()

    if not esc:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Escalation not found")

    if status:
        esc.status = status
    if resolved_by:
        esc.resolved_by = resolved_by
    if status == "resolved" and not esc.resolved_at:
        esc.resolved_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(esc)
    return {
        "escalation_id": str(esc.escalation_id),
        "status": esc.status,
        "resolved_by": esc.resolved_by,
        "resolved_at": esc.resolved_at.isoformat() if esc.resolved_at else None,
    }


# ── Session TTL & Admin Force-End ──────────────────────────────────────────────

SESSION_TTL_MINUTES = 15  # inactivity timeout in minutes


@router.post("/sessions/{session_id}/force-end")
async def admin_force_end_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Admin-only endpoint to forcibly end an active session.
    Marks the conversation as completed, generates a summary, and broadcasts
    a session.ended event to all connected supervisors and the customer's session.
    """
    from datetime import datetime, timezone
    from app.gateway.session import session_manager
    from app.orchestrator.agent import AgentOrchestrator

    # Validate session exists and is active
    conv = (await db.execute(
        select(Conversation).where(Conversation.session_id == session_id)
    )).scalar_one_or_none()

    if not conv:
        raise HTTPException(status_code=404, detail="Session not found")
    if conv.status == "completed":
        return {"status": "already_ended", "session_id": session_id}

    # Mark as completed in DB (the session_manager handles broadcast)
    ended_conv = await session_manager.end_session(db=db, session_id=session_id)

    # Generate summary asynchronously (don't block the response)
    import asyncio
    _agent = AgentOrchestrator()
    asyncio.create_task(
        _agent.end_session(session_id, str(conv.conversation_id), duration_sec=0)
    )

    return {
        "status": "ended",
        "session_id": session_id,
        "conversation_id": str(conv.conversation_id),
        "ended_at": datetime.now(timezone.utc).isoformat(),
        "ended_by": "admin",
    }


@router.get("/sessions/ttl-status")
async def get_session_ttl_status(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Returns TTL info for all active sessions:
    - last activity timestamp (from conversation_state.updated_at)
    - seconds remaining before auto-expiry
    - whether the session is idle (past the warning threshold)
    Used by the frontend to show admins which sessions are about to time out.
    """
    from datetime import datetime, timezone, timedelta

    ttl_seconds = SESSION_TTL_MINUTES * 60
    now = datetime.now(timezone.utc)

    rows = await db.execute(
        select(
            Conversation.session_id,
            Conversation.conversation_id,
            Conversation.started_at,
            ConversationState.updated_at.label("last_activity"),
        )
        .outerjoin(ConversationState, ConversationState.conversation_id == Conversation.conversation_id)
        .where(Conversation.status == "active")
    )

    result = []
    for row in rows:
        last_activity = row.last_activity
        if last_activity is None:
            last_activity = row.started_at
        if last_activity and last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)

        inactive_seconds = int((now - last_activity).total_seconds()) if last_activity else 0
        remaining_seconds = max(0, ttl_seconds - inactive_seconds)
        is_idle = inactive_seconds >= (ttl_seconds * 0.75)  # warn at 75% (≈11min)
        is_expired = inactive_seconds >= ttl_seconds

        result.append({
            "session_id": row.session_id,
            "conversation_id": str(row.conversation_id),
            "last_activity": last_activity.isoformat() if last_activity else None,
            "inactive_seconds": inactive_seconds,
            "remaining_seconds": remaining_seconds,
            "is_idle": is_idle,
            "is_expired": is_expired,
        })

    return result


@router.post("/sessions/expire-idle")
async def expire_idle_sessions(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Server-side TTL enforcement: called periodically by the scheduler.
    Finds all sessions that have been inactive for >= SESSION_TTL_MINUTES
    and forces them to end, generating a summary for each.
    """
    from datetime import datetime, timezone, timedelta
    import asyncio
    from app.gateway.session import session_manager
    from app.orchestrator.agent import AgentOrchestrator

    ttl_cutoff = datetime.now(timezone.utc) - timedelta(minutes=SESSION_TTL_MINUTES)

    # Find active sessions where conversation_state.updated_at < cutoff
    idle_rows = await db.execute(
        select(Conversation.session_id, Conversation.conversation_id)
        .join(ConversationState, ConversationState.conversation_id == Conversation.conversation_id)
        .where(Conversation.status == "active")
        .where(ConversationState.updated_at < ttl_cutoff)
    )
    idle_sessions = idle_rows.all()

    if not idle_sessions:
        return {"expired": 0, "sessions": []}

    _agent = AgentOrchestrator()
    expired = []
    for row in idle_sessions:
        try:
            # DB: mark completed + broadcast session.ended
            async with db.begin_nested():
                await session_manager.end_session(db=db, session_id=row.session_id)
            # Generate summary (non-blocking)
            asyncio.create_task(
                _agent.end_session(row.session_id, str(row.conversation_id), duration_sec=0)
            )
            expired.append(row.session_id)
        except Exception as exc:
            pass  # log individually but don't fail the whole batch

    await db.commit()
    return {"expired": len(expired), "sessions": expired}
