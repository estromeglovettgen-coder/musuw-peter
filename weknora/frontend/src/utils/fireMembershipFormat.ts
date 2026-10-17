import type { FireMembership, TokenCount } from '@/api/fire-membership'

function exactTokens(value: unknown): bigint | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  return null
}
/** Exact grouped integers: a near-empty balance must never round up to 1K/1M. */
export function formatTokens(value: unknown, locale = 'zh-CN'): string {
  const count = exactTokens(value)
  return count === null ? '—' : new Intl.NumberFormat(locale).format(count)
}
export function tokenPercent(remaining: TokenCount, total: TokenCount): number {
  const available = exactTokens(remaining), limit = exactTokens(total)
  if (available === null || limit === null || limit === 0n) return 0
  return Math.min(100, Number(available * 1000000n / limit) / 10000)
}
export function formatMembershipDate(value?: string | null, locale = 'zh-CN'): string {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
export const membershipStatusLabel: Record<FireMembership['status'], string> = {
  active: '使用中', not_activated: '未开通', expired: '已到期', exhausted: '额度已用完', suspended: '已暂停',
}
export function membershipNotice(membership: FireMembership): string {
  if (membership.unlimited) return '管理账户'
  return ({ active: '', not_activated: '尚未开通会员，请联系管理员。', expired: '会员已到期，请联系管理员续期。', exhausted: 'Token 额度已用完，请联系管理员补充。', suspended: '会员已暂停，请联系管理员。' })[membership.status]
}
export function fireError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '请求失败，请重试'
}
