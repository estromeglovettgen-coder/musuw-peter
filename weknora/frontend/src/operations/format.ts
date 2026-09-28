export function formatBytes(value: unknown) {
  const bytes = Number(value || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const amount = bytes / 1024 ** index
  return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`
}

export function formatDate(value: unknown, fallback = '—') {
  if (!value) return fallback
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatNumber(value: unknown) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0))
}

export function formatMicrousd(value: unknown) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(value || 0) / 1_000_000)
}

export function percent(used: unknown, quota: unknown) {
  const numerator = Number(used || 0)
  const denominator = Number(quota || 0)
  if (!denominator) return 0
  return Math.max(0, Math.min(100, (numerator / denominator) * 100))
}

export function statusTone(value: unknown): 'success' | 'warning' | 'danger' | 'primary' | 'default' {
  const normalized = String(value || '').toLowerCase()
  if (['active', 'success', 'completed', 'ready', 'enabled', 'verified'].includes(normalized)) return 'success'
  if (['failed', 'error', 'inactive', 'canceled', 'cancelled', 'past_due', 'unavailable'].includes(normalized)) return 'danger'
  if (['pending', 'waiting', 'processing', 'running', 'paused', 'trialing'].includes(normalized)) return 'warning'
  if (['max', 'pro', 'plus'].includes(normalized)) return 'primary'
  return 'default'
}

export function shortId(value: unknown, length = 12) {
  const text = String(value || '')
  return text.length > length ? `${text.slice(0, length)}…` : text || '—'
}
