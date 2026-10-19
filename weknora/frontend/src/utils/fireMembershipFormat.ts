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
  return ({ active: '', not_activated: '尚未开通会员，请联系管理员。', expired: '会员已到期，请联系管理员续期。', exhausted: '剩余额度不足，请联系管理员追加额度。', suspended: '会员已暂停，请联系管理员。' })[membership.status]
}
export function fireError(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '请求失败，请重试'
}

/** User-facing allowance presentation; exact counters remain admin-only. */
export function remainingUsageLabel(remaining: TokenCount, total: TokenCount, locale = 'zh-CN'): string {
 const available=exactTokens(remaining),limit=exactTokens(total)
 if(available===null||limit===null||limit===0n)return '—'
 const percent=tokenPercent(remaining,total)
 if(percent>0&&percent<1)return '<1%'
 return new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(percent)+'%'
}

/** Optional question caps constrain the same public allowance meter; counters stay admin-only. */
export function membershipUsagePercent(membership: FireMembership): number {
  const tokens = tokenPercent(membership.remaining_tokens, membership.token_limit)
  const questions = exactTokens(membership.question_limit ?? 0)
  return questions !== null && questions > 0n
    ? Math.min(tokens, tokenPercent(membership.remaining_questions ?? 0, membership.question_limit!))
    : tokens
}
export function membershipUsageLabel(membership: FireMembership, locale = 'zh-CN'): string {
  const tokens = remainingUsageLabel(membership.remaining_tokens, membership.token_limit, locale)
  const questionLimit = exactTokens(membership.question_limit ?? 0)
  if (questionLimit === null) return '—'
  if (questionLimit === 0n) return tokens
  const questions = remainingUsageLabel(membership.remaining_questions!, membership.question_limit!, locale)
  if (tokens === '—' || questions === '—') return '—'
  const percent = membershipUsagePercent(membership)
  return percent > 0 && percent < 1 ? '<1%' : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(percent) + '%'
}
