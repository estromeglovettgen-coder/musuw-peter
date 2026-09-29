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
  const passwordOnly = import.meta.env["VITE_WORKSPACE_PROFILE"] === "peter";
  const sharedOptions = {
    onDiagnostic: reportDiagnostic,
    nativeStorage: window.localStorage,
    sharedStorage: window.localStorage,
    storage: window.sessionStorage,
  };
  let runtime;
  if (passwordOnly) {
    runtime = createAuthRuntime({ ...sharedOptions, localMusuwPasswordAuth: true });
  } else {
    const runtimeConfig = (window as Window & {
      __RUNTIME_CONFIG__?: { auth?: unknown };
    }).__RUNTIME_CONFIG__;
    runtime = createAuthRuntime({
      ...sharedOptions,
      config: authConfigFromRuntimeOrEnvironment(
        import.meta.env, runtimeConfig?.auth, import.meta.env.PROD,
      ),
      createIdentityClient: (identityConfig) =>
        createSupabaseIdentityClient(identityConfig, window.sessionStorage, window.localStorage),
      localMusuwPasswordAuth: isLocalMusuwAuthEnabled(
        import.meta.env.DEV,
        import.meta.env["VITE_MUSUW_DEV_LOCAL_AUTH"],
        window.location.hostname,
      ),
    });
  }
  content = <AuthApp runtime={runtime} passwordOnly={passwordOnly} />;
} catch {
  const copy = getAuthCopy(getInitialAuthLocale());
  content = (
    <main className="auth-page">
      <p className="auth-status" role="alert">{copy.errors.unavailable}</p>
    </main>
  );
}

createRoot(root).render(<StrictMode>{content}</StrictMode>);
