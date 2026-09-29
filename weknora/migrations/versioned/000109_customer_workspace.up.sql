ALTER TABLE knowledge_bases ADD COLUMN customer_profile JSONB;
ALTER TABLE sessions ADD COLUMN customer_knowledge_base_id VARCHAR(36) NOT NULL DEFAULT '';
CREATE INDEX idx_sessions_customer_kb ON sessions (tenant_id, customer_knowledge_base_id);
