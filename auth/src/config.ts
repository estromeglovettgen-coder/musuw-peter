import type { AuthConfig } from "./runtime";

/** The only browser-visible values accepted by the startup runtime seam. */
export type RuntimeAuthPublicConfig = Readonly<{
  publicOrigin: string;
  publishableKey: string;
  supabaseUrl: string;
  weknoraOAuthClientId: string;
}>;

const unavailableMessage = "Authentication configuration is unavailable";
const supportedOrigins = new Set([
  "https://app.musuw.com",
  "https://staging.musuw.com",
  "http://localhost:4190",
  "http://127.0.0.1:4190",
]);
const unsafePublicValue = /[\u0000-\u001f\u007f"\\<>]/u;

function unavailable(): never {
  throw new Error(unavailableMessage);
}

/**
 * Public values are deliberately narrower than arbitrary JavaScript strings.
 * The startup shell serializes these values into executable config.js, so
 * control characters and quoting syntax are rejected before serialization.
 */
function publicValue(value: unknown): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value !== value.trim() ||
    value.length > 4_096 ||
    /\s/u.test(value) ||
    unsafePublicValue.test(value)
  ) {
    return unavailable();
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Return the canonical origin only for the four explicitly supported hosts. */
export function publicOriginFromValue(value: unknown): string {
  const origin = publicValue(value);
  if (!supportedOrigins.has(origin)) return unavailable();
  return origin;
}

export function isSupportedPublicOrigin(value: unknown): boolean {
  try {
    publicOriginFromValue(value);
    return true;
  } catch {
    return false;
  }
}

function publicOriginFromEnvironment(environment: ImportMetaEnv): string {
  return publicOriginFromValue(environment["VITE_AUTH_PUBLIC_ORIGIN"]);
}

function supabaseOriginFromValue(value: unknown): string {
  const configuredURL = publicValue(value);
  try {
    const url = new URL(configuredURL);
    const localDevelopmentURL =
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.protocol !== "https:" && !localDevelopmentURL)
    ) {
      return unavailable();
    }
    return url.origin;
  } catch {
    return unavailable();
  }
}

function authConfigFromValues(
  publicOrigin: unknown,
  supabaseUrl: unknown,
  publishableKey: unknown,
  weknoraOAuthClientId: unknown,
): AuthConfig {
  return {
    publicOrigin: publicOriginFromValue(publicOrigin),
    publishableKey: publicValue(publishableKey),
    supabaseUrl: supabaseOriginFromValue(supabaseUrl),
    weknoraOAuthClientId: publicValue(weknoraOAuthClientId),
  };
}

/** Parse the build-time Vite values used only by local development. */
export function authConfigFromEnvironment(environment: ImportMetaEnv): AuthConfig {
  try {
    return authConfigFromValues(
      environment["VITE_AUTH_PUBLIC_ORIGIN"],
      environment["VITE_SUPABASE_URL"],
      environment["VITE_SUPABASE_PUBLISHABLE_KEY"],
      environment["VITE_WEKNORA_OAUTH_CLIENT_ID"],
    );
  } catch {
    return unavailable();
  }
}

/** Parse the complete startup-generated public auth object. */
export function authConfigFromRuntime(value: unknown): AuthConfig {
  try {
    if (!isRecord(value)) return unavailable();
    const keys = Object.keys(value).sort();
    if (
      keys.length !== 4 ||
      keys[0] !== "publicOrigin" ||
      keys[1] !== "publishableKey" ||
      keys[2] !== "supabaseUrl" ||
      keys[3] !== "weknoraOAuthClientId"
    ) {
      return unavailable();
    }
    return authConfigFromValues(
      value["publicOrigin"],
      value["supabaseUrl"],
      value["publishableKey"],
      value["weknoraOAuthClientId"],
    );
  } catch {
    return unavailable();
  }
}

/**
 * Select startup config for a browser. Docker-built bundles pass
 * `requireRuntime=true`; local Vite development may omit config.js and use
 * import.meta.env. A present runtime object is always authoritative.
 */
export function authConfigFromRuntimeOrEnvironment(
  environment: ImportMetaEnv,
  runtimeValue: unknown,
  requireRuntime: boolean,
): AuthConfig {
  if (runtimeValue !== undefined) return authConfigFromRuntime(runtimeValue);
  if (requireRuntime) return unavailable();
  return authConfigFromEnvironment(environment);
}
