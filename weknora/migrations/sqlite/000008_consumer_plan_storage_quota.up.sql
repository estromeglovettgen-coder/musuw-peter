-- Align persisted default quotas with the current consumer plan matrix while
-- preserving operator-defined overrides. SQLite cannot alter the existing
-- column default without rebuilding tenants; the flattened fresh schema
-- carries the new 1 GiB default.
UPDATE tenants
SET storage_quota = 1073741824
WHERE deleted_at IS NULL
  AND plan = 'free'
  AND storage_quota = 5368709120;

UPDATE tenants
SET storage_quota = 10737418240
WHERE deleted_at IS NULL
  AND plan = 'plus'
  AND storage_quota = 21474836480;

UPDATE tenants
SET storage_quota = 32212254720
WHERE deleted_at IS NULL
  AND plan = 'pro'
  AND storage_quota = 42949672960;

UPDATE tenants
SET storage_quota = 107374182400
WHERE deleted_at IS NULL
  AND plan = 'max'
  AND storage_quota = 85899345920;
