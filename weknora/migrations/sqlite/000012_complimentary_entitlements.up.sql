ALTER TABLE tenants ADD COLUMN complimentary_plan VARCHAR(16);
ALTER TABLE tenants ADD COLUMN complimentary_expires_at DATETIME;
ALTER TABLE tenants ADD COLUMN complimentary_grant_id VARCHAR(64);
