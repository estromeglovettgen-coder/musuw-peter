import assert from "node:assert/strict";
import test from "node:test";

import { priceBooks } from "../src/data/homeContent.js";
import {
  COUNTRY_PRICE_CURRENCIES,
  normalizeCountry,
  normalizePricingCurrency,
  selectPricingCurrency,
} from "../src/pricingLocalization.js";

test("country pricing is a bounded Paddle snapshot, independent of language", () => {
  assert.deepEqual(COUNTRY_PRICE_CURRENCIES, { CN: "CNY", JP: "JPY" });
  assert.equal(selectPricingCurrency("jp", "USD"), "JPY");
  assert.equal(selectPricingCurrency("CN", "USD"), "CNY");
  assert.equal(selectPricingCurrency("US", "CNY"), "USD");
  assert.equal(selectPricingCurrency("US", "USD"), "USD");
  assert.equal(selectPricingCurrency("DE", "EUR"), "USD");
  assert.equal(normalizeCountry("  jP "), "JP");
  assert.equal(normalizeCountry("not-a-country"), "");
  assert.equal(normalizePricingCurrency("eur", "CNY"), "CNY");
});

test("the Japanese public price book matches the verified Paddle Live snapshot", () => {
  assert.deepEqual(priceBooks.JPY, [
    { monthly: 0, yearlyTotal: 0 },
    { monthly: 798, yearlyTotal: 7816 },
    { monthly: 1595, yearlyTotal: 15791 },
    { monthly: 3190, yearlyTotal: 31741 },
  ]);
});
