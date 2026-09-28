ALTER TABLE tenants ALTER COLUMN storage_quota SET DEFAULT 1073741824;

-- Preserve operator-defined overrides. Only replace the exact defaults that
-- belonged to the previous consumer plan table.
UPDATE tenants
SET storage_quota = 1073741824,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND plan = 'free'
  AND storage_quota = 5368709120;

UPDATE tenants
SET storage_quota = 10737418240,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND plan = 'plus'
  AND storage_quota = 21474836480;

UPDATE tenants
SET storage_quota = 32212254720,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND plan = 'pro'
  AND storage_quota = 42949672960;

UPDATE tenants
SET storage_quota = 107374182400,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND plan = 'max'
  AND storage_quota = 85899345920;
