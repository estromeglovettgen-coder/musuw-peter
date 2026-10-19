DROP TABLE IF EXISTS fire_question_calls;
ALTER TABLE fire_token_adjustments DROP COLUMN questions;
ALTER TABLE fire_token_memberships DROP COLUMN reserved_questions;
ALTER TABLE fire_token_memberships DROP COLUMN used_questions;
ALTER TABLE fire_token_memberships DROP COLUMN question_limit;
ALTER TABLE fire_token_plans DROP COLUMN question_limit;
