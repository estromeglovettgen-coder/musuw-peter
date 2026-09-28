export type ReasoningModel = {
  id: string
  parameters?: {
    reasoning?: {
      supported?: boolean
      mandatory?: boolean
      supported_efforts?: string[]
      default_effort?: string
    }
  }
}

export function modelReasoningEfforts(model?: ReasoningModel): string[] {
  const reasoning = model?.parameters?.reasoning
  if (!reasoning?.supported) return []
  const supported = reasoning.supported_efforts || []
  const efforts = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].filter(value => supported.includes(value))
  if (!reasoning.mandatory) efforts.push('none')
  return efforts
}

export function resolveModelReasoning(model: ReasoningModel | undefined, effort: string, preferenceModelId = '') {
  // Missing metadata means loading, not an incapable model. Do not overwrite
  // the user's saved depth while the catalog is in flight.
  if (!model || typeof model.parameters?.reasoning?.supported !== 'boolean') return null
  const choices = modelReasoningEfforts(model)
  if (preferenceModelId === model.id && choices.includes(effort)) return { effort, modelId: model.id }
  return { effort: choices.find(value => value !== 'none') || 'none', modelId: model.id }
}
