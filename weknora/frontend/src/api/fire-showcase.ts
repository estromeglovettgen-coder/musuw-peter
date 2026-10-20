import { get } from '@/utils/request'

export interface FireShowcaseBootstrap { user_id: string; tenant_id: number | string }
export async function bootstrapFireShowcase(signal?: AbortSignal): Promise<FireShowcaseBootstrap> {
  const response = await get<{ success: boolean; data?: FireShowcaseBootstrap }>('/api/v1/fire-showcase/bootstrap', { timeout: 20000, signal })
  if (!response.success || !response.data?.user_id || response.data.tenant_id == null) throw new Error('展示面暂时无法打开，请重试')
  return response.data
}
