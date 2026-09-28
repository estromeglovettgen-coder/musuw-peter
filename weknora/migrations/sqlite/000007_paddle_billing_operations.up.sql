-- SQLite equivalent of versioned/000088_paddle_billing_operations.
CREATE TABLE IF NOT EXISTS paddle_billing_operations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id             INTEGER NOT NULL,
    operation_key         VARCHAR(128) NOT NULL,
    operation_type        VARCHAR(32) NOT NULL,
    request_fingerprint   VARCHAR(128) NOT NULL DEFAULT '',
    plan                  VARCHAR(16) NOT NULL DEFAULT '',
    billing_period        VARCHAR(16) NOT NULL DEFAULT '',
    price_id              VARCHAR(64) NOT NULL DEFAULT '',
    subscription_id       VARCHAR(64) NOT NULL DEFAULT '',
    paddle_transaction_id VARCHAR(64) NOT NULL DEFAULT '',
    status                VARCHAR(16) NOT NULL DEFAULT 'pending',
    result_json           TEXT NOT NULL DEFAULT '{}',
    last_error            TEXT NOT NULL DEFAULT '',
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at          DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_paddle_billing_operations_key
    ON paddle_billing_operations (tenant_id, operation_key);

CREATE UNIQUE INDEX IF NOT EXISTS ux_paddle_billing_operations_active_tenant
    ON paddle_billing_operations (tenant_id)
    WHERE status IN ('pending', 'in_flight', 'uncertain');

CREATE INDEX IF NOT EXISTS idx_paddle_billing_operations_tenant_updated
    ON paddle_billing_operations (tenant_id, updated_at DESC);
