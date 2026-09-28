-- Keep recurring-payment ordering independent from lifecycle/adjustment
-- events. SQLite stores timestamps as DATETIME values.
ALTER TABLE tenants ADD COLUMN paddle_last_renewal_at DATETIME;

-- One durable absolute OpenRouter target. SQLite stores the micro-USD value as
-- a non-null INTEGER so legacy rows can be bootstrapped from the provider.
ALTER TABLE tenants ADD COLUMN open_router_desired_limit_microusd INTEGER NOT NULL DEFAULT 0;
