-- Give every existing and future workspace a native default web-search provider.
-- Existing tenant defaults remain authoritative and are not replaced.

CREATE OR REPLACE FUNCTION ensure_default_searxng_provider()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM web_search_providers
        WHERE tenant_id = NEW.id
          AND is_default = true
          AND deleted_at IS NULL
    ) THEN
        INSERT INTO web_search_providers (
            id, tenant_id, name, provider, description, parameters, is_default
        ) VALUES (
            uuid_generate_v4()::text,
            NEW.id,
            'Platform Web Search',
            'searxng',
            'Platform-managed SearXNG provider',
            '{"base_url":"http://searxng:8080","extra_config":{"managed_by":"platform-default"}}'::jsonb,
            true
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO web_search_providers (
    id, tenant_id, name, provider, description, parameters, is_default
)
SELECT
    uuid_generate_v4()::text,
    tenants.id,
    'Platform Web Search',
    'searxng',
    'Platform-managed SearXNG provider',
    '{"base_url":"http://searxng:8080","extra_config":{"managed_by":"platform-default"}}'::jsonb,
    true
FROM tenants
WHERE tenants.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM web_search_providers
      WHERE web_search_providers.tenant_id = tenants.id
        AND web_search_providers.is_default = true
        AND web_search_providers.deleted_at IS NULL
  );

DROP TRIGGER IF EXISTS trg_default_searxng_provider ON tenants;
CREATE TRIGGER trg_default_searxng_provider
AFTER INSERT ON tenants
FOR EACH ROW
EXECUTE FUNCTION ensure_default_searxng_provider();
