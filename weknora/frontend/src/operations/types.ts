export type EnvironmentName = 'TEST' | 'PRODUCTION'

export interface ProviderState {
  available: boolean
  applicable?: boolean
  authority: string
  reason?: string
}

export interface OperationsConfig {
  environment: EnvironmentName
  target: 'test' | 'production'
  providers: Record<'weknora' | 'paddle' | 'supabase' | 'r2' | 'langfuse', ProviderState>
  links: Record<string, string>
}

export type EnvironmentTarget = OperationsConfig['target']

export type ComplimentaryPlan = 'plus' | 'pro' | 'max'

export interface ComplimentaryPlanGrantRequest {
  plan: ComplimentaryPlan
  expires_at: string
  grant_id: string
}

export interface ComplimentaryPlanRevokeRequest {
  grant_id: string
}

/**
 * Safe model metadata returned to the local operations console.  The policy
 * route intentionally carries display/type data only; provider parameters and
 * credentials remain behind the existing model services.
 */
export type ModelPolicySceneKey = 'rag' | 'rerank' | 'wiki' | 'vision' | 'asr'
export type ModelPolicyModelType = 'KnowledgeQA' | 'Rerank' | 'VLLM' | 'ASR'

export interface ModelPolicyOption {
  model_id: string
  display_name: string
  model_type: ModelPolicyModelType
}

export interface ModelPolicyScene {
  scene: ModelPolicySceneKey
  label: string
  description: string
  model_type: ModelPolicyModelType
  free_default_model_id: string
  paid_model_ids: string[]
  options: ModelPolicyOption[]
}

export interface ModelPolicyData {
  scenes: ModelPolicyScene[]
}

export interface ModelPolicyUpdate {
  free_default_model_id?: string
  paid_model_ids?: string[]
}

export interface PageResult<T> {
  rows: T[]
  total: number
  page: number
  page_size: number
}

export interface OverviewData {
  users: { total: number; active: number; new_30d: number }
  tenants: {
    total: number
    active: number
    paid: number
    storage_quota_bytes: string | number
    storage_used_bytes: string | number
  }
  knowledge: {
    knowledge_bases: number
    documents: number
    failed: number
    processing: number
    source_bytes: string | number
    index_bytes: string | number
  }
  storage_backends: Array<{ provider: string; status: string; source: string; count: number }>
  recent_documents: Array<Record<string, unknown>>
}

export interface UserRow {
  id: string
  username: string
  email: string
  avatar?: string
  is_active: boolean
  is_system_admin: boolean
  tenant_id: number
  tenant_name?: string
  tenant_status?: string
  plan?: string
  configured_plan?: string
  plan_status?: string
  plan_source?: string
  complimentary_plan?: ComplimentaryPlan | ''
  complimentary_expires_at?: string | null
  complimentary_grant_id?: string
  storage_quota_bytes?: string | number
  storage_used_bytes?: string | number
  paddle_customer_id?: string
  paddle_subscription_id?: string
  paddle_billing_period?: string
  paddle_current_period_end?: string
  open_router_credit_period_end?: string
  knowledge_base_count: number
  document_count: number
  source_bytes: string | number
  index_bytes: string | number
  created_at: string
  updated_at: string
}

export interface KnowledgeBaseRow {
  id: string
  name: string
  description?: string
  type: string
  tenant_id: number
  tenant_name: string
  creator_id?: string
  storage_backend_id?: string
  storage_provider?: string
  storage_backend_status?: string
  plan?: string
  storage_quota_bytes: string | number
  storage_used_bytes: string | number
  document_count: number
  failed_count: number
  source_bytes: string | number
  index_bytes: string | number
  created_at: string
  updated_at: string
}

export interface DocumentRow {
  id: string
  tenant_id: number
  tenant_name: string
  knowledge_base_id: string
  knowledge_base_name: string
  type: string
  title: string
  description?: string
  source?: string
  parse_status: string
  enable_status: string
  file_name?: string
  file_type?: string
  source_bytes: string | number
  index_bytes: string | number
  object_reference?: string
  error_message?: string
  channel?: string
  storage_backend_id?: string
  storage_provider?: string
  storage_backend_status?: string
  storage_quota_bytes: string | number
  storage_used_bytes: string | number
  created_at: string
  updated_at: string
  processed_at?: string
}

export interface TenantBillingRow {
  tenant_id: number
  tenant_name: string
  tenant_status: string
  plan: string
  plan_status: string
  plan_source?: string
  complimentary_plan?: ComplimentaryPlan | ''
  complimentary_expires_at?: string | null
  complimentary_grant_id?: string
  paddle_customer_id?: string
  paddle_subscription_id?: string
  paddle_billing_period?: string
  paddle_current_period_end?: string
  paddle_last_event_id?: string
  paddle_last_event_at?: string
  open_router_credit_period_end?: string
  created_at: string
  updated_at: string
}

export interface BillingData {
  mirror: TenantBillingRow[]
  provider: {
    available: boolean
    reason: string
    subscriptions_available: boolean
    subscriptions_reason: string
    subscriptions: Array<Record<string, unknown>>
    transactions_available: boolean
    transactions_reason: string
    transactions: Array<Record<string, unknown>>
  }
}

export interface IdentityData {
  account_summary: {
    total: number
    active: number
    system_admins: number
    new_30d: number
    latest_update?: string
  }
  provider: {
    available: boolean
    reason: string
    projects: Array<{
      environment: EnvironmentName
      name: string
      ref: string
      applicable?: boolean
      available: boolean
      reason: string
      total: number
      users: Array<{
        id: string
        email: string
        created_at?: string
        last_sign_in_at?: string
        email_confirmed_at?: string
        provider?: string
        providers?: string[]
      }>
    }>
  }
}

export interface StorageObjectRow extends DocumentRow {
  quota_bytes: string | number
  measured_used_bytes: string | number
}

export interface StorageData extends PageResult<StorageObjectRow> {
  usage: {
    quota_bytes: string | number
    measured_used_bytes: string | number
    source_bytes: string | number
    index_bytes: string | number
  }
  backends: Array<{
    id: string
    tenant_id: number
    tenant_name: string
    name: string
    provider: string
    source: string
    status: string
    legacy_alias: boolean
    knowledge_base_count: number
    created_at: string
    updated_at: string
  }>
  provider: {
    available: boolean
    applicable?: boolean
    reason: string
    bucket: string
    prefix: string
    total: number
    total_bytes: number
    objects: Array<{
      key: string
      size: number
      last_modified?: string
      etag?: string
    }>
  }
}

export interface LangfuseData {
  available: boolean
  reason: string
  cursor?: string
  observations: Array<{
    id: string
    trace_id: string
    name: string
    type: string
    start_time?: string
    end_time?: string
    environment?: string
    level?: string
    model?: string
    total_usage?: number
    total_cost?: number
    latency?: number
    trace_name?: string
    release?: string
  }>
}

export interface TenantEntitlement {
  tenant_id: number
  tenant_name: string
  tenant_status: string
  configured_plan: string
  plan: string
  plan_status: string
  plan_source?: string
  complimentary_plan?: ComplimentaryPlan | ''
  complimentary_expires_at?: string | null
  complimentary_grant_id?: string
  storage_quota_bytes: number
  storage_used_bytes: number
  storage_usage_percent: number
  billing_period?: string
  paddle_customer_id?: string
  paddle_subscription_id?: string
  paddle_current_period_end?: string
  openrouter_credit_period_end?: string
  openrouter_monthly_limit_microusd: number
  openrouter_used_microusd: number
  openrouter_remaining_microusd: number
  openrouter_provider_available?: boolean
  openrouter_provider_error?: string
  openrouter_provider_limit_microusd?: number
  openrouter_provider_usage_microusd?: number
  openrouter_credits_status?: 'available' | 'unavailable' | 'unprovisioned' | 'pending'
}

export interface InvestigationData {
  user?: Record<string, unknown>
  tenant?: Record<string, unknown>
  entitlement?: TenantEntitlement
  sessions?: unknown[]
  knowledge_bases?: unknown[]
  documents?: unknown[]
  processing?: unknown[]
  runtime?: Record<string, unknown>
  audit?: unknown[]
  observability?: Record<string, unknown>
  [key: string]: unknown
}
