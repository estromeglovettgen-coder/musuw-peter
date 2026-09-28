import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { handleRequest } from "../worker/index.js";
import { selectPricingCurrency } from "../src/pricingLocalization.js";
import { getStorefrontCopy } from "../src/i18n.js";
import { priceBooks } from "../src/data/homeContent.js";

test("the homepage price book follows each request's country across languages and cached source assets", async () => {
  const env = {
    ASSETS: {
      async fetch() {
        return new Response('<html lang="en"><head></head><body></body></html>', {
          headers: { "content-type": "text/html", "cf-cache-status": "HIT" },
        });
      },
    },
  };
  // Repeat CN after JP to detect accidental reuse of another visitor's
  // personalized bootstrap. UI language must not select the price book.
  for (const country of ["JP", "CN", "US", "CN"]) {
    for (const locale of ["en", "zh-CN"]) {
      const request = new Request(`https://musuw.com${locale === "en" ? "/en" : "/"}`, {
        headers: { cookie: `musuw_locale=${locale}`, "CF-IPCountry": "JP" },
      });
      Object.defineProperty(request, "cf", { value: { country } });
      const response = await handleRequest(request, env);
      const html = await response.text();
      const bootstrap = html.match(/<script id="musuw-locale-bootstrap">(window\.__MUSUW_LOCALE__=[\s\S]*?)<\/script>/)?.[1];
      assert.ok(bootstrap, "the Worker supplies the browser bootstrap");
      const browser = { window: { location: new URL(request.url) } };
      vm.runInNewContext(bootstrap, browser);
      const resolvedLocale = browser.window.__MUSUW_LOCALE__;
      const copy = getStorefrontCopy(resolvedLocale);
      const pricingCurrency = selectPricingCurrency(browser.window.__MUSUW_COUNTRY__, copy.pricing.currencyCode);
      const amounts = priceBooks[pricingCurrency].map((plan) => plan.monthly);
      assert.deepEqual(amounts, {
        CN: [0, 29, 59, 129],
        JP: [0, 798, 1595, 3190],
        US: [0, 5, 10, 20],
      }[country], `${country} / ${locale} displays the correct country prices`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
  }
});
