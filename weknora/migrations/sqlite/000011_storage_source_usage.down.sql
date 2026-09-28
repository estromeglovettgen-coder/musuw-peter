-- Restore the historical index-only aggregate from the active rows present at
-- rollback time. Historical pre-migration counter mistakes are not recoverable.
-- The recursive accumulation avoids SQLite SUM(integer) overflow and clamps
-- the aggregate at the signed int64 maximum.
WITH RECURSIVE row_values AS (
    SELECT
        k.tenant_id,
        ROW_NUMBER() OVER (PARTITION BY k.tenant_id ORDER BY k.id) AS row_number,
        CASE WHEN COALESCE(k.storage_size, 0) > 0 THEN k.storage_size ELSE 0 END AS contribution
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
