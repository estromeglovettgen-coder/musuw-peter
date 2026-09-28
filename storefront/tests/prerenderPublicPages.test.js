import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { handleRequest } from "../worker/index.js";
import { PUBLIC_DOCUMENT_PATHS, getPublicDocument } from "../src/legalContent.js";

const dist = new URL("../dist/", import.meta.url);
const env = { ASSETS: { fetch: async (request) => {
  const path = new URL(request.url).pathname;
  const candidate = new URL(`${path.slice(1)}.html`, dist);
  return new Response(readFileSync(existsSync(candidate) ? candidate : new URL("index.html", dist)), {
    headers: { "content-type": "text/html", etag: '"static"' },
  });
} } };

test("public pages contain readable localized body text before JavaScript", async () => {
  for (const locale of ["en", "zh-CN"]) {
    for (const path of [locale === "en" ? "/en" : "/", "/press", ...PUBLIC_DOCUMENT_PATHS]) {
      const response = await handleRequest(new Request(`https://musuw.com${path}${["/", "/en"].includes(path) ? "" : `?lang=${locale}`}`, {
        headers: { cookie: `musuw_locale=${locale === "en" ? "zh-CN" : "en"}`, "CF-IPCountry": "US" },
      }), env);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${path} ${locale}`);
      assert.match(html, /<main\b/);
      assert.equal(response.headers.get("content-language"), locale);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("etag"), null);
      assert.ok(html.includes(`<link rel="canonical" href="https://musuw.com${path}">`));
      const document = getPublicDocument(locale, path);
      if (document && path !== "/contact") assert.ok(html.includes(`<h1>${document.title}</h1>`));
      if (path === "/press") assert.ok(html.includes("/media/press/"));
      if (path === "/" || path === "/en") {
        const heading = html.match(/<h1\b[\s\S]*?<\/h1>/)[0];
        assert.doesNotMatch(heading, /opacity:0|filter:blur/);
        assert.doesNotMatch(html, /renderToString.*Suspense/);
      }
    }
  }
});

test("pre-rendered home prices follow country independently of preferred language", async () => {
  for (const [country, locale, amount] of [
    ["CN", "en", "¥29"], ["CN", "zh-CN", "¥29"],
    ["JP", "en", "JP¥798"], ["JP", "zh-CN", "JP¥798"],
    ["US", "zh-CN", "$5"], ["GB", "zh-CN", "$5"],
    ["", "zh-CN", "¥29"], ["", "en", "$5"],
  ]) {
    const response = await handleRequest(new Request(`https://musuw.com${locale === "en" ? "/en" : "/"}`, {
      headers: { "CF-IPCountry": country },
    }), env);
    const html = await response.text();
    const prices = html.match(/class="plan-price"[\s\S]*?<\/div>/g) ?? [];
    assert.equal(prices.length, 4, `${country}/${locale}`);
    assert.ok(prices[1].includes(`<strong>${amount}</strong>`), `${country}/${locale}: ${prices[1]}`);
    assert.ok(html.includes(`__MUSUW_COUNTRY__=${JSON.stringify(country)}`));
  }
});

test("internal page variants are not directly reachable or indexable", async () => {
  for (const path of ["/_prerender", "/_prerender/en/press", "/%5Fprerender/en/home-usd.html"]) {
    const response = await handleRequest(new Request(`https://musuw.com${path}`), {
      ASSETS: { fetch: () => { throw new Error("private variant must not reach assets"); } },
    });
    assert.equal(response.status, 404);
  }
});

test("HEAD returns the same localized headers and no body", async () => {
  const response = await handleRequest(new Request("https://musuw.com/privacy?lang=zh-CN", { method: "HEAD" }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-language"), "zh-CN");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "");
});
