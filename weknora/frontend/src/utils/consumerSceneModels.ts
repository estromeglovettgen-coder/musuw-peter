import type { ConsumerConfigurableScene, ConsumerScene, ConsumerSceneOption, ModelConfig } from '@/api/model'
export type { ConsumerSceneOption } from '@/api/model'

/** Native model interface used by each fixed consumer boundary. */
export const consumerSceneModelType: Record<ConsumerConfigurableScene, ModelConfig['type']> = {
  rag: 'KnowledgeQA',
  wiki: 'KnowledgeQA',
  rerank: 'Rerank',
  vision: 'VLLM',
  asr: 'ASR',
}

export function resolveComposerConsumerScene(
  hasExplicitRetrievalScope: boolean,
  webSearchEnabled: boolean,
  hasBuiltinAllKnowledgeScope: boolean,
  forceUnifiedLiteAgent = false,
): ConsumerScene {
  // Lite exposes one fixed platform agent. Its picker is always the agent
  // scene, while retrieval-scope flags continue to describe the pipeline
  // executed by that agent rather than changing its model identity.
  if (forceUnifiedLiteAgent) return 'rag'
  return hasExplicitRetrievalScope || webSearchEnabled || hasBuiltinAllKnowledgeScope ? 'rag' : 'chat'
}

export function filterConsumerModelCatalog(
  models: readonly ModelConfig[],
  scene?: ConsumerConfigurableScene,
): ModelConfig[] {
  return models.filter((model) => (
    (!scene || model.type === consumerSceneModelType[scene])
    && model.is_builtin === true
    && model.status === 'active'
    && model.parameters?.provider?.trim().toLowerCase() === 'openrouter'
  ))
}

export function normalizeConsumerModelIds(
  ids: readonly unknown[],
  catalog: readonly ModelConfig[],
  scene?: ConsumerConfigurableScene,
): string[] {
  const allowed = new Set(filterConsumerModelCatalog(catalog, scene).map((model) => model.id).filter(Boolean))
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of ids) {
    if (typeof value !== 'string') continue
    const id = value.trim()
    if (!id || seen.has(id) || !allowed.has(id)) continue
    seen.add(id)
    normalized.push(id)
  }
  return normalized
}

export function resolveConsumerSceneCandidate(
  options: readonly ConsumerSceneOption[],
  candidateId?: string | null,
  effectiveModelId?: string | null,
): string {
  const selectable = new Set(
    options.filter((option) => option.selectable && !option.locked).map((option) => option.model_id),
  )
  if (candidateId && selectable.has(candidateId)) return candidateId
  if (effectiveModelId && selectable.has(effectiveModelId)) return effectiveModelId
  return options.find((option) => option.selectable && !option.locked)?.model_id || ''
}
