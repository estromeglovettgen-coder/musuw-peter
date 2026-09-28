import { createClient } from "@supabase/supabase-js";

import { AUTH_FLOW_TTL_MS } from "./runtime";
import type {
  AuthConfig,
  IdentityError,
  IdentityErrorCode,
  IdentityClient,
  SessionStorageLike,
} from "./runtime";

const supabaseStorageKey = "musnow.supabase.pkce";

type Clock = () => number;

type EnumeratedStorage = SessionStorageLike & {
  readonly length?: number;
  key?: (index: number) => string | null;
  values?: Map<string, string>;
};

function isPkceVerifierKey(key: string): boolean {
  return (
    key === `${supabaseStorageKey}-code-verifier` ||
    key === `${supabaseStorageKey}-flows-code-verifier` ||
    new RegExp(`^${supabaseStorageKey}-flow-[0-9a-f]{32}-code-verifier$`, "iu").test(key)
  );
}

type PkceEnvelope = Readonly<{ expiresAt: number; value: string }>;

function parsePkceEnvelope(raw: string, now: number): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as { expiresAt?: unknown }).expiresAt !== "number" ||
      !Number.isFinite((parsed as { expiresAt: number }).expiresAt) ||
      (parsed as { expiresAt: number }).expiresAt <= now ||
      typeof (parsed as { value?: unknown }).value !== "string"
    ) {
      return null;
    }
    return (parsed as PkceEnvelope).value;
  } catch {
    return null;
  }
}

function storageKeys(storage: EnumeratedStorage): string[] {
  const keys: string[] = [];
  if (typeof storage.length === "number" && typeof storage.key === "function") {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null) keys.push(key);
    }
  } else if (storage.values instanceof Map) {
    keys.push(...storage.values.keys());
  }
  return keys;
}

/**
 * PKCE verifier storage is the only cross-tab state. Session and refresh
 * tokens remain in the tab's sessionStorage. Values in the shared medium are
 * short-lived envelopes and are removed on read or any subsequent write.
 */
export function createAuthStorage(
  sessionStorage: SessionStorageLike,
  sharedPkceStorage: SessionStorageLike = sessionStorage,
  now: Clock = Date.now,
): SessionStorageLike {
  const shared = sharedPkceStorage as EnumeratedStorage;

  const purgeExpired = (): void => {
    try {
      for (const key of storageKeys(shared)) {
        if (!isPkceVerifierKey(key)) continue;
        const raw = shared.getItem(key);
        if (raw === null || parsePkceEnvelope(raw, now()) === null) shared.removeItem(key);
      }
    } catch {
      // A blocked localStorage falls back to this tab's session storage below.
    }
  };

  purgeExpired();

  return Object.freeze({
    getItem(key: string): string | null {
      if (!isPkceVerifierKey(key)) return sessionStorage.getItem(key);
      purgeExpired();
      try {
        const raw = shared.getItem(key);
        if (raw === null) return null;
        const value = parsePkceEnvelope(raw, now());
        if (value === null) shared.removeItem(key);
        return value;
      } catch {
        return sessionStorage.getItem(key);
      }
    },
    removeItem(key: string): void {
      if (!isPkceVerifierKey(key)) {
        sessionStorage.removeItem(key);
        return;
      }
      purgeExpired();
      try {
        shared.removeItem(key);
      } catch {
        sessionStorage.removeItem(key);
      }
    },
    setItem(key: string, value: string): void {
      if (!isPkceVerifierKey(key)) {
        sessionStorage.setItem(key, value);
        return;
      }
      purgeExpired();
      const envelope: PkceEnvelope = { expiresAt: now() + AUTH_FLOW_TTL_MS, value };
      try {
        shared.setItem(key, JSON.stringify(envelope));
      } catch {
        sessionStorage.setItem(key, value);
      }
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function providerErrorCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  return typeof error["code"] === "string" ? error["code"] : null;
}

function providerErrorStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  return typeof error["status"] === "number" ? error["status"] : null;
}

/** Keep provider implementation details and messages inside this adapter. */
function boundedIdentityError(error: unknown): IdentityError {
  if (error === null || error === undefined) return null;
  const code = providerErrorCode(error);
  const status = providerErrorStatus(error);
  let bounded: IdentityErrorCode = "unavailable";
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    bounded = "rate_limited";
  } else if (code === "invalid_credentials" || code === "user_not_found") {
    bounded = "invalid_credentials";
  } else if (code === "email_not_confirmed" || code === "provider_email_needs_verification") {
    // Confirmation status must not reveal whether a supplied password was
    // correct; keep account state indistinguishable from bad credentials.
    bounded = "invalid_credentials";
  } else if (code === "weak_password") {
    bounded = "weak_password";
  } else if (
    code === "email_exists" ||
    code === "user_already_exists"
  ) {
    bounded = "identity_exists";
  } else if (code === "signup_disabled" || code === "email_provider_disabled") {
    bounded = "signup_unavailable";
  }
  return { code: bounded };
}

function projectSession(session: unknown): { access_token: string } | null {
  if (!isRecord(session) || typeof session["access_token"] !== "string") return null;
  const accessToken = session["access_token"].trim();
  return accessToken === "" ? null : { access_token: accessToken };
}

/**
 * This is deliberately a thin type boundary over supabase-js.  OAuth code
 * issuance and consent remain Supabase's implementation, not an application
 * reimplementation.
 */
export function createSupabaseIdentityClient(
  config: AuthConfig,
  storage: SessionStorageLike,
  sharedPkceStorage?: SessionStorageLike,
): IdentityClient {
  const authStorage = createAuthStorage(storage, sharedPkceStorage);
  const client = createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
      storage: authStorage,
      storageKey: supabaseStorageKey,
      experimental: { appendPkceFlowIdToRedirects: true },
    },
  });

  return Object.freeze({
    async exchangeCodeForSession(code: string, options?: { flowId?: string }) {
      const result = await client.auth.exchangeCodeForSession(
        code,
        options?.flowId === undefined ? undefined : { flowId: options.flowId },
      );
      return {
        data: {
          session: projectSession(result.data.session),
        },
        error: boundedIdentityError(result.error),
      };
    },
    async getSession() {
      const result = await client.auth.getSession();
      return {
        data: {
          session: projectSession(result.data.session),
        },
        error: boundedIdentityError(result.error),
      };
    },
    oauth: Object.freeze({
      async approveAuthorization(
        authorizationId: string,
        options: Parameters<IdentityClient["oauth"]["approveAuthorization"]>[1],
      ) {
        const result = await client.auth.oauth.approveAuthorization(authorizationId, options);
        return {
          data: result.data === null ? null : { redirect_url: result.data.redirect_url },
          error: boundedIdentityError(result.error),
        };
      },
      async getAuthorizationDetails(authorizationId: string) {
        const result = await client.auth.oauth.getAuthorizationDetails(authorizationId);
        return { data: result.data, error: boundedIdentityError(result.error) };
      },
    }),
    async signInWithOAuth(input: Parameters<IdentityClient["signInWithOAuth"]>[0]) {
      const result = await client.auth.signInWithOAuth(input);
      return { data: { url: result.data.url }, error: boundedIdentityError(result.error) };
    },
    async signInWithPassword(input: Parameters<IdentityClient["signInWithPassword"]>[0]) {
      const result = await client.auth.signInWithPassword(input);
      return {
        data: { session: projectSession(result.data.session) },
        error: boundedIdentityError(result.error),
      };
    },
    async signUp(input: Parameters<IdentityClient["signUp"]>[0]) {
      const result = await client.auth.signUp(input);
      return {
        data: { session: projectSession(result.data.session) },
        error: boundedIdentityError(result.error),
      };
    },
    async signInWithOtp(input: Parameters<IdentityClient["signInWithOtp"]>[0]) {
      const result = await client.auth.signInWithOtp(input);
      return { error: boundedIdentityError(result.error) };
    },
    async resetPasswordForEmail(
      email: string,
      options: Parameters<IdentityClient["resetPasswordForEmail"]>[1],
    ) {
      const result = await client.auth.resetPasswordForEmail(email, options);
      return { error: boundedIdentityError(result.error) };
    },
    async signOut(input: Parameters<IdentityClient["signOut"]>[0]) {
      storage.removeItem(supabaseStorageKey);
      try {
        const result = await client.auth.signOut(input);
        return { error: boundedIdentityError(result.error) };
      } finally {
        storage.removeItem(supabaseStorageKey);
      }
    },
    async updateUser(input: Parameters<IdentityClient["updateUser"]>[0]) {
      const result = await client.auth.updateUser(input);
      if (result.error !== null) {
        return { data: { session: null }, error: boundedIdentityError(result.error) };
      }
      const session = await client.auth.getSession();
      return {
        data: { session: projectSession(session.data.session) },
        error: boundedIdentityError(session.error),
      };
    },
    async verifyOtp(input: Parameters<IdentityClient["verifyOtp"]>[0]) {
      const result = await client.auth.verifyOtp(input);
      return {
        data: {
          session: projectSession(result.data.session),
        },
        error: boundedIdentityError(result.error),
      };
    },
  });
}
