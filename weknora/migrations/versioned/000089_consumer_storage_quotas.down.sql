ALTER TABLE tenants ALTER COLUMN storage_quota SET DEFAULT 5368709120;

-- Roll back only tenants still carrying the exact revised defaults. Custom
-- operator overrides remain untouched.
UPDATE tenants
SET storage_quota = 5368709120,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND plan = 'free'
  AND storage_quota = 1073741824;

UPDATE tenants
SET storage_quota = 21474836480,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND plan = 'plus'
  AND storage_quota = 10737418240;

UPDATE tenants
SET storage_quota = 42949672960,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND plan = 'pro'
  AND storage_quota = 32212254720;

UPDATE tenants
SET storage_quota = 85899345920,
    updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND plan = 'max'
  AND storage_quota = 107374182400;
