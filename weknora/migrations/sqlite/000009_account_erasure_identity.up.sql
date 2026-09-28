-- Account-erasure identity coordinates and authentication fence.
-- Empty provider/subject values preserve existing password-only accounts.
ALTER TABLE users ADD COLUMN identity_provider VARCHAR(32) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN identity_subject VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN deletion_requested_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_users_deletion_requested_at
    ON users (deletion_requested_at);

-- Keep one local account per external identity. SQLite partial indexes let
-- legacy password rows (empty pair) and soft-deleted rows remain unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_identity_provider_subject
    ON users (identity_provider, identity_subject)
    WHERE identity_provider <> ''
      AND identity_subject <> ''
      AND deleted_at IS NULL;
