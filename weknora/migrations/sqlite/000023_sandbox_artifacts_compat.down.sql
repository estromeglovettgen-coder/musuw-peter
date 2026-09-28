DROP TABLE IF EXISTS tenant_sandbox_configs;
ALTER TABLE messages DROP COLUMN artifacts;
ALTER TABLE sessions DROP COLUMN sandbox_config_id;
