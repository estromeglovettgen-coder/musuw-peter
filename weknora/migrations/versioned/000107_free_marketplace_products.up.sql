-- Free products reuse reviewed assets without subscription or Paddle prices.
ALTER TABLE marketplace_products DROP CONSTRAINT marketplace_products_monthly_amount_check;
ALTER TABLE marketplace_products ADD CONSTRAINT marketplace_products_monthly_amount_check
 CHECK (monthly_amount >= 0);
