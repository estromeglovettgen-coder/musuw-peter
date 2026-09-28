ALTER TABLE tenants ADD COLUMN open_router_credit_period_end TIMESTAMPTZ;
ALTER TABLE tenants DROP COLUMN IF EXISTS open_router_usage_month;
ALTER TABLE tenants DROP COLUMN IF EXISTS open_router_used_microusd;
