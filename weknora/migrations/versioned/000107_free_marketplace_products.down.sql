-- Refuse downgrade while free products exist; never delete marketplace data.
ALTER TABLE marketplace_products DROP CONSTRAINT marketplace_products_monthly_amount_check;
ALTER TABLE marketplace_products ADD CONSTRAINT marketplace_products_monthly_amount_check
 CHECK (monthly_amount > 0);
