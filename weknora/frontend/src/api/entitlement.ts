import { get, post } from '@/utils/request'

export type ConsumerPlan = 'free' | 'plus' | 'pro' | 'max'
export type OpenRouterCreditsStatus = 'available' | 'unavailable' | 'unprovisioned' | 'pending'
export type PaidConsumerPlan = Exclude<ConsumerPlan, 'free'>
export type BillingPeriod = 'monthly' | 'yearly'

export interface PaddleCatalogOption {
  price_id: string
}

export interface PaddleBillingConfig {
  configured: boolean
  portal_available: boolean
  /** True when the authenticated tenant has a recoverable/manageable Paddle subscription. */
  can_manage_billing?: boolean
  environment?: 'sandbox' | 'live'
  client_token?: string
  pw_customer_id?: string
  catalog?: Partial<Record<PaidConsumerPlan, Partial<Record<BillingPeriod, PaddleCatalogOption>>>>
}

export interface PaddlePublicConfig {
  configured: boolean
  environment?: 'sandbox' | 'live'
  client_token?: string
}

export interface ConsumerEntitlement {
  plan: ConsumerPlan
  plan_status: string
  storage_bytes: number
  storage_used: number
  monthly_openrouter_microusd: number
  openrouter_used_microusd: number
  openrouter_remaining_microusd: number
  openrouter_resets_at?: string
  openrouter_credits_status: OpenRouterCreditsStatus
  max_knowledge_bases: number
  max_documents_per_kb: number
  video_upload: boolean
}

export interface EntitlementResponse {
  data: ConsumerEntitlement
  billing: PaddleBillingConfig
}

export interface PaddleSubscriptionUpgradePreview {
  plan: PaidConsumerPlan
  period: BillingPeriod
  action: 'charge' | 'credit'
  prorated_subtotal: string
  prorated_tax: string
  due_today: string
  recurring_total: string
  currency_code: string
  next_billed_at: string
}

/** One server-created Paddle transaction. Paddle.js owns the payment UI. */
export interface PaddleCheckoutIntent {
  transaction_id: string
  pending: true
}

export async function getCurrentEntitlement(): Promise<EntitlementResponse> {
  return get('/api/v1/entitlements/current') as unknown as Promise<EntitlementResponse>
}

export async function getPaddlePublicConfig(): Promise<PaddlePublicConfig> {
  return get('/api/v1/billing/paddle/public-config') as unknown as Promise<PaddlePublicConfig>
}

export async function createPaddlePortalSession(): Promise<{ authorization_url: string }> {
  return post('/api/v1/billing/paddle/portal-session') as Promise<{ authorization_url: string }>
}

export async function previewPaddleSubscriptionUpgrade(plan: PaidConsumerPlan): Promise<PaddleSubscriptionUpgradePreview> {
  return post('/api/v1/billing/paddle/subscription-upgrade/preview', { plan }) as Promise<PaddleSubscriptionUpgradePreview>
}

export async function upgradePaddleSubscription(plan: PaidConsumerPlan, operationKey: string): Promise<{ pending: true; plan: PaidConsumerPlan }> {
  return post('/api/v1/billing/paddle/subscription-upgrade', {
    plan,
    operation_key: operationKey,
  }) as Promise<{ pending: true; plan: PaidConsumerPlan }>
}

export async function createPaddleCheckoutIntent(input: {
  plan: PaidConsumerPlan
  billingPeriod: BillingPeriod
  operationKey: string
}): Promise<PaddleCheckoutIntent> {
  return post('/api/v1/billing/paddle/checkout-intent', {
    plan: input.plan,
    billing_period: input.billingPeriod,
    operation_key: input.operationKey,
  }) as Promise<PaddleCheckoutIntent>
}
