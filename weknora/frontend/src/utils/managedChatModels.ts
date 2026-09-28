export const DEFAULT_CHAT_MODEL_ID = 'builtin-deepseek-v4-flash'

type ChatModelLike = {
  id?: string | null
  is_default?: boolean
  is_builtin?: boolean
}

/**
 * The backend is authoritative for ordinary consumers. System administrators
 * intentionally receive the full maintenance catalog, so the Lite chat picker
 * applies the same Free-plan boundary once more without hiding admin settings.
 */
export function filterChatModelsForPlan<T extends ChatModelLike>(
  availableModels: readonly T[],
  plan: 'free' | 'plus' | 'pro' | 'max',
): T[] {
  if (plan !== 'free') return [...availableModels]
  return availableModels.filter((model) => model.id === DEFAULT_CHAT_MODEL_ID)
}

/** Keep a valid user choice, then prefer a tenant default over the shared platform fallback. */
export function resolveChatModelId<T extends ChatModelLike>(
  candidateId: string | null | undefined,
  availableModels: readonly T[],
): string {
  if (candidateId && availableModels.some((model) => model.id === candidateId)) {
    return candidateId
  }

  const tenantDefault = availableModels.find((model) => model.is_default && !model.is_builtin)
  if (tenantDefault?.id) return tenantDefault.id

  const platformDefault = availableModels.find((model) => model.is_default)
  if (platformDefault?.id) return platformDefault.id

  if (availableModels.some((model) => model.id === DEFAULT_CHAT_MODEL_ID)) {
    return DEFAULT_CHAT_MODEL_ID
  }
  return availableModels[0]?.id || ''
}
