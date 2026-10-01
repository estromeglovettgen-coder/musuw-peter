export type ReasoningModel = {
  id: string
  name?: string
  type?: string
  parameters?: {
    provider?: string
    extra_config?: {
      thinking_control?: string
    }
    reasoning?: {
      supported?: boolean
      mandatory?: boolean
      supported_efforts?: string[]
      default_effort?: string
    }
  }
}

/** Direct DeepSeek models expose thinking through the OpenAI-compatible API. */
export function isDeepSeekThinkingModel(model?: ReasoningModel): boolean {
  if (!model) return false
  if (model.type && model.type !== 'KnowledgeQA') return false
  const provider = model.parameters?.provider?.trim().toLowerCase() || ''
  const name = model.name?.trim().toLowerCase() || ''
  if (model.parameters?.extra_config?.thinking_control?.trim().toLowerCase() === 'none') {
    return false
  }
  return provider === 'deepseek' || (provider === 'openrouter' && name.includes('deepseek')) || name.includes('deepseek-flash')
}

export function modelReasoningEfforts(model?: ReasoningModel): string[] {
  const reasoning = model?.parameters?.reasoning
  if (!reasoning?.supported) {
    return isDeepSeekThinkingModel(model) ? ['low', 'high', 'max', 'none'] : []
  }
  const supported = reasoning.supported_efforts || []
  const efforts = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].filter(value => supported.includes(value))
  if (!reasoning.mandatory) efforts.push('none')
  return efforts
}

export function modelReasoningDefaultEffort(model?: ReasoningModel): string {
  const choices = modelReasoningEfforts(model)
  if (isDeepSeekThinkingModel(model) && choices.includes('high')) return 'high'
  return choices.find(value => value !== 'none') || 'none'
}

export function resolveModelReasoning(model: ReasoningModel | undefined, effort: string, preferenceModelId = '') {
  // Missing metadata means loading, not an incapable model. Do not overwrite
  // the user's saved depth while the catalog is in flight.
  if (!model) return null
  const hasReasoningMetadata = typeof model.parameters?.reasoning?.supported === 'boolean'
  if (!hasReasoningMetadata && !isDeepSeekThinkingModel(model)) return null
  const choices = modelReasoningEfforts(model)
  if (preferenceModelId === model.id && choices.includes(effort)) return { effort, modelId: model.id }
  return { effort: modelReasoningDefaultEffort(model), modelId: model.id }
}
