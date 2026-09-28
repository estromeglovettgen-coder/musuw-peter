-- Reconcile the existing tenant aggregate from active knowledge rows. Source
-- bytes and derived index bytes are independent diagnostics, so each positive
-- component is charged once and legacy NULL/negative values contribute zero.
-- SUM is evaluated as numeric before the final cast so the migration follows
-- the runtime saturating int64 contract instead of overflowing a BIGINT.
UPDATE tenants AS t
SET storage_used = COALESCE((
    SELECT LEAST(
        COALESCE(SUM(
            (CASE WHEN COALESCE(k.file_size, 0) > 0 THEN k.file_size ELSE 0 END)::numeric
            + (CASE WHEN COALESCE(k.storage_size, 0) > 0 THEN k.storage_size ELSE 0 END)::numeric
        ), 0),
        9223372036854775807
    )::bigint
    FROM knowledges AS k
    WHERE k.tenant_id = t.id
      AND k.deleted_at IS NULL
), 0);
