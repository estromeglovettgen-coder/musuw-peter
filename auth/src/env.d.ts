interface ImportMetaEnv {
  readonly VITE_AUTH_PUBLIC_ORIGIN: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_WEKNORA_OAUTH_CLIENT_ID: string;
}

interface Window {
  __RUNTIME_CONFIG__?: {
    auth?: unknown;
  };
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
