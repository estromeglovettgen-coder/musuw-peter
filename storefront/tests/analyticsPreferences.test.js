import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("analytics choices are bilingual, equally visible, reversible, and absent before client configuration", async (t) => {
  const server = await createServer({ root: new URL("../", import.meta.url).pathname, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  t.after(() => server.close());
  const { AnalyticsChoice, AnalyticsPreferences } = await server.ssrLoadModule("/src/components/AnalyticsPreferences.jsx");
  assert.equal(renderToStaticMarkup(React.createElement(AnalyticsPreferences, { isZh: false })), "");
  for (const isZh of [true, false]) {
    const markup = renderToStaticMarkup(React.createElement(AnalyticsChoice, { isZh, consent: null }));
    assert.equal((markup.match(/class="button button-secondary"/g) ?? []).length, 2);
    assert.match(markup, isZh ? /拒绝统计/ : /Decline analytics/);
    assert.match(markup, isZh ? /同意统计/ : /Allow analytics/);
    assert.match(markup, /href="\/cookies\?lang=/);
    assert.doesNotMatch(markup, /role="dialog"|aria-modal/);
    const accepted = renderToStaticMarkup(React.createElement(AnalyticsChoice, { isZh, consent: "accepted" }));
    assert.match(accepted, isZh ? /撤回同意/ : /Withdraw consent/);
  }
});

test("the production build consumes the public GA4 repository variable", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/deploy-storefront.yml", import.meta.url), "utf8");
  assert.match(workflow, /name: Run storefront tests and build\s+env:\s+VITE_GA_MEASUREMENT_ID: \$\{\{ vars\.VITE_GA_MEASUREMENT_ID \}\}\s+run: npm --prefix storefront test/);
});
