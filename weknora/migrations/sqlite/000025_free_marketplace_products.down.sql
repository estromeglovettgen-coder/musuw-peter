-- Refuse downgrade while free products exist; never remove marketplace data.
CREATE TABLE marketplace_free_rollback_guard (free_products INTEGER CHECK(free_products = 0));
INSERT INTO marketplace_free_rollback_guard
SELECT count(*) FROM marketplace_products WHERE monthly_amount = 0;
PRAGMA writable_schema = ON;
UPDATE sqlite_master
SET sql = replace(sql, 'CHECK(monthly_amount >= 0)', 'CHECK(monthly_amount > 0)')
WHERE type = 'table' AND name = 'marketplace_products';
PRAGMA writable_schema = RESET;
DROP TABLE marketplace_free_rollback_guard;
