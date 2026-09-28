DROP TRIGGER IF EXISTS trg_default_searxng_provider ON tenants;
DROP FUNCTION IF EXISTS ensure_default_searxng_provider();

DELETE FROM web_search_providers
WHERE provider = 'searxng'
  AND parameters->'extra_config'->>'managed_by' = 'platform-default';
