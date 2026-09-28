-- Roll back only rows that still carry the exact revised plan defaults.
-- Operator-defined overrides and stored usage remain untouched.
UPDATE tenants
SET storage_quota = 5368709120
WHERE deleted_at IS NULL
  AND plan = 'free'
  AND storage_quota = 1073741824;

UPDATE tenants
SET storage_quota = 21474836480
WHERE deleted_at IS NULL
  AND plan = 'plus'
  AND storage_quota = 10737418240;

UPDATE tenants
SET storage_quota = 42949672960
WHERE deleted_at IS NULL
  AND plan = 'pro'
  AND storage_quota = 32212254720;

UPDATE tenants
SET storage_quota = 85899345920
WHERE deleted_at IS NULL
  AND plan = 'max'
  AND storage_quota = 107374182400;
