import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { handleRequest } from "../worker/index.js";

const root = new URL("../", import.meta.url);
const cases = [
  ["/compare/notebooklm", "en", "Musuw vs. Gemini Notebook"],
  ["/zh/compare/notebooklm", "zh-CN", "Musuw 与 Gemini Notebook 怎么选"],
];

test("comparison URLs serve their full article and matching metadata despite conflicting locale inputs", async () => {
  for (const [pathname, locale, title] of cases) {
    const opposite = locale === "en" ? "zh-CN" : "en";
    const response = await handleRequest(new Request(`https://musuw.com${pathname}?lang=${opposite}`, {
      headers: { cookie: `musuw_locale=${opposite}`, "CF-IPCountry": locale === "en" ? "CN" : "US" },
    }), {
      ASSETS: { fetch: async () => new Response(readFileSync(new URL(`dist${pathname}.html`, root), "utf8"), { headers: { "content-type": "text/html" } }) },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-language"), locale);
    assert.match(response.headers.get("cache-control"), /no-store/);
    const html = await response.text();
    assert.ok(html.includes(`<html lang="${locale}">`));
    assert.ok(html.includes(`<h1>${title}</h1>`));
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.ok(html.includes(`<link rel="canonical" href="https://musuw.com${pathname}">`));
    assert.match(html, /name="robots" content="index,follow"/);
    for (const [alternate, alternateLocale] of cases) {
      assert.ok(html.includes(`hreflang="${alternateLocale}" href="https://musuw.com${alternate}"`));
      assert.equal((html.match(new RegExp(`hreflang="${alternateLocale}"`, "g")) ?? []).length, 1);
    }
    assert.match(html, /<table>/);
    assert.match(html, /<th scope="col">Musuw<\/th>/);
    assert.match(html, /<th scope="col">Gemini Notebook/);
    assert.equal((html.match(/<th scope="row">/g) ?? []).length, 4);
    assert.match(html, /href="https:\/\/support\.google\.com\/gemininotebook\/answer\/16206563"/);
    assert.ok(html.includes(`href="${locale === "en" ? "" : "/zh"}/guides/citation-checks"`));
    assert.ok(html.includes(`href="${locale === "en" ? "/en" : "/"}#pricing"`));
    assert.match(html, /src="\/images\/musuw-wiki-page\.jpg"/);
    assert.equal((html.match(/id="musuw-locale-bootstrap"/g) ?? []).length, 1);
  }
});

test("unknown comparison routes remain unindexable 404s", async () => {
  for (const pathname of ["/compare/missing", "/zh/compare/missing", "/compare/notebooklm/extra"]) {
    const response = await handleRequest(new Request(`https://musuw.com${pathname}`), {
      ASSETS: { fetch: async () => new Response(readFileSync(new URL("dist/index.html", root), "utf8"), { headers: { "content-type": "text/html" } }) },
    });
    assert.equal(response.status, 404);
    assert.match(await response.text(), /name="robots" content="noindex,follow"/);
  }
});
