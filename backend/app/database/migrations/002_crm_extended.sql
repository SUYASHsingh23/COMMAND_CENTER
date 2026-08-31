-- =============================================================================
-- Migration 002: Extended CRM Schema
-- Adds domain-neutral fields to customer & account tables,
-- plus customer_interaction and customer_note tables.
-- Compatible with any vertical: telecom, insurance, IT, banking, healthcare.
-- =============================================================================

-- ─── CUSTOMER: extended profile fields ───────────────────────────────────────

ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS date_of_birth     DATE,
  ADD COLUMN IF NOT EXISTS gender            VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address_line1     TEXT,
  ADD COLUMN IF NOT EXISTS address_line2     TEXT,
  ADD COLUMN IF NOT EXISTS city              VARCHAR(80),
  ADD COLUMN IF NOT EXISTS state             VARCHAR(80),
  ADD COLUMN IF NOT EXISTS pincode           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS country           VARCHAR(60) DEFAULT 'India',
  -- Tier: standard / silver / gold / platinum
  ADD COLUMN IF NOT EXISTS customer_tier     VARCHAR(20) DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS customer_since    DATE,
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS preferred_channel VARCHAR(20) DEFAULT 'voice',
  -- Editable tag list: ["high_value","nps_detractor","vip"]
  ADD COLUMN IF NOT EXISTS tags              JSONB       DEFAULT '[]',
  -- Domain-specific overflow: insurance → policy_no, IT → asset_tag, etc.
  ADD COLUMN IF NOT EXISTS custom_fields     JSONB       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_contact_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now();

-- ─── ACCOUNT: extended billing / plan fields ─────────────────────────────────

ALTER TABLE account
  ADD COLUMN IF NOT EXISTS plan_start_date   DATE,
  ADD COLUMN IF NOT EXISTS plan_end_date     DATE,
  ADD COLUMN IF NOT EXISTS auto_renew        BOOLEAN     DEFAULT true,
  ADD COLUMN IF NOT EXISTS data_used_gb      NUMERIC(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit      NUMERIC(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method    VARCHAR(40) DEFAULT 'UPI',
  -- Domain-specific account overflow
  ADD COLUMN IF NOT EXISTS custom_fields     JSONB       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT now();

-- ─── CUSTOMER_INTERACTION: every touchpoint (call, chat, email, ticket) ──────

CREATE TABLE IF NOT EXISTS customer_interaction (
    interaction_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID        NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    conversation_id UUID        REFERENCES conversation(conversation_id) ON DELETE SET NULL,
    channel         VARCHAR(20) DEFAULT 'voice',        -- voice / chat / email / ticket
    direction       VARCHAR(10) DEFAULT 'inbound',      -- inbound / outbound
    duration_sec    INTEGER     DEFAULT 0,
    outcome         VARCHAR(40) DEFAULT 'completed',    -- completed / dropped / escalated
    sentiment       VARCHAR(20) DEFAULT 'neutral',
    resolution      VARCHAR(40) DEFAULT 'unresolved',
    agent_id        VARCHAR(80),
    summary         TEXT,
    started_at      TIMESTAMPTZ DEFAULT now(),
    ended_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_interaction_customer
    ON customer_interaction (customer_id, started_at DESC);

-- ─── CUSTOMER_NOTE: agent / supervisor free-text notes ───────────────────────

CREATE TABLE IF NOT EXISTS customer_note (
    note_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID        NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    author          VARCHAR(80) DEFAULT 'agent',
    content         TEXT        NOT NULL,
    note_type       VARCHAR(20) DEFAULT 'general',  -- general / flag / follow_up / complaint
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_note_customer
    ON customer_note (customer_id, created_at DESC);
