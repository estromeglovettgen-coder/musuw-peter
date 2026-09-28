-- Only the CHECK expression changes. Updating the schema in place preserves
-- incoming subscription/transaction foreign keys inside the migration transaction.
-- SQLite documents this method for CHECK changes; RESET reloads the parsed schema.
-- https://www.sqlite.org/lang_altertable.html#otheralter
-- The short-lived guard also advances SQLite's schema cookie for other connections.
CREATE TABLE marketplace_free_schema_guard (valid INTEGER NOT NULL CHECK(valid = 1));
INSERT INTO marketplace_free_schema_guard
SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'marketplace_products'
 AND instr(sql, 'CHECK(monthly_amount > 0)') > 0;
PRAGMA writable_schema = ON;
UPDATE sqlite_master
SET sql = replace(sql, 'CHECK(monthly_amount > 0)', 'CHECK(monthly_amount >= 0)')
WHERE type = 'table' AND name = 'marketplace_products';
PRAGMA writable_schema = RESET;
DROP TABLE marketplace_free_schema_guard;
