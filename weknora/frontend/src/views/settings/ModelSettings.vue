<template>
  <section class="visual-model-settings" :class="{ 'is-lite': authStore.isLiteMode }">
    <header class="visual-settings-page-header visual-model-settings__header">
      <div class="visual-settings-page-header__copy">
        <h2 class="visual-settings-page-header__title">{{ $t(authStore.isLiteMode ? 'modelSettings.sceneModels.navTitle' : 'modelSettings.title') }}</h2>
        <p class="visual-settings-page-header__description">{{ $t(authStore.isLiteMode ? 'modelSettings.sceneModels.description' : 'modelSettings.description') }}</p>
      </div>
      <button
        v-if="!authStore.isLiteMode && authStore.hasRole('admin')"
        type="button"
        class="visual-model-settings__debug"
        @click="showDebugDrawer = true"
      >
        <play-circle-icon />
        <span>{{ $t('modelSettings.actions.debugModel') }}</span>
      </button>
    </header>

    <aside v-if="!authStore.isLiteMode" class="visual-model-settings__hint" role="note">
      <div>
        <strong>{{ $t('modelSettings.builtinModels.title') }}</strong>
        <p>
          {{ $t(authStore.isSystemAdmin
            ? 'modelSettings.builtinModels.descriptionAdmin'
            : 'modelSettings.builtinModels.description') }}
        </p>
      </div>
      <a
        href="https://github.com/estromeglovettgen-coder/musuw/blob/main/weknora/docs/BUILTIN_MODELS.md"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ $t('modelSettings.builtinModels.viewGuide') }}
        <t-icon name="link" />
      </a>
    </aside>

    <section
      v-if="authStore.isLiteMode"
      class="consumer-scene-settings"
      data-persisted-capability="consumer-scene-models"
    >
      <t-loading v-if="consumerSceneLoading" class="consumer-scene-settings__loading" size="small" />
      <div class="consumer-scene-settings__grid">
        <div v-for="scene in consumerScenes" :key="scene" class="consumer-scene-settings__row">
          <div class="consumer-scene-settings__copy">
            <strong>{{ $t(`modelSettings.sceneModels.scenes.${scene}.label`) }}</strong>
            <span>{{ $t(`modelSettings.sceneModels.scenes.${scene}.description`) }}</span>
          </div>
          <ModelSelector
            :scene-options="consumerSceneOptionsFor(scene)"
            :selected-model-id="consumerSceneCandidate(scene)"
            :show-add-model="false"
            :placeholder="$t('model.selectModelPlaceholder')"
            @update:selected-model-id="onConsumerSceneModelChange(scene, $event)"
          />
        </div>
      </div>
    </section>

    <template v-if="!authStore.isLiteMode">
      <div class="visual-model-tabs" data-guide="settings-models" role="tablist">
      <button
        v-for="tab in ([
          { value: 'all', label: $t('common.all'), count: allLegacyModels.length },
          { value: 'chat', label: $t('modelSettings.typeShort.chat'), count: countByType('chat') },
          { value: 'embedding', label: $t('modelSettings.typeShort.embedding'), count: countByType('embedding') },
          { value: 'rerank', label: $t('modelSettings.typeShort.rerank'), count: countByType('rerank') },
          { value: 'vllm', label: $t('modelSettings.typeShort.vllm'), count: countByType('vllm') },
          { value: 'asr', label: $t('modelSettings.typeShort.asr'), count: countByType('asr') },
        ] as const)"
        :key="tab.value"
        type="button"
        role="tab"
        class="visual-model-tabs__item"
        :class="{ 'is-active': activeTypeFilter === tab.value }"
        :aria-selected="activeTypeFilter === tab.value"
        @click="activeTypeFilter = tab.value"
      >
        <span>{{ tab.label }}</span>
        <small>{{ tab.count }}</small>
      </button>
      </div>

      <div class="visual-model-settings__content">
      <div v-if="loading" class="visual-model-settings__loading">
        <t-loading size="small" />
      </div>

      <div v-else-if="filteredModels.length === 0 && !authStore.hasRole('admin')" class="visual-model-empty">
        <t-empty :description="emptyHint" />
      </div>

      <div v-else class="visual-model-grid">
        <article
          v-for="model in filteredModels"
          :key="`${model._modelType}-${model.id}`"
          class="visual-model-card"
          :class="{
            'is-builtin': model.isBuiltin,
            'is-clickable': isModelCardClickable(model),
          }"
          :role="isModelCardClickable(model) ? 'button' : undefined"
          :tabindex="isModelCardClickable(model) ? 0 : undefined"
          @click="onModelCardClick($event, model._modelType, model)"
          @keydown.enter="onModelCardClick($event, model._modelType, model)"
        >
          <span class="visual-model-card__icon" :aria-label="typeLabel(model._modelType)">
            <t-icon :name="typeIcon(model._modelType)" />
          </span>

          <div class="visual-model-card__body">
            <div class="visual-model-card__top">
              <h3 :title="modelDisplayName(model)">{{ modelDisplayName(model) }}</h3>
              <span v-if="model.isDefault" class="visual-model-card__default">{{ $t('model.defaultTag') }}</span>
              <span
                v-if="model.isBuiltin"
                class="visual-model-card__lock"
                :title="$t('modelSettings.builtinTag')"
                :aria-label="$t('modelSettings.builtinTag')"
              >
                <t-icon :name="authStore.isSystemAdmin ? 'edit-1' : 'lock-on'" />
              </span>

              <div v-if="canManageModel(model)" class="visual-model-card__actions" @click.stop>
                <t-dropdown
                  :options="getModelOptions(model._modelType, model)"
                  placement="bottom-right"
                  attach="body"
                  trigger="click"
                  @click="(data: any) => handleMenuAction({ value: data.value }, model._modelType, model)"
                >
                  <button type="button" class="visual-model-card__action" :aria-label="$t('common.more')">
                    <t-icon name="ellipsis" />
                  </button>
                </t-dropdown>
                <t-popconfirm
                  v-if="canDeleteModel(model)"
                  :content="$t('modelSettings.confirmDelete', { name: modelDisplayName(model) })"
                  :confirm-btn="{ content: $t('common.delete'), theme: 'danger' }"
                  :cancel-btn="{ content: $t('common.cancel') }"
                  placement="bottom-right"
                  @confirm="deleteModel(model._modelType, model.id)"
                >
                  <button type="button" class="visual-model-card__action is-danger" :aria-label="$t('common.delete')" @click.stop>
                    <t-icon name="delete" />
                  </button>
                </t-popconfirm>
              </div>
            </div>

            <p class="visual-model-card__meta">
              <span>{{ vendorLabel(model) }}</span>
              <template v-if="model._modelType === 'embedding' && model.dimension">
                <span aria-hidden="true">·</span>
                <span>{{ $t('model.editor.dimensionLabel') }} {{ model.dimension }}</span>
              </template>
              <template v-if="model._modelType === 'chat' && model.supportsVision">
                <span aria-hidden="true">·</span>
                <t-icon name="image" :title="$t('model.editor.supportsVisionLabel')" />
              </template>
            </p>
          </div>
        </article>

        <button
          v-if="authStore.hasRole('admin')"
          type="button"
          class="visual-model-card visual-model-card--add"
          data-guide="settings-add-model"
          @click="openAddDialog"
        >
          <span class="visual-model-card--add__icon"><add-icon /></span>
          <span>{{ $t('modelSettings.actions.addModel') }}</span>
        </button>
      </div>
      </div>
    </template>

    <ModelEditorDialog
      v-model:visible="showDialog"
      :model-type="currentModelType"
      :model-data="editingModel"
      @confirm="handleModelSave"
    />
    <ModelDebugDrawer v-model:visible="showDebugDrawer" :models="allModels" />
  </section>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, PlayCircleIcon } from 'tdesign-icons-vue-next'
import { useI18n } from 'vue-i18n'
import ModelEditorDialog from '@/components/ModelEditorDialog.vue'
import ModelDebugDrawer from '@/components/ModelDebugDrawer.vue'
import ModelSelector from '@/components/ModelSelector.vue'
import { listModels, createModel, updateModel as updateModelAPI, deleteModel as deleteModelAPI, type ConsumerConfigurableScene, type ModelConfig } from '@/api/model'
import { getTenantRetrievalConfig, updateTenantRetrievalConfig, type RetrievalConfig } from '@/api/retrieval'
import { useAuthStore } from '@/stores/auth'
import { useChatResourcesStore } from '@/stores/chatResources'
import { useSettingsStore } from '@/stores/settings'
import { resolveConsumerSceneCandidate } from '@/utils/consumerSceneModels'
import { useUIStore } from '@/stores/ui'

const { t, te } = useI18n()
const authStore = useAuthStore()
const chatResources = useChatResourcesStore()
const settingsStore = useSettingsStore()
const uiStore = useUIStore()
const props = defineProps<{ initialType?: string | null }>()
type ModelType = 'chat' | 'embedding' | 'rerank' | 'vllm' | 'asr'
type FilterType = 'all' | ModelType

const showDialog = ref(false)
const showDebugDrawer = ref(false)
const currentModelType = ref<ModelType>('chat')
const editingModel = ref<any>(null)
const loading = ref(true)
const activeTypeFilter = ref<FilterType>('all')
// Only user-safe native seams belong on the consumer page. Standalone Chat is
// an internal compatibility path for the fixed platform agent; Embedding is
// bound to the KB vector index and must never become a browser preference.
const consumerScenes: readonly ConsumerConfigurableScene[] = ['rag', 'rerank', 'wiki', 'vision', 'asr']
const consumerSceneLoading = ref(false)
const defaultRetrievalConfig: RetrievalConfig = {
  embedding_top_k: 50,
  vector_threshold: 0.15,
  keyword_threshold: 0.3,
  rerank_top_k: 10,
  rerank_threshold: 0.2,
  rerank_model_id: '',
}
const retrievalConfig = ref<RetrievalConfig>({ ...defaultRetrievalConfig })

const consumerSceneOptionsFor = (scene: ConsumerConfigurableScene) =>
  chatResources.consumerSceneOptions[scene]?.options || []

const consumerSceneCandidate = (scene: ConsumerConfigurableScene): string => {
  const response = chatResources.consumerSceneOptions[scene]
  const storedCandidate = scene === 'rerank'
    ? retrievalConfig.value.rerank_model_id
    : settingsStore.getConsumerSceneModel(scene)
  return resolveConsumerSceneCandidate(
    response?.options || [],
    storedCandidate,
    response?.effective_model_id,
  )
}

const loadRetrievalConfig = async () => {
  try {
    const response: any = await getTenantRetrievalConfig()
    const data = response?.data ?? response
    if (data && typeof data === 'object') {
      retrievalConfig.value = {
        ...defaultRetrievalConfig,
        ...data,
        rerank_model_id: typeof data.rerank_model_id === 'string' ? data.rerank_model_id : '',
      }
    }
  } catch (error) {
    // Keep the deterministic server default when the existing retrieval seam
    // is temporarily unavailable; selecting another scene does not broaden
    // the safe scene-options catalog.
    console.warn('Failed to load tenant retrieval config', error)
  }
}

const loadConsumerSceneOptions = async () => {
  consumerSceneLoading.value = true
  try {
    await Promise.all(consumerScenes.map(scene => chatResources.ensureConsumerSceneOptions(scene)))
    for (const scene of consumerScenes) {
      const selected = consumerSceneCandidate(scene)
      if (scene !== 'rerank' && selected && selected !== settingsStore.getConsumerSceneModel(scene)) {
        settingsStore.updateConsumerSceneModel(scene, selected)
      }
    }
  } catch (error) {
    // The model catalog remains usable when the optional scene-options endpoint
    // is unavailable; the server still enforces the resolver on submit.
    console.warn('Failed to load consumer scene options', error)
  } finally {
    consumerSceneLoading.value = false
  }
}

const onConsumerSceneModelChange = async (scene: ConsumerConfigurableScene, value: string) => {
  const option = consumerSceneOptionsFor(scene).find(item => item.model_id === value)
  if (!option || option.locked || !option.selectable) return

  if (scene === 'rerank') {
    const nextConfig: RetrievalConfig = {
      ...retrievalConfig.value,
      rerank_model_id: value,
    }
    try {
      const response: any = await updateTenantRetrievalConfig(nextConfig)
      const data = response?.data ?? response
      retrievalConfig.value = {
        ...nextConfig,
        ...(data && typeof data === 'object' ? data : {}),
        rerank_model_id: typeof data?.rerank_model_id === 'string'
          ? data.rerank_model_id
          : value,
      }
    } catch (error: any) {
      MessagePlugin.error(error?.message || t('modelSettings.toasts.saveFailed'))
    }
    return
  }

  settingsStore.updateConsumerSceneModel(scene, value)
}

const normalizeInitialType = (value?: string | null): FilterType => {
  const key = (value || '').toLowerCase()
  if (key === 'knowledgeqa' || key === 'chat') return 'chat'
  if (key === 'embedding' || key === 'rerank' || key === 'vllm' || key === 'asr') return key
  return 'all'
}

watch(() => props.initialType, value => {
  activeTypeFilter.value = normalizeInitialType(value)
}, { immediate: true })

const MODEL_TAB_TYPES: FilterType[] = ['chat', 'embedding', 'rerank', 'vllm', 'asr']
watch(
  () => uiStore.settingsInitialSubSection,
  (sub) => {
    if (sub && MODEL_TAB_TYPES.includes(sub as FilterType)) {
      activeTypeFilter.value = sub as FilterType
    }
  },
  { immediate: true },
)

// 模型列表数据
const allModels = ref<ModelConfig[]>([])

// 后端 type → 前端分组 type 的映射
const backendTypeToModelType: Record<string, ModelType> = {
  KnowledgeQA: 'chat',
  Embedding: 'embedding',
  Rerank: 'rerank',
  VLLM: 'vllm',
  ASR: 'asr'
}

// 将后端模型格式转换为旧的前端格式（附带 _modelType 便于渲染）
// apiKey is always blank here: the server's main GET response does not
// include it (see internal/handler/dto/model.go — ModelParametersDTO omits
// secret fields). Credential read/write happens inside the editor dialog
// via the dedicated /credentials subresource.
function convertToLegacyFormat(model: ModelConfig) {
  return {
    id: model.id!,
    name: model.name,
    displayName: model.display_name || '',
    source: model.source,
    modelName: model.name,
    baseUrl: model.parameters.base_url || '',
    apiKey: '',
    provider: model.parameters.provider || '',
    dimension: model.parameters.embedding_parameters?.dimension,
    supportsDimensionOverride: model.parameters.embedding_parameters?.supports_dimension_override || false,
    isBuiltin: model.is_builtin || false,
    isDefault: model.is_default || false,
    supportsVision: model.parameters.supports_vision || false,
    maxConcurrency: model.parameters.max_concurrency,
    customHeaders: model.parameters.custom_headers
      ? Object.entries(model.parameters.custom_headers).map(([key, value]) => ({ key, value: String(value) }))
      : [],
    lkeapRegion: model.parameters.extra_config?.region || 'ap-guangzhou',
    // 原始存库值，编辑弹窗内再 resolve（避免打开时被推断值覆盖）
    thinkingControl: model.parameters.extra_config?.thinking_control,
    _modelType: backendTypeToModelType[model.type] || 'chat' as ModelType,
    // Preserve the credential metadata map so the editor dialog can render
    // the "Configured" state without an extra round-trip.
    credentials: model.credentials,
  }
}

// 平铺 + 过滤
const allLegacyModels = computed(() => allModels.value.map(convertToLegacyFormat))
const filteredModels = computed(() => {
  if (activeTypeFilter.value === 'all') return allLegacyModels.value
  return allLegacyModels.value.filter(m => m._modelType === activeTypeFilter.value)
})

const countByType = (type: ModelType) => allLegacyModels.value.filter(m => m._modelType === type).length

// 类型徽章图标。沿用 TDesign 自带 icon name，避免再引第三方图标包。
const typeIcon = (type: ModelType): string => {
  const map: Record<ModelType, string> = {
    chat: 'chat',
    embedding: 'chart-bubble',
    rerank: 'filter-sort',
    vllm: 'image',
    asr: 'sound',
  }
  return map[type]
}

const typeLabel = (type: ModelType) => {
  const map: Record<ModelType, string> = {
    chat: t('modelSettings.typeShort.chat'),
    embedding: t('modelSettings.typeShort.embedding'),
    rerank: t('modelSettings.typeShort.rerank'),
    vllm: t('modelSettings.typeShort.vllm'),
    asr: t('modelSettings.typeShort.asr')
  }
  return map[type]
}

const sourceLabel = (type: ModelType) => {
  // vllm / asr 的 remote 文案特殊，其余走通用 remote 文案
  if (type === 'vllm' || type === 'asr') {
    return t('modelSettings.source.openaiCompatible')
  }
  return t('modelSettings.source.remote')
}

// Maps a backend `provider` id (e.g. "openai", "aliyun", "weknoracloud")
// to its localized short label. Reuses the same i18n keys the editor's
// provider dropdown uses, so the model card and the editor stay in sync
// when a provider is renamed. Falls back to '' when the backend didn't
// store a provider — caller falls back to sourceLabel().
const providerLabel = (model: any): string => {
  const id = model.provider
  if (!id) return ''
  const key = `model.editor.providers.${id}.label`
  return te(key) ? t(key) : id
}

// What the vendor chip on a card shows. Keeps the chip text uniformly
// short so cards line up:
//   local  → "Ollama"
//   remote → provider's localized short name (e.g. "腾讯云 LKEAP",
//            "阿里云 DashScope"). For the catch-all "generic" provider
//            we render a single short word ("自定义" / "Custom") — the
//            editor dropdown's longer "自定义 (OpenAI兼容接口)" label
//            blows out the card chip row, and the "OpenAI 兼容" framing
//            isn't meaningful to most end users (they didn't pick "I
//            want OpenAI compatibility", they just pasted a base URL).
const vendorLabel = (model: any): string => {
  if (model.source === 'local') return 'Ollama'
  if (model.provider === 'generic') {
    return t('modelSettings.source.custom')
  }
  return providerLabel(model) || sourceLabel(model._modelType)
}

const modelDisplayName = (model: any) => {
  const displayName = typeof model.displayName === 'string' ? model.displayName.trim() : ''
  return displayName || model.name
}

const emptyHint = computed(() => {
  if (activeTypeFilter.value === 'all') return t('modelSettings.chat.empty')
  const map: Record<ModelType, string> = {
    chat: t('modelSettings.chat.empty'),
    embedding: t('modelSettings.embedding.empty'),
    rerank: t('modelSettings.rerank.empty'),
    vllm: t('modelSettings.vllm.empty'),
    asr: t('modelSettings.asr.empty')
  }
  return map[activeTypeFilter.value as ModelType]
})

// 加载模型列表
const loadModels = async () => {
  if (authStore.isLiteMode) {
    // Lite users only receive the narrow, permission-aware scene-options
    // responses above; never fetch the legacy tenant model catalog here.
    allModels.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const models = await listModels()
    allModels.value = models
  } catch (error: any) {
    console.error('加载模型列表失败:', error)
    MessagePlugin.error(error.message)
  } finally {
    loading.value = false
  }
}

// 打开添加对话框；类型在抽屉内选择，此处仅按当前 Tab 预填默认值
const openAddDialog = () => {
  currentModelType.value = activeTypeFilter.value === 'all' ? 'chat' : activeTypeFilter.value
  editingModel.value = null
  showDialog.value = true
}

// Tenant Admin+ manages tenant models; only SystemAdmin manages shared
// built-in models. The backend repeats this distinction authoritatively.
const canEditModel = (model: any) =>
  model.isBuiltin ? authStore.isSystemAdmin : authStore.hasRole('admin')

const isModelCardClickable = (model: any) => canEditModel(model)

const canManageModel = (model: any) => canEditModel(model)

// Built-in lifecycle remains deployment-managed (YAML / SQL). The UI only
// exposes configuration and credential editing to SystemAdmin.
const canDeleteModel = (model: any) =>
  authStore.hasRole('admin') && !model.isBuiltin

const onModelCardClick = (event: Event, type: ModelType, model: any) => {
  if (!isModelCardClickable(model)) return
  if (event.type === 'keydown') {
    const ke = event as KeyboardEvent
    if (ke.key !== 'Enter' && ke.key !== ' ') return
    ke.preventDefault()
  }
  const target = event.target as HTMLElement | null
  if (target?.closest('.visual-model-card__actions')) return
  editModel(type, model)
}

// 编辑模型
const editModel = (type: ModelType, model: any) => {
  if (model.isBuiltin && !authStore.isSystemAdmin) {
    MessagePlugin.warning(t('modelSettings.toasts.builtinCannotEdit'))
    return
  }
  if (!model.isBuiltin && !authStore.hasRole('admin')) {
    return
  }
  currentModelType.value = type
  editingModel.value = { ...model }
  showDialog.value = true
}

// 保存模型
const handleModelSave = async (modelData: any) => {
  const saveType: ModelType = modelData.modelType ?? currentModelType.value
  currentModelType.value = saveType

  try {
    if (!modelData.modelName || !modelData.modelName.trim()) {
      MessagePlugin.warning(t('modelSettings.toasts.nameRequired'))
      return
    }

    if (modelData.modelName.trim().length > 100) {
      MessagePlugin.warning(t('modelSettings.toasts.nameTooLong'))
      return
    }

    if (modelData.displayName && modelData.displayName.trim().length > 100) {
      MessagePlugin.warning(t('modelSettings.toasts.displayNameTooLong'))
      return
    }

    if (modelData.source === 'remote') {
      if (!modelData.baseUrl || !modelData.baseUrl.trim()) {
        MessagePlugin.warning(t('modelSettings.toasts.baseUrlRequired'))
        return
      }

      try {
        new URL(modelData.baseUrl.trim())
      } catch {
        MessagePlugin.warning(t('modelSettings.toasts.baseUrlInvalid'))
        return
      }
    }

    if (saveType === 'embedding') {
      if (!modelData.dimension || modelData.dimension < 128 || modelData.dimension > 4096) {
        MessagePlugin.warning(t('modelSettings.toasts.dimensionInvalid'))
        return
      }
    }

    const customHeadersMap: Record<string, string> = {}
    if (Array.isArray(modelData.customHeaders)) {
      for (const item of modelData.customHeaders) {
        const key = (item?.key ?? '').trim()
        const value = (item?.value ?? '').trim()
        if (key && value) {
          customHeadersMap[key] = value
        }
      }
    }

    // api_key flows in only on initial create (modelData.apiKey is wiped on
    // every edit-mode open). Edits to existing models commit credentials via
    // the /credentials subresource (handled inside ModelEditorDialog).
    const trimmedApiKey = (modelData.apiKey ?? '').trim()
    const apiKeyFields: { api_key?: string } =
      !editingModel.value && trimmedApiKey ? { api_key: trimmedApiKey } : {}
    const trimmedAppSecret = (modelData.appSecret ?? '').trim()
    const appSecretFields: { app_secret?: string } =
      !editingModel.value && trimmedAppSecret ? { app_secret: trimmedAppSecret } : {}
    const extraConfig: Record<string, string> = {}
    if (modelData.provider === 'lkeap' && saveType === 'rerank') {
      extraConfig.region = (modelData.lkeapRegion || 'ap-guangzhou').trim()
    }
    if (
      saveType === 'chat'
      && modelData.source === 'remote'
      && modelData.thinkingControl
    ) {
      extraConfig.thinking_control = modelData.thinkingControl
    }
    const extraConfigFields = Object.keys(extraConfig).length > 0
      ? { extra_config: extraConfig }
      : {}

    const apiModelData: ModelConfig = {
      name: modelData.modelName.trim(),
      display_name: modelData.displayName?.trim() || '',
      type: getModelType(saveType),
      source: modelData.source,
      description: '',
      is_default: modelData.isDefault ?? false,
      parameters: {
        base_url: modelData.baseUrl?.trim() || '',
        ...apiKeyFields,
        ...appSecretFields,
        provider: modelData.provider || '',
        ...extraConfigFields,
        ...(Object.keys(customHeadersMap).length > 0 ? { custom_headers: customHeadersMap } : {}),
        ...(saveType === 'embedding' && modelData.dimension ? {
          embedding_parameters: {
            dimension: modelData.dimension,
            truncate_prompt_tokens: 0,
            supports_dimension_override: modelData.supportsDimensionOverride ?? false
          }
        } : {}),
        ...(saveType === 'vllm' ? {
          supports_vision: true
        } : saveType === 'chat' ? {
          supports_vision: modelData.supportsVision ?? false
        } : {}),
        // 后台并发上限：仅 chat/embedding/vllm 受治理，>0 才写入（0/空沿用全局默认）。
        ...(['chat', 'embedding', 'vllm'].includes(saveType)
          && Number(modelData.maxConcurrency) > 0
          ? { max_concurrency: Number(modelData.maxConcurrency) }
          : {})
      }
    }

    if (editingModel.value && editingModel.value.id) {
      await updateModelAPI(editingModel.value.id, apiModelData)
      MessagePlugin.success(t('modelSettings.toasts.updated'))
    } else {
      await createModel(apiModelData)
      MessagePlugin.success(t('modelSettings.toasts.added'))
    }

    showDialog.value = false
    await loadModels()
  } catch (error: any) {
    console.error('保存模型失败:', error)
    MessagePlugin.error(error.message || t('modelSettings.toasts.saveFailed'))
  }
}

// 删除模型
const deleteModel = async (_type: ModelType, modelId: string) => {
  const model = allModels.value.find(m => m.id === modelId)
  if (model?.is_builtin) {
    MessagePlugin.warning(t('modelSettings.toasts.builtinCannotDelete'))
    return
  }

  try {
    await deleteModelAPI(modelId)
    MessagePlugin.success(t('modelSettings.toasts.deleted'))
    await loadModels()
  } catch (error: any) {
    console.error('删除模型失败:', error)
    MessagePlugin.error(error.message || t('modelSettings.toasts.deleteFailed'))
  }
}

// 获取模型操作菜单选项
const getModelOptions = (type: ModelType, model: any) => {
  const options: any[] = []

  if (model.isBuiltin) {
    if (authStore.isSystemAdmin) {
      options.push({
        content: t('common.edit'),
        value: `edit-${type}-${model.id}`
      })
    }
    return options
  }

  // Models are tenant-wide infrastructure (LLM credentials); the
  // backend gates every mutation behind Admin+ (see RegisterModelRoutes).
  // Non-Admins get an empty action menu — viewing is fine, but editing,
  // copying (also goes through createModel), and deleting are not.
  if (!authStore.hasRole('admin')) {
    return options
  }

  options.push({
    content: t('common.edit'),
    value: `edit-${type}-${model.id}`
  })

  options.push({
    content: t('common.copy'),
    value: `copy-${type}-${model.id}`
  })

  return options
}

// 处理菜单操作
const handleMenuAction = (data: { value: string }, type: ModelType, model: any) => {
  const value = data.value

  if (value.indexOf('edit-') === 0) {
    editModel(type, model)
  } else if (value.indexOf('copy-') === 0) {
    copyModel(type, model.id)
  }
}

// 生成不重复的复制名称
const generateCopyName = (originalName: string): string => {
  const suffix = t('modelSettings.copySuffix')
  const existingNames = new Set(allModels.value.map(m => m.name))
  let candidate = `${originalName}${suffix}`
  let counter = 2
  while (existingNames.has(candidate)) {
    candidate = `${originalName}${suffix} ${counter}`
    counter += 1
  }
  return candidate
}

// 复制模型
const copyModel = async (_type: ModelType, modelId: string) => {
  const source = allModels.value.find(m => m.id === modelId)
  if (!source) {
    return
  }
  if (source.is_builtin) {
    MessagePlugin.warning(t('modelSettings.toasts.builtinCannotCopy'))
    return
  }

  try {
    const newModel: ModelConfig = {
      name: generateCopyName(source.name),
      display_name: source.display_name || '',
      type: source.type,
      source: source.source,
      description: source.description || '',
      is_default: false,
      parameters: JSON.parse(JSON.stringify(source.parameters || {}))
    }

    await createModel(newModel)
    MessagePlugin.success(t('modelSettings.toasts.copied'))
    await loadModels()
  } catch (error: any) {
    console.error('复制模型失败:', error)
    MessagePlugin.error(error.message || t('modelSettings.toasts.copyFailed'))
  }
}

// 获取后端模型类型
function getModelType(type: ModelType): 'KnowledgeQA' | 'Embedding' | 'Rerank' | 'VLLM' | 'ASR' {
  const typeMap = {
    chat: 'KnowledgeQA' as const,
    embedding: 'Embedding' as const,
    rerank: 'Rerank' as const,
    vllm: 'VLLM' as const,
    asr: 'ASR' as const
  }
  return typeMap[type]
}

onMounted(() => {
  void Promise.all([loadModels(), loadConsumerSceneOptions(), loadRetrievalConfig()])
})
</script>

<style scoped lang="less">
.visual-model-settings {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  color: #1f2937;
}

.visual-model-settings__header {
  margin: 0 0 8px;
  padding: 0 0 12px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.visual-settings-page-header__copy {
  min-width: 0;
  flex: 1 1 auto;
}

.visual-settings-page-header__title {
  margin: 0;
  color: #111827;
  font-size: 16px;
  line-height: 24px;
  font-weight: 700;
}

.visual-settings-page-header__description {
  margin: 2px 0 0;
  color: #9ca3af;
  font-size: 12px;
  line-height: 16px;
}

.visual-model-settings__heading > div {
  min-width: 0;
}

.visual-model-settings__debug {
  flex: 0 0 auto;
  min-height: 30px;
  padding: 5px 8px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: #6b7280;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
  cursor: pointer;
}

.visual-model-settings__debug:hover {
  background: #f3f4f6;
  color: #111827;
}

.visual-model-settings__debug :deep(svg) {
  width: 15px;
  height: 15px;
}

.visual-model-settings__hint {
  margin-top: 12px;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  background: rgb(249 250 251 / 70%);
}

.visual-model-settings__hint > div {
  min-width: 0;
}

.visual-model-settings__hint strong {
  display: block;
  margin-bottom: 2px;
  color: #9ca3af;
  font-size: 10px;
  line-height: 14px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.visual-model-settings__hint p {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
}

.visual-model-settings__hint a {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #4b5563;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
  text-decoration: none;
}

.visual-model-settings__hint a:hover {
  color: #111827;
}

.consumer-scene-settings {
  margin-bottom: 18px;
  padding: 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: rgb(249 250 251 / 55%);
}

.visual-model-settings.is-lite .consumer-scene-settings {
  margin-bottom: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.consumer-scene-settings__loading {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.consumer-scene-settings__grid {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.consumer-scene-settings__row {
  min-width: 0;
  min-height: 64px;
  padding: 14px 0;
  border: 0;
  border-bottom: 1px solid #f0f0f0;
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: transparent;
}
.consumer-scene-settings__row:last-child { border-bottom: 0; }

.consumer-scene-settings__copy {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  margin-bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.consumer-scene-settings__copy strong {
  color: #374151;
  font-size: 11px;
  line-height: 16px;
}

.visual-model-settings.is-lite .consumer-scene-settings__copy strong {
  color: #111827;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}

.visual-model-settings.is-lite .consumer-scene-settings__copy span {
  color: #777;
  font-size: 12px;
  line-height: 18px;
}

.consumer-scene-settings__copy span {
  color: #9ca3af;
  font-size: 10px;
  line-height: 14px;
}

.visual-model-tabs {
  width: 100%;
  min-width: 0;
  overflow-x: auto;
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #f3f4f6;
  scrollbar-width: none;
}

.visual-model-tabs::-webkit-scrollbar { display: none; }

.visual-model-tabs__item {
  position: relative;
  flex: 0 0 auto;
  min-height: 36px;
  padding: 8px 10px;
  border: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: 11px;
  line-height: 18px;
  font-weight: 600;
  cursor: pointer;
}

.visual-model-tabs__item small {
  color: inherit;
  font-size: 10px;
  font-weight: 500;
}

.visual-model-tabs__item:hover {
  color: #4b5563;
}

.visual-model-tabs__item.is-active {
  color: #111827;
}

.visual-model-tabs__item.is-active::after {
  content: '';
  position: absolute;
  right: 8px;
  bottom: -1px;
  left: 8px;
  height: 1px;
  background: #111827;
}

.visual-model-settings__content {
  min-height: 120px;
  padding-top: 16px;
}

.visual-model-settings__loading,
.visual-model-empty {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.visual-model-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.visual-model-card {
  position: relative;
  min-width: 0;
  min-height: 72px;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fff;
  color: #1f2937;
  box-shadow: 0 1px 2px rgb(0 0 0 / 3%);
  transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
}

.visual-model-card:hover {
  border-color: #d1d5db;
  background: rgb(249 250 251 / 55%);
  box-shadow: 0 2px 5px rgb(0 0 0 / 4%);
}

.visual-model-card.is-builtin {
  background: rgb(249 250 251 / 60%);
}

.visual-model-card.is-clickable {
  cursor: pointer;
}

.visual-model-card.is-clickable:focus-visible {
  outline: 2px solid #9ca3af;
  outline-offset: 2px;
}

.visual-model-card__icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #4b5563;
}

.visual-model-card__icon :deep(.t-icon) {
  font-size: 16px;
}

.visual-model-card__body {
  min-width: 0;
  flex: 1 1 auto;
}

.visual-model-card__top {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.visual-model-card__top h3 {
  min-width: 0;
  flex: 1 1 auto;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #111827;
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
}

.visual-model-card__default {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 5px;
  background: #ecfdf5;
  color: #047857;
  font-size: 9px;
  line-height: 14px;
  font-weight: 600;
}

.visual-model-card__lock {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.visual-model-card__lock :deep(.t-icon) { font-size: 12px; }

.visual-model-card__meta {
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #9ca3af;
  font-size: 10px;
  line-height: 15px;
}

.visual-model-card__meta :deep(.t-icon) { font-size: 11px; }

.visual-model-card__actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 2px;
}

.visual-model-card__action {
  width: 26px;
  height: 26px;
  padding: 5px;
  border: 0;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #9ca3af;
  opacity: 0;
  cursor: pointer;
}

.visual-model-card:hover .visual-model-card__action,
.visual-model-card:focus-within .visual-model-card__action {
  opacity: 1;
}

.visual-model-card__action:hover {
  background: #f3f4f6;
  color: #374151;
}

.visual-model-card__action.is-danger:hover {
  background: #fef2f2;
  color: #b91c1c;
}

.visual-model-card--add {
  width: 100%;
  min-height: 72px;
  border-style: dashed;
  border-color: #d1d5db;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 4px;
  background: transparent;
  color: #9ca3af;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}

.visual-model-card--add:hover {
  border-color: #9ca3af;
  background: #f9fafb;
  color: #374151;
}

.visual-model-card--add__icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  color: #4b5563;
}

.visual-model-card--add__icon :deep(svg) {
  width: 14px;
  height: 14px;
}

@media (max-width: 760px) {
  .visual-model-grid { grid-template-columns: 1fr; }
  .consumer-scene-settings__row { align-items: flex-start; flex-direction: column; gap: 10px; }
  .visual-model-settings__hint { flex-direction: column; }
}

@media (max-width: 520px) {
  .visual-model-settings__header { flex-direction: column; gap: 10px; }
  .visual-model-settings__debug { align-self: flex-start; }
}
</style>
