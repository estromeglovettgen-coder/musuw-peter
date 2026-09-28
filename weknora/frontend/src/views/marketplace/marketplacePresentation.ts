/** Money crosses the marketplace interface as integer USD cents. */
export function parseMonthlyAmount(value: string): number | null {
  const input = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null
  const [whole = '', fraction = ''] = input.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 100_000_000 ? amount : null
}

/** Published catalogs encode free access as zero for both billing intervals. */
export function isFreeMarketProduct(product: { monthly_amount: number; yearly_amount: number } | null | undefined): boolean {
  return product?.monthly_amount === 0 && product?.yearly_amount === 0
}

export function annualAmountForMonthly(monthly: number): number {
  return monthly * 10
}

export function formatMarketPrice(amount: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100)
}

export function sortMarketProducts<T extends { featured?: boolean; fixture?: boolean }>(products: T[]): T[] {
  return [...products].sort((a, b) => Number(Boolean(a.fixture)) - Number(Boolean(b.fixture)) || Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
}

export function formatMarketDate(value: string | undefined, locale: string): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

export function marketStatusKey(status: string | undefined): string {
  const known = ['free', 'draft', 'pending', 'published', 'rejected', 'unpublished', 'active', 'trialing', 'past_due', 'canceled', 'cancelled', 'expired', 'paid', 'completed', 'refunded', 'billed', 'ready', 'paused', 'creating', 'uncertain', 'failed', 'chargeback', 'disputed', 'pending_payment', 'in_flight', 'checkout_created']
  return `creatorMarketplace.status.${known.includes(status || '') ? status : 'unknown'}`
}
