const PROVIDER_INTERNAL_ERROR =
  /OPENROUTER_[A-Z_]*|openrouter\.ai|create chat completion|LLM call failed|\b(?:DeepSeek|Gemini|Claude|Grok|GPT(?:-[\w.]+)?)\b|^HTTP \d{3}\b/i

export const BILLING_RENEWAL_PENDING_CODE = 'billing_renewal_pending'
export const OPENROUTER_CREDITS_EXHAUSTED_CODE = 'openrouter_credits_exhausted'

/**
 * Convert a backend error into text that is safe to show end users. Stable
 * machine codes take precedence over message text so billing state remains
 * honest even when a provider wraps or changes its wording.
 */
export function userFacingAIError(
  message: unknown,
  fallback: string,
  errorCode?: unknown,
  billingFallback?: string,
  creditsFallback?: string,
): string {
  if (errorCode === BILLING_RENEWAL_PENDING_CODE) {
    return billingFallback || fallback
  }
  if (errorCode === OPENROUTER_CREDITS_EXHAUSTED_CODE) {
    return creditsFallback || fallback
  }
  const raw = String(message ?? '').trim()
  if (raw.includes('token_allowance')) {
    try {
      const value = JSON.parse(raw.slice(raw.indexOf('{')))
      if (value?.error?.code === 'token_allowance' && typeof value.error.message === 'string') return value.error.message
    } catch { /* Keep unrelated/malformed provider errors on the normal path. */ }
  }
  if (!raw || PROVIDER_INTERNAL_ERROR.test(raw)) return fallback
  return raw
}
