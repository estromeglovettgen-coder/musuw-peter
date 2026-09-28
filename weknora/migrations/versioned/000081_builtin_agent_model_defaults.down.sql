-- The previous tenant-local model selections are not recoverable and may
-- contain valid user customisations, so rollback deliberately leaves them in
-- place. Runtime defaults remain safe and the migration itself is idempotent.
SELECT 1;
