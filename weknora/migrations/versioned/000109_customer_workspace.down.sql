DROP INDEX IF EXISTS idx_sessions_customer_kb;
ALTER TABLE sessions DROP COLUMN customer_knowledge_base_id;
ALTER TABLE knowledge_bases DROP COLUMN customer_profile;
