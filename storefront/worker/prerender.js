import { getStorefrontCopy } from "../src/i18n.js";
import { PUBLIC_DOCUMENT_PATHS } from "../src/legalContent.js";
import { PRESS_PATH } from "../src/pressContent.js";
import { selectPricingCurrency } from "../src/pricingLocalization.js";
import { normalizePathname } from "../src/seoMetadata.js";
import { homeLocale } from "../src/publicRoutes.js";

// The build and Worker share one bounded mapping; no user input becomes an asset path.
export function prerenderAssetPath(pathname, locale, country = "") {
  const path = normalizePathname(pathname);
  const language = homeLocale(path) ?? (locale === "zh-CN" ? "zh-CN" : "en");
  if (homeLocale(path)) {
    const currency = selectPricingCurrency(country, getStorefrontCopy(language).pricing.currencyCode);
    return `/_prerender/${language}/home-${currency.toLowerCase()}`;
  }
  if (path === PRESS_PATH || PUBLIC_DOCUMENT_PATHS.includes(path)) {
    return `/_prerender/${language}${path}`;
  }
  return null;
}
