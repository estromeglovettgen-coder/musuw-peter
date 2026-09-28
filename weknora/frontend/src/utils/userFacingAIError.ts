const PROVIDER_INTERNAL_ERROR =
  /OPENROUTER_[A-Z_]*|openrouter\.ai|create chat completion|LLM call failed/i

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
  if (!raw || PROVIDER_INTERNAL_ERROR.test(raw)) return fallback
  return raw
}
