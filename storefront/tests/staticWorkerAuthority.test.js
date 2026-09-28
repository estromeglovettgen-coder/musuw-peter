import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../worker/index.js";

test("the storefront Worker has no checkout or account API authority", async () => {
  let assetCalls = 0;
  const response = await handleRequest(
    new Request("https://musuw.com/api/checkout", {
      body: JSON.stringify({ plan: "personal", billingPeriod: "monthly" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    {
      ASSETS: {
        async fetch() {
          assetCalls += 1;
          return new Response("asset");
        },
      },
    },
  );

  assert.equal(response.status, 404);
  assert.equal(assetCalls, 0);
  assert.deepEqual(await response.json(), { error: "NOT_FOUND" });
});
