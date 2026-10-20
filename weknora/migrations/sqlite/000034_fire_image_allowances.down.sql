DROP TABLE fire_image_calls;
ALTER TABLE fire_token_adjustments DROP COLUMN image_outcome;
ALTER TABLE fire_token_adjustments DROP COLUMN image_task_id;
ALTER TABLE fire_token_adjustments DROP COLUMN images;
ALTER TABLE fire_token_memberships DROP COLUMN reserved_images;
ALTER TABLE fire_token_memberships DROP COLUMN used_images;
ALTER TABLE fire_token_memberships DROP COLUMN image_limit;
ALTER TABLE fire_token_plans DROP COLUMN image_limit;
