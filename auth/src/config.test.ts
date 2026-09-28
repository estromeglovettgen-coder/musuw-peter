import { describe, expect, it } from "vitest";

import {
  authConfigFromEnvironment,
  authConfigFromRuntime,
  authConfigFromRuntimeOrEnvironment,
} from "./config";

function environment(publicOrigin: string): ImportMetaEnv {
  return {
    MODE: "production",
    BASE_URL: "/auth/",
    DEV: false,
    PROD: true,
    SSR: false,
    VITE_AUTH_PUBLIC_ORIGIN: publicOrigin,
    VITE_SUPABASE_URL: "https://identity.example",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key",
    VITE_WEKNORA_OAUTH_CLIENT_ID: "weknora-client",
  };
}

function runtimeAuth(publicOrigin = "https://staging.musuw.com"): Record<string, string> {
  return {
    publicOrigin,
    supabaseUrl: "https://identity.example",
    publishableKey: "sb_publishable_key",
    weknoraOAuthClientId: "weknora-client",
  };
}

describe("auth public origin configuration", () => {
  it.each([
    ["https://app.musuw.com", "https://app.musuw.com"],
    ["https://staging.musuw.com", "https://staging.musuw.com"],
    ["http://localhost:4190", "http://localhost:4190"],
    ["http://127.0.0.1:4190", "http://127.0.0.1:4190"],
  ])("accepts the exact supported origin %s", (input, expectedOrigin) => {
    expect(authConfigFromEnvironment(environment(input)).publicOrigin).toBe(expectedOrigin);
  });

  it.each([
    "",
    "https://unknown.example",
    "https://staging.app.musuw.com",
    "https://app.musuw.com https://staging.musuw.com",
    "http://app.musuw.com",
    "https://staging.musuw.com:4090",
    "https://staging-app.musuw.com",
    "http://localhost:4090",
    "https://app.musuw.com/callback",
    "https://app.musuw.com?next=https://evil.example",
  ])("rejects an unsafe public origin %s", (publicOrigin) => {
    expect(() => authConfigFromEnvironment(environment(publicOrigin))).toThrow(
      "Authentication configuration is unavailable",
    );
  });

  it("accepts a complete startup runtime auth object", () => {
    expect(authConfigFromRuntime(runtimeAuth())).toEqual({
      publicOrigin: "https://staging.musuw.com",
      supabaseUrl: "https://identity.example",
      publishableKey: "sb_publishable_key",
      weknoraOAuthClientId: "weknora-client",
    });
  });

  it.each([
    undefined,
    null,
    {},
    { ...runtimeAuth(), supabaseUrl: "" },
    { ...runtimeAuth(), publishableKey: " " },
    { ...runtimeAuth(), weknoraOAuthClientId: undefined },
    { ...runtimeAuth(), serverSecret: "pdl_live_apikey_should_not_be_here" },
    { ...runtimeAuth(), publicOrigin: "https://staging-app.musuw.com" },
    { ...runtimeAuth(), publicOrigin: "https://staging.musuw.com\";alert(1)//" },
  ])("rejects an incomplete or unsafe startup runtime auth object", (runtime) => {
    expect(() => authConfigFromRuntime(runtime)).toThrow(
      "Authentication configuration is unavailable",
    );
  });

  it("never falls back field-by-field when a runtime object is present", () => {
    const partial = { publicOrigin: "https://staging.musuw.com" };
    expect(() => authConfigFromRuntimeOrEnvironment(environment("https://app.musuw.com"), partial, true)).toThrow(
      "Authentication configuration is unavailable",
    );
  });

  it("keeps local Vite development fallback only when runtime config is absent", () => {
    expect(
      authConfigFromRuntimeOrEnvironment(environment("http://localhost:4190"), undefined, false),
    ).toEqual({
      publicOrigin: "http://localhost:4190",
      supabaseUrl: "https://identity.example",
      publishableKey: "sb_publishable_key",
      weknoraOAuthClientId: "weknora-client",
    });
  });

  it("requires startup runtime config for Docker-built auth assets", () => {
    expect(() => authConfigFromRuntimeOrEnvironment(environment("https://app.musuw.com"), undefined, true)).toThrow(
      "Authentication configuration is unavailable",
    );
  });

  it("requires the new origin key instead of silently falling back to the browser host", () => {
    const missing = environment("https://app.musuw.com");
    delete (missing as Record<string, unknown>)["VITE_AUTH_PUBLIC_ORIGIN"];

    expect(() => authConfigFromEnvironment(missing)).toThrow(
      "Authentication configuration is unavailable",
    );
  });
});
