-- Reconcile tenant usage from active knowledge rows. NULL and negative source
-- or index components are normalized to zero; failed rows remain counted while
-- their owned source/index data is retained for retry or deletion. SQLite's
-- SUM(integer) can overflow before a caller can clamp it, so a recursive CTE
-- accumulates each row with an explicit int64 saturation guard.
WITH RECURSIVE row_values AS (
    SELECT
        k.tenant_id,
        ROW_NUMBER() OVER (PARTITION BY k.tenant_id ORDER BY k.id) AS row_number,
        CASE
            WHEN (CASE WHEN COALESCE(k.file_size, 0) > 0 THEN k.file_size ELSE 0 END)
                 > 9223372036854775807
                   - (CASE WHEN COALESCE(k.storage_size, 0) > 0 THEN k.storage_size ELSE 0 END)
            THEN 9223372036854775807
            ELSE (CASE WHEN COALESCE(k.file_size, 0) > 0 THEN k.file_size ELSE 0 END)
               + (CASE WHEN COALESCE(k.storage_size, 0) > 0 THEN k.storage_size ELSE 0 END)
        END AS contribution
    FROM knowledges AS k
    WHERE k.deleted_at IS NULL
), usage(tenant_id, row_number, total) AS (
    SELECT tenant_id, row_number, contribution
    FROM row_values
    WHERE row_number = 1
    UNION ALL
    SELECT next.tenant_id, next.row_number,
        CASE
            WHEN usage.total > 9223372036854775807 - next.contribution
            THEN 9223372036854775807
            ELSE usage.total + next.contribution
        END
    FROM usage
    JOIN row_values AS next
      ON next.tenant_id = usage.tenant_id
     AND next.row_number = usage.row_number + 1
)
UPDATE tenants
SET storage_used = COALESCE((
    SELECT total
    FROM usage
    WHERE usage.tenant_id = tenants.id
    ORDER BY row_number DESC
    LIMIT 1
), 0);
