-- =============================================================================
-- Migration 004: Scheduling System Schema
-- Domain-neutral appointment scheduling tables compatible with:
-- telecom, insurance, IT, banking, SaaS, healthcare.
-- Every table carries custom_fields JSONB for vertical-specific extensions.
-- =============================================================================

-- ─── SERVICE_TYPE: appointment catalogue ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_type (
    service_type_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    code                      VARCHAR(40)   UNIQUE NOT NULL,
    name                      VARCHAR(120)  NOT NULL,
    description               TEXT,

    -- Classification
    category                  VARCHAR(40)   DEFAULT 'general',
    -- billing/technical/sales/retention/complaint/general/escalation
    domain                    VARCHAR(40)   DEFAULT 'general',
    -- telecom/insurance/IT/banking/saas/healthcare/general
    sub_domain                VARCHAR(40),

    -- Scheduling properties
    estimated_duration_mins   INTEGER       DEFAULT 30,
    requires_supervisor       BOOLEAN       DEFAULT false,
    requires_specialist       BOOLEAN       DEFAULT false,
    allow_self_schedule       BOOLEAN       DEFAULT true,  -- customer can book without AI
    max_per_day_per_agent     INTEGER       DEFAULT 20,

    -- Priority & SLA
    priority_weight           INTEGER       DEFAULT 5,     -- 1=low, 10=critical
    sla_response_mins         INTEGER       DEFAULT 60,    -- target first response
    sla_resolution_mins       INTEGER       DEFAULT 1440,  -- target full resolution (24h)

    -- Routing hints
    preferred_channel         VARCHAR(20)   DEFAULT 'voice_call',
    fallback_channel          VARCHAR(20)   DEFAULT 'callback',
    auto_assign               BOOLEAN       DEFAULT true,  -- system auto-assigns agent

    -- Status
    is_active                 BOOLEAN       DEFAULT true,
    sort_order                INTEGER       DEFAULT 0,
    tags                      JSONB         DEFAULT '[]',
    custom_fields             JSONB         DEFAULT '{}',
    created_at                TIMESTAMPTZ   DEFAULT now(),
    updated_at                TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_type_category ON service_type (category, domain, is_active);

-- ─── AGENT: human customer care agents ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent (
    agent_id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_code                VARCHAR(20)   UNIQUE NOT NULL,  -- AGT-001
    name                      VARCHAR(80)   NOT NULL,
    display_name              VARCHAR(80),
    email                     VARCHAR(120)  UNIQUE,
    phone                     VARCHAR(20),

    -- Role & department
    role                      VARCHAR(30)   DEFAULT 'agent',
    -- agent/senior_agent/supervisor/specialist/team_lead
    department                VARCHAR(40)   DEFAULT 'general',
    -- billing/technical/retention/sales/complaint/general
    team                      VARCHAR(40),                    -- sub-team name
    employee_id               VARCHAR(30),                    -- HR employee code
    location                  VARCHAR(60),                    -- city / office

    -- Skills & preferences
    specializations           JSONB         DEFAULT '[]',
    -- ["billing_dispute", "5g_support", "policy_review"]
    languages                 JSONB         DEFAULT '["en"]', -- ISO 639-1 codes
    certifications            JSONB         DEFAULT '[]',
    -- [{"name": "NISM Level 5", "valid_until": "2027-01-01"}]

    -- Capacity
    max_concurrent_sessions   INTEGER       DEFAULT 3,
    current_load              INTEGER       DEFAULT 0,
    status                    VARCHAR(20)   DEFAULT 'offline',
    -- available/busy/break/training/offline

    -- Schedule
    shift_start               TIME,                           -- e.g. 09:00
    shift_end                 TIME,                           -- e.g. 18:00
    timezone                  VARCHAR(50)   DEFAULT 'Asia/Kolkata',
    working_days              JSONB         DEFAULT '[1,2,3,4,5]',
    -- ISO weekday numbers: 1=Mon … 7=Sun

    -- Performance
    rating                    NUMERIC(3,2)  DEFAULT 0,        -- avg CSAT 0–5
    total_sessions            INTEGER       DEFAULT 0,
    sessions_today            INTEGER       DEFAULT 0,
    avg_handle_time_mins      NUMERIC(5,2)  DEFAULT 0,
    first_call_resolution_pct NUMERIC(5,2)  DEFAULT 0,        -- FCR %

    -- Auth / integration
    agent_portal_id           VARCHAR(60),                    -- SSO / portal user ID
    is_active                 BOOLEAN       DEFAULT true,

    custom_fields             JSONB         DEFAULT '{}',
    created_at                TIMESTAMPTZ   DEFAULT now(),
    updated_at                TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_status     ON agent (status, current_load) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_department ON agent (department, role);

-- ─── APPOINTMENT: core scheduling record ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment (
    appointment_id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_number        VARCHAR(40)   UNIQUE NOT NULL,  -- APT-2026-00123

    -- Parties
    customer_id               UUID          NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    account_id                UUID          REFERENCES account(account_id) ON DELETE SET NULL,
    agent_id                  UUID          REFERENCES agent(agent_id) ON DELETE SET NULL,
    service_type_id           UUID          REFERENCES service_type(service_type_id),

    -- Source
    conversation_id           VARCHAR(80),                    -- AI voice session ID
    booked_via                VARCHAR(30)   DEFAULT 'ai_agent',
    -- ai_agent/self_service/supervisor/walk_in/callback

    -- Status lifecycle
    status                    VARCHAR(20)   DEFAULT 'pending',
    -- pending/assigned/confirmed/in_progress/completed/cancelled/no_show/rescheduled/escalated
    priority                  VARCHAR(10)   DEFAULT 'normal',
    -- low/normal/high/urgent/critical

    -- Channel
    channel                   VARCHAR(20)   DEFAULT 'voice_call',
    -- voice_call/video_call/chat/in_person/callback/email
    channel_detail            VARCHAR(80),                    -- phone number / video link / room

    -- Scheduling times
    scheduled_at              TIMESTAMPTZ,                    -- requested / confirmed slot
    window_start              TIMESTAMPTZ,                    -- earliest acceptable time
    window_end                TIMESTAMPTZ,                    -- latest acceptable time
    confirmed_at              TIMESTAMPTZ,
    started_at                TIMESTAMPTZ,
    ended_at                  TIMESTAMPTZ,
    cancelled_at              TIMESTAMPTZ,
    duration_mins             INTEGER,                        -- actual talk time

    -- Reason (from AI intent)
    reason                    VARCHAR(120)  NOT NULL,         -- short intent label
    reason_detail             TEXT,                           -- expanded context
    intent_category           VARCHAR(40),                    -- billing/technical/general/etc.
    urgency_signal            VARCHAR(20),                    -- calm/frustrated/angry/distressed
    sentiment_score           NUMERIC(3,2),                   -- -1 to +1

    -- AI-generated pre-call briefing
    ai_summary                TEXT,                           -- paragraph summary for agent
    ai_suggested_actions      JSONB         DEFAULT '[]',
    -- [{"action": "Check invoice INV-2026-001006", "priority": "high"}]
    ai_risk_flags             JSONB         DEFAULT '[]',
    -- [{"flag": "churn_risk", "score": 0.82}]

    -- Customer context snapshots (frozen at booking time)
    customer_snapshot         JSONB         DEFAULT '{}',
    -- full CRM profile: name, tier, account_number, phone, plan, etc.
    billing_snapshot          JSONB         DEFAULT '{}',
    -- balance, outstanding, next_due, failed_payments, active_plan
    conversation_transcript   JSONB         DEFAULT '[]',
    -- [{role, content, ts}] key turns from the AI conversation
    previous_interactions     JSONB         DEFAULT '[]',
    -- [{date, channel, resolution, duration_mins}] past appointment history

    -- Resolution
    resolution_notes          TEXT,
    resolution_category       VARCHAR(40),
    -- resolved/escalated/pending_action/no_action/transferred/callback_scheduled
    escalated_to_agent_id     UUID          REFERENCES agent(agent_id) ON DELETE SET NULL,
    escalation_reason         TEXT,

    -- CSAT
    csat_score                INTEGER       CHECK (csat_score BETWEEN 1 AND 5),
    csat_feedback             TEXT,
    csat_collected_at         TIMESTAMPTZ,

    -- Follow-up
    follow_up_required        BOOLEAN       DEFAULT false,
    follow_up_date            DATE,
    follow_up_notes           TEXT,
    follow_up_appointment_id  UUID          REFERENCES appointment(appointment_id) ON DELETE SET NULL,

    -- Metadata
    tags                      JSONB         DEFAULT '[]',
    internal_notes            TEXT,
    custom_fields             JSONB         DEFAULT '{}',
    created_at                TIMESTAMPTZ   DEFAULT now(),
    updated_at                TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointment_customer  ON appointment (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointment_agent     ON appointment (agent_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointment_status    ON appointment (status, priority, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointment_conv      ON appointment (conversation_id) WHERE conversation_id IS NOT NULL;

-- ─── APPOINTMENT_NOTE: agent notes timeline ───────────────────────────────────
CREATE TABLE IF NOT EXISTS appointment_note (
    note_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id   UUID          NOT NULL REFERENCES appointment(appointment_id) ON DELETE CASCADE,
    author           VARCHAR(80)   NOT NULL,
    author_role      VARCHAR(30),                             -- agent/supervisor/system/customer
    note_type        VARCHAR(20)   DEFAULT 'observation',
    -- observation/action_taken/escalation/follow_up/resolution/csat
    content          TEXT          NOT NULL,
    is_internal      BOOLEAN       DEFAULT true,              -- false = visible to customer
    attachments      JSONB         DEFAULT '[]',
    -- [{filename, url, type}]
    created_at       TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appt_note_appointment ON appointment_note (appointment_id, created_at);

-- ─── AGENT_AVAILABILITY_BLOCK: schedule exceptions ───────────────────────────
CREATE TABLE IF NOT EXISTS agent_availability_block (
    block_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     UUID          NOT NULL REFERENCES agent(agent_id) ON DELETE CASCADE,
    start_at     TIMESTAMPTZ   NOT NULL,
    end_at       TIMESTAMPTZ   NOT NULL,
    block_type   VARCHAR(20)   DEFAULT 'break',
    -- break/training/meeting/leave/sick/busy
    notes        TEXT,
    created_at   TIMESTAMPTZ   DEFAULT now(),
    CONSTRAINT chk_block_times CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_avail_block_agent ON agent_availability_block (agent_id, start_at, end_at);
