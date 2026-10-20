ALTER TABLE fire_token_plans ADD COLUMN image_limit BIGINT NOT NULL DEFAULT 0 CHECK (image_limit BETWEEN 0 AND 1000000000);
ALTER TABLE fire_token_memberships ADD COLUMN image_limit BIGINT NOT NULL DEFAULT 0 CHECK (image_limit BETWEEN 0 AND 1000000000);
ALTER TABLE fire_token_memberships ADD COLUMN used_images BIGINT NOT NULL DEFAULT 0 CHECK (used_images >= 0);
ALTER TABLE fire_token_memberships ADD COLUMN reserved_images BIGINT NOT NULL DEFAULT 0 CHECK (reserved_images >= 0);
ALTER TABLE fire_token_adjustments ADD COLUMN images BIGINT NOT NULL DEFAULT 0 CHECK (images >= 0);
ALTER TABLE fire_token_adjustments ADD COLUMN image_task_id VARCHAR(36) NOT NULL DEFAULT '';
ALTER TABLE fire_token_adjustments ADD COLUMN image_outcome TEXT NOT NULL DEFAULT '' CHECK (image_outcome IN ('', 'succeeded', 'failed'));

-- Period is a logical immutable snapshot, not a FK to a mutable current cycle.
-- Unknown submissions retain their slot until explicit, audited reconciliation.
CREATE TABLE fire_image_calls (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_id TEXT NOT NULL,
    task_id VARCHAR(36) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'unknown', 'succeeded', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMPTZ,
    CONSTRAINT fire_image_membership FOREIGN KEY (user_id) REFERENCES fire_token_memberships(user_id) ON DELETE CASCADE,
    CONSTRAINT fire_image_task UNIQUE (user_id, task_id)
);
CREATE INDEX fire_images_user_status ON fire_image_calls(user_id, status, created_at);
