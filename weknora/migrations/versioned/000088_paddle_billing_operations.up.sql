-- Durable, short-lived intent records for Paddle checkout and subscription
-- updates. The provider request is always made after the claim transaction
-- commits; this table is not a lock held across network I/O.
CREATE TABLE IF NOT EXISTS paddle_billing_operations (
    id                    BIGSERIAL PRIMARY KEY,
    tenant_id             BIGINT NOT NULL,
    operation_key         VARCHAR(128) NOT NULL,
    operation_type        VARCHAR(32) NOT NULL,
    request_fingerprint   VARCHAR(128) NOT NULL DEFAULT '',
    plan                  VARCHAR(16) NOT NULL DEFAULT '',
    billing_period        VARCHAR(16) NOT NULL DEFAULT '',
    price_id              VARCHAR(64) NOT NULL DEFAULT '',
    subscription_id       VARCHAR(64) NOT NULL DEFAULT '',
    paddle_transaction_id VARCHAR(64) NOT NULL DEFAULT '',
    status                VARCHAR(16) NOT NULL DEFAULT 'pending',
    result_json           JSONB NOT NULL DEFAULT '{}'::JSONB,
    last_error            TEXT NOT NULL DEFAULT '',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_paddle_billing_operations_key
    ON paddle_billing_operations (tenant_id, operation_key);

-- pending/in_flight/uncertain are the only states allowed to occupy the
-- tenant slot. Terminal rows remain available for idempotent replay.
CREATE UNIQUE INDEX IF NOT EXISTS ux_paddle_billing_operations_active_tenant
    ON paddle_billing_operations (tenant_id)
    WHERE status IN ('pending', 'in_flight', 'uncertain');

CREATE INDEX IF NOT EXISTS idx_paddle_billing_operations_tenant_updated
    ON paddle_billing_operations (tenant_id, updated_at DESC);
