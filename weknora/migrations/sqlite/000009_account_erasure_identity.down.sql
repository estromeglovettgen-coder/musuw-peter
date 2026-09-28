DROP INDEX IF EXISTS idx_users_identity_provider_subject;
DROP INDEX IF EXISTS idx_users_deletion_requested_at;

ALTER TABLE users DROP COLUMN deletion_requested_at;
ALTER TABLE users DROP COLUMN identity_subject;
ALTER TABLE users DROP COLUMN identity_provider;
