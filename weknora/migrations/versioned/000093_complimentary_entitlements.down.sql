ALTER TABLE tenants
    DROP COLUMN IF EXISTS complimentary_grant_id,
    DROP COLUMN IF EXISTS complimentary_expires_at,
    DROP COLUMN IF EXISTS complimentary_plan;
