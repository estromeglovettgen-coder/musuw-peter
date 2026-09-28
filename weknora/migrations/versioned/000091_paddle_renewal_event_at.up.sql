-- Keep the recurring-payment watermark separate from the lifecycle and
-- adjustment webhook cursor. A later unrelated event must not suppress a
-- valid renewal.
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS paddle_last_renewal_at TIMESTAMPTZ;

-- Keep one durable absolute OpenRouter spend target. OpenRouter remains the
-- usage authority; this value is only the replayable limit the provider must
-- converge to after a plan, period, or operator adjustment.
ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS open_router_desired_limit_microusd BIGINT NOT NULL DEFAULT 0;
