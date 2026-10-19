import { get, post, put } from '@/utils/request'

export type TokenCount = number | string
export interface FireMembership {
  managed: boolean
  unlimited: boolean
  plan_name: string
  status: 'active' | 'not_activated' | 'expired' | 'exhausted' | 'suspended'
  starts_at?: string | null
  expires_at?: string | null
  token_limit: TokenCount
  used_tokens: TokenCount
  reserved_tokens: TokenCount
  remaining_tokens: TokenCount
  input_tokens: TokenCount
  output_tokens: TokenCount
  estimated_tokens: TokenCount
  question_limit?: TokenCount
  used_questions?: TokenCount
  reserved_questions?: TokenCount
  remaining_questions?: TokenCount
}
export interface FireUsage {
  id?: string
  input_tokens: TokenCount
  output_tokens: TokenCount
  total_tokens: TokenCount
  estimated?: boolean
  estimated_tokens?: TokenCount
  purpose: string
  created_at: string
}
export interface FirePlan { id: string; name: string; duration_days: number; token_limit: number; question_limit?: number; active: boolean }
export interface FireUser { id: string; username: string; email: string; tenant_id: number; created_at: string; is_system_admin: boolean; membership: FireMembership }
export interface FirePage<T> { items: T[]; total: number; page: number; page_size: number }
export interface FireAdjustment { operation_id: string; kind: 'grant' | 'renew' | 'topup' | 'extend' | 'suspend' | 'resume' | 'set_question_limit'; plan_id?: string; duration_days?: number; tokens?: number; questions?: number; question_limit?: number; note?: string }
export interface FireAdjustmentRecord extends FireAdjustment { created_at?: string }
export interface FireUserDetail { user: Omit<FireUser, 'membership'>; membership: FireMembership; usage: FireUsage[]; adjustments: FireAdjustmentRecord[] }
export interface FireCreateUser { operation_id: string; username?: string; email?: string; password?: string; fire_plan_id?: string; fire_duration_days?: number; fire_tokens?: number; fire_questions?: number }
export interface FireCreatedUser { user: Omit<FireUser, 'membership'>; generated_password?: string; membership: FireMembership }
export interface FireOverview { users_total: number; active_users: number; expired_users: number; total_tokens: TokenCount }
interface Response<T> { success: boolean; data: T; message?: string; error?: string | { message?: string } }
async function data<T>(request: Promise<Response<T>>): Promise<T> {
  const response = await request
  if (!response.success || response.data == null) throw new Error(response.message || (typeof response.error === 'string' ? response.error : response.error?.message) || '读取失败，请重试')
  return response.data
}
const ADMIN = '/api/v1/system/admin/fire'
export const fireMembershipApi = {
  current: () => data(get<Response<FireMembership>>('/api/v1/fire/membership')),
  usage: (page = 1, pageSize = 20) => data(get<Response<FirePage<FireUsage>>>('/api/v1/fire/usage', { params: { page, page_size: pageSize } })),
  overview: () => data(get<Response<FireOverview>>(`${ADMIN}/overview`)),
  plans: async () => {
    const response = await get<Response<FirePlan[] | null>>(`${ADMIN}/plans`)
    // Go's empty slice may serialize to null; an empty catalog is not a failed request.
    return data(Promise.resolve({ ...response, data: response.data ?? [] }))
  },
  savePlan: (plan: Omit<FirePlan, 'id'>, id?: string) => data(id ? put<Response<FirePlan>>(`${ADMIN}/plans/${encodeURIComponent(id)}`, plan) : post<Response<FirePlan>>(`${ADMIN}/plans`, plan)),
  users: (query = '', page = 1, pageSize = 20) => data(get<Response<FirePage<FireUser>>>(`${ADMIN}/users`, { params: { query, page, page_size: pageSize } })),
  user: (id: string) => data(get<Response<FireUserDetail>>(`${ADMIN}/users/${encodeURIComponent(id)}`)),
  adjust: (id: string, body: FireAdjustment) => data(post<Response<FireMembership>>(`${ADMIN}/users/${encodeURIComponent(id)}/adjustments`, body)),
  createUser: (body: FireCreateUser) => post<FireCreatedUser>('/api/v1/system/admin/users/create', body),
}
