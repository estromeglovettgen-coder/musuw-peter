import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { handleRequest } from "../worker/index.js";

const root = new URL("../", import.meta.url);

test("guide URLs retain their own language and canonical despite visitor locale", async () => {
  for (const [pathname, locale, title] of [
    ["/guides/citation-checks", "en", "Three checks for cited answers | Musuw"],
    ["/zh/guides/citation-checks", "zh-CN", "核验引用的三个步骤 | Musuw"],
  ]) {
    const oppositeLocale = locale === "en" ? "zh-CN" : "en";
    const request = new Request(`https://musuw.com${pathname}?lang=${oppositeLocale}`, {
      headers: { cookie: `musuw_locale=${oppositeLocale}`, "CF-IPCountry": locale === "en" ? "CN" : "US" },
    });
    const response = await handleRequest(request, {
      ASSETS: { fetch: async () => new Response(readFileSync(new URL("index.html", root), "utf8"), { headers: { "content-type": "text/html" } }) },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-language"), locale);
    const html = await response.text();
    assert.ok(html.includes(`<html lang="${locale}">`));
    assert.ok(html.includes(`<title>${title}</title>`));
    assert.ok(html.includes(`<link rel="canonical" href="https://musuw.com${pathname}">`));
    assert.match(html, /name="robots" content="index,follow"/);
    assert.match(html, /rel="alternate" hreflang="en" href="https:\/\/musuw\.com\/guides\/citation-checks"/);
    assert.match(html, /rel="alternate" hreflang="zh-CN" href="https:\/\/musuw\.com\/zh\/guides\/citation-checks"/);
  }
});

test("built guide responses contain the complete article without running JavaScript", async () => {
  for (const [pathname, expected] of [
    ["/guides/citation-checks", ["fictional planning example", "September 24, 2026", "October 1 remains a conditional plan", "final approver", "AI assistance"]],
    ["/zh/guides/citation-checks", ["虚构的规划示例", "2026 年 9 月 24 日", "10 月 1 日仍是有条件的计划", "最终批准人", "AI 辅助"]],
  ]) {
    const response = await handleRequest(new Request(`https://musuw.com${pathname}`), {
      ASSETS: { fetch: async () => {
        const file = new URL(`dist${pathname}.html`, root);
        return new Response(readFileSync(existsSync(file) ? file : new URL("dist/index.html", root), "utf8"), { headers: { "content-type": "text/html" } });
      } },
    });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<article\b/, "article must be present in the initial response");
    for (const text of expected) assert.ok(html.includes(text), text);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1);
    assert.match(html, /href="https:\/\/gist\.github\.com\/estromeglovettgen-coder\/9ffbe863d4c176d0499627d364566128"/);
    assert.match(html, /src="\/images\/guides\/cedar-cited-answer\.jpg"/);
    const videoLanguage = pathname.startsWith("/zh/") ? "zh" : "en";
    assert.match(html, /<video controls="" playsInline="" preload="none"/);
    assert.ok(html.includes(`src="/media/press/musuw-cedar-live-${videoLanguage}-16x9.mp4"`));
    assert.ok(html.includes(`src="/media/press/cedar-live-${videoLanguage}.vtt"`));
    assert.doesNotMatch(html, /<video[^>]*autoPlay/i);
    assert.match(html, /href="\/guides\/citation-checks"[^>]*>English<\/a>/);
    assert.match(html, /href="\/zh\/guides\/citation-checks"[^>]*>中文<\/a>/);
    assert.equal((html.match(/hreflang="en"/g) ?? []).length, 1);
    assert.equal((html.match(/hreflang="zh-CN"/g) ?? []).length, 1);
    assert.equal((html.match(/id="musuw-locale-bootstrap"/g) ?? []).length, 1);
    for (const filename of ["01-project-brief.md", "02-source-register.md", "03-review-note.md"]) {
      assert.ok(html.includes(`href="/examples/cedar/${filename}" download=""`));
      const source = readFileSync(new URL(`dist/examples/cedar/${filename}`, root), "utf8");
      assert.match(source, /fictional/i);
      assert.doesNotMatch(source, /<html/i);
    }
  }
});

test("site verification survives localization and unknown guide URLs remain 404", async () => {
  for (const path of ["/", "/press", "/guides/citation-checks", "/zh/guides/citation-checks", "/guides/missing"]) {
    for (const locale of ["en", "zh-CN"]) {
      const requestPath = path === "/" ? (locale === "en" ? "/en" : "/") : `${path}?lang=${locale}`;
      const response = await handleRequest(new Request(`https://musuw.com${requestPath}`), {
        ASSETS: { fetch: async () => new Response(readFileSync(new URL("index.html", root), "utf8"), { headers: { "content-type": "text/html" } }) },
      });
      const html = await response.text();
      assert.equal(response.status, path.endsWith("missing") ? 404 : 200);
      assert.equal((html.match(/name="google-site-verification" content="vS9ylGV6pFQKk3FgNEpR0o9jKV--P_Gnrv4M8rHDNus"/g) ?? []).length, 1);
      assert.equal((html.match(/name="google-site-verification" content="7lQwhi1oEZApp6nxmYt0FYHmfTn226ffpQH4ZTMAYHc"/g) ?? []).length, 1);
      if (path.endsWith("missing")) assert.match(html, /name="robots" content="noindex,follow"/);
    }
  }
});
