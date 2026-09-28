<template>
  <Teleport to="body">
    <Transition name="visual-model-debug">
      <div v-if="drawerVisible" class="visual-model-debug__overlay" @click.self="closeDrawer">
        <div
          class="visual-model-debug__resize-handle"
          :class="{ 'is-active': drawerResizing }"
          :style="{ right: `${drawerWidthPx}px` }"
          role="separator"
          aria-orientation="vertical"
          @mousedown.prevent="onResizeStart"
        >
          <span />
        </div>

        <aside
          class="visual-model-debug"
          :class="{ 'is-resizing': drawerResizing }"
          :style="{ width: `${drawerWidthPx}px` }"
          role="dialog"
          aria-modal="true"
          :aria-label="$t('modelSettings.debug.title')"
        >
          <header class="visual-model-debug__header">
            <div class="visual-model-debug__heading">
              <span class="visual-model-debug__heading-icon"><t-icon name="play-circle-stroke" /></span>
              <div>
                <h3>{{ $t('modelSettings.debug.title') }}</h3>
                <p>{{ $t('modelSettings.debug.description') }}</p>
              </div>
            </div>
            <button type="button" class="visual-model-debug__close" :aria-label="$t('common.close')" @click="closeDrawer">
              <t-icon name="close" />
            </button>
          </header>

          <div class="visual-model-debug__content">
            <section class="visual-model-debug__section">
              <h4>{{ $t('modelSettings.debug.groupModel') }}</h4>
              <div v-if="availableModelTypes.length > 1" class="visual-model-debug__types" role="radiogroup" :aria-label="$t('modelSettings.debug.modelType')">
                <button
                  v-for="option in availableModelTypes"
                  :key="option.value"
                  type="button"
                  :class="{ 'is-active': selectedModelType === option.value }"
                  role="radio"
                  :aria-checked="selectedModelType === option.value"
                  @click="selectModelType(option.value)"
                >
                  <t-icon :name="option.icon" />
                  <span>{{ option.label }}</span>
                </button>
              </div>
              <div class="visual-model-debug__field">
                <label>{{ $t('modelSettings.debug.model') }}</label>
                <t-select
                  v-model="selectedModelId"
                  filterable
                  :placeholder="$t('modelSettings.debug.modelPlaceholder')"
                  :disabled="filteredModels.length === 0"
                  @change="resetResult"
                >
                  <t-option v-for="model in filteredModels" :key="model.id" :value="model.id!" :label="modelLabel(model)">
                    <div class="visual-model-debug__model-option">
                      <span>{{ modelLabel(model) }}</span>
                      <small>{{ vendorLabel(model) }}</small>
                    </div>
                  </t-option>
                </t-select>
                <p v-if="filteredModels.length === 0">{{ $t('modelSettings.debug.noModelsForType') }}</p>
              </div>
            </section>

            <template v-if="selectedModel">
              <section class="visual-model-debug__section">
                <h4>{{ $t('modelSettings.debug.groupInput') }}</h4>
                <div v-if="selectedModel.type !== 'ASR'" class="visual-model-debug__field">
                  <label>{{ inputLabel }}</label>
                  <t-textarea v-model="input" :placeholder="inputPlaceholder" :autosize="{ minRows: 4, maxRows: 8 }" />
                </div>

                <div v-if="selectedModel.type === 'Rerank'" class="visual-model-debug__field">
                  <label>{{ $t('modelSettings.debug.documents') }}</label>
                  <t-textarea v-model="documentsText" :placeholder="$t('modelSettings.debug.documentsPlaceholder')" :autosize="{ minRows: 4, maxRows: 8 }" />
                  <p>{{ $t('modelSettings.debug.documentsHint') }}</p>
                </div>

                <div v-if="needsFile" class="visual-model-debug__field">
                  <label>{{ fileLabel }}</label>
                  <input
                    ref="fileInputRef"
                    class="visual-model-debug__native-file"
                    type="file"
                    :accept="selectedModel.type === 'VLLM' ? 'image/*' : 'audio/*'"
                    @change="onNativeFileChange"
                  >
                  <button type="button" class="visual-model-debug__file-button" @click="fileInputRef?.click()">
                    <t-icon name="upload" />
                    <span>{{ $t('modelSettings.debug.chooseFile') }}</span>
                  </button>
                  <p v-if="file">{{ file.name }} · {{ formatBytes(file.size) }}</p>
                </div>
              </section>

              <section v-if="isChat" class="visual-model-debug__section">
                <h4>{{ $t('modelSettings.debug.parameters') }}</h4>
                <div class="visual-model-debug__parameter-grid">
                  <div class="visual-model-debug__field">
                    <label>Temperature</label>
                    <t-input-number v-model="temperature" :min="0" :max="2" :step="0.1" theme="column" />
                  </div>
                  <div class="visual-model-debug__field">
                    <label>Top P</label>
                    <t-input-number v-model="topP" :min="0.01" :max="1" :step="0.1" theme="column" />
                  </div>
                  <div class="visual-model-debug__field">
                    <label>Max Tokens</label>
                    <t-input-number v-model="maxTokens" :min="1" :max="8192" :step="128" theme="column" />
                  </div>
                </div>
                <div class="visual-model-debug__field">
                  <label>{{ $t('modelSettings.debug.systemPrompt') }}</label>
                  <t-textarea v-model="systemPrompt" :placeholder="$t('modelSettings.debug.systemPromptPlaceholder')" :autosize="{ minRows: 2, maxRows: 4 }" />
                </div>
                <div v-if="supportsThinking" class="visual-model-debug__switch-field">
                  <t-switch v-model="thinking" />
                  <span>{{ $t('modelSettings.debug.thinkingDesc') }}</span>
                </div>
              </section>

              <section v-if="result || history.length > 0" class="visual-model-debug__section">
                <h4>{{ $t('modelSettings.debug.groupResult') }}</h4>
                <div v-if="history.length > 1" class="visual-model-debug__history">
                  <button
                    v-for="run in history"
                    :key="run.id"
                    type="button"
                    :class="{ 'is-active': result === run.result }"
                    @click="result = run.result"
                  >
                    <strong>{{ run.label }}</strong>
                    <span>{{ run.result.elapsed_ms }} ms</span>
                  </button>
                </div>

                <div v-if="result" class="visual-model-debug__result">
                  <div class="visual-model-debug__banner" :class="result.ok ? 'is-ok' : 'is-error'">
                    <t-icon :name="result.ok ? 'check-circle-filled' : 'close-circle-filled'" />
                    <strong>{{ result.ok ? $t('modelSettings.debug.success') : $t('modelSettings.debug.failed') }}</strong>
                    <span>{{ result.elapsed_ms }} ms</span>
                  </div>
                  <div v-if="resultMetrics.length > 0" class="visual-model-debug__metrics">
                    <span v-for="metric in resultMetrics" :key="metric.key">{{ metric.label }}: {{ metric.value }}</span>
                  </div>
                  <p v-if="result.error" class="visual-model-debug__error">{{ result.error }}</p>
                  <div class="visual-model-debug__result-tabs" role="tablist">
                    <button type="button" :class="{ 'is-active': resultTab === 'response' }" @click="resultTab = 'response'">{{ $t('modelSettings.debug.rawResponse') }}</button>
                    <button type="button" :class="{ 'is-active': resultTab === 'request' }" @click="resultTab = 'request'">{{ $t('modelSettings.debug.requestPreview') }}</button>
                  </div>
                  <pre>{{ formattedResult }}</pre>
                </div>
              </section>
            </template>
          </div>

          <footer class="visual-model-debug__footer">
            <button v-if="result" type="button" class="visual-model-debug__button" @click="copyResult">
              <t-icon name="file-copy" />
              <span>{{ $t('modelSettings.debug.copyResult') }}</span>
            </button>
            <div class="visual-model-debug__footer-actions">
              <button type="button" class="visual-model-debug__button" @click="closeDrawer">{{ $t('common.close') }}</button>
              <button type="button" class="visual-model-debug__button is-primary" :disabled="!canRun || running" @click="runDebug">
                <t-loading v-if="running" size="small" />
                <t-icon v-else name="play-circle-stroke" />
                <span>{{ $t('modelSettings.debug.run') }}</span>
              </button>
            </div>
          </footer>
        </aside>

        <div v-if="drawerResizing" class="visual-model-debug__resize-shield" aria-hidden="true" />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { copyWithToast } from '@/utils/clipboard'
import { debugModel, type ModelConfig, type ModelDebugResult } from '@/api/model'
import { fileSizeVerification } from '@/utils'
import { modelSupportsThinking } from '@/utils/thinkingControl'

const props = defineProps<{
  visible: boolean
  models: ModelConfig[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const { t, te } = useI18n()
const drawerVisible = computed({
  get: () => props.visible,
  set: value => emit('update:visible', value),
})

const MODEL_DEBUG_WIDTH_KEY = 'setting-drawer:width:model-debug'
const MODEL_DEBUG_DEFAULT_WIDTH = 560
const MODEL_DEBUG_MIN_WIDTH = 480
const MODEL_DEBUG_MAX_WIDTH = 900
const clampDrawerWidth = (value: number) => Math.max(MODEL_DEBUG_MIN_WIDTH, Math.min(MODEL_DEBUG_MAX_WIDTH, Math.round(value)))
const loadStoredDrawerWidth = () => {
  if (typeof window === 'undefined') return MODEL_DEBUG_DEFAULT_WIDTH
  try {
    const raw = window.localStorage.getItem(MODEL_DEBUG_WIDTH_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? clampDrawerWidth(parsed) : MODEL_DEBUG_DEFAULT_WIDTH
  } catch {
    return MODEL_DEBUG_DEFAULT_WIDTH
  }
}
const drawerWidthPx = ref(loadStoredDrawerWidth())
const drawerResizing = ref(false)
let resizeStartX = 0
let resizeStartWidth = MODEL_DEBUG_DEFAULT_WIDTH

const persistDrawerWidth = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MODEL_DEBUG_WIDTH_KEY, String(clampDrawerWidth(drawerWidthPx.value)))
  } catch {
    // Preserve the live width when storage is unavailable.
  }
}
const onResizeMove = (event: MouseEvent) => {
  drawerWidthPx.value = clampDrawerWidth(resizeStartWidth + resizeStartX - event.clientX)
}
const cleanupResize = () => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  drawerResizing.value = false
}
function onResizeEnd() {
  cleanupResize()
  persistDrawerWidth()
}
const onResizeStart = (event: MouseEvent) => {
  drawerResizing.value = true
  resizeStartX = event.clientX
  resizeStartWidth = drawerWidthPx.value
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
const onWindowResize = () => {
  drawerWidthPx.value = clampDrawerWidth(drawerWidthPx.value)
}
const blurActiveElementBeforeClose = () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}
const closeDrawer = () => {
  blurActiveElementBeforeClose()
  drawerVisible.value = false
}

type DebugModelType = ModelConfig['type']

const selectedModelType = ref<DebugModelType>('KnowledgeQA')
const selectedModelId = ref('')
const input = ref('')
const documentsText = ref('')
const file = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const thinking = ref(false)
const temperature = ref(0.7)
const topP = ref(1)
const maxTokens = ref(1024)
const systemPrompt = ref('')
const running = ref(false)
const result = ref<ModelDebugResult | null>(null)
const resultTab = ref<'response' | 'request'>('response')
const history = ref<Array<{
  id: number
  label: string
  result: ModelDebugResult
}>>([])
let runSequence = 0

const selectedModel = computed(() => props.models.find(model => model.id === selectedModelId.value))
const filteredModels = computed(() => props.models.filter(model => model.type === selectedModelType.value))
const isChat = computed(() => selectedModel.value?.type === 'KnowledgeQA')
const supportsThinking = computed(() => selectedModel.value ? modelSupportsThinking(selectedModel.value) : false)
const needsFile = computed(() => ['VLLM', 'ASR'].includes(selectedModel.value?.type || ''))
const documents = computed(() => documentsText.value.split('\n').map(item => item.trim()).filter(Boolean))
const canRun = computed(() => {
  if (!selectedModel.value) return false
  if (needsFile.value && !file.value) return false
  if (selectedModel.value.type === 'ASR') return true
  if (selectedModel.value.type === 'Rerank') return !!input.value.trim() && documents.value.length > 0
  return !!input.value.trim()
})

const allModelTypeOptions = computed(() => {
  const keys: Record<DebugModelType, { short: string; icon: string }> = {
    KnowledgeQA: { short: 'chat', icon: 'chat' },
    Embedding: { short: 'embedding', icon: 'chart-bubble' },
    Rerank: { short: 'rerank', icon: 'filter-sort' },
    VLLM: { short: 'vllm', icon: 'image' },
    ASR: { short: 'asr', icon: 'sound' },
  }
  return (Object.keys(keys) as DebugModelType[]).map(value => ({
    value,
    label: t(`modelSettings.typeShort.${keys[value].short}`),
    icon: keys[value].icon,
  }))
})

const modelCount = (type: DebugModelType) => props.models.filter(model => model.type === type).length
const availableModelTypes = computed(() => allModelTypeOptions.value.filter(option => modelCount(option.value) > 0))
const modelLabel = (model: ModelConfig) => model.display_name?.trim() || model.name
const vendorLabel = (model: ModelConfig) => {
  const provider = model.parameters.provider || ''
  if (model.source === 'local') return 'Ollama'
  if (provider === 'generic') return t('modelSettings.source.custom')
  const key = `model.editor.providers.${provider}.label`
  return te(key) ? t(key) : provider || model.source
}

const inputLabel = computed(() => {
  if (selectedModel.value?.type === 'Embedding') return t('modelSettings.debug.embeddingInput')
  if (selectedModel.value?.type === 'VLLM') return t('modelSettings.debug.vlmPrompt')
  if (selectedModel.value?.type === 'Rerank') return t('modelSettings.debug.query')
  return t('modelSettings.debug.query')
})
const inputPlaceholder = computed(() => {
  if (selectedModel.value?.type === 'Embedding') return t('modelSettings.debug.embeddingPlaceholder')
  if (selectedModel.value?.type === 'VLLM') return t('modelSettings.debug.vlmPromptPlaceholder')
  return t('modelSettings.debug.queryPlaceholder')
})
const fileLabel = computed(() => selectedModel.value?.type === 'VLLM' ? t('modelSettings.debug.imageFile') : t('modelSettings.debug.audioFile'))

const formattedResult = computed(() => {
  if (!result.value) return ''
  const value = resultTab.value === 'response' ? result.value.raw_response : result.value.request
  return JSON.stringify(value, null, 2)
})

const OBSERVATION_LABELS: Record<string, string> = {
  dimension: 'modelSettings.debug.metrics.dimension',
  result_count: 'modelSettings.debug.metrics.resultCount',
  answer_characters: 'modelSettings.debug.metrics.answerChars',
  reasoning_characters: 'modelSettings.debug.metrics.reasoningChars',
  reasoning_returned: 'modelSettings.debug.metrics.reasoningReturned',
  text_characters: 'modelSettings.debug.metrics.textChars',
  segment_count: 'modelSettings.debug.metrics.segmentCount',
}
const resultMetrics = computed(() => {
  if (!result.value?.observations) return []
  const obs = result.value.observations
  const keys = Object.keys(OBSERVATION_LABELS).filter(key => obs[key] !== undefined && obs[key] !== null)
  return keys.map(key => ({ key, label: t(OBSERVATION_LABELS[key]), value: formatMetricValue(key, obs[key]) }))
})
const formatMetricValue = (_key: string, value: unknown) => typeof value === 'boolean' ? (value ? t('common.yes') : t('common.no')) : String(value)

const ensureDefaultSelection = () => {
  const types = availableModelTypes.value
  if (types.length === 0) {
    selectedModelId.value = ''
    return
  }
  if (!types.some(option => option.value === selectedModelType.value)) selectedModelType.value = types[0].value
  const models = filteredModels.value
  if (!models.some(model => model.id === selectedModelId.value)) selectedModelId.value = models[0]?.id || ''
}
watch(() => props.visible, visible => { if (visible) ensureDefaultSelection() })
watch(availableModelTypes, () => { if (props.visible) ensureDefaultSelection() })
watch(() => selectedModel.value?.id, () => { if (!supportsThinking.value) thinking.value = false })
watch(() => selectedModel.value?.type, () => {
  file.value = null
  result.value = null
  history.value = []
  resultTab.value = 'response'
})

const resetResult = () => {
  result.value = null
  history.value = []
  resultTab.value = 'response'
}
const selectModelType = (type: DebugModelType) => {
  if (selectedModelType.value === type) return
  selectedModelType.value = type
  selectedModelId.value = filteredModels.value[0]?.id || ''
  input.value = ''
  documentsText.value = ''
  file.value = null
  resetResult()
}
const onNativeFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const selectedFile = target.files?.[0] || null
  if (selectedFile && fileSizeVerification(selectedFile)) {
    target.value = ''
    file.value = null
    resetResult()
    return
  }
  file.value = selectedFile
  resetResult()
}
const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
const historyLabel = (thinkingValue: boolean) => {
  if (supportsThinking.value) return thinkingValue ? t('modelSettings.debug.thinkOn') : t('modelSettings.debug.thinkOff')
  return t('modelSettings.debug.runLabel', { n: runSequence })
}

const runDebug = async () => {
  if (!selectedModel.value?.id || !canRun.value || running.value) return
  running.value = true
  try {
    const thinkingValue = supportsThinking.value ? thinking.value : false
    const nextResult = await debugModel(selectedModel.value.id, {
      input: input.value.trim(),
      documents: documents.value,
      file: file.value,
      options: isChat.value ? {
        system_prompt: systemPrompt.value.trim() || undefined,
        temperature: temperature.value,
        top_p: topP.value,
        max_tokens: maxTokens.value,
        thinking: thinkingValue,
      } : {},
    })
    result.value = nextResult
    history.value.unshift({ id: ++runSequence, label: historyLabel(thinkingValue), result: nextResult })
    history.value = history.value.slice(0, 6)
    resultTab.value = 'response'
  } catch (error: any) {
    MessagePlugin.error(error?.message || t('modelSettings.debug.requestFailed'))
  } finally {
    running.value = false
  }
}

const copyResult = async () => {
  if (!result.value) return
  await copyWithToast(JSON.stringify(result.value, null, 2), 'common.copied')
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize)
  cleanupResize()
  blurActiveElementBeforeClose()
})
</script>

<style scoped lang="less">
.visual-model-debug__overlay { position: fixed; inset: 0; z-index: 3200; display: flex; justify-content: flex-end; background: rgb(15 23 42 / 18%); backdrop-filter: blur(2px); }
.visual-model-debug { width: 560px; max-width: 100vw; height: 100%; min-width: 0; display: flex; flex-direction: column; border-left: 1px solid #e5e7eb; background: #fff; box-shadow: -18px 0 50px rgb(15 23 42 / 12%); color: #374151; }
.visual-model-debug__header { flex: 0 0 auto; padding: 18px 20px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.visual-model-debug__heading { min-width: 0; display: flex; gap: 10px; }
.visual-model-debug__heading-icon { flex: 0 0 32px; width: 32px; height: 32px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #6b7280; }
.visual-model-debug__heading h3 { margin: 0; color: #111827; font-size: 14px; line-height: 20px; font-weight: 700; }
.visual-model-debug__heading p { margin: 3px 0 0; color: #9ca3af; font-size: 11px; line-height: 16px; }
.visual-model-debug__close { width: 28px; height: 28px; padding: 6px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-model-debug__close:hover { background: #f3f4f6; color: #374151; }
.visual-model-debug__content { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 0 20px; }
.visual-model-debug__section { padding: 16px 0; border-bottom: 1px solid #f3f4f6; display: flex; flex-direction: column; gap: 12px; }
.visual-model-debug__section:last-child { border-bottom: 0; }
.visual-model-debug__section > h4 { margin: 0; color: #374151; font-size: 10px; line-height: 16px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.visual-model-debug__types { display: flex; flex-wrap: wrap; gap: 6px; }
.visual-model-debug__types button { min-height: 30px; padding: 5px 9px; border: 1px solid #e5e7eb; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; background: #fff; color: #6b7280; font: inherit; font-size: 10px; cursor: pointer; }
.visual-model-debug__types button:hover,.visual-model-debug__types button.is-active { background: #f3f4f6; color: #111827; border-color: #d1d5db; }
.visual-model-debug__types :deep(.t-icon) { font-size: 12px; }
.visual-model-debug__field { display: flex; flex-direction: column; gap: 6px; }
.visual-model-debug__field > label { color: #4b5563; font-size: 10px; line-height: 15px; font-weight: 600; }
.visual-model-debug__field > p { margin: 0; color: #9ca3af; font-size: 9px; line-height: 14px; }
.visual-model-debug__field :deep(.t-input),.visual-model-debug__field :deep(.t-textarea__inner),.visual-model-debug__field :deep(.t-input-number) { border-color: #e5e7eb; border-radius: 8px; box-shadow: none !important; font-size: 11px; }
.visual-model-debug__model-option { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.visual-model-debug__model-option span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-model-debug__model-option small { flex: 0 0 auto; color: #9ca3af; font-size: 9px; }
.visual-model-debug__native-file { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
.visual-model-debug__file-button { align-self: flex-start; min-height: 30px; padding: 5px 9px; border: 1px solid #e5e7eb; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; background: #fff; color: #6b7280; font: inherit; font-size: 10px; cursor: pointer; }
.visual-model-debug__file-button:hover { background: #f9fafb; color: #374151; }
.visual-model-debug__parameter-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.visual-model-debug__switch-field { min-height: 30px; display: flex; align-items: center; gap: 8px; color: #9ca3af; font-size: 9px; }
.visual-model-debug__history { display: flex; flex-wrap: wrap; gap: 5px; }
.visual-model-debug__history button { min-height: 28px; padding: 4px 8px; border: 1px solid #e5e7eb; border-radius: 7px; display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #9ca3af; font: inherit; font-size: 9px; cursor: pointer; }
.visual-model-debug__history button strong { color: #4b5563; font-weight: 600; }
.visual-model-debug__history button.is-active,.visual-model-debug__history button:hover { background: #f3f4f6; border-color: #d1d5db; }
.visual-model-debug__result { display: flex; flex-direction: column; gap: 9px; }
.visual-model-debug__banner { min-height: 34px; padding: 7px 9px; border-radius: 8px; display: flex; align-items: center; gap: 7px; background: #f9fafb; color: #6b7280; font-size: 10px; }
.visual-model-debug__banner.is-ok { background: #f0fdf4; color: #047857; }
.visual-model-debug__banner.is-error { background: #fef2f2; color: #dc2626; }
.visual-model-debug__banner strong { color: #374151; }
.visual-model-debug__banner span { margin-left: auto; color: #9ca3af; }
.visual-model-debug__metrics { display: flex; flex-wrap: wrap; gap: 5px; }
.visual-model-debug__metrics span { padding: 2px 6px; border-radius: 6px; background: #f3f4f6; color: #6b7280; font-size: 9px; line-height: 14px; }
.visual-model-debug__error { margin: 0; color: #dc2626; font-size: 10px; line-height: 16px; white-space: pre-wrap; }
.visual-model-debug__result-tabs { display: flex; gap: 4px; }
.visual-model-debug__result-tabs button { min-height: 28px; padding: 4px 8px; border: 0; border-radius: 7px; background: transparent; color: #9ca3af; font: inherit; font-size: 9px; cursor: pointer; }
.visual-model-debug__result-tabs button.is-active { background: #f3f4f6; color: #374151; }
.visual-model-debug__result pre { max-height: 420px; min-height: 140px; margin: 0; overflow: auto; padding: 10px 11px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f9fafb; color: #374151; font: 10px/1.6 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; white-space: pre-wrap; word-break: break-word; }
.visual-model-debug__footer { flex: 0 0 auto; min-height: 58px; padding: 11px 20px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #f9fafb; }
.visual-model-debug__footer-actions { margin-left: auto; display: flex; gap: 7px; }
.visual-model-debug__button { min-height: 32px; padding: 6px 10px; border: 1px solid #e5e7eb; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; background: #fff; color: #4b5563; font: inherit; font-size: 10px; font-weight: 600; cursor: pointer; }
.visual-model-debug__button.is-primary { border-color: #111827; background: #111827; color: #fff; }
.visual-model-debug__button:disabled { cursor: default; opacity: .5; }
.visual-model-debug__resize-handle { position: fixed; top: 0; bottom: 0; z-index: 3202; width: 12px; margin-right: -6px; display: flex; align-items: center; justify-content: center; cursor: col-resize; }
.visual-model-debug__resize-handle > span { width: 2px; height: 48px; border-radius: 1px; background: #d1d5db; opacity: .55; transition: opacity 150ms ease, background-color 150ms ease; }
.visual-model-debug__resize-handle:hover > span,.visual-model-debug__resize-handle.is-active > span { background: #6b7280; opacity: 1; }
.visual-model-debug__resize-shield { position: fixed; inset: 0; z-index: 3201; cursor: col-resize; }
.visual-model-debug.is-resizing .visual-model-debug__content { pointer-events: none; user-select: none; }
.visual-model-debug-enter-active,.visual-model-debug-leave-active { transition: opacity 160ms ease; }
.visual-model-debug-enter-from,.visual-model-debug-leave-to { opacity: 0; }
@media (max-width: 640px) { .visual-model-debug { width: 100% !important; min-width: 0; } .visual-model-debug__resize-handle { display: none; } .visual-model-debug__parameter-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) { .visual-model-debug-enter-active,.visual-model-debug-leave-active,.visual-model-debug__resize-handle > span { transition: none !important; } }
</style>
