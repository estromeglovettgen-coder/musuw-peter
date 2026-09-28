import type {
  BillingData,
  ComplimentaryPlanGrantRequest,
  ComplimentaryPlanRevokeRequest,
  DocumentRow,
  IdentityData,
  InvestigationData,
  KnowledgeBaseRow,
  LangfuseData,
  ModelPolicyData,
  ModelPolicyScene,
  ModelPolicySceneKey,
  ModelPolicyUpdate,
  OperationsConfig,
  OverviewData,
  PageResult,
  StorageData,
  TenantEntitlement,
  UserRow,
} from './types'
import { setOperationsCsrfHeader } from '@/utils/request'
import { operationsCsrfToken } from './csrf'

function csrfToken() {
  return operationsCsrfToken(document.cookie, window.location.port)
}

let synchronizedCsrfToken = ''
let sessionVersion = 0
let sessionRenewal: Promise<void> | undefined

function synchronizeCsrf(token: string) {
  synchronizedCsrfToken = csrfToken() || token
  setOperationsCsrfHeader(synchronizedCsrfToken)
}

function renewReadSession() {
  if (!sessionRenewal) {
    sessionRenewal = (async () => {
      // The private gateway establishes its existing operator session on GET.
      // Fetching the entry preserves the mounted page and any unsaved forms.
      const entry = await fetch('/operations.html', { credentials: 'same-origin', cache: 'no-store' })
      if (!entry.ok) throw new Error('无法恢复运营会话')
      const response = await fetch('/admin-api/config', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' })
      if (!response.ok) throw new Error('无法恢复运营会话')
      const payload = await response.json()
      const token = (payload?.data ?? payload)?.csrf_token
      if (typeof token !== 'string' || !token) throw new Error('无法恢复运营会话')
      synchronizeCsrf(token)
      sessionVersion += 1
    })().finally(() => { sessionRenewal = undefined })
  }
  return sessionRenewal
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestVersion = sessionVersion
  const method = (init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  const currentCsrf = csrfToken() || synchronizedCsrfToken
  if (currentCsrf !== synchronizedCsrfToken) synchronizeCsrf(currentCsrf)
  headers.set('Accept', 'application/json')
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('Content-Type', 'application/json')
    headers.set('X-Musuw-CSRF', currentCsrf)
  }
  let response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (response.status === 401 && ['GET', 'HEAD'].includes(method)) {
    try {
      // A late 401 from the old session must not establish another session.
      if (requestVersion === sessionVersion) await renewReadSession()
      response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
    } catch {
      // Preserve the original error if renewal fails; never recurse or replay writes.
    }
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || payload?.message || `HTTP ${response.status}`
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
  }
  return payload?.data ?? payload
}

function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim() !== '') params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

export const operationsApi = {
  config: async () => {
    const requestVersion = sessionVersion
    const { csrf_token, ...config } = await request<OperationsConfig & { csrf_token: string }>('/admin-api/config')
    if (requestVersion === sessionVersion) synchronizeCsrf(csrf_token)
    return config
  },
  modelPolicy: () => request<ModelPolicyData>('/admin-api/model-policy'),
  updateModelPolicy: (scene: ModelPolicySceneKey, body: ModelPolicyUpdate) =>
    request<ModelPolicyScene>(`/admin-api/model-policy/${encodeURIComponent(scene)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  overview: () => request<OverviewData>('/admin-api/overview'),
  users: (params: { page?: number; page_size?: number; q?: string; plan?: string; state?: string }) =>
    request<PageResult<UserRow>>(`/admin-api/users${queryString(params)}`),
  knowledge: <T extends DocumentRow | KnowledgeBaseRow>(params: { kind: 'documents' | 'knowledge_bases'; page?: number; page_size?: number; q?: string; status?: string }) =>
    request<PageResult<T> & { kind: string }>(`/admin-api/knowledge${queryString(params)}`),
  billing: () => request<BillingData>('/admin-api/billing'),
  identity: () => request<IdentityData>('/admin-api/identity'),
  storage: (params: { page?: number; page_size?: number; q?: string }) =>
    request<StorageData>(`/admin-api/storage${queryString(params)}`),
  langfuse: () => request<LangfuseData>('/admin-api/langfuse'),
  entitlement: (tenantId: number) =>
    request<TenantEntitlement>(`/api/v1/system/admin/tenants/${tenantId}/entitlement`),
  investigation: (userId: string) =>
    request<InvestigationData>(`/api/v1/system/admin/users/${encodeURIComponent(userId)}/investigation`),
  eraseUser: (userId: string) =>
    request<{ accepted: boolean }>(`/api/v1/system/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  updateTenant: (tenantId: number, body: { status?: string; storage_quota_bytes?: number }) =>
    request(`/api/v1/system/admin/tenants/${tenantId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  updateCredits: (tenantId: number, body: { reset?: boolean; remaining_microusd?: number }) =>
    request<TenantEntitlement>(`/api/v1/system/admin/tenants/${tenantId}/openrouter-credits`, { method: 'PUT', body: JSON.stringify(body) }),
  grantComplimentaryPlan: (tenantId: number, body: ComplimentaryPlanGrantRequest) =>
    request<TenantEntitlement>(`/api/v1/system/admin/tenants/${tenantId}/complimentary-entitlement`, { method: 'PUT', body: JSON.stringify(body) }),
  revokeComplimentaryPlan: (tenantId: number, body: ComplimentaryPlanRevokeRequest) =>
    request<TenantEntitlement>(`/api/v1/system/admin/tenants/${tenantId}/complimentary-entitlement`, { method: 'DELETE', body: JSON.stringify(body) }),
}
