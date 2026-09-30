import type { ModelDefaultCandidate } from '@/utils/modelDefaults'

type MediaRepairSection = 'multimodal' | 'asr'
type MediaModel = ModelDefaultCandidate & { deleted_at?: string | null }
type MediaKnowledgeBase = {
  vlm_config?: { enabled?: boolean; model_id?: string }
  asr_config?: { enabled?: boolean; model_id?: string }
}

// Keep these extensions aligned with the server's IsImageType/IsAudioType
// gates. Videos use the separate server-owned media path.
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'm4a', 'flac', 'ogg'])

function extension(value: string): string {
  const path = value.split(/[?#]/, 1)[0].trim().toLowerCase()
  return path.split('/').pop()?.split('.').pop() || ''
}

export function needsPeterMediaModelCheck(fileTypesOrNames: readonly string[]): boolean {
  return fileTypesOrNames.some(value => {
    const ext = extension(value)
    return IMAGE_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext)
  })
}

export function peterMediaRepairSection(
  fileTypesOrNames: readonly string[],
  kb: MediaKnowledgeBase,
  models: readonly MediaModel[],
): MediaRepairSection | null {
  const fileTypes = fileTypesOrNames.map(extension)
  const hasActiveModel = (id: string | undefined, type: 'VLLM' | 'ASR') => {
    const modelId = id?.trim()
    return !!modelId && models.some(model =>
      model.id === modelId && model.type === type
      && (!model.status || model.status === 'active') && !model.deleted_at,
    )
  }

  if (fileTypes.some(type => IMAGE_EXTENSIONS.has(type))
    && (!kb.vlm_config?.enabled || !hasActiveModel(kb.vlm_config.model_id, 'VLLM'))) {
    return 'multimodal'
  }
  if (fileTypes.some(type => AUDIO_EXTENSIONS.has(type))
    && (!kb.asr_config?.enabled || !hasActiveModel(kb.asr_config.model_id, 'ASR'))) {
    return 'asr'
  }
  return null
}
