-- =============================================================================
-- Migration 003: Billing System Schema
-- Domain-neutral billing tables compatible with: telecom, insurance, IT,
-- banking, SaaS, utilities, healthcare billing.
-- Every table carries custom_fields JSONB for vertical-specific extensions.
-- =============================================================================

-- ─── BILLING_PLAN: reusable plan catalogue ────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_plan (
    plan_id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code        VARCHAR(40)   UNIQUE NOT NULL,
    name             VARCHAR(120)  NOT NULL,
    description      TEXT,
    category         VARCHAR(40)   DEFAULT 'general',       -- broadband / mobile / insurance / saas / utility
    subcategory      VARCHAR(40),                           -- postpaid / prepaid / family / enterprise
    base_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    billing_cycle    VARCHAR(20)   DEFAULT 'monthly',       -- monthly / quarterly / annual / one_time
    currency         VARCHAR(5)    DEFAULT 'INR',
    tax_rate_pct     NUMERIC(5,2)  DEFAULT 18.00,           -- GST %
    setup_fee        NUMERIC(10,2) DEFAULT 0,
    data_cap_gb      NUMERIC(10,2),                         -- telecom: data allowance
    speed_mbps       INTEGER,                               -- telecom: advertised speed
    min_contract_months INTEGER    DEFAULT 0,               -- insurance / SaaS: lock-in
    trial_days       INTEGER       DEFAULT 0,
    is_active        BOOLEAN       DEFAULT true,
    sort_order       INTEGER       DEFAULT 0,
    tags             JSONB         DEFAULT '[]',
    custom_fields    JSONB         DEFAULT '{}',            -- domain: policy_type, asset_class, etc.
    created_at       TIMESTAMPTZ   DEFAULT now(),
    updated_at       TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_plan_category ON billing_plan (category, is_active);

-- ─── INVOICE: one per billing cycle per account ───────────────────────────────
CREATE TABLE IF NOT EXISTS invoice (
    invoice_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id          UUID          NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    account_id           UUID          REFERENCES account(account_id) ON DELETE SET NULL,
    invoice_number       VARCHAR(40)   UNIQUE NOT NULL,
    status               VARCHAR(20)   DEFAULT 'sent',           -- draft/sent/paid/overdue/cancelled/partial/void
    billing_period_start DATE,
    billing_period_end   DATE,
    due_date             DATE          NOT NULL,
    issue_date           DATE          DEFAULT CURRENT_DATE,

    -- Amounts (all in `currency`)
    subtotal             NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount      NUMERIC(12,2) DEFAULT 0,
    taxable_amount       NUMERIC(12,2) DEFAULT 0,
    cgst_amount          NUMERIC(12,2) DEFAULT 0,               -- Indian GST split
    sgst_amount          NUMERIC(12,2) DEFAULT 0,
    igst_amount          NUMERIC(12,2) DEFAULT 0,
    other_tax_amount     NUMERIC(12,2) DEFAULT 0,
    tax_amount           NUMERIC(12,2) DEFAULT 0,               -- sum of all taxes
    total_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    amount_paid          NUMERIC(12,2) DEFAULT 0,
    outstanding_amount   NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    currency             VARCHAR(5)    DEFAULT 'INR',

    -- Line items: [{desc, plan_code, qty, unit_price, discount, tax_pct, amount}]
    line_items           JSONB         DEFAULT '[]',

    -- Delivery
    sent_via             VARCHAR(20)   DEFAULT 'email',          -- email / sms / whatsapp / post
    sent_at              TIMESTAMPTZ,
    viewed_at            TIMESTAMPTZ,
    paid_at              TIMESTAMPTZ,

    -- References
    previous_invoice_id  UUID          REFERENCES invoice(invoice_id) ON DELETE SET NULL,  -- for amendments
    dispute_reason       TEXT,
    internal_notes       TEXT,
    customer_notes       TEXT,                                   -- visible to customer

    -- Late fees
    late_fee_applied     BOOLEAN       DEFAULT false,
    late_fee_amount      NUMERIC(10,2) DEFAULT 0,
    late_fee_date        DATE,

    -- Domain extensions
    custom_fields        JSONB         DEFAULT '{}',
    created_at           TIMESTAMPTZ   DEFAULT now(),
    updated_at           TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_customer ON invoice (customer_id, due_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_status   ON invoice (status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_number   ON invoice (invoice_number);

-- ─── BILLING_TRANSACTION: every financial movement ───────────────────────────
CREATE TABLE IF NOT EXISTS billing_transaction (
    transaction_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id         UUID          NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    account_id          UUID          REFERENCES account(account_id) ON DELETE SET NULL,
    invoice_id          UUID          REFERENCES invoice(invoice_id) ON DELETE SET NULL,

    -- Classification
    transaction_type    VARCHAR(20)   NOT NULL,   -- payment/refund/credit/debit/adjustment/penalty/writeoff
    transaction_sub_type VARCHAR(30),              -- auto_debit/manual/gateway_reversal/goodwill_credit
    amount              NUMERIC(12,2) NOT NULL,
    currency            VARCHAR(5)    DEFAULT 'INR',

    -- Status lifecycle
    status              VARCHAR(20)   DEFAULT 'pending',  -- pending/processing/success/failed/reversed/disputed
    status_reason       TEXT,                              -- machine-readable on failure

    -- Payment details
    payment_method      VARCHAR(40),               -- UPI/Card/NEFT/NACH/Wallet/Cheque/Cash
    payment_method_detail VARCHAR(60),             -- UPI: VPA, Card: last 4 digits, NACH: mandate ID
    payment_gateway     VARCHAR(40),               -- Razorpay/Paytm/Billdesk/HDFC/manual
    gateway_ref         VARCHAR(80),               -- external payment ID
    bank_ref            VARCHAR(80),               -- bank UTR/NEFT ref
    upi_txn_id          VARCHAR(80),
    auth_code           VARCHAR(30),

    -- Failure info
    failure_code        VARCHAR(20),               -- INSUFFICIENT_FUNDS / BANK_DECLINE / EXPIRED_CARD
    failure_reason      TEXT,
    retry_count         INTEGER       DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,

    -- Accounting
    gl_code             VARCHAR(20),               -- General Ledger code
    cost_center         VARCHAR(40),
    tax_collected       NUMERIC(10,2) DEFAULT 0,
    net_amount          NUMERIC(12,2),             -- after gateway fee deduction
    gateway_fee         NUMERIC(10,2) DEFAULT 0,

    -- Traceability
    initiated_by        VARCHAR(20)   DEFAULT 'system',  -- customer/agent/system/scheduled
    agent_id            VARCHAR(80),               -- agent who initiated (if applicable)
    ip_address          VARCHAR(45),               -- for fraud detection
    device_fingerprint  VARCHAR(80),

    -- Metadata
    receipt_url         TEXT,
    metadata            JSONB         DEFAULT '{}',
    created_at          TIMESTAMPTZ   DEFAULT now(),
    settled_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_txn_customer ON billing_transaction (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_txn_invoice  ON billing_transaction (invoice_id);
CREATE INDEX IF NOT EXISTS idx_billing_txn_status   ON billing_transaction (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_txn_gateway  ON billing_transaction (gateway_ref) WHERE gateway_ref IS NOT NULL;

-- ─── REFUND_REQUEST: refund lifecycle with threshold gate ─────────────────────
CREATE TABLE IF NOT EXISTS refund_request (
    refund_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_number       VARCHAR(40)   UNIQUE,                   -- e.g. REF-2024-00045
    customer_id         UUID          NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    account_id          UUID          REFERENCES account(account_id) ON DELETE SET NULL,
    transaction_id      UUID          REFERENCES billing_transaction(transaction_id) ON DELETE SET NULL,
    invoice_id          UUID          REFERENCES invoice(invoice_id) ON DELETE SET NULL,

    -- Amounts
    requested_amount    NUMERIC(12,2) NOT NULL,
    approved_amount     NUMERIC(12,2),                          -- may differ after review
    currency            VARCHAR(5)    DEFAULT 'INR',

    -- Reason
    reason              VARCHAR(60)   NOT NULL,
    -- duplicate_payment/service_outage/overbilling/cancellation/product_defect/other
    reason_detail       TEXT,
    supporting_docs     JSONB         DEFAULT '[]',             -- [{filename, url, type}]

    -- Status lifecycle
    status              VARCHAR(20)   DEFAULT 'pending',
    -- pending/under_review/approved/rejected/processed/cancelled/escalated
    priority            VARCHAR(10)   DEFAULT 'medium',         -- low/medium/high/critical

    -- Threshold gate
    threshold_exceeded  BOOLEAN       DEFAULT false,
    threshold_amount    NUMERIC(12,2),                          -- threshold at time of request
    auto_processed      BOOLEAN       DEFAULT false,            -- true = system auto-approved

    -- Requestor
    requested_by        VARCHAR(20)   DEFAULT 'agent',          -- agent/customer/system
    requesting_agent_id VARCHAR(80),
    customer_consent    BOOLEAN       DEFAULT false,

    -- Reviewer (supervisor)
    reviewed_by         VARCHAR(80),
    review_notes        TEXT,
    rejection_reason    TEXT,
    escalation_reason   TEXT,

    -- Refund delivery
    refund_mode         VARCHAR(40),                            -- original_source/bank_transfer/wallet/cheque
    refund_bank_account VARCHAR(80),
    refund_upi_id       VARCHAR(80),

    -- SLA
    sla_deadline        TIMESTAMPTZ,                            -- when review must complete by
    sla_breached        BOOLEAN       DEFAULT false,

    -- Timestamps
    created_at          TIMESTAMPTZ   DEFAULT now(),
    reviewed_at         TIMESTAMPTZ,
    processed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ   DEFAULT now(),

    custom_fields       JSONB         DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_refund_customer ON refund_request (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_status   ON refund_request (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_refund_threshold ON refund_request (threshold_exceeded, status) WHERE threshold_exceeded = true;

-- ─── BILLING_ALERT: notification feed for agents/supervisors ─────────────────
CREATE TABLE IF NOT EXISTS billing_alert (
    alert_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID        REFERENCES customer(customer_id) ON DELETE CASCADE,
    -- alert_type: payment_due/payment_failed/refund_pending_review/refund_processed/
    --             plan_expiring/plan_renewed/credit_limit_near/invoice_overdue/
    --             auto_debit_failed/dispute_raised
    alert_type   VARCHAR(50) NOT NULL,
    severity     VARCHAR(10) DEFAULT 'info',   -- info/warning/critical
    title        VARCHAR(120),
    message      TEXT        NOT NULL,
    entity_type  VARCHAR(20),                  -- invoice/transaction/refund/plan
    entity_id    UUID,                          -- FK to the related entity
    is_read      BOOLEAN     DEFAULT false,
    read_by      VARCHAR(80),
    read_at      TIMESTAMPTZ,
    action_url   TEXT,                          -- deep link to the relevant record
    metadata     JSONB       DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT now(),
    expires_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_alert_customer  ON billing_alert (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_alert_unread    ON billing_alert (is_read, severity, created_at DESC) WHERE is_read = false;
