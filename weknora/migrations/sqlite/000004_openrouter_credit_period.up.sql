ALTER TABLE tenants ADD COLUMN open_router_credit_period_end DATETIME;
ALTER TABLE tenants DROP COLUMN open_router_usage_month;
ALTER TABLE tenants DROP COLUMN open_router_used_microusd;
