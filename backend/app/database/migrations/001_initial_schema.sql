-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CUSTOMER
CREATE TABLE IF NOT EXISTS customer (
    customer_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(120) NOT NULL,
    phone           VARCHAR(20),
    email           VARCHAR(120),
    account_number  VARCHAR(40) UNIQUE,
    plan            VARCHAR(60),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ACCOUNT
CREATE TABLE IF NOT EXISTS account (
    account_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    plan_name       VARCHAR(80),
    status          VARCHAR(20) DEFAULT 'active',
    balance         NUMERIC(12, 2) DEFAULT 0,
    billing_cycle   VARCHAR(20) DEFAULT 'monthly'
);

-- CONVERSATION
CREATE TABLE IF NOT EXISTS conversation (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID REFERENCES customer(customer_id) ON DELETE SET NULL,
    session_id      VARCHAR(80) UNIQUE NOT NULL,
    channel         VARCHAR(20) DEFAULT 'web',
    status          VARCHAR(20) DEFAULT 'active',
    started_at      TIMESTAMPTZ DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    sentiment       VARCHAR(20) DEFAULT 'neutral',
    intent_summary  TEXT,
    language        VARCHAR(10) DEFAULT 'en'
);

-- MESSAGE
CREATE TABLE IF NOT EXISTS message (
    message_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL,
    content         TEXT NOT NULL,
    timestamp       TIMESTAMPTZ DEFAULT now(),
    turn_index      INTEGER
);

-- CONVERSATION_STATE
CREATE TABLE IF NOT EXISTS conversation_state (
    state_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id    UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    current_workflow   VARCHAR(80),
    customer_verified  BOOLEAN DEFAULT false,
    task_status        JSONB DEFAULT '{}',
    updated_at         TIMESTAMPTZ DEFAULT now()
);

-- MEMORY
CREATE TABLE IF NOT EXISTS memory (
    memory_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    customer_id     UUID REFERENCES customer(customer_id) ON DELETE CASCADE,
    memory_type     VARCHAR(20) NOT NULL,
    key             VARCHAR(120) NOT NULL,
    value           TEXT,
    expires_at      TIMESTAMPTZ
);

-- INTENT
CREATE TABLE IF NOT EXISTS intent (
    intent_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id   UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    message_id        UUID REFERENCES message(message_id) ON DELETE SET NULL,
    detected_intents  JSONB DEFAULT '[]',
    entities          JSONB DEFAULT '{}',
    sentiment         VARCHAR(20),
    urgency           VARCHAR(10) DEFAULT 'medium',
    confidence        NUMERIC(4, 3)
);

-- TOOL_EXECUTION
CREATE TABLE IF NOT EXISTS tool_execution (
    exec_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    tool_name       VARCHAR(80) NOT NULL,
    input_params    JSONB DEFAULT '{}',
    output          JSONB DEFAULT '{}',
    status          VARCHAR(20) DEFAULT 'success',
    duration_ms     INTEGER,
    timestamp       TIMESTAMPTZ DEFAULT now()
);

-- WORKFLOW_EXECUTION
CREATE TABLE IF NOT EXISTS workflow_execution (
    wf_exec_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    workflow_name    VARCHAR(80) NOT NULL,
    state            VARCHAR(20) DEFAULT 'running',
    steps_completed  JSONB DEFAULT '[]',
    started_at       TIMESTAMPTZ DEFAULT now(),
    completed_at     TIMESTAMPTZ
);

-- POLICY_DECISION
CREATE TABLE IF NOT EXISTS policy_decision (
    decision_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    policy_name      VARCHAR(80),
    action_proposed  TEXT,
    authorized       BOOLEAN NOT NULL,
    reason           TEXT,
    timestamp        TIMESTAMPTZ DEFAULT now()
);

-- KNOWLEDGE_DOCUMENT
CREATE TABLE IF NOT EXISTS knowledge_document (
    doc_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(200) NOT NULL,
    source          VARCHAR(200),
    category        VARCHAR(60),
    content_hash    VARCHAR(64) UNIQUE,
    embedding_model VARCHAR(60),
    indexed_at      TIMESTAMPTZ DEFAULT now()
);

-- KNOWLEDGE_CHUNK (stores actual text + embedding vector)
CREATE TABLE IF NOT EXISTS knowledge_chunk (
    chunk_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID NOT NULL REFERENCES knowledge_document(doc_id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    embedding       vector(1536),
    token_count     INTEGER
);

CREATE INDEX IF NOT EXISTS knowledge_chunk_embedding_idx
    ON knowledge_chunk USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- KNOWLEDGE_RETRIEVAL
CREATE TABLE IF NOT EXISTS knowledge_retrieval (
    retrieval_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    query           TEXT NOT NULL,
    doc_id          UUID REFERENCES knowledge_document(doc_id) ON DELETE SET NULL,
    passage         TEXT,
    relevance_score NUMERIC(5, 4),
    timestamp       TIMESTAMPTZ DEFAULT now()
);

-- CALL_SUMMARY
CREATE TABLE IF NOT EXISTS call_summary (
    summary_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    summary_text    TEXT,
    resolution      VARCHAR(40) DEFAULT 'unresolved',
    escalated       BOOLEAN DEFAULT false,
    duration_sec    INTEGER,
    tools_used      JSONB DEFAULT '[]',
    generated_at    TIMESTAMPTZ DEFAULT now()
);

-- ESCALATION
CREATE TABLE IF NOT EXISTS escalation (
    escalation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id  UUID NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE,
    reason           TEXT NOT NULL,
    agent_id         VARCHAR(80),
    handoff_context  JSONB DEFAULT '{}',
    timestamp        TIMESTAMPTZ DEFAULT now()
);
