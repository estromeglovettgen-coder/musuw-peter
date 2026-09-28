ALTER TABLE tenants ADD COLUMN plan VARCHAR(16) NOT NULL DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN plan_status VARCHAR(16) NOT NULL DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN open_router_usage_month VARCHAR(7) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN open_router_used_microusd BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN paddle_customer_id VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN paddle_subscription_id VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN paddle_last_event_id VARCHAR(64) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN paddle_last_event_at TIMESTAMPTZ;
ALTER TABLE tenants ALTER COLUMN storage_quota SET DEFAULT 5368709120;

UPDATE tenants
SET plan = 'free',
    plan_status = 'active',
    storage_quota = 5368709120
WHERE deleted_at IS NULL;

UPDATE knowledge_bases
SET summary_model_id = 'builtin-deepseek-v4-flash',
    wiki_config = jsonb_set(
        COALESCE(wiki_config, '{}'::jsonb),
        '{synthesis_model_id}',
        '"builtin-deepseek-v4-flash"'::jsonb,
        true
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND type = 'document';
