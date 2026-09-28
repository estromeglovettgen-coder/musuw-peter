import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../worker/index.js";

function assets() {
  const paths = [];
  return { paths, ASSETS: { fetch: async (request) => {
    paths.push(new URL(request.url).pathname);
    return new Response('<html><head></head><body>public page</body></html>', { headers: { "content-type": "text/html" } });
  } } };
}

test("each canonical homepage keeps its language across country and saved preference", async () => {
  for (const [path, locale, opposite] of [["/", "zh-CN", "en"], ["/en", "en", "zh-CN"]]) {
    for (const country of ["CN", "JP", "US"]) {
      const env = assets();
      const response = await handleRequest(new Request(`https://musuw.com${path}`, {
        headers: { cookie: `musuw_locale=${opposite}`, "CF-IPCountry": country },
      }), env);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-language"), locale);
      assert.equal(env.paths[0], `/_prerender/${locale}/home-${{ CN: "cny", JP: "jpy", US: "usd" }[country]}`);
      assert.ok(html.includes(`<link rel="canonical" href="https://musuw.com${path}">`));
      assert.match(html, /hreflang="zh-CN" href="https:\/\/musuw\.com\/"/);
      assert.match(html, /hreflang="en" href="https:\/\/musuw\.com\/en"/);
      assert.match(html, /hreflang="x-default" href="https:\/\/musuw\.com\/"/);
    }
  }
});

test("legacy language links and www combine into one redirect without dropping campaign or fragment", async () => {
  for (const [source, target] of [
    ["/?lang=en&utm_source=link#pricing", "/en?utm_source=link#pricing"],
    ["/?lang=zh-CN&utm_source=link#demo", "/?utm_source=link#demo"],
    ["/en?lang=zh-CN&utm_source=link#pricing", "/en?utm_source=link#pricing"],
    ["/zh/?lang=en&utm_source=link#pricing", "/?utm_source=link#pricing"],
    ["/en/?utm_source=link", "/en?utm_source=link"],
  ]) {
    for (const host of ["musuw.com", "www.musuw.com"]) {
      for (const method of ["GET", "HEAD"]) {
        const env = assets();
        const response = await handleRequest(new Request(`https://${host}${source}`, { method }), env);
        assert.equal(response.status, 301, source);
        assert.equal(response.headers.get("location"), `https://musuw.com${target}`);
        assert.deepEqual(env.paths, []);
      }
    }
  }
});

test("www canonicalization leaves API requests and non-GET methods alone", async () => {
  for (const [path, method] of [["/api/test", "GET"], ["/api", "HEAD"], ["/?lang=en", "POST"]]) {
    const response = await handleRequest(new Request(`https://www.musuw.com${path}`, { method }), assets());
    assert.equal(response.headers.get("location"), null);
  }
  const response = await handleRequest(new Request("https://www.musuw.com/privacy?lang=en"), assets());
  assert.equal(response.headers.get("location"), "https://musuw.com/privacy?lang=en");
});
