/**
 * Public marketing price localization is intentionally a bounded snapshot.
 *
 * Paddle remains the source of truth for checkout. These are the only country
 * overrides for which this storefront has an approved, current Paddle snapshot
 * (see openspec/changes/enable-paddle-live-production/verification.md,
 * "Japan localization correction", 2026-08-28). Do not turn this into a
 * client-side FX or GeoIP system: adding a country requires a fresh Paddle
 * country-price verification and an explicit price-book entry.
 */
export const COUNTRY_PRICE_CURRENCIES = Object.freeze({
  CN: "CNY",
  JP: "JPY",
});

const FALLBACK_CURRENCIES = new Set(["USD", "CNY", "JPY"]);

export function normalizeCountry(value) {
  if (typeof value !== "string" || !/^[a-z]{2}$/i.test(value.trim())) return "";
  return value.trim().toUpperCase();
}

export function normalizePricingCurrency(value, fallback = "USD") {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (FALLBACK_CURRENCIES.has(normalized)) return normalized;
  return FALLBACK_CURRENCIES.has(fallback) ? fallback : "USD";
}

export function selectPricingCurrency(country, fallbackCurrency = "USD") {
  const normalizedCountry = normalizeCountry(country);
  // A recognized country without a verified override must not inherit a
  // language-selected CNY book; USD is the explicit safe public fallback.
  if (normalizedCountry) {
    return COUNTRY_PRICE_CURRENCIES[normalizedCountry] ?? "USD";
  }
  return normalizePricingCurrency(fallbackCurrency);
}

export function getInitialPricingCountry() {
  if (typeof window === "undefined") return "";
  return normalizeCountry(window.__MUSUW_COUNTRY__);
}
