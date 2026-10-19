ALTER TABLE fire_token_plans ADD COLUMN question_limit BIGINT NOT NULL DEFAULT 0 CHECK (question_limit BETWEEN 0 AND 1000000000);
ALTER TABLE fire_token_memberships ADD COLUMN question_limit BIGINT NOT NULL DEFAULT 0 CHECK (question_limit BETWEEN 0 AND 1000000000);
ALTER TABLE fire_token_memberships ADD COLUMN used_questions BIGINT NOT NULL DEFAULT 0 CHECK (used_questions >= 0);
ALTER TABLE fire_token_memberships ADD COLUMN reserved_questions BIGINT NOT NULL DEFAULT 0 CHECK (reserved_questions >= 0);
ALTER TABLE fire_token_adjustments ADD COLUMN questions BIGINT NOT NULL DEFAULT 0 CHECK (questions >= 0);
CREATE TABLE fire_question_calls (
    id TEXT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_id TEXT NOT NULL,
    message_id VARCHAR(36) NOT NULL,
    session_id VARCHAR(36) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'released')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    settled_at DATETIME,
    CONSTRAINT fire_question_membership FOREIGN KEY (user_id) REFERENCES fire_token_memberships(user_id) ON DELETE CASCADE,
    CONSTRAINT fire_question_message UNIQUE (user_id, message_id)
);
CREATE INDEX fire_questions_user_period ON fire_question_calls(user_id, period_id, created_at);
CREATE INDEX fire_questions_recovery ON fire_question_calls(status, created_at);
