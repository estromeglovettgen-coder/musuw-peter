DO $$ BEGIN RAISE NOTICE '[Migration 000097 down] Dropping sessions.sandbox_config_id'; END $$;

ALTER TABLE sessions DROP COLUMN IF EXISTS sandbox_config_id;
