import { describe, expect, it, vi } from "vitest";

import {
  AUTH_FLOW_TTL_MS,
  createAuthRuntime,
  isLocalMusuwAuthEnabled,
  type AuthorizationDetails,
  type IdentityClient,
  type SessionStorageLike,
} from "./runtime";

function storage(): SessionStorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

function authorizationDetails(
  clientId = "weknora-client",
): AuthorizationDetails {
  return {
    authorization_id: "authorization_1",
    client: {
      id: clientId,
      logo_uri: "",
      name: "Musuw",
      uri: "https://app.musuw.com",
    },
    redirect_uri: "https://app.musuw.com/api/v1/auth/oidc/callback",
    scope: "openid email profile",
  };
}

function identity(
  overrides: Partial<IdentityClient> = {},
): IdentityClient {
  return {
    exchangeCodeForSession: vi.fn(async () => ({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    })),
    getSession: vi.fn(async () => ({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    })),
    oauth: {
      approveAuthorization: vi.fn(async () => ({
        data: {
          redirect_url:
            "https://app.musuw.com/api/v1/auth/oidc/callback?code=oidc-code&state=weknora-state",
        },
        error: null,
      })),
      getAuthorizationDetails: vi.fn(async () => ({
        data: authorizationDetails(),
        error: null,
      })),
    },
    signInWithOAuth: vi.fn(async () => ({
      data: { url: "https://identity.example/authorize" },
      error: null,
    })),
    signInWithPassword: vi.fn(async () => ({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    })),
    signUp: vi.fn(async () => ({
      data: { session: null },
      error: null,
    })),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    })),
    verifyOtp: vi.fn(async () => ({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    })),
    ...overrides,
  };
}

function runtimeFor(
  client: IdentityClient,
  store = storage(),
  assigned = vi.fn(),
  fetch = vi.fn<typeof globalThis.fetch>(async () =>
    response({
      authorization_url:
        "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
      success: true,
    }),
  ),
  nativeStore = storage(),
  publicOrigin = "https://app.musuw.com",
  sharedStore?: SessionStorageLike,
  localMusuwPasswordAuth = false,
) {
  const runtimeOptions = {
    config: {
      publicOrigin,
      publishableKey: "sb_publishable_key",
      supabaseUrl: "https://identity.example",
      weknoraOAuthClientId: "weknora-client",
    },
    createIdentityClient: () => client,
    fetch,
    location: { assign: assigned, origin: "https://app.musuw.com" },
    localMusuwPasswordAuth,
    nativeStorage: nativeStore,
    nextFlowId: () => "flow_1",
    now: () => 1,
    storage: store,
    ...(sharedStore === undefined ? {} : { sharedStorage: sharedStore }),
  };
  return {
    assigned,
    fetch,
    runtime: createAuthRuntime(runtimeOptions),
    nativeStore,
    store,
  };
}

describe("Supabase to WeKnora authorization continuation", () => {
  it("automatically resumes native OIDC from the start route when Supabase is already signed in", async () => {
    const client = identity();
    const { assigned, fetch, runtime } = runtimeFor(client);

    await expect(
      (runtime as typeof runtime & { resumeStart(): Promise<unknown> }).resumeStart(),
    ).resolves.toEqual({ state: "start_complete" });

    expect(client.getSession).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/oidc/url?"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(assigned).toHaveBeenLastCalledWith(
      "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
    );
  });

  it("takes an already valid native session directly to the same-origin workspace", async () => {
    const client = identity();
    const nativeStore = storage();
    nativeStore.setItem("weknora_token", "native-session-token");
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input);
      if (url === "https://app.musuw.com/api/v1/auth/me") {
        return response({ success: true });
      }
      return response({ success: false }, 500);
    });
    const { assigned, runtime } = runtimeFor(client, storage(), vi.fn(), fetch, nativeStore);

    await expect(runtime.resumeStart("/?plan=max&period=yearly")).resolves.toEqual({ state: "start_complete" });

    expect(fetch).toHaveBeenCalledWith(
      "https://app.musuw.com/api/v1/auth/me",
      expect.objectContaining({
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer native-session-token",
        },
      }),
    );
    expect(client.getSession).not.toHaveBeenCalled();
    expect(assigned).toHaveBeenLastCalledWith("https://app.musuw.com/?plan=max&period=yearly");
  });

  it("clears a stale native session before it resumes a valid Supabase session", async () => {
    const client = identity();
    const nativeStore = storage();
    nativeStore.setItem("weknora_token", "stale-native-token");
    nativeStore.setItem("weknora_refresh_token", "stale-refresh-token");
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input);
      if (url === "https://app.musuw.com/api/v1/auth/me") {
        return response({ success: false }, 401);
      }
      return response({
        authorization_url:
          "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
        success: true,
      });
    });
    const { assigned, runtime } = runtimeFor(client, storage(), vi.fn(), fetch, nativeStore);

    await expect(runtime.resumeStart()).resolves.toEqual({ state: "start_complete" });

    expect(nativeStore.getItem("weknora_token")).toBeNull();
    expect(nativeStore.getItem("weknora_refresh_token")).toBeNull();
    expect(client.getSession).toHaveBeenCalledOnce();
    expect(assigned).toHaveBeenLastCalledWith(
      "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
    );
  });

  it("keeps a native session when its validation endpoint is temporarily unavailable", async () => {
    const client = identity();
    const nativeStore = storage();
    nativeStore.setItem("weknora_token", "native-session-token");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({ success: false }, 503));
    const { assigned, runtime } = runtimeFor(client, storage(), vi.fn(), fetch, nativeStore);

    await expect(runtime.resumeStart()).resolves.toEqual({
      code: "native_session_unavailable",
      state: "start_error",
    });

    expect(nativeStore.getItem("weknora_token")).toBe("native-session-token");
    expect(client.getSession).not.toHaveBeenCalled();
    expect(assigned).not.toHaveBeenCalled();
  });

  it("keeps a native session when its validation response is malformed", async () => {
    const client = identity();
    const nativeStore = storage();
    nativeStore.setItem("weknora_token", "native-session-token");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response({ success: false }));
    const { assigned, runtime } = runtimeFor(client, storage(), vi.fn(), fetch, nativeStore);

    await expect(runtime.resumeStart()).resolves.toEqual({
      code: "native_session_unavailable",
      state: "start_error",
    });

    expect(nativeStore.getItem("weknora_token")).toBe("native-session-token");
    expect(client.getSession).not.toHaveBeenCalled();
    expect(assigned).not.toHaveBeenCalled();
  });

  it("uses the current localhost origin for the OIDC callback", async () => {
    const client = identity();
    const assigned = vi.fn();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      response({
        authorization_url:
          "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
        success: true,
      }),
    );
    const runtime = createAuthRuntime({
      config: {
        publicOrigin: "http://localhost:4190",
        publishableKey: "sb_publishable_key",
        supabaseUrl: "https://identity.example",
        weknoraOAuthClientId: "weknora-client",
      },
      createIdentityClient: () => client,
      fetch,
      location: { assign: assigned, origin: "http://localhost:4190" },
      nativeStorage: storage(),
      now: () => 1,
      storage: storage(),
    });

    await expect(runtime.resumeStart()).resolves.toEqual({ state: "start_complete" });

    const requestURL = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(requestURL.origin).toBe("http://localhost:4190");
    expect(requestURL.pathname).toBe("/api/v1/auth/oidc/url");
    expect(requestURL.searchParams.get("redirect_uri")).toBe(
      "http://localhost:4190/api/v1/auth/oidc/callback",
    );
  });

  it("starts only the native WeKnora OIDC endpoint after an ordinary Google login", async () => {
    const client = identity();
    const { assigned, fetch, runtime } = runtimeFor(client);

    await runtime.startGoogle();
    await expect(runtime.completeCallback("?code=google-code&flow=flow_1")).resolves.toEqual({
      state: "identity_complete",
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/oidc/url?"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetch.mock.calls.flat().join(" ")).not.toContain("/v1/auth/exchange");
    expect(assigned).toHaveBeenLastCalledWith(
      "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
    );
  });

  it("processes one Google callback exactly once when the browser invokes the route effect twice", async () => {
    const client = identity();
    const { fetch, runtime } = runtimeFor(client);

    await runtime.startGoogle();
    const first = runtime.completeCallback("?code=google-code&flow=flow_1");
    const repeated = runtime.completeCallback("?code=google-code&flow=flow_1");

    await expect(Promise.all([first, repeated])).resolves.toEqual([
      { state: "identity_complete" },
      { state: "identity_complete" },
    ]);
    expect(client.exchangeCodeForSession).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps Supabase's opaque authorization ID while it asks an unsigned-in user to log in", async () => {
    const client = identity({
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    });
    const { runtime, store } = runtimeFor(client);

    await expect(runtime.continueAuthorization("?authorization_id=authorization_1")).resolves.toEqual({
      state: "authorization_login_required",
    });
    expect(store.getItem("musnow.auth.pending-authorization")).toBe(
      JSON.stringify({ authorizationId: "authorization_1", createdAt: 1 }),
    );
  });

  it("resumes a pending WeKnora authorization after Google login without calling the displaced exchange endpoint", async () => {
    const client = identity();
    const { assigned, runtime, store } = runtimeFor(client);
    store.setItem(
      "musnow.auth.pending-authorization",
      JSON.stringify({ authorizationId: "authorization_1", createdAt: 1 }),
    );

    await runtime.startGoogle();
    const completed = await runtime.completeCallback("?code=google-code&flow=flow_1");

    expect(completed).toEqual({ state: "identity_complete" });
    expect(assigned).toHaveBeenLastCalledWith(
      "https://app.musuw.com/oauth/consent?authorization_id=authorization_1",
    );
    expect(client.exchangeCodeForSession).toHaveBeenCalledWith("google-code");
    expect(client.signOut).not.toHaveBeenCalled();
  });

  it("resumes a pending WeKnora authorization after email OTP verification", async () => {
    const client = identity();
    const { assigned, runtime, store } = runtimeFor(client);
    store.setItem(
      "musnow.auth.pending-authorization",
      JSON.stringify({ authorizationId: "authorization_1", createdAt: 1 }),
    );

    const completed = await runtime.verifyEmailOtp("USER@example.com", "123456");

    expect(completed).toEqual({ state: "identity_complete" });
    expect(client.verifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "123456",
      type: "email",
    });
    expect(assigned).toHaveBeenCalledWith(
      "https://app.musuw.com/oauth/consent?authorization_id=authorization_1",
    );
  });

  it("verifies a six-digit signup code and resumes the existing identity handoff", async () => {
    const client = identity();
    const { assigned, fetch, runtime, store } = runtimeFor(client);
    store.setItem(
      "musnow.auth.flow",
      JSON.stringify({ createdAt: 1, id: "flow_1", kind: "signup" }),
    );

    const completed = await (
      runtime as typeof runtime & {
        verifySignupOtp(email: string, token: string): Promise<unknown>;
      }
    ).verifySignupOtp(" USER@example.com ", "123456");

    expect(completed).toEqual({ state: "identity_complete" });
    expect(client.verifyOtp).toHaveBeenCalledWith({
      email: "user@example.com",
      token: "123456",
      type: "signup",
    });
    expect(store.getItem("musnow.auth.flow")).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/oidc/url?"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(assigned).toHaveBeenLastCalledWith(
      "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
    );
  });

  it("fails closed for malformed or provider-failed signup codes without leaking details", async () => {
    const verifyOtp = vi.fn<IdentityClient["verifyOtp"]>(async () => ({
      data: { session: null },
      error: null,
    }));
    const client = identity({ verifyOtp });
    const { runtime } = runtimeFor(client);
    const verifySignupOtp = (runtime as typeof runtime & {
      verifySignupOtp(email: string, token: string): Promise<unknown>;
    }).verifySignupOtp;

    await expect(verifySignupOtp("user@example.com", "12345")).resolves.toEqual({
      code: "email_code_invalid",
      state: "identity_error",
    });
    expect(verifyOtp).not.toHaveBeenCalled();

    verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { code: "invalid_credentials" as const },
    });
    await expect(verifySignupOtp("user@example.com", "123456")).resolves.toEqual({
      code: "email_code_invalid",
      state: "identity_error",
    });
  });

  it("approves a local authorization from the production consent origin without local storage", async () => {
    const client = identity({
      oauth: {
        approveAuthorization: vi.fn(async () => ({
          data: {
            redirect_url:
              "http://localhost:4190/api/v1/auth/oidc/callback?code=oidc-code&state=weknora-state",
          },
          error: null,
        })),
        getAuthorizationDetails: vi.fn(async () => ({
          data: {
            ...authorizationDetails(),
            redirect_uri: "http://localhost:4190/api/v1/auth/oidc/callback",
          },
          error: null,
        })),
      },
    });
    const { assigned, runtime } = runtimeFor(
      client,
      storage(),
      vi.fn(),
      undefined,
      storage(),
      "http://localhost:4190",
    );

    await expect(runtime.continueAuthorization("?authorization_id=authorization_1")).resolves.toEqual({
      state: "authorization_complete",
    });

    expect(client.oauth.approveAuthorization).toHaveBeenCalledOnce();
    expect(assigned).toHaveBeenCalledWith(
      "http://localhost:4190/api/v1/auth/oidc/callback?code=oidc-code&state=weknora-state",
    );
  });

  it("accepts the loopback alias registered for a fresh local authorization", async () => {
    const client = identity({
      oauth: {
        approveAuthorization: vi.fn(async () => ({
          data: {
            redirect_url:
              "http://127.0.0.1:4190/api/v1/auth/oidc/callback?code=oidc-code&state=client-state",
          },
          error: null,
        })),
        getAuthorizationDetails: vi.fn(async () => ({
          data: {
            ...authorizationDetails(),
            redirect_uri: "http://127.0.0.1:4190/api/v1/auth/oidc/callback",
          },
          error: null,
        })),
      },
    });
    const assigned = vi.fn();
    const runtime = createAuthRuntime({
      config: {
        publicOrigin: "http://localhost:4190",
        publishableKey: "sb_publishable_key",
        supabaseUrl: "https://identity.example",
        weknoraOAuthClientId: "weknora-client",
      },
      createIdentityClient: () => client,
      location: { assign: assigned, origin: "https://app.musuw.com" },
      nativeStorage: storage(),
      now: () => 1,
      storage: storage(),
    });

    await expect(runtime.continueAuthorization("?authorization_id=authorization_1")).resolves.toEqual({
      state: "authorization_complete",
    });
    expect(assigned).toHaveBeenCalledWith(
      "http://127.0.0.1:4190/api/v1/auth/oidc/callback?code=oidc-code&state=client-state",
    );
  });

  it("trusts the configured staging callback without trusting production or request-host origins", async () => {
    const assigned = vi.fn();
    const client = identity({
      oauth: {
        approveAuthorization: vi.fn(async () => ({
          data: {
            redirect_url:
              "https://staging.musuw.com/api/v1/auth/oidc/callback?code=oidc-code&state=client-state",
          },
          error: null,
        })),
        getAuthorizationDetails: vi.fn(async () => ({
          data: {
            ...authorizationDetails(),
            redirect_uri: "https://staging.musuw.com/api/v1/auth/oidc/callback",
          },
          error: null,
        })),
      },
    });
    const runtime = createAuthRuntime({
      config: {
        publicOrigin: "https://staging.musuw.com",
        publishableKey: "sb_publishable_key",
        supabaseUrl: "https://identity.example",
        weknoraOAuthClientId: "weknora-client",
      },
      createIdentityClient: () => client,
      location: { assign: assigned, origin: "https://request-host.example" },
      nativeStorage: storage(),
      now: () => 1,
      storage: storage(),
    });

    await expect(runtime.continueAuthorization("?authorization_id=authorization_1")).resolves.toEqual({
      state: "authorization_complete",
    });
    expect(assigned).toHaveBeenCalledWith(
      "https://staging.musuw.com/api/v1/auth/oidc/callback?code=oidc-code&state=client-state",
    );

    const productionClient = identity({
      oauth: {
        approveAuthorization: vi.fn(async () => ({ data: null, error: null })),
        getAuthorizationDetails: vi.fn(async () => ({
          data: {
            ...authorizationDetails(),
            redirect_uri: "https://app.musuw.com/api/v1/auth/oidc/callback",
          },
          error: null,
        })),
      },
    });
    const productionAssigned = vi.fn();
    const stagingRuntime = createAuthRuntime({
      config: {
        publicOrigin: "https://staging-app.musuw.com",
        publishableKey: "sb_publishable_key",
        supabaseUrl: "https://identity.example",
        weknoraOAuthClientId: "weknora-client",
      },
      createIdentityClient: () => productionClient,
      location: { assign: productionAssigned, origin: "https://request-host.example" },
      nativeStorage: storage(),
      now: () => 1,
      storage: storage(),
    });

    await expect(
      stagingRuntime.continueAuthorization("?authorization_id=authorization_1"),
    ).resolves.toEqual({
      code: "oauth_continuation_invalid",
      state: "authorization_error",
    });
    expect(productionAssigned).not.toHaveBeenCalled();
    expect(productionClient.oauth.approveAuthorization).not.toHaveBeenCalled();
  });

  it("rejects a registered redirect outside the production and local callback allowlist", async () => {
    const client = identity({
      oauth: {
        approveAuthorization: vi.fn(async () => ({ data: null, error: null })),
        getAuthorizationDetails: vi.fn(async () => ({
          data: {
            ...authorizationDetails(),
            redirect_uri: "https://attacker.example/callback",
          },
          error: null,
        })),
      },
    });
    const { assigned, runtime } = runtimeFor(client);

    await expect(runtime.continueAuthorization("?authorization_id=authorization_1")).resolves.toEqual({
      code: "oauth_continuation_invalid",
      state: "authorization_error",
    });
    expect(client.oauth.approveAuthorization).not.toHaveBeenCalled();
    expect(assigned).not.toHaveBeenCalled();
  });

  it("follows Supabase's already-consented redirect only when its callback is trusted", async () => {
    const client = identity({
      oauth: {
        approveAuthorization: vi.fn(async () => ({ data: null, error: null })),
        getAuthorizationDetails: vi.fn(async () => ({
          data: {
            redirect_url:
              "http://127.0.0.1:4190/api/v1/auth/oidc/callback?code=oidc-code&state=client-state",
          },
          error: null,
        })),
      },
    });
    const { assigned, runtime } = runtimeFor(
      client,
      storage(),
      vi.fn(),
      undefined,
      storage(),
      "http://localhost:4190",
    );

    await expect(runtime.continueAuthorization("?authorization_id=authorization_1")).resolves.toEqual({
      state: "authorization_complete",
    });
    expect(client.oauth.approveAuthorization).not.toHaveBeenCalled();
    expect(assigned).toHaveBeenCalledWith(
      "http://127.0.0.1:4190/api/v1/auth/oidc/callback?code=oidc-code&state=client-state",
    );
  });

  it.each([
    ["empty state", "https://app.musuw.com/api/v1/auth/oidc/callback?code=oidc-code&state="],
    ["non-default production port", "https://app.musuw.com:444/api/v1/auth/oidc/callback?code=oidc-code&state=client-state"],
  ])("rejects a server redirect with an unsafe %s", async (_name, redirectURL) => {
    const client = identity({
      oauth: {
        approveAuthorization: vi.fn(async () => ({ data: null, error: null })),
        getAuthorizationDetails: vi.fn(async () => ({
          data: { redirect_url: redirectURL },
          error: null,
        })),
      },
    });
    const { assigned, runtime } = runtimeFor(client);

    await expect(runtime.continueAuthorization("?authorization_id=authorization_1")).resolves.toEqual({
      code: "oauth_continuation_invalid",
      state: "authorization_error",
    });
    expect(assigned).not.toHaveBeenCalled();
  });

  it("approves the configured WeKnora client for an already signed-in user and follows Supabase's redirect_url", async () => {
    const client = identity();
    const { assigned, runtime, store } = runtimeFor(client);
    store.setItem(
      "musnow.auth.weknora-oidc",
      JSON.stringify({
        callbackUrl: "https://app.musuw.com/api/v1/auth/oidc/callback",
        createdAt: 1,
        state: "weknora-state",
      }),
    );

    const result = await runtime.continueAuthorization("?authorization_id=authorization_1");

    expect(result).toEqual({ state: "authorization_complete" });
    expect(client.oauth.getAuthorizationDetails).toHaveBeenCalledWith("authorization_1");
    expect(client.oauth.approveAuthorization).toHaveBeenCalledWith("authorization_1", {
      skipBrowserRedirect: true,
    });
    expect(assigned).toHaveBeenCalledWith(
      "https://app.musuw.com/api/v1/auth/oidc/callback?code=oidc-code&state=weknora-state",
    );
  });

  it("approves one authorization request once when the consent route effect is replayed", async () => {
    const client = identity();
    const { runtime, store } = runtimeFor(client);
    store.setItem(
      "musnow.auth.weknora-oidc",
      JSON.stringify({
        callbackUrl: "https://app.musuw.com/api/v1/auth/oidc/callback",
        createdAt: 1,
        state: "weknora-state",
      }),
    );

    const first = runtime.continueAuthorization("?authorization_id=authorization_1");
    const repeated = runtime.continueAuthorization("?authorization_id=authorization_1");

    await expect(Promise.all([first, repeated])).resolves.toEqual([
      { state: "authorization_complete" },
      { state: "authorization_complete" },
    ]);
    expect(client.oauth.approveAuthorization).toHaveBeenCalledOnce();
  });

  it("rejects an unknown OAuth client before it can receive an authorization code", async () => {
    const client = identity({
      oauth: {
        approveAuthorization: vi.fn(async () => ({ data: null, error: null })),
        getAuthorizationDetails: vi.fn(async () => ({
          data: authorizationDetails("unknown-client"),
          error: null,
        })),
      },
    });
    const { assigned, runtime, store } = runtimeFor(client);
    store.setItem(
      "musnow.auth.weknora-oidc",
      JSON.stringify({
        callbackUrl: "https://app.musuw.com/api/v1/auth/oidc/callback",
        createdAt: 1,
        state: "weknora-state",
      }),
    );

    await expect(runtime.continueAuthorization("?authorization_id=authorization_1")).resolves.toEqual({
      code: "oauth_client_not_allowed",
      state: "authorization_error",
    });
    expect(client.oauth.approveAuthorization).not.toHaveBeenCalled();
    expect(assigned).not.toHaveBeenCalled();
  });

  it("sign-out clears the local Supabase session and every pending continuation", async () => {
    const client = identity();
    const { runtime, store } = runtimeFor(client);
    store.setItem("musnow.supabase.pkce", "session");
    store.setItem("musnow.auth.flow", "flow");
    store.setItem(
      "musnow.auth.pending-authorization",
      JSON.stringify({ authorizationId: "authorization_1", createdAt: 1 }),
    );
    store.setItem("musnow.auth.weknora-oidc", "expected");

    await runtime.signOut();

    expect(client.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(store.values.size).toBe(0);
  });
});

describe("password identity continuation", () => {
  it("keeps local Musuw auth restricted to an explicit loopback development switch", () => {
    expect(isLocalMusuwAuthEnabled(true, "true", "localhost")).toBe(true);
    expect(isLocalMusuwAuthEnabled(true, "true", "127.0.0.1")).toBe(true);
    expect(isLocalMusuwAuthEnabled(false, "true", "localhost")).toBe(false);
    expect(isLocalMusuwAuthEnabled(true, "false", "localhost")).toBe(false);
    expect(isLocalMusuwAuthEnabled(true, "true", "app.musuw.com")).toBe(false);
  });

  it("signs into the local Musuw app without redirecting through hosted identity", async () => {
    const client = identity() as IdentityClient & {
      signInWithPassword: ReturnType<typeof vi.fn>;
    };
    const assigned = vi.fn();
    const nativeStore = storage();
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      expect(String(input)).toBe("http://localhost:4190/api/v1/auth/login");
      return response({
        refresh_token: "local-refresh-token",
        success: true,
        token: "local-access-token",
      });
    });
    const runtime = createAuthRuntime({
      config: {
        publicOrigin: "http://localhost:4190",
        publishableKey: "sb_publishable_key",
        supabaseUrl: "https://identity.example",
        weknoraOAuthClientId: "weknora-client",
      },
      createIdentityClient: () => client,
      fetch,
      localMusuwPasswordAuth: true,
      location: { assign: assigned, origin: "http://localhost:4190" },
      nativeStorage: nativeStore,
      storage: storage(),
    });

    await expect(runtime.signInWithPassword(" USER@example.com ", "local-password"))
      .resolves.toEqual({ state: "identity_complete" });

    expect(client.signInWithPassword).not.toHaveBeenCalled();
    expect(nativeStore.getItem("weknora_token")).toBe("local-access-token");
    expect(nativeStore.getItem("weknora_refresh_token")).toBe("local-refresh-token");
    expect(assigned).toHaveBeenCalledWith("http://localhost:4190/");
  });

  it("shows the Musuw login page locally even when a hosted identity session exists", async () => {
    const client = identity();
    const { assigned, fetch, runtime } = runtimeFor(
      client,
      storage(),
      vi.fn(),
      vi.fn<typeof globalThis.fetch>(async () => response({}, 401)),
      storage(),
      "http://localhost:4190",
      undefined,
      true,
    );

    await expect(runtime.resumeStart()).resolves.toEqual({ state: "start_login_required" });
    expect(client.getSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(assigned).not.toHaveBeenCalled();
  });

  it("signs in with a normalized email and resumes the native OIDC handoff", async () => {
    const client = identity() as IdentityClient & {
      signInWithPassword: ReturnType<typeof vi.fn>;
    };
    client.signInWithPassword = vi.fn(async () => ({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    }));
    const { assigned, fetch, runtime } = runtimeFor(client);

    await expect(
      (runtime as typeof runtime & {
        signInWithPassword(email: string, password: string): Promise<unknown>;
      }).signInWithPassword(" USER@example.com ", "correct horse battery staple"),
    ).resolves.toEqual({ state: "identity_complete" });

    expect(client.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "correct horse battery staple",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/oidc/url?"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(assigned).toHaveBeenLastCalledWith(
      "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
    );
  });

  it("keeps signup confirmation in a bounded state when Supabase requires email confirmation", async () => {
    const client = identity() as IdentityClient & {
      signUp: ReturnType<typeof vi.fn>;
    };
    client.signUp = vi.fn(async () => ({
      data: { session: null },
      error: null,
    }));
    const { assigned, runtime, store } = runtimeFor(client);

    const result = await (
      runtime as typeof runtime & {
        signUpWithPassword(
          email: string,
          password: string,
          confirmation: string,
        ): Promise<unknown>;
      }
    ).signUpWithPassword(" USER@example.com ", "correct horse battery staple", "correct horse battery staple");

    expect(result).toEqual({ email: "user@example.com", state: "registration_confirmation" });
    expect(client.signUp).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "correct horse battery staple",
      options: {
        emailRedirectTo: "https://app.musuw.com/auth/callback?flow=flow_1",
      },
    });
    expect(store.getItem("musnow.auth.flow")).toBe(
      JSON.stringify({ createdAt: 1, id: "flow_1", kind: "signup" }),
    );
    expect(assigned).not.toHaveBeenCalled();
  });

  it("masks an existing-account signup result exactly like a new confirmation flow", async () => {
    const client = identity({
      signUp: vi.fn(async () => ({
        data: { session: null },
        error: { code: "identity_exists" as const },
      })),
    });
    const { runtime, store } = runtimeFor(client);
    await expect(
      (runtime as typeof runtime & { signUpWithPassword(email: string, password: string, confirmation: string): Promise<unknown> })
        .signUpWithPassword("existing@example.com", "correct horse battery staple", "correct horse battery staple"),
    ).resolves.toEqual({ email: "existing@example.com", state: "registration_confirmation" });
    expect(store.getItem("musnow.auth.flow")).toContain('"kind":"signup"');
  });

  it("resumes the native handoff after a confirmed signup callback", async () => {
    const client = identity() as IdentityClient & {
      signUp: ReturnType<typeof vi.fn>;
    };
    client.signUp = vi.fn(async () => ({
      data: { session: null },
      error: null,
    }));
    const { assigned, fetch, runtime } = runtimeFor(client);

    await expect(
      (runtime as typeof runtime & {
        signUpWithPassword(
          email: string,
          password: string,
          confirmation: string,
        ): Promise<unknown>;
      }).signUpWithPassword("user@example.com", "correct horse battery staple", "correct horse battery staple"),
    ).resolves.toEqual({ email: "user@example.com", state: "registration_confirmation" });

    await expect(runtime.completeCallback("?flow=flow_1&code=signup-code&sb_flow_id=0123456789abcdef0123456789abcdef")).resolves.toEqual({
      state: "identity_complete",
    });
    expect(client.exchangeCodeForSession).toHaveBeenCalledWith("signup-code", {
      flowId: "0123456789abcdef0123456789abcdef",
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/oidc/url?"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(assigned).toHaveBeenLastCalledWith(
      "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
    );
  });

  it("uses a recovery flow once and exposes only the recovery-ready state", async () => {
    const client = identity() as IdentityClient & {
      resetPasswordForEmail: ReturnType<typeof vi.fn>;
      updateUser: ReturnType<typeof vi.fn>;
    };
    client.resetPasswordForEmail = vi.fn(async () => ({ error: null }));
    client.updateUser = vi.fn(async () => ({
      data: { session: { access_token: "supabase-access-token" } },
      error: null,
    }));
    const { assigned, fetch, runtime, store } = runtimeFor(client);

    await expect(
      (runtime as typeof runtime & {
        requestPasswordReset(email: string): Promise<unknown>;
      }).requestPasswordReset(" USER@example.com "),
    ).resolves.toEqual({ email: "user@example.com", state: "password_reset_requested" });
    expect(client.resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "https://app.musuw.com/auth/callback?flow=flow_1",
    });
    expect(store.getItem("musnow.auth.flow")).toBe(
      JSON.stringify({ createdAt: 1, id: "flow_1", kind: "recovery" }),
    );

    await expect(
      runtime.completeCallback("?code=recovery-code&flow=flow_1&sb_flow_id=0123456789abcdef0123456789abcdef"),
    ).resolves.toEqual({ state: "password_recovery_ready" });
    expect(client.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code", {
      flowId: "0123456789abcdef0123456789abcdef",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(assigned).not.toHaveBeenCalled();
    expect(store.getItem("musnow.auth.flow")).toBeNull();

    await expect(
      (runtime as typeof runtime & {
        updatePassword(password: string, confirmation: string): Promise<unknown>;
      }).updatePassword("new correct horse battery staple", "new correct horse battery staple"),
    ).resolves.toEqual({ state: "identity_complete" });
    expect(client.updateUser).toHaveBeenCalledWith({ password: "new correct horse battery staple" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/oidc/url?"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("exchanges signup and recovery callbacks from another tab through only the shared flow store", async () => {
    const shared = storage();
    const firstSession = storage();
    const secondSession = storage();
    const exchange = vi.fn(async (_code: string, options?: { flowId?: string }) => ({
      data: { session: options?.flowId === "0123456789abcdef0123456789abcdef" ? { access_token: "token" } : null },
      error: options?.flowId === "0123456789abcdef0123456789abcdef" ? null : { code: "unavailable" as const },
    }));
    const client = identity({ exchangeCodeForSession: exchange });
    const first = runtimeFor(client, firstSession, vi.fn(), undefined, storage(), "https://app.musuw.com", shared);
    await expect(
      (first.runtime as typeof first.runtime & { signUpWithPassword(email: string, password: string, confirmation: string): Promise<unknown> })
        .signUpWithPassword("new@example.com", "correct horse battery staple", "correct horse battery staple"),
    ).resolves.toEqual({ email: "new@example.com", state: "registration_confirmation" });
    expect(firstSession.getItem("musnow.auth.flow")).toBeNull();
    expect(shared.getItem("musnow.auth.flow")).toContain('"kind":"signup"');

    const second = runtimeFor(client, secondSession, vi.fn(), undefined, storage(), "https://app.musuw.com", shared);
    await expect(
      second.runtime.completeCallback("?flow=flow_1&code=signup-code&sb_flow_id=0123456789abcdef0123456789abcdef"),
    ).resolves.toEqual({ state: "identity_complete" });
    expect(exchange).toHaveBeenCalledWith("signup-code", { flowId: "0123456789abcdef0123456789abcdef" });
    expect(shared.getItem("musnow.auth.flow")).toBeNull();

    await expect(
      (first.runtime as typeof first.runtime & { requestPasswordReset(email: string): Promise<unknown> })
        .requestPasswordReset("new@example.com"),
    ).resolves.toEqual({ email: "new@example.com", state: "password_reset_requested" });
    const recoveryTab = runtimeFor(client, storage(), vi.fn(), undefined, storage(), "https://app.musuw.com", shared);
    await expect(
      recoveryTab.runtime.completeCallback("?flow=flow_1&code=recovery-code&sb_flow_id=0123456789abcdef0123456789abcdef"),
    ).resolves.toEqual({ state: "password_recovery_ready" });
    expect(exchange).toHaveBeenCalledWith("recovery-code", { flowId: "0123456789abcdef0123456789abcdef" });
    expect(shared.getItem("musnow.auth.flow")).toBeNull();
  });

  it("fails closed for missing or wrong SDK flow ids and never borrows a verifier", async () => {
    const exchange = vi.fn(async (_code: string, options?: { flowId?: string }) => ({
      data: { session: null },
      error: options?.flowId === "0123456789abcdef0123456789abcdef" ? null : { code: "unavailable" as const },
    }));
    const client = identity({ exchangeCodeForSession: exchange });
    const missing = runtimeFor(client);
    await (missing.runtime as typeof missing.runtime & { signUpWithPassword(email: string, password: string, confirmation: string): Promise<unknown> })
      .signUpWithPassword("new@example.com", "correct horse battery staple", "correct horse battery staple");
    await expect(missing.runtime.completeCallback("?flow=flow_1&code=signup-code")).resolves.toEqual({
      code: "callback_invalid",
      state: "identity_error",
    });
    expect(exchange).not.toHaveBeenCalled();

    const wrong = runtimeFor(client);
    await (wrong.runtime as typeof wrong.runtime & { signUpWithPassword(email: string, password: string, confirmation: string): Promise<unknown> })
      .signUpWithPassword("new@example.com", "correct horse battery staple", "correct horse battery staple");
    await expect(
      wrong.runtime.completeCallback("?flow=flow_1&code=signup-code&sb_flow_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ).resolves.toEqual({ code: "identity_exchange_failed", state: "identity_error" });
    expect(exchange).toHaveBeenCalledWith("signup-code", { flowId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
  });

  it("returns a bounded recovery retry state for an invalid or consumed recovery callback", async () => {
    const client = identity();
    const { runtime } = runtimeFor(client);
    await (runtime as typeof runtime & { requestPasswordReset(email: string): Promise<unknown> })
      .requestPasswordReset("user@example.com");
    await expect(runtime.completeCallback("?flow=flow_1&error=access_denied")).resolves.toEqual({
      code: "password_recovery_failed",
      state: "identity_error",
    });
    const replay = runtimeFor(client);
    await expect(replay.runtime.completeCallback("?flow=flow_1&code=used-code")).resolves.toEqual({
      code: "callback_expired_or_used",
      state: "identity_error",
    });
  });

  it("uses a short-lived recovery marker after a callback refresh and rejects an expired marker", async () => {
    const client = identity();
    const session = storage();
    const first = runtimeFor(client, session);
    await (first.runtime as typeof first.runtime & { requestPasswordReset(email: string): Promise<unknown> })
      .requestPasswordReset("user@example.com");
    await expect(
      first.runtime.completeCallback("?flow=flow_1&code=recovery-code&sb_flow_id=0123456789abcdef0123456789abcdef"),
    ).resolves.toEqual({ state: "password_recovery_ready" });
    expect(session.getItem("musnow.auth.password-recovery")).toContain('"createdAt":1');

    const refreshed = runtimeFor(client, session);
    await expect(refreshed.runtime.completeCallback("?flow=flow_1")).resolves.toEqual({
      state: "password_recovery_ready",
    });
    session.setItem("musnow.auth.password-recovery", JSON.stringify({ createdAt: -AUTH_FLOW_TTL_MS }));
    const expired = runtimeFor(client, session);
    await expect(expired.runtime.completeCallback("?flow=flow_1")).resolves.toEqual({
      code: "callback_expired_or_used",
      state: "identity_error",
    });
  });

  it("treats a legacy flow without kind as the existing OAuth flow", async () => {
    const client = identity();
    const { assigned, fetch, runtime, store } = runtimeFor(client);
    store.setItem("musnow.auth.flow", JSON.stringify({ createdAt: 1, id: "flow_1" }));

    await expect(runtime.completeCallback("?code=legacy-code&flow=flow_1")).resolves.toEqual({
      state: "identity_complete",
    });
    expect(client.exchangeCodeForSession).toHaveBeenCalledWith("legacy-code");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/auth/oidc/url?"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(assigned).toHaveBeenLastCalledWith(
      "https://identity.example/auth/v1/oauth/authorize?client_id=weknora-client&state=weknora-state",
    );
  });

  it("rejects an unknown flow kind instead of treating it as an OAuth callback", async () => {
    const client = identity();
    const { assigned, fetch, runtime, store } = runtimeFor(client);
    store.setItem(
      "musnow.auth.flow",
      JSON.stringify({ createdAt: 1, id: "flow_1", kind: "unexpected" }),
    );

    await expect(runtime.completeCallback("?code=unexpected-code&flow=flow_1")).resolves.toEqual({
      code: "callback_expired_or_used",
      state: "identity_error",
    });
    expect(client.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(assigned).not.toHaveBeenCalled();
    expect(store.getItem("musnow.auth.flow")).toBeNull();
  });
});

describe('bounded auth phase diagnostics', () => {
  function instrumented(client: IdentityClient, events: unknown[], timeout = 20, report?: () => void) {
    return createAuthRuntime({
      config: { publicOrigin: 'https://app.musuw.com', publishableKey: 'test', supabaseUrl: 'https://identity.example', weknoraOAuthClientId: 'test' },
      createIdentityClient: () => client,
      storage: storage(), nativeStorage: storage(),
      location: { assign() {}, origin: 'https://app.musuw.com' },
      requestTimeoutMs: timeout,
      onDiagnostic: event => { events.push(event); report?.() },
    })
  }
  it('records OTP send outcome without email or input and ignores reporter exceptions', async () => {
    const events: unknown[] = []
    const runtime = instrumented(identity(), events, 1000, () => { throw Error('report failed') })
    expect(await runtime.requestEmailOtp('private@example.test')).toEqual({ email: 'private@example.test', state: 'email_otp_sent' })
    expect(events).toEqual([{ phase: 'auth.otp_send', outcome: 'ok', duration_ms: expect.any(Number) }])
    expect(JSON.stringify(events)).not.toContain('private')
  })
  it('records a deadline once and ignores late identity completion', async () => {
    let resolve!: (value: { error: null }) => void
    const events: unknown[] = []
    const runtime = instrumented(identity({ signInWithOtp: () => new Promise(done => { resolve = done }) }), events)
    expect((await runtime.requestEmailOtp('private@example.test')).state).toBe('email_otp_error')
    expect(events).toEqual([{ phase: 'auth.otp_send', outcome: 'timeout', duration_ms: expect.any(Number) }])
    resolve({ error: null })
    await Promise.resolve()
    expect(events).toHaveLength(1)
  })
  it('distinguishes rejected requests and bounded identity refusals', async () => {
    const events: unknown[] = []
    const failing = identity({ signInWithOtp: async () => { throw Error('sensitive upstream details') } })
    await instrumented(failing, events).requestEmailOtp('private@example.test')
    await instrumented(identity({ signInWithOtp: async () => ({ error: { code: 'rate_limited' } }) }), events).requestEmailOtp('private@example.test')
    expect(events.map(event => (event as { outcome: string }).outcome)).toEqual(['network', 'identity'])
    expect(JSON.stringify(events)).not.toContain('sensitive')
  })
})
