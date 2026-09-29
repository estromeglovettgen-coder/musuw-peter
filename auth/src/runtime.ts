import type { DiagnosticEvent, DiagnosticPhase } from "../../shared/client-diagnostics";
import { publicOriginFromValue } from "./config";

/**
 * The auth shell owns only Supabase identity and the standard OAuth 2.1
 * continuation into WeKnora.  It deliberately does not know any Musnow
 * business endpoint, session, account, tenant, or knowledge payload.
 */

export type SessionStorageLike = Readonly<{
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}>;

/** A short-lived browser continuation must never outlive the auth attempt. */
export const AUTH_FLOW_TTL_MS = 10 * 60 * 1_000;

export type IdentityErrorCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "signup_unavailable"
  | "identity_exists"
  | "rate_limited"
  | "unavailable";

export type IdentityError = Readonly<{ code: IdentityErrorCode }> | null;

export type AuthorizationDetails = Readonly<{
  authorization_id: string;
  client: Readonly<{
    id: string;
    logo_uri: string;
    name: string;
    uri: string;
  }>;
  redirect_uri: string;
  scope: string;
}>;

type AuthorizationRedirect = Readonly<{ redirect_url: string }>;

type IdentitySession = Readonly<{ access_token: string }>;

export interface IdentityClient {
  exchangeCodeForSession(code: string, options?: { flowId?: string }): Promise<{
    data: { session: IdentitySession | null };
    error: IdentityError;
  }>;
  getSession(): Promise<{
    data: { session: IdentitySession | null };
    error: IdentityError;
  }>;
  oauth: Readonly<{
    approveAuthorization(
      authorizationId: string,
      options: { skipBrowserRedirect: true },
    ): Promise<{ data: AuthorizationRedirect | null; error: IdentityError }>;
    getAuthorizationDetails(
      authorizationId: string,
    ): Promise<{ data: AuthorizationDetails | AuthorizationRedirect | null; error: IdentityError }>;
  }>;
  signInWithOAuth(input: {
    options: {
      queryParams: { prompt: "select_account" };
      redirectTo: string;
      skipBrowserRedirect: true;
    };
    provider: "google";
  }): Promise<{ data: { url: string | null }; error: IdentityError }>;
  signInWithPassword(input: {
    email: string;
    password: string;
    options?: { captchaToken?: string };
  }): Promise<{
    data: { session: IdentitySession | null };
    error: IdentityError;
  }>;
  signUp(input: {
    email: string;
    password: string;
    options?: { captchaToken?: string; emailRedirectTo?: string };
  }): Promise<{
    data: { session: IdentitySession | null };
    error: IdentityError;
  }>;
  signInWithOtp(input: {
    email: string;
    options: { shouldCreateUser: true };
  }): Promise<{ error: IdentityError }>;
  resetPasswordForEmail(
    email: string,
    options: { captchaToken?: string; redirectTo: string },
  ): Promise<{ error: IdentityError }>;
  signOut(input: { scope: "local" }): Promise<{ error: IdentityError }>;
  updateUser(input: {
    current_password?: string;
    nonce?: string;
    password: string;
  }): Promise<{
    data: { session: IdentitySession | null };
    error: IdentityError;
  }>;
  verifyOtp(input: { email: string; token: string; type: "email" | "signup" }): Promise<{
    data: { session: IdentitySession | null };
    error: IdentityError;
  }>;
}

export type AuthConfig = Readonly<{
  publicOrigin: string;
  publishableKey: string;
  supabaseUrl: string;
  weknoraOAuthClientId: string;
}>;

type LocationLike = Readonly<{ assign(url: string): void; origin: string }>;

type RuntimeOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  location?: LocationLike;
  nativeStorage: SessionStorageLike;
  nextFlowId?: () => string;
  now?: () => number;
  requestTimeoutMs?: number;
  onDiagnostic?: (event: DiagnosticEvent) => void;
  sharedStorage?: SessionStorageLike;
  storage: SessionStorageLike;
}> & (
  | Readonly<{
      config: AuthConfig;
      createIdentityClient: (config: AuthConfig) => IdentityClient;
      localMusuwPasswordAuth?: boolean;
    }>
  | Readonly<{
      // Private deployments reuse the Musuw UI with their own account API.
      localMusuwPasswordAuth: true;
      config?: never;
      createIdentityClient?: never;
    }>
);

type LoginFlowKind = "oauth" | "recovery" | "signup";

type LoginFlow = Readonly<{ createdAt: number; id: string; kind: LoginFlowKind }>;

type PendingAuthorization = Readonly<{ authorizationId: string; createdAt: number }>;

type ExpectedWeKnoraAuthorization = Readonly<{
  callbackUrl: string;
  createdAt: number;
  state: string;
}>;

export type EmailOtpSendView =
  | Readonly<{ email: string; state: "email_otp_sent" }>
  | Readonly<{
      code: "email_invalid" | "email_send_failed" | "identity_network_error";
      state: "email_otp_error";
    }>;

export type IdentityCompletionErrorCode =
  | "callback_expired_or_used"
  | "callback_invalid"
  | "email_invalid"
  | "email_not_confirmed"
  | "identity_exchange_failed"
  | "identity_network_error"
  | "invalid_credentials"
  | "password_invalid"
  | "password_mismatch"
  | "password_too_short"
  | "password_recovery_failed"
  | "rate_limited"
  | "signup_unavailable"
  | "unavailable"
  | "weak_password"
  | "email_code_invalid"
  | "native_oidc_unavailable";

export type IdentityCompletionView =
  | Readonly<{ state: "identity_complete" }>
  | Readonly<{ email: string; state: "registration_confirmation" }>
  | Readonly<{ state: "password_recovery_ready" }>
  | Readonly<{ code: IdentityCompletionErrorCode; state: "identity_error" }>;

export type PasswordResetRequestView =
  | Readonly<{ email: string; state: "password_reset_requested" }>
  | Readonly<{
      code: "email_invalid" | "rate_limited" | "unavailable";
      state: "password_reset_error";
    }>;

export type AuthorizationContinuationView =
  | Readonly<{ state: "authorization_complete" }>
  | Readonly<{ state: "authorization_login_required" }>
  | Readonly<{
      code:
        | "authorization_invalid"
        | "authorization_session_missing"
        | "oauth_client_not_allowed"
        | "oauth_continuation_invalid"
        | "oauth_request_invalid";
      state: "authorization_error";
    }>;

/**
 * `/auth/start` is deliberately idempotent: an existing native session
 * returns to the workspace, an identity-only session resumes OIDC, and only
 * a browser without either session sees the login form.
 */
export type AuthStartView =
  | Readonly<{ state: "start_complete" }>
  | Readonly<{ state: "start_login_required" }>
  | Readonly<{
      code: "native_oidc_unavailable" | "native_session_unavailable";
      state: "start_error";
    }>;

const callbackPath = "/api/v1/auth/oidc/callback";
const oidcURLPath = "/api/v1/auth/oidc/url";
const localMusuwLoginPath = "/api/v1/auth/login";
const nativeSessionPath = "/api/v1/auth/me";
const flowKey = "musnow.auth.flow";
const recoveryMarkerKey = "musnow.auth.password-recovery";
const pendingAuthorizationKey = "musnow.auth.pending-authorization";
const supabaseStorageKey = "musnow.supabase.pkce";
const weknoraAuthorizationKey = "musnow.auth.weknora-oidc";
const nativeTokenKey = "weknora_token";
const nativeRefreshTokenKey = "weknora_refresh_token";
const maximumFlowAgeMs = AUTH_FLOW_TTL_MS;
const defaultRequestTimeoutMs = 30_000;

export function isLocalMusuwAuthEnabled(
  isDevelopment: boolean,
  flag: unknown,
  hostname: string,
): boolean {
  const normalizedHost = hostname.trim().toLowerCase();
  return (
    isDevelopment &&
    flag === "true" &&
    (normalizedHost === "localhost" ||
      normalizedHost === "127.0.0.1" ||
      normalizedHost === "::1" ||
      normalizedHost === "[::1]")
  );
}

function localWorkspaceURL(path: string, origin: string): string {
  const root = new URL("/", origin);
  try {
    const candidate = new URL(path, origin);
    if (candidate.origin === root.origin && candidate.pathname === "/" && candidate.hash === "") {
      return candidate.toString();
    }
  } catch {
    // Fall back to the same-origin workspace root.
  }
  return root.toString();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactString(value: unknown, maximumLength = 4_096): string | null {
  if (typeof value !== "string" || value === "" || value !== value.trim()) return null;
  return value.length <= maximumLength ? value : null;
}

function opaqueIdentifier(value: unknown): string | null {
  const candidate = exactString(value, 512);
  return candidate !== null && /^[A-Za-z0-9._~-]+$/u.test(candidate) ? candidate : null;
}

/** Supabase's PKCE flow ids are 16 random bytes encoded as 32 hex digits. */
function supabaseFlowIdentifier(value: unknown): string | null {
  const candidate = exactString(value, 64);
  return candidate !== null && /^[0-9a-f]{32}$/iu.test(candidate) ? candidate : null;
}

function jsonOf<T>(raw: string, parse: (value: unknown) => T | null): T | null {
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function validCreatedAt(value: unknown, now: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const age = now - value;
  return age >= 0 && age <= maximumFlowAgeMs ? value : null;
}

function parseLoginFlow(value: unknown, now: number): LoginFlow | null {
  if (!isObject(value)) return null;
  const id = opaqueIdentifier(value["id"]);
  const createdAt = validCreatedAt(value["createdAt"], now);
  const rawKind = value["kind"];
  const kind =
    rawKind === undefined
      ? "oauth"
      : rawKind === "recovery" || rawKind === "signup" || rawKind === "oauth"
        ? rawKind
        : null;
  return id === null || createdAt === null || kind === null ? null : { createdAt, id, kind };
}

function parsePendingAuthorization(value: unknown, now: number): PendingAuthorization | null {
  if (!isObject(value)) return null;
  const authorizationId = opaqueIdentifier(value["authorizationId"]);
  const createdAt = validCreatedAt(value["createdAt"], now);
  return authorizationId === null || createdAt === null ? null : { authorizationId, createdAt };
}

function parseExpectedWeKnoraAuthorization(
  value: unknown,
  now: number,
  publicOrigin: string,
): ExpectedWeKnoraAuthorization | null {
  if (!isObject(value)) return null;
  const callbackUrl = exactString(value["callbackUrl"], 2_048);
  const state = exactString(value["state"], 2_048);
  const createdAt = validCreatedAt(value["createdAt"], now);
  if (callbackUrl === null || state === null || createdAt === null) return null;
  try {
    const url = new URL(callbackUrl);
    if (
      !isTrustedCallbackOrigin(url, publicOrigin) ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return { callbackUrl, createdAt, state };
}

function isAuthorizationDetails(value: AuthorizationDetails | AuthorizationRedirect): value is AuthorizationDetails {
  return "authorization_id" in value;
}

function safeRedirectURL(
  value: unknown,
  expected: ExpectedWeKnoraAuthorization,
  publicOrigin: string,
): string | null {
  const redirectURL = exactString(value, 4_096);
  if (redirectURL === null) return null;
  try {
    const redirect = new URL(redirectURL);
    const callback = new URL(expected.callbackUrl);
    if (
      !isTrustedCallbackOrigin(callback, publicOrigin) ||
      !isTrustedCallbackOrigin(redirect, publicOrigin) ||
      redirect.protocol !== callback.protocol ||
      redirect.host !== callback.host ||
      redirect.username !== "" ||
      redirect.password !== "" ||
      redirect.pathname !== callback.pathname ||
      redirect.hash !== "" ||
      callback.hash !== "" ||
      redirect.searchParams.get("state") !== expected.state
    ) {
      return null;
    }
    return redirect.toString();
  } catch {
    return null;
  }
}

/**
 * When the OAuth consent page is rendered on app.musuw.com for a request
 * that originated on a local shell, the local shell's sessionStorage is not
 * visible here.  In that case the registered redirect URI returned by
 * Supabase is the trust anchor.  Keep this fallback deliberately narrow:
 * only the configured public callback origin (plus its supported local alias)
 * is accepted, and the server-issued redirect must contain the OAuth state
 * plus a code (or an explicit denial).
 */
function safeRegisteredRedirectURL(value: unknown, publicOrigin: string): string | null {
  const redirectURL = exactString(value, 4_096);
  if (redirectURL === null) return null;
  try {
    const redirect = new URL(redirectURL);
    if (
      !isTrustedCallbackOrigin(redirect, publicOrigin) ||
      redirect.hash !== "" ||
      exactString(redirect.searchParams.get("state"), 2_048) === null
    ) {
      return null;
    }
    const hasCode = exactString(redirect.searchParams.get("code"), 2_048) !== null;
    const hasError = exactString(redirect.searchParams.get("error"), 256) !== null;
    return hasCode || hasError ? redirect.toString() : null;
  } catch {
    return null;
  }
}

function isTrustedRegisteredCallback(value: URL | string, publicOrigin: string): boolean {
  try {
    const callback = typeof value === "string" ? new URL(value) : value;
    return (
      isTrustedCallbackOrigin(callback, publicOrigin) &&
      callback.search === "" &&
      callback.hash === ""
    );
  } catch {
    return false;
  }
}

function isTrustedCallbackOrigin(callback: URL, publicOrigin: string): boolean {
  if (
    callback.username !== "" ||
    callback.password !== "" ||
    callback.pathname !== callbackPath
  ) {
    return false;
  }

  try {
    const configured = new URL(publicOriginFromValue(publicOrigin));

    const configuredLocal =
      configured.protocol === "http:" &&
      (configured.hostname === "localhost" || configured.hostname === "127.0.0.1") &&
      configured.port === "4190";
    if (configuredLocal) {
      return (
        callback.protocol === "http:" &&
        (callback.hostname === "localhost" || callback.hostname === "127.0.0.1") &&
        callback.port === "4190"
      );
    }

    return (
      configured.protocol === "https:" &&
      callback.protocol === "https:" &&
      callback.hostname === configured.hostname &&
      (callback.port === "" || callback.port === "443")
    );
  } catch {
    return false;
  }
}

function registeredCallbackMatches(
  value: string,
  expected: ExpectedWeKnoraAuthorization,
): boolean {
  try {
    const registered = new URL(value);
    const callback = new URL(expected.callbackUrl);
    return (
      registered.protocol === callback.protocol &&
      registered.host === callback.host &&
      registered.username === "" &&
      registered.password === "" &&
      registered.pathname === callback.pathname &&
      registered.search === "" &&
      registered.hash === ""
    );
  } catch {
    return false;
  }
}

function nativeAuthorizationURL(value: unknown): { state: string; url: string } | null {
  const raw = exactString(value, 4_096);
  if (raw === null) return null;
  try {
    const url = new URL(raw);
    const localDevelopmentURL = url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    if (url.username !== "" || url.password !== "" || (url.protocol !== "https:" && !localDevelopmentURL)) {
      return null;
    }
    const state = exactString(url.searchParams.get("state"), 2_048);
    return state === null ? null : { state, url: url.toString() };
  } catch {
    return null;
  }
}

export function normalizeEmailAddress(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || /\s/u.test(email)) return null;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@") || at === email.length - 1) return null;
  return email;
}

export function isEmailOtpCode(value: string): boolean {
  return /^\d{6}$/u.test(value);
}

/**
 * Runs the complete browser-only identity boundary.  WeKnora remains the
 * authority for every post-callback user, tenant, and business operation.
 */
export function createAuthRuntime(options: RuntimeOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? defaultRequestTimeoutMs);
  const location: LocationLike =
    options.location ??
    ({ assign: (url: string) => window.location.assign(url), origin: window.location.origin } satisfies LocationLike);
  let client: IdentityClient | null = null;
  const publicOrigin = options.config?.publicOrigin ?? location.origin;

  const identity = (): IdentityClient => {
    if (!options.config || !options.createIdentityClient) {
      throw new Error("Hosted identity is not enabled for this deployment");
    }
    if (client === null) client = options.createIdentityClient(options.config);
    return client;
  };

  const sharedStorage = options.sharedStorage ?? options.storage;

  const flowStorage = (kind: LoginFlowKind): SessionStorageLike =>
    kind === "signup" || kind === "recovery" ? sharedStorage : options.storage;

  const removeFlowFromAllStores = (): void => {
    options.storage.removeItem(flowKey);
    if (sharedStorage !== options.storage) sharedStorage.removeItem(flowKey);
  };

  const parseStoredFlow = (raw: string, timestamp: number): LoginFlow | null => {
    const parsed = jsonOf(raw, (value) => value);
    if (isObject(parsed) && "expiresAt" in parsed && "flow" in parsed) {
      const expiresAt = parsed["expiresAt"];
      if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= timestamp) {
        return null;
      }
      return parseLoginFlow(parsed["flow"], timestamp);
    }
    return parseLoginFlow(parsed, timestamp);
  };

  const currentIdentitySession = async (): Promise<IdentitySession | null> => {
    try {
      const current = await withinRequestDeadline(identity().getSession(), "auth.session");
      const session = current.error === null ? current.data.session : null;
      return session?.access_token.trim() === "" ? null : session;
    } catch {
      return null;
    }
  };

  const clearRecoveryMarker = (): void => {
    options.storage.removeItem(recoveryMarkerKey);
  };

  const recoveryMarkerIsReady = async (): Promise<boolean> => {
    const raw = options.storage.getItem(recoveryMarkerKey);
    if (raw === null) return false;
    const marker = jsonOf(raw, (value) => {
      if (!isObject(value)) return null;
      return validCreatedAt(value["createdAt"], now()) === null ? null : value;
    });
    if (marker === null || await currentIdentitySession() === null) {
      clearRecoveryMarker();
      return false;
    }
    return true;
  };

  const withinRequestDeadline = <T>(request: Promise<T>, phase?: DiagnosticPhase): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const started = performance.now();
      let settled = false;
      const record = (outcome: DiagnosticEvent['outcome'], status?: number): void => {
        if (!phase) return;
        try {
          options.onDiagnostic?.({ phase, outcome,
            duration_ms: Math.min(120_000, Math.max(0, Math.round(performance.now() - started))),
            ...(status === undefined ? {} : { status }),
          });
        } catch { /* Operational reporting cannot change authentication. */ }
      };
      const timer = globalThis.setTimeout(() => {
        settled = true;
        record('timeout');
        reject(new Error("Authentication request timed out"));
      }, requestTimeoutMs);
      void request.then(
        (value) => {
          if (settled) return;
          settled = true;
          globalThis.clearTimeout(timer);
          if (value instanceof Response) record(value.ok ? 'ok' : 'http', value.status);
          else record(isObject(value) && value['error'] ? 'identity' : 'ok');
          resolve(value);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          globalThis.clearTimeout(timer);
          record('network');
          reject(error);
        },
      );
    });

  const consumeFlow = (flowId: string): LoginFlow | null => {
    const timestamp = now();
    let consumed: LoginFlow | null = null;
    for (const store of sharedStorage === options.storage
      ? [options.storage]
      : [options.storage, sharedStorage]) {
      const raw = store.getItem(flowKey);
      if (raw === null) continue;
      store.removeItem(flowKey);
      const flow = parseStoredFlow(raw, timestamp);
      if (consumed === null && flow !== null && flow.id === flowId) consumed = flow;
    }
    return consumed;
  };

  const createFlow = (kind: LoginFlowKind): string | null => {
    const flowId = options.nextFlowId?.() ?? crypto.randomUUID().replaceAll("-", "");
    const normalizedFlowId = opaqueIdentifier(flowId);
    if (normalizedFlowId === null) return null;
    const flow = { createdAt: now(), id: normalizedFlowId, kind } satisfies LoginFlow;
    const store = flowStorage(kind);
    store.setItem(
      flowKey,
      store === options.storage
        ? JSON.stringify(flow)
        : JSON.stringify({ expiresAt: now() + AUTH_FLOW_TTL_MS, flow }),
    );
    return normalizedFlowId;
  };

  const identityErrorCode = (
    error: IdentityError,
    fallback: Extract<IdentityErrorCode, "signup_unavailable" | "unavailable"> = "unavailable",
  ): IdentityCompletionErrorCode => {
    if (error === null) return fallback;
    if (
      error.code === "invalid_credentials" ||
      error.code === "email_not_confirmed" ||
      error.code === "weak_password" ||
      error.code === "rate_limited" ||
      error.code === "signup_unavailable" ||
      error.code === "unavailable"
    ) {
      return error.code;
    }
    return fallback;
  };

  const identityError = (code: IdentityCompletionErrorCode): IdentityCompletionView => ({
    code,
    state: "identity_error",
  });

  const validSession = (session: IdentitySession | null): boolean =>
    typeof session?.access_token === "string" && session.access_token.trim() !== "";

  const pendingAuthorization = (): PendingAuthorization | null => {
    const raw = options.storage.getItem(pendingAuthorizationKey);
    if (raw === null) return null;
    const pending = jsonOf(raw, (value) => parsePendingAuthorization(value, now()));
    if (pending === null) options.storage.removeItem(pendingAuthorizationKey);
    return pending;
  };

  const expectedWeKnoraAuthorization = (): ExpectedWeKnoraAuthorization | null => {
    const raw = options.storage.getItem(weknoraAuthorizationKey);
    if (raw === null) return null;
    const expected = jsonOf(raw, (value) =>
      parseExpectedWeKnoraAuthorization(value, now(), publicOrigin),
    );
    if (expected === null) options.storage.removeItem(weknoraAuthorizationKey);
    return expected;
  };

  const clearContinuation = (): void => {
    options.storage.removeItem(pendingAuthorizationKey);
    options.storage.removeItem(weknoraAuthorizationKey);
  };

  const clearNativeSession = (): void => {
    options.nativeStorage.removeItem(nativeTokenKey);
    options.nativeStorage.removeItem(nativeRefreshTokenKey);
  };

  const signInToLocalMusuw = async (
    email: string,
    password: string,
  ): Promise<IdentityCompletionView> => {
    try {
      const endpoint = new URL(localMusuwLoginPath, location.origin);
      const response = await withinRequestDeadline(
        fetchImpl(endpoint.toString(), {
          body: JSON.stringify({ email, password }),
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          method: "POST",
        }),
        "auth.password",
      );
      if (response.status === 401 || response.status === 403) {
        return identityError("invalid_credentials");
      }
      if (response.status === 429) return identityError("rate_limited");
      if (!response.ok) return identityError("unavailable");

      const payload: unknown = await withinRequestDeadline(response.json());
      const token = isObject(payload) ? exactString(payload["token"], 16_384) : null;
      const refreshToken = isObject(payload)
        ? exactString(payload["refresh_token"], 16_384)
        : null;
      if (!isObject(payload) || payload["success"] !== true || token === null || refreshToken === null) {
        return identityError("unavailable");
      }

      try {
        // The workspace must hydrate this account, not a previous cached profile.
        for (const key of [
          "weknora_user", "weknora_tenant", "weknora_memberships",
          "weknora_selected_tenant_id", "weknora_selected_tenant_name",
          "weknora_knowledge_bases", "weknora_current_kb",
        ]) options.nativeStorage.removeItem(key);
        options.nativeStorage.setItem(nativeRefreshTokenKey, refreshToken);
        options.nativeStorage.setItem(nativeTokenKey, token);
      } catch {
        clearNativeSession();
        return identityError("unavailable");
      }
      clearContinuation();
      location.assign(localWorkspaceURL("/", location.origin));
      return { state: "identity_complete" };
    } catch {
      return identityError("unavailable");
    }
  };

  const nativeSessionState = async (): Promise<"active" | "absent" | "invalid" | "unavailable"> => {
    const rawToken = options.nativeStorage.getItem(nativeTokenKey);
    const token = exactString(rawToken, 16_384);
    if (token === null) {
      if (rawToken !== null) clearNativeSession();
      return "absent";
    }

    try {
      const endpoint = new URL(nativeSessionPath, location.origin);
      const response = await withinRequestDeadline(
        fetchImpl(endpoint.toString(), {
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }),
        "auth.native_session",
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearNativeSession();
          return "invalid";
        }
        return "unavailable";
      }
      const payload: unknown = await withinRequestDeadline(response.json());
      if (isObject(payload) && payload["success"] === true) return "active";
      return "unavailable";
    } catch {
      return "unavailable";
    }
  };

  const startWeKnoraOIDC = async (): Promise<IdentityCompletionView> => {
    try {
      const redirectURI = new URL(callbackPath, publicOrigin).toString();
      const endpoint = new URL(oidcURLPath, location.origin);
      endpoint.searchParams.set("redirect_uri", redirectURI);
      const response = await withinRequestDeadline(
        fetchImpl(endpoint.toString(), {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
        "auth.oidc_start",
      );
      if (!response.ok) return { code: "native_oidc_unavailable", state: "identity_error" };
      const payload: unknown = await withinRequestDeadline(response.json());
      const authorizationURL =
        isObject(payload) && payload["success"] === true
          ? nativeAuthorizationURL(payload["authorization_url"])
          : null;
      if (authorizationURL === null) {
        return { code: "native_oidc_unavailable", state: "identity_error" };
      }
      options.storage.setItem(
        weknoraAuthorizationKey,
        JSON.stringify({
          callbackUrl: redirectURI,
          createdAt: now(),
          state: authorizationURL.state,
        } satisfies ExpectedWeKnoraAuthorization),
      );
      location.assign(authorizationURL.url);
      return { state: "identity_complete" };
    } catch {
      return { code: "native_oidc_unavailable", state: "identity_error" };
    }
  };

  const resumeAfterIdentity = async (): Promise<IdentityCompletionView> => {
    const pending = pendingAuthorization();
    if (pending !== null) {
      const consentURL = new URL("/oauth/consent", location.origin);
      consentURL.searchParams.set("authorization_id", pending.authorizationId);
      location.assign(consentURL.toString());
      return { state: "identity_complete" };
    }
    return startWeKnoraOIDC();
  };

  // React StrictMode deliberately replays route effects in development. Keep
  // the OAuth callback's one-time code consumption at this public boundary.
  let callbackOperation: Promise<IdentityCompletionView> | null = null;
  let authorizationOperation: Promise<AuthorizationContinuationView> | null = null;
  let startOperation: Promise<AuthStartView> | null = null;

  return Object.freeze({
    resumeStart(workspacePath = "/"): Promise<AuthStartView> {
      if (startOperation !== null) return startOperation;
      startOperation = (async (): Promise<AuthStartView> => {
        const nativeSession = await nativeSessionState();
        if (nativeSession === "active") {
          location.assign(localWorkspaceURL(workspacePath, location.origin));
          return { state: "start_complete" };
        }
        if (nativeSession === "unavailable") {
          return { code: "native_session_unavailable", state: "start_error" };
        }

        if (options.localMusuwPasswordAuth === true) {
          return { state: "start_login_required" };
        }

        if (await currentIdentitySession() === null) {
          return { state: "start_login_required" };
        }
        const continuation = await startWeKnoraOIDC();
        return continuation.state === "identity_complete"
          ? { state: "start_complete" }
          : { code: "native_oidc_unavailable", state: "start_error" };
      })();
      return startOperation;
    },

    completeCallback(search: string): Promise<IdentityCompletionView> {
      if (callbackOperation !== null) return callbackOperation;
      callbackOperation = (async (): Promise<IdentityCompletionView> => {
        const parameters = new URLSearchParams(search);
        const flowId = opaqueIdentifier(parameters.get("flow"));
        const code = exactString(parameters.get("code"), 2_048);
        if (flowId === null) {
          return { code: "callback_invalid", state: "identity_error" };
        }
        const flow = consumeFlow(flowId);
        if (flow === null) {
          if (await recoveryMarkerIsReady()) return { state: "password_recovery_ready" };
          return { code: "callback_expired_or_used", state: "identity_error" };
        }
        const rawSupabaseFlowId = parameters.get("sb_flow_id");
        const supabaseFlowId =
          rawSupabaseFlowId === null ? null : supabaseFlowIdentifier(rawSupabaseFlowId);
        const callbackInvalid =
          code === null || parameters.has("error") ||
          (rawSupabaseFlowId !== null && supabaseFlowId === null);
        if (callbackInvalid || code === null) {
          clearRecoveryMarker();
          return flow.kind === "recovery"
            ? { code: "password_recovery_failed", state: "identity_error" }
            : { code: "callback_invalid", state: "identity_error" };
        }
        if ((flow.kind === "signup" || flow.kind === "recovery") && supabaseFlowId === null) {
          clearRecoveryMarker();
          return flow.kind === "recovery"
            ? { code: "password_recovery_failed", state: "identity_error" }
            : { code: "callback_invalid", state: "identity_error" };
        }
        try {
          const result = await withinRequestDeadline(
            supabaseFlowId === null
              ? identity().exchangeCodeForSession(code)
              : identity().exchangeCodeForSession(code, { flowId: supabaseFlowId }),
            "auth.exchange",
          );
          if (result.error !== null || !validSession(result.data.session)) {
            clearRecoveryMarker();
            return flow.kind === "recovery"
              ? { code: "password_recovery_failed", state: "identity_error" }
              : { code: "identity_exchange_failed", state: "identity_error" };
          }
          if (flow.kind === "recovery") {
            options.storage.setItem(recoveryMarkerKey, JSON.stringify({ createdAt: now() }));
            return { state: "password_recovery_ready" };
          }
          return resumeAfterIdentity();
        } catch {
          clearRecoveryMarker();
          return flow.kind === "recovery"
            ? { code: "password_recovery_failed", state: "identity_error" }
            : { code: "identity_network_error", state: "identity_error" };
        }
      })();
      return callbackOperation;
    },

    async resumePasswordRecovery(): Promise<IdentityCompletionView> {
      return (await recoveryMarkerIsReady())
        ? { state: "password_recovery_ready" }
        : { code: "password_recovery_failed", state: "identity_error" };
    },

    continueAuthorization(search: string): Promise<AuthorizationContinuationView> {
      if (authorizationOperation !== null) return authorizationOperation;
      authorizationOperation = (async (): Promise<AuthorizationContinuationView> => {
        const authorizationId = opaqueIdentifier(new URLSearchParams(search).get("authorization_id"));
        if (authorizationId === null) {
          return { code: "authorization_invalid", state: "authorization_error" };
        }
        if (await currentIdentitySession() === null) {
          options.storage.setItem(
            pendingAuthorizationKey,
            JSON.stringify({ authorizationId, createdAt: now() } satisfies PendingAuthorization),
          );
          return { state: "authorization_login_required" };
        }

        try {
          const details = await withinRequestDeadline(
            identity().oauth.getAuthorizationDetails(authorizationId),
            "auth.authorize",
          );
          if (details.error !== null || details.data === null) {
            clearContinuation();
            return { code: "oauth_request_invalid", state: "authorization_error" };
          }

          if (!isAuthorizationDetails(details.data)) {
            const expected = expectedWeKnoraAuthorization();
            const redirectURL =
              expected === null
                ? safeRegisteredRedirectURL(details.data.redirect_url, publicOrigin)
                : safeRedirectURL(details.data.redirect_url, expected, publicOrigin);
            if (redirectURL === null) {
              clearContinuation();
              return { code: "oauth_continuation_invalid", state: "authorization_error" };
            }
            clearContinuation();
            location.assign(redirectURL);
            return { state: "authorization_complete" };
          }

          if (
            details.data.authorization_id !== authorizationId ||
            details.data.client.id !== options.config?.weknoraOAuthClientId
          ) {
            clearContinuation();
            return { code: "oauth_client_not_allowed", state: "authorization_error" };
          }

          const expected = expectedWeKnoraAuthorization();
          const registeredCallback = new URL(details.data.redirect_uri);
          if (
            expected === null
              ? !isTrustedRegisteredCallback(registeredCallback, publicOrigin)
              : !registeredCallbackMatches(details.data.redirect_uri, expected)
          ) {
            clearContinuation();
            return { code: "oauth_continuation_invalid", state: "authorization_error" };
          }

          const approved = await withinRequestDeadline(
            identity().oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true }),
            "auth.authorize",
          );
          const redirectURL =
            approved.error === null && approved.data !== null
              ? expected === null
                ? safeRegisteredRedirectURL(approved.data.redirect_url, publicOrigin)
                : safeRedirectURL(approved.data.redirect_url, expected, publicOrigin)
              : null;
          if (redirectURL === null) {
            clearContinuation();
            return { code: "oauth_request_invalid", state: "authorization_error" };
          }
          clearContinuation();
          location.assign(redirectURL);
          return { state: "authorization_complete" };
        } catch {
          clearContinuation();
          return { code: "oauth_request_invalid", state: "authorization_error" };
        }
      })();
      return authorizationOperation;
    },

    async signInWithPassword(emailInput: string, password: string): Promise<IdentityCompletionView> {
      const email = normalizeEmailAddress(emailInput);
      if (email === null) return identityError("email_invalid");
      if (password === "") return identityError("password_invalid");
      if (options.localMusuwPasswordAuth === true) {
        return signInToLocalMusuw(email, password);
      }
      try {
        const result = await withinRequestDeadline(
          identity().signInWithPassword({ email, password }),
          "auth.password",
        );
        if (result.error !== null) return identityError(identityErrorCode(result.error));
        if (!validSession(result.data.session)) return identityError("unavailable");
        return resumeAfterIdentity();
      } catch {
        return identityError("unavailable");
      }
    },

    async signUpWithPassword(
      emailInput: string,
      password: string,
      confirmation: string,
    ): Promise<IdentityCompletionView> {
      const email = normalizeEmailAddress(emailInput);
      if (email === null) return identityError("email_invalid");
      if (password.length < 8) return identityError("password_too_short");
      if (password !== confirmation) return identityError("password_mismatch");

      const flowId = createFlow("signup");
      if (flowId === null) return identityError("unavailable");
      const redirectTo = new URL("/auth/callback", location.origin).toString();
      try {
        const result = await withinRequestDeadline(
          identity().signUp({
            email,
            password,
            options: { emailRedirectTo: `${redirectTo}?flow=${encodeURIComponent(flowId)}` },
          }),
        );
        if (result.error !== null) {
          if (result.error.code === "identity_exists") {
            return { email, state: "registration_confirmation" };
          }
          removeFlowFromAllStores();
          return identityError(identityErrorCode(result.error, "signup_unavailable"));
        }
        if (!validSession(result.data.session)) {
          return { email, state: "registration_confirmation" };
        }
        removeFlowFromAllStores();
        return resumeAfterIdentity();
      } catch {
        removeFlowFromAllStores();
        return identityError("unavailable");
      }
    },

    async requestPasswordReset(input: string): Promise<PasswordResetRequestView> {
      const email = normalizeEmailAddress(input);
      if (email === null) return { code: "email_invalid", state: "password_reset_error" };

      const flowId = createFlow("recovery");
      if (flowId === null) return { code: "unavailable", state: "password_reset_error" };
      const redirectTo = new URL("/auth/callback", location.origin).toString();
      try {
        const result = await withinRequestDeadline(
          identity().resetPasswordForEmail(email, {
            redirectTo: `${redirectTo}?flow=${encodeURIComponent(flowId)}`,
          }),
        );
        if (result.error !== null) {
          removeFlowFromAllStores();
          return result.error.code === "rate_limited"
            ? { code: "rate_limited", state: "password_reset_error" }
            : result.error.code === "unavailable"
              ? { code: "unavailable", state: "password_reset_error" }
              : { email, state: "password_reset_requested" };
        }
        return { email, state: "password_reset_requested" };
      } catch {
        removeFlowFromAllStores();
        return { code: "unavailable", state: "password_reset_error" };
      }
    },

    async updatePassword(password: string, confirmation: string): Promise<IdentityCompletionView> {
      if (password.length < 8) return identityError("password_too_short");
      if (password !== confirmation) return identityError("password_mismatch");
      try {
        const result = await withinRequestDeadline(identity().updateUser({ password }));
        if (result.error !== null) return identityError(identityErrorCode(result.error));
        if (!validSession(result.data.session)) return identityError("unavailable");
        removeFlowFromAllStores();
        clearRecoveryMarker();
        return resumeAfterIdentity();
      } catch {
        return identityError("unavailable");
      }
    },

    async requestEmailOtp(input: string): Promise<EmailOtpSendView> {
      const email = normalizeEmailAddress(input);
      if (email === null) return { code: "email_invalid", state: "email_otp_error" };
      try {
        const result = await withinRequestDeadline(
          identity().signInWithOtp({ email, options: { shouldCreateUser: true } }),
          "auth.otp_send",
        );
        return result.error === null
          ? { email, state: "email_otp_sent" }
          : { code: "email_send_failed", state: "email_otp_error" };
      } catch {
        return { code: "identity_network_error", state: "email_otp_error" };
      }
    },

    async signOut(): Promise<void> {
      removeFlowFromAllStores();
      clearRecoveryMarker();
      clearContinuation();
      clearNativeSession();
      try {
        await withinRequestDeadline(identity().signOut({ scope: "local" }));
      } catch {
        // Local removal is still required even if Auth's network acknowledgement is unavailable.
      } finally {
        options.storage.removeItem(supabaseStorageKey);
      }
    },

    async startGoogle(): Promise<void> {
      const normalizedFlowId = createFlow("oauth");
      if (normalizedFlowId === null) throw new Error("Unable to start sign-in");
      try {
        const redirectTo = new URL("/auth/callback", location.origin).toString();
        const result = await withinRequestDeadline(
          identity().signInWithOAuth({
            options: {
              queryParams: { prompt: "select_account" },
              redirectTo: `${redirectTo}?flow=${encodeURIComponent(normalizedFlowId)}`,
              skipBrowserRedirect: true,
            },
            provider: "google",
          }),
        );
        if (result.error !== null || result.data.url === null) throw new Error("Sign-in unavailable");
        location.assign(result.data.url);
      } catch (error) {
        removeFlowFromAllStores();
        throw error;
      }
    },

    async verifyEmailOtp(emailInput: string, token: string): Promise<IdentityCompletionView> {
      const email = normalizeEmailAddress(emailInput);
      if (email === null || !isEmailOtpCode(token)) {
        return { code: "email_code_invalid", state: "identity_error" };
      }
      try {
        const result = await withinRequestDeadline(
          identity().verifyOtp({ email, token, type: "email" }),
          "auth.otp_verify",
        );
        if (result.error !== null || !validSession(result.data.session)) {
          return { code: "email_code_invalid", state: "identity_error" };
        }
        return resumeAfterIdentity();
      } catch {
        return { code: "identity_network_error", state: "identity_error" };
      }
    },

    async verifySignupOtp(emailInput: string, token: string): Promise<IdentityCompletionView> {
      const email = normalizeEmailAddress(emailInput);
      if (email === null || !isEmailOtpCode(token)) {
        return { code: "email_code_invalid", state: "identity_error" };
      }
      try {
        const result = await withinRequestDeadline(
          identity().verifyOtp({ email, token, type: "signup" }),
          "auth.otp_verify",
        );
        if (result.error !== null || !validSession(result.data.session)) {
          return { code: "email_code_invalid", state: "identity_error" };
        }
        removeFlowFromAllStores();
        return resumeAfterIdentity();
      } catch {
        return { code: "identity_network_error", state: "identity_error" };
      }
    },
  });
}

export type AuthRuntime = ReturnType<typeof createAuthRuntime>;
