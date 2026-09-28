ALTER TABLE tenants ADD COLUMN open_router_usage_month VARCHAR(7) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN open_router_used_microusd BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tenants DROP COLUMN IF EXISTS open_router_credit_period_end;
