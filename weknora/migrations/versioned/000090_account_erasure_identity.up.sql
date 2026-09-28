-- Account-erasure identity coordinates and authentication fence.
--
-- Empty provider/subject values preserve existing password-only accounts;
-- OIDC login fills both values atomically from the verified provider claim.
-- A deletion request is a durable fence checked by every native session path
-- before a token is accepted or minted.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS identity_provider VARCHAR(32) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS identity_subject VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_deletion_requested_at
    ON users (deletion_requested_at);

-- Prevent two local accounts from claiming the same external identity while
-- allowing legacy password rows (empty pair) and soft-deleted rows to be
-- repaired or recreated.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_identity_provider_subject
    ON users (identity_provider, identity_subject)
    WHERE identity_provider <> ''
      AND identity_subject <> ''
      AND deleted_at IS NULL;
