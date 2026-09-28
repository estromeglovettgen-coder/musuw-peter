-- Rollback deterministically restores the historical index-only view from
-- active rows. It cannot recreate a pre-migration counter mistake for rows
-- that were subsequently added or deleted.
UPDATE tenants AS t
SET storage_used = COALESCE((
    SELECT LEAST(
        COALESCE(SUM(
            (CASE WHEN COALESCE(k.storage_size, 0) > 0 THEN k.storage_size ELSE 0 END)::numeric
        ), 0),
        9223372036854775807
    )::bigint
    FROM knowledges AS k
    WHERE k.tenant_id = t.id
      AND k.deleted_at IS NULL
), 0);
