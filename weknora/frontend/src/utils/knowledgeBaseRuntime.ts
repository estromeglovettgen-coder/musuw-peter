export interface KnowledgeBaseRuntimeState {
  capabilities?: { ready?: boolean; storage_ready?: boolean }
  summary_model_id?: string
  embedding_model_id?: string
  storage_backend_id?: string | null
  storage_provider_config?: { provider?: string } | null
  indexing_strategy?: {
    vector_enabled?: boolean
    keyword_enabled?: boolean
    wiki_enabled?: boolean
  }
}

/**
 * Prefer the server-computed, identifier-free readiness flag used by Musuw
 * Lite. The model-id fallback keeps Standard and older API payloads working.
 */
export function isKnowledgeBaseRuntimeReady(kb: KnowledgeBaseRuntimeState | null | undefined): boolean {
  if (typeof kb?.capabilities?.ready === 'boolean') {
    return kb.capabilities.ready
  }
  if (!kb?.summary_model_id) return false
  const strategy = kb.indexing_strategy
  const needsEmbedding = !strategy || strategy.vector_enabled || strategy.keyword_enabled
  return !needsEmbedding || Boolean(kb.embedding_model_id)
}

/**
 * Prefer the server-computed Lite flag so storage identifiers remain hidden.
 * The binding fallback preserves Standard and older response compatibility.
 */
export function isKnowledgeBaseStorageReady(kb: KnowledgeBaseRuntimeState | null | undefined): boolean {
  if (typeof kb?.capabilities?.storage_ready === 'boolean') {
    return kb.capabilities.storage_ready
  }
  return Boolean(kb?.storage_backend_id || kb?.storage_provider_config?.provider)
}
