import assert from "node:assert/strict";
import test from "node:test";
import {
  STOREFRONT_AUTH_STATUS_URL,
  readStorefrontAuthentication,
} from "../src/storefrontAuthStatus.js";

function response(payload, ok = true) {
  return {
    ok,
    json: async () => payload,
  };
}

test("authenticated status uses one bounded credentialed request and returns true", async () => {
  const calls = [];
  const authenticated = await readStorefrontAuthentication({
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      return response({ data: { authenticated: true } });
    },
    timeoutMs: 50,
  });

  assert.equal(authenticated, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://app.musuw.com/v1/auth/status");
  assert.equal(calls[0][0], STOREFRONT_AUTH_STATUS_URL);
  assert.deepEqual(
    {
      cache: calls[0][1].cache,
      credentials: calls[0][1].credentials,
      method: calls[0][1].method,
    },
    { cache: "no-store", credentials: "include", method: "GET" },
  );
  assert.equal(calls[0][1].headers.Accept, "application/json");
  assert.ok(calls[0][1].signal instanceof AbortSignal);
});

test("explicit signed-out status stays on the guest entry actions", async () => {
  let calls = 0;
  const authenticated = await readStorefrontAuthentication({
    fetchImpl: async () => {
      calls += 1;
      return response({ data: { authenticated: false } });
    },
    timeoutMs: 50,
  });

  assert.equal(authenticated, false);
  assert.equal(calls, 1);
});

test("network, HTTP, and malformed response failures degrade to guest", async (t) => {
  await t.test("network", async () => {
    assert.equal(
      await readStorefrontAuthentication({
        fetchImpl: async () => {
          throw new Error("offline");
        },
        timeoutMs: 50,
      }),
      false,
    );
  });

  await t.test("HTTP", async () => {
    assert.equal(
      await readStorefrontAuthentication({
        fetchImpl: async () => response({ data: { authenticated: true } }, false),
        timeoutMs: 50,
      }),
      false,
    );
  });

  await t.test("malformed", async () => {
    assert.equal(
      await readStorefrontAuthentication({
        fetchImpl: async () => response({ authenticated: true }),
        timeoutMs: 50,
      }),
      false,
    );
  });
});

test("a slow status endpoint times out, aborts, and leaves guest actions usable", async () => {
  let aborted = false;
  const authenticated = await readStorefrontAuthentication({
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      }, { once: true });
    }),
    timeoutMs: 5,
  });

  assert.equal(authenticated, false);
  assert.equal(aborted, true);
});
