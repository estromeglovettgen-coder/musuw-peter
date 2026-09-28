import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getStorefrontCopy } from "../src/i18n.js";
import { getPressContent } from "../src/pressContent.js";
import { localizeDocumentResponse } from "../worker/localization.js";

const root = new URL("../", import.meta.url).pathname;

test("media kit is a localized crawlable route before hydration, with a stable canonical", async () => {
  for (const locale of ["en", "zh-CN"]) {
    for (const path of ["/press", "/press/"]) {
      const response = await localizeDocumentResponse(new Response(readFileSync(join(root, "index.html"), "utf8"), {
        headers: { "content-type": "text/html" },
      }), locale, path);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-language"), locale);
      assert.ok(html.includes(`<title>${getPressContent(locale).meta.title}</title>`));
      assert.match(html, /name="robots" content="index,follow"/);
      assert.match(html, /rel="canonical" href="https:\/\/musuw\.com\/press"/);
      assert.match(html, /property="og:url" content="https:\/\/musuw\.com\/press"/);
      assert.match(html, /name="twitter:card" content="summary_large_image"/);
    }
  }
});

test("media kit offers eight opt-in videos, caption files, public downloads, and existing product routes", async (t) => {
  const server = await createServer({ root, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  t.after(() => server.close());
  const { PressPage } = await server.ssrLoadModule("/src/PressPage.jsx");
  for (const locale of ["en", "zh-CN"]) {
    const html = renderToStaticMarkup(React.createElement(PressPage, { copy: getStorefrontCopy(locale), locale }));
    assert.equal((html.match(/<video /g) ?? []).length, 8);
    assert.equal((html.match(/<track kind="captions"/g) ?? []).length, 8);
    assert.equal((html.match(/preload="none"/g) ?? []).length, 8);
    assert.doesNotMatch(html, /autoplay/i);
    assert.ok(html.includes(`href="${locale === "en" ? "" : "/zh"}/guides/citation-checks"`));
    assert.ok(html.includes(`href="${locale === "en" ? "/en" : "/"}#pricing"`));
    assert.match(html, /href="mailto:support@didren\.com"/);
    const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0];
    assert.ok(footer);
    assert.match(footer, /href="\/press"/);
    assert.ok(html.includes(locale === "en" ? "not live recordings" : "并非实机录屏"));
    const downloadPaths = [...html.matchAll(/href="([^"]+)"[^>]*\bdownload=""/g)].map((match) => match[1]);
    assert.equal(new Set(downloadPaths).size, 28);
    for (const language of ["en", "zh"]) {
      const pdf = `/media/press/musuw-product-brief-${language}.pdf`;
      assert.ok(downloadPaths.includes(pdf), `${language} product brief must be downloadable`);
      assert.equal(readFileSync(join(root, "public", pdf)).subarray(0, 5).toString(), "%PDF-");
    }
    for (const path of downloadPaths) {
      assert.ok(path.startsWith("/media/press/") || path.startsWith("/images/musuw-") || path === "/musuw-logo-512.png");
      assert.ok(statSync(join(root, "public", path)).size > 100, `${path} must be a real, nonempty download`);
    }
  }
});
