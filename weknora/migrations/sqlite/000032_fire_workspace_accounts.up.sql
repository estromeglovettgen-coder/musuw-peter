CREATE TABLE fire_workspace_accounts (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tenant_id INTEGER NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    operation_id VARCHAR(100) NOT NULL UNIQUE,
    request_fingerprint VARCHAR(64) NOT NULL,
    source_tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    course_knowledge_base_id VARCHAR(36) NOT NULL,
    source_agent_id VARCHAR(36) NOT NULL,
    default_agent_id VARCHAR(36) NOT NULL,
    model_ids_json TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
