ALTER TABLE tenants
    DROP COLUMN IF EXISTS paddle_last_renewal_at;

ALTER TABLE tenants
    DROP COLUMN IF EXISTS open_router_desired_limit_microusd;
