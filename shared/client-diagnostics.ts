// Best-effort operational evidence, not analytics or authentication state.
export const diagnosticPhases = [
  'auth.session', 'auth.exchange', 'auth.authorize', 'auth.password',
  'auth.otp_send', 'auth.otp_verify', 'auth.native_session', 'auth.oidc_start',
  'auth.other', 'app.startup', 'api.auth', 'api.documents', 'api.other',
] as const;
export type DiagnosticPhase = typeof diagnosticPhases[number];
export type DiagnosticEvent = Readonly<{
  phase: DiagnosticPhase;
  outcome: 'ok' | 'network' | 'timeout' | 'http' | 'identity' | 'error';
  duration_ms: number;
  request_id?: string;
  status?: number;
}>;
const storageKey = 'musuw.diagnostic-flow';
const ttl = 10 * 60_000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ReporterOptions = {
  fetch: typeof globalThis.fetch;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now: () => number;
  randomUUID: () => string;
};

export function createDiagnosticReporter(options: ReporterOptions) {
  let sent = 0;
  let flow: { id: string; created: number } | undefined;
  return (event: DiagnosticEvent): void => {
    try {
      if (sent >= 40 || !diagnosticPhases.includes(event.phase) ||
          !['ok', 'network', 'timeout', 'http', 'identity', 'error'].includes(event.outcome) ||
          !Number.isInteger(event.duration_ms) || event.duration_ms < 0 || event.duration_ms > 120_000 ||
          (event.request_id !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(event.request_id)) ||
          (event.status !== undefined && (!Number.isInteger(event.status) || (event.status !== 0 && (event.status < 100 || event.status > 599))))) return;
      const now = options.now();
      if (!flow || now < flow.created || now - flow.created >= ttl) {
        flow = undefined;
        try {
          const saved = JSON.parse(options.storage.getItem(storageKey) ?? 'null');
          if (saved && typeof saved.id === 'string' && uuidPattern.test(saved.id) &&
              Number.isFinite(saved.created) && now >= saved.created && now - saved.created < ttl) flow = saved;
        } catch { /* Storage is optional, including private browsing. */ }
        if (!flow) {
          flow = { id: options.randomUUID(), created: now };
          try { options.storage.setItem(storageKey, JSON.stringify(flow)); } catch { /* Optional. */ }
        }
      }
      if (!uuidPattern.test(flow.id)) return;
      // Pick fields explicitly; never serialize an error, URL, form, or caller extras.
      const payload = {
        phase: event.phase, outcome: event.outcome, duration_ms: event.duration_ms,
        flow_id: flow.id,
        ...(event.request_id === undefined ? {} : { request_id: event.request_id }),
        ...(event.status === undefined ? {} : { status: event.status }),
      };
      sent++;
      void options.fetch('/api/v1/client-diagnostics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), credentials: 'omit', mode: 'same-origin',
        referrerPolicy: 'no-referrer', keepalive: true,
        signal: AbortSignal.timeout(2000),
      }).catch(() => {});
    } catch { /* Diagnostics must never affect the user's action. */ }
  };
}

let browserReporter: ReturnType<typeof createDiagnosticReporter> | undefined;
export function reportDiagnostic(event: DiagnosticEvent): void {
  try {
    if (!browserReporter) {
      browserReporter = createDiagnosticReporter({
        fetch: window.fetch.bind(window),
        storage: {
          getItem: key => window.sessionStorage.getItem(key),
          setItem: (key, value) => window.sessionStorage.setItem(key, value),
        },
        now: Date.now, randomUUID: () => window.crypto.randomUUID(),
      });
    }
    browserReporter(event);
  } catch { /* Also safe when window, storage, or Web Crypto is unavailable. */ }
}
