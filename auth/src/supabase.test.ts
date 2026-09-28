import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthStorage, createSupabaseIdentityClient } from "./supabase";
import {
  AUTH_FLOW_TTL_MS,
  type AuthConfig,
  type IdentityClient,
  type SessionStorageLike,
} from "./runtime";

const mocked = vi.hoisted(() => ({
  auth: {
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(),
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    verifyOtp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
  },
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocked.createClient,
}));

function storage(): SessionStorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function sharedStorage(): SessionStorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

const config: AuthConfig = {
  publicOrigin: "https://app.musuw.com",
  publishableKey: "sb_publishable_key",
  supabaseUrl: "https://identity.example",
  weknoraOAuthClientId: "weknora-client",
};

describe("Supabase identity adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.createClient.mockReturnValue({ auth: mocked.auth });
    mocked.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
      error: null,
    });
  });

  it("maps SDK AuthError codes to bounded password errors without exposing raw details", async () => {
    mocked.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: {
        code: "invalid_credentials",
        message: "raw provider detail must never cross the auth boundary",
        status: 401,
      },
    });

    const client = createSupabaseIdentityClient(config, storage()) as ReturnType<
      typeof createSupabaseIdentityClient
    > & {
      signInWithPassword(input: { email: string; password: string }): Promise<unknown>;
    };

    await expect(client.signInWithPassword({ email: "user@example.com", password: "secret" })).resolves.toEqual({
      data: { session: null },
      error: { code: "invalid_credentials" },
    });
    expect(mocked.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret",
    });
  });

  it("keeps existing-account signup errors bounded without exposing account existence to UI", async () => {
    mocked.auth.signUp.mockResolvedValue({
      data: { session: null },
      error: { code: "email_exists", message: "provider detail", status: 422 },
    });
    const client = createSupabaseIdentityClient(config, storage());
    await expect(
      client.signUp({ email: "user@example.com", password: "secret-password" }),
    ).resolves.toEqual({ data: { session: null }, error: { code: "identity_exists" } });
  });

  it("collapses provider confirmation status into the generic credential error", async () => {
    mocked.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "email_not_confirmed", message: "provider detail", status: 400 },
    });
    const client = createSupabaseIdentityClient(config, storage());
    await expect(
      client.signInWithPassword({ email: "user@example.com", password: "secret-password" }),
    ).resolves.toEqual({ data: { session: null }, error: { code: "invalid_credentials" } });
  });

  it("verifies signup tokens through Supabase and keeps provider errors bounded", async () => {
    mocked.auth.verifyOtp.mockResolvedValueOnce({
      data: { session: { access_token: "access-token", refresh_token: "secret-refresh-token" } },
      error: null,
    });
    const client = createSupabaseIdentityClient(config, storage());
    const signupVerification = {
      email: "user@example.com",
      token: "123456",
      type: "signup",
    } satisfies Parameters<IdentityClient["verifyOtp"]>[0];

    await expect(client.verifyOtp(signupVerification)).resolves.toEqual({
      data: { session: { access_token: "access-token" } },
      error: null,
    });
    expect(mocked.auth.verifyOtp).toHaveBeenCalledWith(signupVerification);

    mocked.auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: {
        code: "over_email_send_rate_limit",
        message: "raw provider detail must never cross the auth boundary",
        status: 429,
      },
    });
    await expect(client.verifyOtp(signupVerification)).resolves.toEqual({
      data: { session: null },
      error: { code: "rate_limited" },
    });
  });

  it("uses appendable SDK flow ids and passes a validated flow id to exchange", async () => {
    mocked.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
      error: null,
    });
    const client = createSupabaseIdentityClient(config, storage(), sharedStorage());
    await expect(
      client.exchangeCodeForSession("auth-code", { flowId: "0123456789abcdef0123456789abcdef" }),
    ).resolves.toEqual({ data: { session: { access_token: "access-token" } }, error: null });
    expect(mocked.auth.exchangeCodeForSession).toHaveBeenCalledWith("auth-code", {
      flowId: "0123456789abcdef0123456789abcdef",
    });
    expect(mocked.createClient).toHaveBeenCalledWith(
      config.supabaseUrl,
      config.publishableKey,
      expect.objectContaining({
        auth: expect.objectContaining({
          experimental: { appendPkceFlowIdToRedirects: true },
        }),
      }),
    );
  });

  it("projects only an access token and exact public redirect options for signup and recovery", async () => {
    mocked.auth.signUp.mockResolvedValue({
      data: { session: { access_token: "access-token", refresh_token: "secret-refresh-token" } },
      error: null,
    });
    mocked.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocked.auth.updateUser.mockResolvedValue({
      data: { user: { id: "secret-user-id" }, session: { access_token: "access-token" } },
      error: null,
    });

    const client = createSupabaseIdentityClient(config, storage()) as ReturnType<
      typeof createSupabaseIdentityClient
    > & {
      signUp(input: unknown): Promise<unknown>;
      resetPasswordForEmail(email: string, options: unknown): Promise<unknown>;
      updateUser(input: unknown): Promise<unknown>;
    };

    await expect(
      client.signUp({
        email: "user@example.com",
        password: "secret",
        options: { emailRedirectTo: "https://app.musuw.com/auth/callback?flow=signup" },
      }),
    ).resolves.toEqual({
      data: { session: { access_token: "access-token" } },
      error: null,
    });
    await expect(
      client.resetPasswordForEmail("user@example.com", {
        redirectTo: "https://app.musuw.com/auth/callback?flow=recovery",
      }),
    ).resolves.toEqual({ error: null });
    await expect(client.updateUser({ password: "new-secret" })).resolves.toEqual({
      data: { session: { access_token: "access-token" } },
      error: null,
    });
    expect(mocked.auth.resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "https://app.musuw.com/auth/callback?flow=recovery",
    });
    expect(mocked.auth.updateUser).toHaveBeenCalledWith({ password: "new-secret" });
  });

  it("shares only short-lived PKCE verifier slots and the opaque auth flow across tabs", () => {
    const firstTab = storage();
    const secondTab = storage();
    const shared = sharedStorage();
    const firstAuthStorage = createAuthStorage(firstTab, shared);
    const secondAuthStorage = createAuthStorage(secondTab, shared);

    firstAuthStorage.setItem("musnow.supabase.pkce-code-verifier", "verifier");
    firstAuthStorage.setItem(
      "musnow.supabase.pkce-flow-0123456789abcdef0123456789abcdef-code-verifier",
      "slot-verifier",
    );
    firstAuthStorage.setItem("musnow.auth.flow", '{"id":"flow_1","kind":"recovery"}');
    firstAuthStorage.setItem("musnow.supabase.pkce", '{"access_token":"session"}');

    expect(secondAuthStorage.getItem("musnow.supabase.pkce-code-verifier")).toBe("verifier");
    expect(
      secondAuthStorage.getItem(
        "musnow.supabase.pkce-flow-0123456789abcdef0123456789abcdef-code-verifier",
      ),
    ).toBe(
      "slot-verifier",
    );
    expect(secondAuthStorage.getItem("musnow.auth.flow")).toBeNull();
    expect(secondAuthStorage.getItem("musnow.supabase.pkce")).toBeNull();

    secondAuthStorage.removeItem("musnow.supabase.pkce-code-verifier");
    secondAuthStorage.removeItem(
      "musnow.supabase.pkce-flow-0123456789abcdef0123456789abcdef-code-verifier",
    );
    expect(firstAuthStorage.getItem("musnow.supabase.pkce-code-verifier")).toBeNull();
    expect(firstAuthStorage.getItem("musnow.auth.flow")).toContain('"kind":"recovery"');
  });

  it("expires verifier envelopes and never routes session tokens or passwords to shared storage", () => {
    let now = 100;
    const firstTab = storage();
    const shared = sharedStorage();
    const authStorage = createAuthStorage(firstTab, shared, () => now);
    authStorage.setItem("musnow.supabase.pkce-code-verifier", "verifier");
    authStorage.setItem("musnow.supabase.pkce", '{"access_token":"session","refresh_token":"refresh"}');
    authStorage.setItem("musnow.auth.flow", '{"kind":"signup"}');
    expect(shared.values.has("musnow.supabase.pkce-code-verifier")).toBe(true);
    expect(shared.values.has("musnow.supabase.pkce")).toBe(false);
    expect(shared.values.has("musnow.auth.flow")).toBe(false);
    now += AUTH_FLOW_TTL_MS + 1;
    expect(authStorage.getItem("musnow.supabase.pkce-code-verifier")).toBeNull();
    expect(shared.values.has("musnow.supabase.pkce-code-verifier")).toBe(false);
  });
});
