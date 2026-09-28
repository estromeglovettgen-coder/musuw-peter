import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../worker/index.js";

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

test("the shared demo URL redirects readers to the canonical guide with its query intact", async () => {
  for (const method of ["GET", "HEAD"]) {
    for (const suffix of ["", "/?utm_source=directory&lang=en"]) {
      const response = await handleRequest(
        new Request(`https://musuw.com/guides/check-ai-answer-sources${suffix}`, { method }),
        env,
      );
      assert.equal(response.status, 301);
      assert.equal(response.headers.get("location"),
        `https://musuw.com/guides/citation-checks${suffix.startsWith("/") ? suffix.slice(1) : suffix}`);
      assert.equal(await response.text(), "");
    }
  }
});

test("the shared Chinese homepage URL enters the existing Chinese homepage", async () => {
  for (const method of ["GET", "HEAD"]) {
    for (const pathname of ["/zh", "/zh/"]) {
      const response = await handleRequest(
        new Request(`https://musuw.com${pathname}?utm_source=github&lang=en`, { method }),
        env,
      );
      assert.equal(response.status, 301);
      assert.equal(response.headers.get("location"),
        "https://musuw.com/?utm_source=github");
    }
  }
});

test("the shared demo redirect does not claim other paths, POSTs or the partner host", async () => {
  for (const [url, method] of [
    ["https://musuw.com/guides/check-ai-answer-sources-extra", "GET"],
    ["https://musuw.com/guides/check-ai-answer-sources/child", "GET"],
    ["https://musuw.com/guides/check-ai-answer-sources", "POST"],
    ["https://partners.musuw.com/guides/check-ai-answer-sources", "GET"],
    ["https://musuw.com/zh/unknown", "GET"],
    ["https://musuw.com/zh", "POST"],
    ["https://partners.musuw.com/zh", "GET"],
  ]) {
    const response = await handleRequest(new Request(url, { method }), env);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("location"), null);
  }
});
