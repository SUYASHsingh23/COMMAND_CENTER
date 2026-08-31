-- =============================================================================
-- Migration 004: Authentication Layer
-- Adds password_hash to customer table and creates refresh_token table
-- for the full JWT access + refresh token security model.
-- =============================================================================

-- ─── CUSTOMER: add auth fields ───────────────────────────────────────────────
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS password_hash  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login_at  TIMESTAMPTZ;

-- Ensure email is unique so it can be the login identifier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'customer' AND indexname = 'uq_customer_email'
  ) THEN
    CREATE UNIQUE INDEX uq_customer_email ON customer (email) WHERE email IS NOT NULL;
  END IF;
END $$;

-- ─── REFRESH_TOKEN table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_token (
    token_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
    token_hash   VARCHAR(255) NOT NULL UNIQUE,   -- stored as SHA-256 hash, not plain
    issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,                    -- NULL = still valid
    user_agent   TEXT,                           -- for session audit display
    ip_address   VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_customer ON refresh_token (customer_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash     ON refresh_token (token_hash);
