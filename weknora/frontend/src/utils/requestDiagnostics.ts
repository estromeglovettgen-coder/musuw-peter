import type { AxiosInstance } from 'axios'
import type { DiagnosticEvent, DiagnosticPhase } from '../../../../shared/client-diagnostics'

// Observe only the existing auth and document read paths, before response
// unwrapping. Payloads, query strings, resource IDs and credentials stay here.
export function installRequestDiagnostics(
  instance: AxiosInstance,
  report: (event: DiagnosticEvent) => void,
  now: () => number = () => performance.now(),
) {
  const starts = new WeakMap<object, { time: number; phase: DiagnosticPhase }>()
  instance.interceptors.request.use(config => {
    const path = (config.url ?? '').split('?')[0]
    const phase = /^\/api\/v1\/auth\//.test(path) ? 'api.auth'
      : /^(?:\/api\/v1)?\/(?:knowledge|knowledge-bases|knowledgebase|chunks)(?:\/|$)/.test(path) ? 'api.documents' : undefined
    if (phase) starts.set(config, { time: now(), phase })
    return config
  })
  const record = (config: any, status: number, code?: string) => {
    try {
      const start = config && starts.get(config)
      if (!start || code === 'ERR_CANCELED') return
      const duration_ms = Math.min(120_000, Math.max(0, Math.round(now() - start.time)))
      if (start.phase !== 'api.auth' && status >= 200 && status < 400 && duration_ms < 1000) return
      const requestID = config.headers?.['X-Request-ID']
      report({ phase: start.phase, duration_ms, status,
        outcome: code === 'ECONNABORTED' || code === 'ETIMEDOUT' ? 'timeout'
          : status === 0 ? 'network' : status >= 400 ? 'http' : 'ok',
        ...(typeof requestID === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(requestID) ? { request_id: requestID } : {}),
      })
    } catch { /* Reporting never changes HTTP behavior. */ }
  }
  instance.interceptors.response.use(response => {
    record(response.config, response.status)
    return response
  }, error => {
    record(error.config, error.response?.status ?? 0, error.code)
    return Promise.reject(error)
  })
}
