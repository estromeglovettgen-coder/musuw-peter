ALTER TABLE tenants ALTER COLUMN storage_quota SET DEFAULT 10737418240;
ALTER TABLE tenants DROP COLUMN IF EXISTS paddle_last_event_at;
ALTER TABLE tenants DROP COLUMN IF EXISTS paddle_last_event_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS paddle_subscription_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS paddle_customer_id;
ALTER TABLE tenants DROP COLUMN IF EXISTS open_router_used_microusd;
ALTER TABLE tenants DROP COLUMN IF EXISTS open_router_usage_month;
ALTER TABLE tenants DROP COLUMN IF EXISTS plan_status;
ALTER TABLE tenants DROP COLUMN IF EXISTS plan;
