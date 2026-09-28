import { get, post, put } from '@/utils/request'

export type MarketplaceBillingPeriod = 'monthly' | 'yearly'
export type MarketplaceProductStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'unpublished'

export interface MarketplaceAccess {
  portal_available: boolean
  can_chat: boolean
  subscription_id?: string
  status?: string
  paid_through?: string
  cancel_at_period_end: boolean
}

export interface MarketplaceProductInput {
  title: string
  description: string
  category: string
  cover_url?: string
  agent_id: string
  knowledge_base_ids: string[]
  default_model_id?: string
  currency?: 'USD'
  monthly_amount: number
  sample_questions?: string[]
  sample_conversations?: MarketplaceExampleConversation[]
  contact: string
  authorization: string
  authorization_confirmed: boolean
}

export interface MarketplaceProduct extends Omit<MarketplaceProductInput, 'contact' | 'authorization' | 'authorization_confirmed'> {
  contact?: string
  authorization?: string
  authorization_confirmed?: boolean
  checkout_available: boolean
  id: string
  agent_name: string
  knowledge_base_names: string[]
  default_model_id: string
  currency: 'USD'
  yearly_amount: number
  paddle_product_id?: string
  monthly_price_id?: string
  yearly_price_id?: string
  platform_agent_id?: string
  platform_knowledge_base_ids?: string[]
  status: MarketplaceProductStatus
  featured: boolean
  fixture: boolean
  review_note?: string
  reviewed_at?: string
  created_at: string
  updated_at: string
  access?: MarketplaceAccess
}

export interface MarketplaceExampleConversation { question: string; answer: string }
export interface MarketplaceDirectoryEntry { id: string; title: string; path: string[]; page_type: string }
export interface MarketplaceProductPreview {
  directory: MarketplaceDirectoryEntry[]
  examples: MarketplaceExampleConversation[]
}

export interface MarketplaceReviewInput {
  action: 'approve' | 'reject' | 'unpublish'
  paddle_product_id?: string
  monthly_price_id?: string
  yearly_price_id?: string
  platform_agent_id?: string
  platform_knowledge_base_ids?: string[]
  review_note?: string
  featured?: boolean
  fixture?: boolean
}

export interface MarketplaceSubscription {
  portal_available: boolean
  id: string
  product_id: string
  product_title: string
  billing_period: MarketplaceBillingPeriod
  price_id: string
  currency: string
  amount: number
  status: string
  paid_through?: string
  cancel_at_period_end: boolean
  scheduled_change_at?: string
  created_at: string
  updated_at: string
  can_chat: boolean
}

export interface MarketplaceTransaction {
  id: string
  subscription_id: string
  product_id: string
  product_title: string
  status: string
  currency: string
  /** Paddle minor-unit amount, transmitted as a string to preserve precision. */
  amount: string
  billing_period: MarketplaceBillingPeriod
  period_starts_at?: string
  period_ends_at?: string
  occurred_at: string
  created_at: string
  updated_at: string
}

export interface MarketplaceOrdersResponse {
  subscriptions: MarketplaceSubscription[]
  transactions: MarketplaceTransaction[]
  membership_management_path: string
}

export interface MarketplaceCheckoutIntent {
  configured: boolean
  environment: 'sandbox' | 'live'
  client_token: string
  transaction_id: string
  subscription_id: string
}

export interface MarketplaceListResponse { data: MarketplaceProduct[]; total: number }
export interface MarketplaceListQuery { q?: string; category?: string; status?: string; limit?: number; offset?: number }

const base = '/api/v1/creator-marketplace'
const admin = '/api/v1/system/creator-marketplace'
const idPath = (id: string) => encodeURIComponent(id)

export function listMarketplaceProducts(query: MarketplaceListQuery = {}): Promise<MarketplaceListResponse> {
  return get(`${base}/products`, { params: query })
}
export async function getMarketplaceProduct(id: string): Promise<MarketplaceProduct> {
  const response = await get<{ data: MarketplaceProduct }>(`${base}/products/${idPath(id)}`)
  return response.data
}
export async function getMarketplaceProductPreview(id: string): Promise<MarketplaceProductPreview> {
  const response = await get<{ data: MarketplaceProductPreview }>(`${base}/products/${idPath(id)}/preview`)
  return response.data
}
export function listCreatorProducts(query: MarketplaceListQuery = {}): Promise<MarketplaceListResponse> {
  return get(`${base}/creator/products`, { params: query })
}
export async function saveCreatorProduct(input: MarketplaceProductInput, id?: string): Promise<MarketplaceProduct> {
  const response = id
    ? await put<{ data: MarketplaceProduct }>(`${base}/creator/products/${idPath(id)}`, input)
    : await post<{ data: MarketplaceProduct }>(`${base}/creator/products`, input)
  return response.data
}
export async function submitCreatorProduct(id: string): Promise<MarketplaceProduct> {
  const response = await post<{ data: MarketplaceProduct }>(`${base}/creator/products/${idPath(id)}/submit`)
  return response.data
}
export function listMarketplaceOrders(): Promise<MarketplaceOrdersResponse> { return get(`${base}/orders`) }
export function createMarketplaceCheckout(productId: string, billingPeriod: MarketplaceBillingPeriod, operationKey: string): Promise<MarketplaceCheckoutIntent> {
  return post(`${base}/products/${idPath(productId)}/checkout`, { billing_period: billingPeriod, operation_key: operationKey })
}
export function createMarketplacePortal(subscriptionId: string): Promise<{ authorization_url: string }> {
  return post(`${base}/subscriptions/${idPath(subscriptionId)}/portal`)
}
export function listAdminMarketplaceProducts(query: MarketplaceListQuery = {}): Promise<MarketplaceListResponse> {
  return get(`${admin}/products`, { params: query })
}
export async function saveAdminMarketplaceProduct(id: string, input: MarketplaceProductInput): Promise<MarketplaceProduct> {
  const response = await put<{ data: MarketplaceProduct }>(`${admin}/products/${idPath(id)}`, input)
  return response.data
}
export async function reviewMarketplaceProduct(id: string, input: MarketplaceReviewInput): Promise<MarketplaceProduct> {
  const response = await post<{ data: MarketplaceProduct }>(`${admin}/products/${idPath(id)}/review`, input)
  return response.data
}


/** Purchased knowledge base and agent projection; never editable source resources. */
export interface MarketplaceLibraryEntry {
  product_id: string
  product_title: string
  agent_id: string
  agent_name: string
  knowledge_base_id: string
  name: string
  description: string
  wiki_enabled: boolean
  can_read: boolean
  can_chat: boolean
  status: string
  paid_through?: string
  cancel_at_period_end: boolean
}

export async function listMarketplaceLibrary(): Promise<MarketplaceLibraryEntry[]> {
  const response = await get<{ data: MarketplaceLibraryEntry[] }>(`${base}/library`)
  return response.data
}
