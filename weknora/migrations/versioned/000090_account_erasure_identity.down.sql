DROP INDEX IF EXISTS idx_users_identity_provider_subject;
DROP INDEX IF EXISTS idx_users_deletion_requested_at;

ALTER TABLE users
    DROP COLUMN IF EXISTS deletion_requested_at,
    DROP COLUMN IF EXISTS identity_subject,
    DROP COLUMN IF EXISTS identity_provider;
