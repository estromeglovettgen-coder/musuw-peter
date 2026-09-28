-- Reviewed platform-owned knowledge services and independent buyer subscriptions.
-- Membership fields on tenants remain unchanged.
CREATE TABLE IF NOT EXISTS marketplace_products (
 id VARCHAR(36) PRIMARY KEY,
 creator_tenant_id BIGINT NOT NULL,
 creator_user_id VARCHAR(36) NOT NULL,
 creator_name VARCHAR(255) NOT NULL DEFAULT '',
 contact TEXT NOT NULL DEFAULT '',
 "authorization" TEXT NOT NULL DEFAULT '',
 authorization_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
 published_tenant_id BIGINT NOT NULL DEFAULT 0,
 platform_agent_id VARCHAR(36) NOT NULL DEFAULT '',
 platform_knowledge_base_ids JSON NOT NULL DEFAULT '[]',
 title VARCHAR(160) NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 category VARCHAR(64) NOT NULL DEFAULT '',
 cover_url TEXT NOT NULL DEFAULT '',
 agent_id VARCHAR(36) NOT NULL,
 agent_name VARCHAR(255) NOT NULL DEFAULT '',
 knowledge_base_ids JSON NOT NULL DEFAULT '[]',
 knowledge_base_names JSON NOT NULL DEFAULT '[]',
 sample_questions JSON NOT NULL DEFAULT '[]',
 agent_snapshot JSON NOT NULL DEFAULT '{}',
 default_model_id VARCHAR(128) NOT NULL DEFAULT 'builtin-deepseek-v4-flash',
 currency VARCHAR(3) NOT NULL DEFAULT 'USD',
 monthly_amount BIGINT NOT NULL CHECK(monthly_amount > 0),
 yearly_amount BIGINT NOT NULL CHECK(yearly_amount = monthly_amount * 10),
 paddle_product_id VARCHAR(64) NOT NULL DEFAULT '',
 monthly_price_id VARCHAR(64) NOT NULL DEFAULT '',
 yearly_price_id VARCHAR(64) NOT NULL DEFAULT '',
 status VARCHAR(24) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published','rejected','unpublished')),
 featured BOOLEAN NOT NULL DEFAULT FALSE,
 fixture BOOLEAN NOT NULL DEFAULT FALSE,
 review_note TEXT NOT NULL DEFAULT '',
 reviewed_by VARCHAR(36) NOT NULL DEFAULT '',
 reviewed_at DATETIME,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_marketplace_creator ON marketplace_products(creator_tenant_id,creator_user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_catalog ON marketplace_products(status,featured,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_monthly_price ON marketplace_products(monthly_price_id) WHERE monthly_price_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_yearly_price ON marketplace_products(yearly_price_id) WHERE yearly_price_id <> '';

CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
 id VARCHAR(36) PRIMARY KEY,
 tenant_id BIGINT NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 product_id VARCHAR(36) NOT NULL REFERENCES marketplace_products(id),
 product_title VARCHAR(160) NOT NULL,
 operation_key VARCHAR(128) NOT NULL,
 billing_period VARCHAR(16) NOT NULL CHECK(billing_period IN ('monthly','yearly')),
 price_id VARCHAR(64) NOT NULL,
 currency VARCHAR(3) NOT NULL,
 amount BIGINT NOT NULL CHECK(amount > 0),
 status VARCHAR(24) NOT NULL,
 paddle_customer_id VARCHAR(64) NOT NULL DEFAULT '',
 paddle_subscription_id VARCHAR(64) NOT NULL DEFAULT '',
 checkout_transaction_id VARCHAR(64) NOT NULL DEFAULT '',
 paid_through DATETIME,
 cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
 scheduled_change_at DATETIME,
 last_event_id VARCHAR(64) NOT NULL DEFAULT '',
 last_event_at DATETIME,
 last_payment_at DATETIME,
 last_error TEXT NOT NULL DEFAULT '',
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_checkout_key ON marketplace_subscriptions(tenant_id,operation_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_current_product ON marketplace_subscriptions(tenant_id,product_id) WHERE status NOT IN ('canceled','failed');
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_provider_subscription ON marketplace_subscriptions(paddle_subscription_id) WHERE paddle_subscription_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_marketplace_checkout_transaction ON marketplace_subscriptions(checkout_transaction_id) WHERE checkout_transaction_id <> '';
CREATE INDEX IF NOT EXISTS idx_marketplace_buyer_subscriptions ON marketplace_subscriptions(tenant_id,created_at);

CREATE TABLE IF NOT EXISTS marketplace_transactions (
 id VARCHAR(64) PRIMARY KEY,
 tenant_id BIGINT NOT NULL,
 subscription_id VARCHAR(36) NOT NULL REFERENCES marketplace_subscriptions(id),
 product_id VARCHAR(36) NOT NULL REFERENCES marketplace_products(id),
 product_title VARCHAR(160) NOT NULL DEFAULT '',
 status VARCHAR(24) NOT NULL,
 currency VARCHAR(3) NOT NULL DEFAULT '',
 amount VARCHAR(32) NOT NULL DEFAULT '',
 billing_period VARCHAR(16) NOT NULL,
 period_starts_at DATETIME,
 period_ends_at DATETIME,
 occurred_at DATETIME NOT NULL,
 last_event_at DATETIME NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_marketplace_buyer_transactions ON marketplace_transactions(tenant_id,occurred_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_subscription_transactions ON marketplace_transactions(subscription_id);
CREATE TABLE IF NOT EXISTS marketplace_processed_events (
 event_id VARCHAR(64) PRIMARY KEY,
 subscription_id VARCHAR(36) NOT NULL REFERENCES marketplace_subscriptions(id),
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_marketplace_subscription_events ON marketplace_processed_events(subscription_id);
