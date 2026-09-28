ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS complimentary_plan VARCHAR(16),
    ADD COLUMN IF NOT EXISTS complimentary_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS complimentary_grant_id VARCHAR(64);
