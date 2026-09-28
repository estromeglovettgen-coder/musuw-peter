import i18n from '../i18n'

const CONSUMER_PLAN_ERROR_KEYS: Record<string, string> = {
  'Free plan supports one knowledge base; upgrade to create another': 'entitlement.freeKnowledgeBaseLimit',
  // Lite's knowledge-base service currently emits the localized message for
  // this guard. Keep the canonical Chinese forms here so the UI can still
  // identify the entitlement denial and open the shared upgrade prompt.
  '免费版仅支持 1 个知识库；升级后可继续创建。': 'entitlement.freeKnowledgeBaseLimit',
  '免费版仅支持 1 个知识库；升级后可继续创建': 'entitlement.freeKnowledgeBaseLimit',
  'Free plan supports ten documents per knowledge base; upgrade to add more': 'entitlement.freeDocumentLimit',
  'Free plan does not support video upload': 'entitlement.freeVideoLimit',
  'Free plan does not support URL import': 'entitlement.freeUrlImport',
  'Storage quota exceeded': 'entitlement.storageQuotaUpgradeBody',
}

/**
 * Return the stable i18n key for a server-side consumer-plan denial.
 *
 * Requests can carry the original English backend message, the localized
 * message produced by the request interceptor, or (for older Lite handlers)
 * the canonical Chinese message directly. Matching all three keeps the
 * presentation decision at the UI boundary without parsing arbitrary errors.
 */
export function consumerPlanErrorKey(message?: unknown): string | undefined {
  if (typeof message !== 'string') return undefined
  const normalized = message.trim()
  if (!normalized) return undefined

  const direct = CONSUMER_PLAN_ERROR_KEYS[normalized]
  if (direct) return direct

  for (const key of new Set(Object.values(CONSUMER_PLAN_ERROR_KEYS))) {
    if (normalized === String(i18n.global.t(key))) return key
  }
  return undefined
}

/** Extract the plan-denial key from the shapes returned by the Axios wrapper. */
export function consumerPlanErrorKeyFromError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const value = error as any
  const candidates = [
    value.message,
    value.error?.message,
    value.error,
    value.response?.data?.error?.message,
    value.response?.data?.error,
    value.response?.data?.message,
  ]
  for (const candidate of candidates) {
    const key = consumerPlanErrorKey(candidate)
    if (key) return key
  }
  return undefined
}

export function localizeConsumerPlanError(message?: string): string | undefined {
  const key = consumerPlanErrorKey(message)
  return key ? String(i18n.global.t(key)) : message
}
