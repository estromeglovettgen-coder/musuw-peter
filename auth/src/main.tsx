import { reportDiagnostic } from "../../shared/client-diagnostics";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AuthApp, getAuthCopy } from "./AuthApp";
import { authConfigFromRuntimeOrEnvironment } from "./config";
import { getInitialAuthLocale } from "./locale";
import { createAuthRuntime, isLocalMusuwAuthEnabled } from "./runtime";
import { createSupabaseIdentityClient } from "./supabase";
import "./styles.css";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("Auth shell root is missing");
}

let content: React.ReactNode;
try {
  const runtimeConfig = (window as Window & {
    __RUNTIME_CONFIG__?: { auth?: unknown };
  }).__RUNTIME_CONFIG__;
  const config = authConfigFromRuntimeOrEnvironment(
    import.meta.env,
    runtimeConfig?.auth,
    import.meta.env.PROD,
  );
  const runtime = createAuthRuntime({
    config,
    onDiagnostic: reportDiagnostic,
    createIdentityClient: (identityConfig) =>
      createSupabaseIdentityClient(identityConfig, window.sessionStorage, window.localStorage),
    localMusuwPasswordAuth: isLocalMusuwAuthEnabled(
      import.meta.env.DEV,
      import.meta.env["VITE_MUSUW_DEV_LOCAL_AUTH"],
      window.location.hostname,
    ),
    nativeStorage: window.localStorage,
    sharedStorage: window.localStorage,
    storage: window.sessionStorage,
  });
  content = <AuthApp runtime={runtime} />;
} catch {
  const copy = getAuthCopy(getInitialAuthLocale());
  content = (
    <main className="auth-page">
      <p className="auth-status" role="alert">{copy.errors.unavailable}</p>
    </main>
  );
}

createRoot(root).render(<StrictMode>{content}</StrictMode>);
