export type ModelEditorSource = 'local' | 'remote'

export type ModelEditorType = 'chat' | 'embedding' | 'rerank' | 'vllm' | 'asr'

export function shouldShowModelProvider(
  provider: string,
  peterWorkspace: boolean,
  existingProvider?: string,
): boolean {
  const normalized = provider.trim().toLowerCase()
  return !peterWorkspace || normalized !== 'weknoracloud'
    || existingProvider?.trim().toLowerCase() === normalized
}

export function shouldShowOllamaUnavailableTip(
  source: ModelEditorSource,
  modelType: ModelEditorType,
  ollamaServiceStatus: boolean | null,
): boolean {
  return source === 'local' && modelType !== 'rerank' && ollamaServiceStatus === false
}
