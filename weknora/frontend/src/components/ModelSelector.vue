<template>
  <div class="visual-model-selector" :class="{ 'visual-model-selector--chat': mode === 'chat', 'visual-model-selector--consumer-scene': isConsumerSceneSelector, 'is-open': isConsumerSceneSelector && consumerSelectOpen }">
    <template v-if="mode === 'chat'">
      <section
        ref="chatPanelRef"
        class="visual-model-selector__chat-panel"
        :aria-label="chatPanelLabel"
        @keydown="handlePanelKeydown"
      >
        <template v-if="view === 'overview'">
          <button
            ref="overviewFirstRef"
            type="button"
            class="visual-model-selector__chat-row is-agent"
            aria-haspopup="listbox"
            @mouseenter="hoverOpen('agents')"
            @click="toggleHover('agents')"
            @keydown.enter.stop.prevent="toggleHover('agents')"
            @keydown.space.stop.prevent="toggleHover('agents')"
          >
            <span class="visual-model-selector__chat-row-label">{{ agentLabel }}</span>
            <div class="visual-model-selector__chat-row-trailing">
              <span class="visual-model-selector__chat-row-value" :title="selectedAgentDisplayName">{{ selectedAgentDisplayName }}</span>
              <t-icon name="chevron-right" aria-hidden="true" />
            </div>
          </button>
          <button
            type="button"
            class="visual-model-selector__chat-row"
            aria-haspopup="listbox"
            @mouseenter="hoverOpen('models')"
            @click="toggleHover('models')"
            @keydown.enter.stop.prevent="toggleHover('models')"
            @keydown.space.stop.prevent="toggleHover('models')"
          >
            <span class="visual-model-selector__chat-row-label">{{ modelLabel }}</span>
            <div class="visual-model-selector__chat-row-trailing">
              <span class="visual-model-selector__chat-row-value is-model" :title="selectedModelDisplayName">{{ selectedModelDisplayName }}</span>
              <t-icon name="chevron-right" aria-hidden="true" />
            </div>
          </button>
          <button
            type="button"
            class="visual-model-selector__chat-row"
            :class="{ 'is-disabled': !reasoningOptions.length }"
            :aria-disabled="!reasoningOptions.length"
            aria-haspopup="listbox"
            @mouseenter="reasoningOptions.length && hoverOpen('reasoning')"
            @click="reasoningOptions.length && toggleHover('reasoning')"
            @keydown.enter.stop.prevent="reasoningOptions.length && toggleHover('reasoning')"
            @keydown.space.stop.prevent="reasoningOptions.length && toggleHover('reasoning')"
          >
            <span class="visual-model-selector__chat-row-label">{{ reasoningLabel }}</span>
            <div class="visual-model-selector__chat-row-trailing">
              <span class="visual-model-selector__chat-row-value" :title="selectedReasoningLabel">{{ selectedReasoningLabel }}</span>
              <t-icon name="chevron-right" aria-hidden="true" />
            </div>
          </button>
        </template>

        <template v-else>
          <header class="visual-model-selector__chat-header">
            <button type="button" class="visual-model-selector__chat-back" :aria-label="backLabel" @click="openView('overview')">
              <t-icon name="chevron-left" aria-hidden="true" />
            </button>
            <span class="visual-model-selector__chat-title">{{ view === 'models' ? modelLabel : reasoningLabel }}</span>
            <span class="visual-model-selector__chat-header-spacer" aria-hidden="true" />
          </header>

          <div
            v-if="view === 'models'"
            :id="modelListId"
            ref="modelListRef"
            class="visual-model-selector__chat-list"
            role="listbox"
            tabindex="0"
            :aria-label="modelLabel"
            :aria-activedescendant="activeModelId"
            @keydown="handleModelKeydown"
          >
            <button
              v-for="model in chatModels"
              :id="modelOptionId(model.id || '')"
              :key="model.id"
              type="button"
              role="option"
              tabindex="-1"
              class="visual-model-selector__chat-option"
              :class="{
                'is-selected': model.id === selectedModelId,
                'is-active': modelIndex(model.id) === activeModelIndex,
                'is-locked': model.locked || model.selectable === false,
              }"
              :aria-selected="model.id === selectedModelId"
              :aria-disabled="model.locked || model.selectable === false"
              @mouseenter="activeModelIndex = modelIndex(model.id)"
              @click="selectChatModel(model.id || '')"
            >
              <span class="visual-model-selector__chat-option-copy">
                <strong :title="modelDisplayName(model)">{{ modelDisplayName(model) }}</strong>
              </span>
              <span v-if="model.locked || model.selectable === false" class="visual-model-selector__chat-lock" :aria-label="$t('model.lockedTag')"><t-icon name="lock-on" /></span>
              <span v-if="model.id === selectedModelId && !model.locked && model.selectable !== false" class="visual-model-selector__chat-check" aria-hidden="true"><t-icon name="check" /></span>
            </button>
            <div v-if="!chatModels.length" class="visual-model-selector__chat-empty">{{ noModelsLabel }}</div>
          </div>

          <div
            v-else
            ref="reasoningListRef"
            class="visual-model-selector__chat-list"
            role="listbox"
            tabindex="0"
            :aria-label="reasoningLabel"
            :aria-activedescendant="activeReasoningId"
            @keydown="handleReasoningKeydown"
          >
            <button
              v-for="(option, index) in reasoningOptions"
              :id="reasoningOptionId(option.value)"
              :key="option.value"
              type="button"
              role="option"
              tabindex="-1"
              class="visual-model-selector__chat-option is-reasoning"
              :class="{ 'is-selected': option.value === reasoningEffort, 'is-active': index === activeReasoningIndex }"
              :aria-selected="option.value === reasoningEffort"
              @mouseenter="activeReasoningIndex = index"
              @click="selectChatReasoning(option.value)"
            >
              <span class="visual-model-selector__chat-option-copy">
                <strong>{{ option.label }}</strong>
              </span>
              <span v-if="option.value === reasoningEffort" class="visual-model-selector__chat-check" aria-hidden="true"><t-icon name="check" /></span>
            </button>
            <div v-if="!reasoningOptions.length" class="visual-model-selector__chat-empty">{{ noReasoningLabel }}</div>
          </div>
        </template>

        <Transition name="visual-model-selector__chat-flyout">
          <div
            v-if="view === 'overview' && hoveredSubmenu"
            :key="hoveredSubmenu"
            class="visual-model-selector__chat-flyout"
            :class="[`is-${submenuPlacement}`, `is-${hoveredSubmenu}`]"
          >
          <div
            v-if="hoveredSubmenu === 'agents'"
            :id="agentListId"
            ref="flyoutAgentListRef"
            class="visual-model-selector__chat-list"
            role="listbox"
            tabindex="0"
            :aria-label="agentLabel"
            :aria-activedescendant="activeAgentId"
            @keydown="handleAgentKeydown"
          >
            <button
              v-for="(option, index) in chatAgentOptions"
              :id="agentOptionId(option.key)"
              :key="option.key"
              type="button"
              role="option"
              tabindex="-1"
              class="visual-model-selector__chat-option"
              :class="{
                'is-selected': isAgentOptionSelected(option),
                'is-active': index === activeAgentIndex,
              }"
              :aria-selected="isAgentOptionSelected(option)"
              @mouseenter="activeAgentIndex = index"
              @click="selectChatAgent(option)"
            >
              <span class="visual-model-selector__chat-option-copy">
                <strong :title="option.agent.name">{{ option.agent.name }}</strong>
              </span>
              <span v-if="isAgentOptionSelected(option)" class="visual-model-selector__chat-check" aria-hidden="true"><t-icon name="check" /></span>
            </button>
            <div v-if="!chatAgentOptions.length" class="visual-model-selector__chat-empty">{{ noAgentsLabel }}</div>
          </div>

          <div
            v-else-if="hoveredSubmenu === 'models'"
            :id="modelListId"
            ref="flyoutModelListRef"
            class="visual-model-selector__chat-list"
            role="listbox"
            tabindex="0"
            :aria-label="modelLabel"
            :aria-activedescendant="activeModelId"
            @keydown="handleModelKeydown"
          >
            <div class="visual-model-selector__chat-flyout-heading">{{ modelLabel }}</div>
            <button
              v-for="model in chatModels"
              :id="modelOptionId(model.id || '')"
              :key="model.id"
              type="button"
              role="option"
              tabindex="-1"
              class="visual-model-selector__chat-option"
              :class="{
                'is-selected': model.id === selectedModelId,
                'is-active': modelIndex(model.id) === activeModelIndex,
                'is-locked': model.locked || model.selectable === false,
              }"
              :aria-selected="model.id === selectedModelId"
              :aria-disabled="model.locked || model.selectable === false"
              @mouseenter="activeModelIndex = modelIndex(model.id)"
              @click="selectChatModel(model.id || '')"
            >
              <span class="visual-model-selector__chat-option-copy">
                <strong :title="modelDisplayName(model)">{{ modelDisplayName(model) }}</strong>
              </span>
              <span v-if="model.locked || model.selectable === false" class="visual-model-selector__chat-lock" :aria-label="$t('model.lockedTag')"><t-icon name="lock-on" /></span>
              <span v-if="model.id === selectedModelId && !model.locked && model.selectable !== false" class="visual-model-selector__chat-check" aria-hidden="true"><t-icon name="check" /></span>
            </button>
            <div v-if="!chatModels.length" class="visual-model-selector__chat-empty">{{ noModelsLabel }}</div>
          </div>

          <div
            v-else
            ref="flyoutReasoningListRef"
            class="visual-model-selector__chat-list"
            role="listbox"
            tabindex="0"
            :aria-label="reasoningLabel"
            :aria-activedescendant="activeReasoningId"
            @keydown="handleReasoningKeydown"
          >
            <div class="visual-model-selector__chat-flyout-heading">{{ reasoningLabel }}</div>
            <button
              v-for="(option, index) in reasoningOptions"
              :id="reasoningOptionId(option.value)"
              :key="option.value"
              type="button"
              role="option"
              tabindex="-1"
              class="visual-model-selector__chat-option is-reasoning"
              :class="{ 'is-selected': option.value === reasoningEffort, 'is-active': index === activeReasoningIndex }"
              :aria-selected="option.value === reasoningEffort"
              @mouseenter="activeReasoningIndex = index"
              @click="selectChatReasoning(option.value)"
            >
              <span class="visual-model-selector__chat-option-copy">
                <strong>{{ option.label }}</strong>
              </span>
              <span v-if="option.value === reasoningEffort" class="visual-model-selector__chat-check" aria-hidden="true"><t-icon name="check" /></span>
            </button>
            <div v-if="!reasoningOptions.length" class="visual-model-selector__chat-empty">{{ noReasoningLabel }}</div>
          </div>
          </div>
        </Transition>
      </section>
    </template>

    <div v-else-if="isConsumerSceneSelector" ref="consumerSelectRef" class="visual-model-selector__consumer">
      <button
        type="button"
        class="visual-model-selector__consumer-control"
        :aria-expanded="consumerSelectOpen"
        aria-haspopup="listbox"
        :aria-label="placeholderText"
        :aria-busy="loading || status === 'error'"
        :disabled="disabled"
        @click="toggleConsumerSelect"
        @keydown.esc.prevent="closeConsumerSelect"
      >
        <span class="visual-model-selector__consumer-value" :title="consumerSelectedLabel">{{ consumerSelectedLabel }}</span>
        <t-icon name="chevron-down" aria-hidden="true" />
      </button>

      <Transition name="visual-model-selector__consumer-fade">
        <div
          v-if="consumerSelectOpen"
          ref="consumerDropdownRef"
          class="visual-model-selector__consumer-dropdown"
          :class="{ 'is-above': consumerSelectPlacement === 'above' }"
          role="listbox"
          :aria-label="placeholderText"
        >
          <div v-if="loading" class="visual-model-selector__consumer-state">{{ $t('common.loading') }}</div>
          <div v-else-if="status === 'error'" class="visual-model-selector__consumer-state">{{ $t('model.loadFailed') }}</div>
          <template v-else-if="selectorModels.length">
            <button
              v-for="model in selectorModels"
              :key="model.id"
              type="button"
              role="option"
              class="visual-model-selector__consumer-option"
              :class="{
                'is-selected': model.id === selectedModelId && !sceneOptionFor(model.id)?.locked && sceneOptionFor(model.id)?.selectable !== false,
                'is-locked': sceneOptionFor(model.id)?.locked || sceneOptionFor(model.id)?.selectable === false,
              }"
              :aria-selected="model.id === selectedModelId"
              :aria-disabled="sceneOptionFor(model.id)?.locked || sceneOptionFor(model.id)?.selectable === false"
              @click="selectConsumerModel(model.id || '')"
            >
              <span class="visual-model-selector__consumer-option-copy">
                <strong :title="modelDisplayName(model)">{{ modelDisplayName(model) }}</strong>
              </span>
              <span v-if="model.id === selectedModelId && !sceneOptionFor(model.id)?.locked && sceneOptionFor(model.id)?.selectable !== false" class="visual-model-selector__consumer-check" aria-hidden="true"><t-icon name="check" /></span>
              <span v-if="sceneOptionFor(model.id)?.locked || sceneOptionFor(model.id)?.selectable === false" class="visual-model-selector__consumer-lock" :aria-label="$t('model.lockedTag')"><t-icon name="lock-on" aria-hidden="true" /></span>
            </button>
            <button
              v-if="clearable && selectedModelId"
              type="button"
              role="option"
              class="visual-model-selector__consumer-option is-clear"
              :aria-label="$t('common.clear')"
              @click="clearConsumerSelection"
            >
              <span class="visual-model-selector__consumer-option-copy">
                <strong>{{ $t('common.clear') }}</strong>
              </span>
              <t-icon name="close" aria-hidden="true" />
            </button>
            <button
              v-if="!disabled && showAddModel && !authStore.isLiteMode"
              type="button"
              role="option"
              class="visual-model-selector__consumer-option is-add"
              :aria-label="$t('model.addModelInSettings')"
              @click="addModelFromConsumerSelect"
            >
              <span class="visual-model-selector__consumer-option-copy">
                <strong>{{ $t('model.addModelInSettings') }}</strong>
              </span>
              <t-icon name="add" aria-hidden="true" />
            </button>
          </template>
          <template v-else>
            <div class="visual-model-selector__consumer-state">{{ placeholderText }}</div>
            <button
              v-if="!disabled && showAddModel && !authStore.isLiteMode"
              type="button"
              role="option"
              class="visual-model-selector__consumer-option is-add"
              :aria-label="$t('model.addModelInSettings')"
              @click="addModelFromConsumerSelect"
            >
              <span class="visual-model-selector__consumer-option-copy">
                <strong>{{ $t('model.addModelInSettings') }}</strong>
              </span>
              <t-icon name="add" aria-hidden="true" />
            </button>
          </template>
        </div>
      </Transition>
    </div>

    <t-select
      v-else
      :value="selectedModelId"
      @change="handleModelChange"
      :placeholder="placeholderText"
      :disabled="disabled"
      :loading="loading"
      :status="status"
      :clearable="clearable"
      filterable
      class="visual-model-selector__control"
      style="width: 100%;"
    >
      <t-option
        v-for="model in selectorModels"
        :key="model.id"
        :value="model.id"
        :label="modelDisplayName(model)"
      >
        <div
          class="visual-model-selector__option"
          :class="{ 'is-locked': sceneOptionFor(model.id)?.locked || sceneOptionFor(model.id)?.selectable === false }"
          :aria-disabled="sceneOptionFor(model.id)?.locked || sceneOptionFor(model.id)?.selectable === false"
        >
          <span class="visual-model-selector__option-check" aria-hidden="true">
            <t-icon name="check-circle-filled" />
          </span>
          <span class="visual-model-selector__option-copy">
            <strong :title="modelDisplayName(model)">{{ modelDisplayName(model) }}</strong>
            <small v-if="model.display_name" :title="model.name">{{ model.name }}</small>
          </span>
          <span class="visual-model-selector__badges">
            <span v-if="model.is_builtin" class="visual-model-selector__badge">{{ $t('model.builtinTag') }}</span>
            <span v-if="model.is_default" class="visual-model-selector__badge is-default">{{ $t('model.defaultTag') }}</span>
            <span v-if="sceneOptionFor(model.id)?.locked || sceneOptionFor(model.id)?.selectable === false" class="visual-model-selector__badge is-locked">
              <t-icon name="lock-on" /> {{ $t('model.lockedTag') }}
            </span>
          </span>
        </div>
      </t-option>

      <t-option v-if="!disabled && showAddModel && !authStore.isLiteMode" value="__add_model__" class="visual-model-selector__add-option">
        <div class="visual-model-selector__option is-add">
          <span class="visual-model-selector__option-check" aria-hidden="true"><t-icon name="add" /></span>
          <span class="visual-model-selector__option-copy"><strong>{{ $t('model.addModelInSettings') }}</strong></span>
        </div>
      </t-option>
    </t-select>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { listModels, type ConsumerSceneOption, type ModelConfig } from '@/api/model'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import { filterModelsByType } from './modelSelectorFilter'
import { useAuthStore } from '@/stores/auth'
import { useConsumerUpgradePrompt } from '@/hooks/useConsumerUpgradePrompt'
import { type CustomAgent, BUILTIN_QUICK_ANSWER_ID, BUILTIN_SMART_REASONING_ID } from '@/api/agent'
import type { SharedAgentInfo } from '@/api/organization'
import type { MarketplaceLibraryEntry } from '@/api/creator-marketplace'

type ModelSelectorModel = ModelConfig & Partial<Pick<ConsumerSceneOption, 'selectable' | 'locked' | 'required_plan' | 'model_type'>>
type ChatAgentOption = {
  key: string
  agent: CustomAgent
  sourceTenantId?: string
  marketplaceProductId?: string
}

interface Props {
  modelType?: 'KnowledgeQA' | 'Embedding' | 'Rerank' | 'VLLM' | 'ASR'
  selectedModelId?: string
  disabled?: boolean
  placeholder?: string
  status?: 'default' | 'success' | 'warning' | 'error'
  clearable?: boolean
  // 可选：外部传入的所有模型列表，如果提供则不调用API
  allModels?: ModelConfig[]
  mode?: 'catalog' | 'chat'
  models?: ModelSelectorModel[]
  sceneOptions?: ConsumerSceneOption[]
  // Reuse the native scene-model CustomSelect surface without requiring a
  // scene policy projection. This is opt-in so existing catalog/chat callers
  // retain their exact rendering and behavior.
  useConsumerStyle?: boolean
  showAddModel?: boolean
  selectedModelDisplayName?: string
  selectedReasoningLabel?: string
  reasoningOptions?: Array<{ value: string; label: string }>
  reasoningEffort?: string
  agents?: CustomAgent[]
  sharedAgents?: SharedAgentInfo[]
  subscribedAgents?: MarketplaceLibraryEntry[]
  selectedMarketplaceProductId?: string
  selectedAgentId?: string
  selectedAgentSourceTenantId?: string
  selectedAgentDisplayName?: string
  view?: 'overview' | 'models' | 'reasoning'
}

const props = withDefaults(defineProps<Props>(), {
  modelType: 'KnowledgeQA',
  disabled: false,
  placeholder: '',
  status: 'default',
  clearable: false,
  mode: 'catalog',
  models: () => [],
  sceneOptions: () => [],
  useConsumerStyle: false,
  showAddModel: true,
  selectedModelDisplayName: '',
  selectedReasoningLabel: '',
  reasoningOptions: () => [],
  reasoningEffort: 'none',
  agents: () => [],
  sharedAgents: () => [],
  subscribedAgents: () => [],
  selectedMarketplaceProductId: '',
  selectedAgentId: '',
  selectedAgentSourceTenantId: '',
  selectedAgentDisplayName: '',
  view: 'overview',
})

const emit = defineEmits<{
  'update:selectedModelId': [value: string]
  'add-model': []
  'select-model': [value: string]
  'select-reasoning': [value: string]
  'select-agent': [agent: CustomAgent, sourceTenantId?: string]
  'select-marketplace-agent': [productId: string]
  'update:view': [value: 'overview' | 'models' | 'reasoning']
  close: []
}>()

const catalogModels = ref<ModelConfig[]>([])
const loading = ref(false)
const { t } = useI18n()
const authStore = useAuthStore()
const showConsumerUpgradePrompt = useConsumerUpgradePrompt()

const placeholderText = computed(() => {
  return props.placeholder || t('model.selectModelPlaceholder')
})

const modelDisplayName = (model: ModelConfig) => {
  const displayName = model.display_name?.trim()
  return displayName || model.name
}

watch(() => [props.allModels, props.modelType] as const, ([newModels]) => {
  if (newModels && Array.isArray(newModels)) {
    catalogModels.value = filterModelsByType(newModels, props.modelType)
  }
}, { immediate: true })

const sceneOptionById = computed(() => new Map((props.sceneOptions || []).map(option => [option.model_id, option])))
const sceneOptionFor = (modelId?: string) => modelId ? sceneOptionById.value.get(modelId) : undefined
const isConsumerSceneSelector = computed(() =>
  props.mode === 'catalog' && (!props.showAddModel || props.useConsumerStyle),
)
const selectorModels = computed<ModelSelectorModel[]>(() => {
  if (props.sceneOptions.length) {
    if (isConsumerSceneSelector.value) {
      return props.sceneOptions.map((option) => ({
        id: option.model_id,
        name: option.display_name,
        display_name: option.display_name,
        type: option.model_type,
        model_type: option.model_type,
        source: 'remote' as const,
        parameters: { provider: 'openrouter' },
        is_builtin: true,
        is_default: option.is_scene_default,
      }))
    }
  }
  return catalogModels.value
})

const consumerSelectRef = ref<HTMLElement | null>(null)
const consumerDropdownRef = ref<HTMLElement | null>(null)
const consumerSelectOpen = ref(false)
const consumerSelectPlacement = ref<'below' | 'above'>('below')
const consumerSelectedLabel = computed(() => {
  const selected = selectorModels.value.find(model => model.id === props.selectedModelId)
  return selected ? modelDisplayName(selected) : placeholderText.value
})

const selectedCatalogModel = computed(() => {
  if (!props.selectedModelId) return null
  return catalogModels.value.find(m => m.id === props.selectedModelId)
})
void selectedCatalogModel

const loadModels = async () => {
  // Compact scene selectors receive the safe scene projection used by the
  // settings page. A caller that only opts into the scene CustomSelect surface
  // still owns a normal catalog, so it must load the same catalog as before.
  // Neither variant should issue a second, competing /models request.
  if (props.allModels || (isConsumerSceneSelector.value && props.sceneOptions.length)) {
    return
  }

  loading.value = true
  try {
    const result = await listModels()
    if (result && Array.isArray(result)) {
      catalogModels.value = filterModelsByType(result, props.modelType)
    } else {
      catalogModels.value = []
    }
  } catch (error) {
    console.error(t('model.loadFailed'), error)
    MessagePlugin.error(t('model.loadFailed'))
    catalogModels.value = []
  } finally {
    loading.value = false
  }
}

const handleCatalogModelChange = (value?: string) => {
  // 如果选择的是添加模型选项，触发添加事件而不更新选中值
  if (value === '__add_model__') {
    if (authStore.isLiteMode) return
    emit('add-model')
    return
  }
  const option = sceneOptionFor(value)
  if (option && (option.locked || !option.selectable)) {
    showConsumerUpgradePrompt(String(t('entitlement.advancedModelUpgradeBody')))
    return
  }
  emit('update:selectedModelId', value || '')
}
const updateConsumerSelectPlacement = () => {
  if (!consumerSelectOpen.value) return
  const root = consumerSelectRef.value
  const dropdown = consumerDropdownRef.value
  const control = root?.querySelector<HTMLElement>('.visual-model-selector__consumer-control')
  if (!root || !dropdown || !control) return

  const controlRect = control.getBoundingClientRect()
  const container = root.closest('.visual-settings-content')
  const containerRect = container?.getBoundingClientRect()
  const topBoundary = Math.max(0, containerRect?.top ?? 0)
  const bottomBoundary = Math.min(window.innerHeight, containerRect?.bottom ?? window.innerHeight)
  const dropdownHeight = Math.min(dropdown.scrollHeight, 256)
  const availableBelow = bottomBoundary - controlRect.bottom - 6
  const availableAbove = controlRect.top - topBoundary - 6
  consumerSelectPlacement.value = availableBelow < dropdownHeight && availableAbove > availableBelow
    ? 'above'
    : 'below'
}
const toggleConsumerSelect = () => {
  if (props.disabled) return
  const willOpen = !consumerSelectOpen.value
  consumerSelectOpen.value = willOpen
  if (willOpen) {
    consumerSelectPlacement.value = 'below'
    nextTick(updateConsumerSelectPlacement)
  }
}
const closeConsumerSelect = () => { consumerSelectOpen.value = false }
const clearConsumerSelection = () => {
  if (!props.clearable) return
  emit('update:selectedModelId', '')
  closeConsumerSelect()
}
const addModelFromConsumerSelect = () => {
  if (props.disabled || authStore.isLiteMode || !props.showAddModel) return
  emit('add-model')
  closeConsumerSelect()
}
const selectConsumerModel = (value: string) => {
  if (!value) return
  const option = sceneOptionFor(value)
  if (option && (option.locked || option.selectable === false)) {
    handleCatalogModelChange(value)
    return
  }
  handleCatalogModelChange(value)
  closeConsumerSelect()
}
const handleConsumerOutsideClick = (event: MouseEvent) => {
  if (!consumerSelectOpen.value) return
  const target = event.target as Node
  if (!consumerSelectRef.value?.contains(target)) closeConsumerSelect()
}
// Keep the native catalog callback name stable for the management surfaces;
// the chat branch emits its own select-model event and never mutates catalog state.
const handleModelChange = handleCatalogModelChange

const agentLabel = computed(() => t('agent.title'))
const modelLabel = computed(() => t('input.modelLabel'))
const reasoningLabel = computed(() => t('input.reasoningEffort'))
const chatPanelLabel = computed(() => `${agentLabel.value} / ${modelLabel.value} / ${reasoningLabel.value}`)
const backLabel = computed(() => t('input.back'))
const noAgentsLabel = computed(() => t('agent.noAgents'))
const noModelsLabel = computed(() => t('input.noModel'))
const noReasoningLabel = computed(() => t('input.noReasoningEfforts'))

const activeAgentIndex = ref(0)
const activeModelIndex = ref(0)
const activeReasoningIndex = ref(0)
const modelListRef = ref<HTMLElement | null>(null)
const reasoningListRef = ref<HTMLElement | null>(null)
const overviewFirstRef = ref<HTMLButtonElement | null>(null)
const chatPanelRef = ref<HTMLElement | null>(null)
const flyoutAgentListRef = ref<HTMLElement | null>(null)
const flyoutModelListRef = ref<HTMLElement | null>(null)
const flyoutReasoningListRef = ref<HTMLElement | null>(null)
const hoveredSubmenu = ref<'agents' | 'models' | 'reasoning' | null>(null)
const submenuPlacement = ref<'right' | 'left'>('right')
let hoverTask = 0
const modelListId = `visual-model-list-${Math.random().toString(36).slice(2, 9)}`
const agentListId = `visual-agent-list-${Math.random().toString(36).slice(2, 9)}`

// `props.models` is deliberately the caller-owned, plan-filtered catalog.  The
// picker only presents this array; it never fetches or synthesizes records.
const chatModels = computed(() => props.models.filter(model => !!model.id))
const chatAgentOptions = computed<ChatAgentOption[]>(() => {
  const own = props.agents.map((agent) => {
    if (agent.id === BUILTIN_QUICK_ANSWER_ID) {
      return { key: `own-${agent.id}`, agent: { ...agent, name: t('input.normalMode') } }
    }
    if (agent.id === BUILTIN_SMART_REASONING_ID) {
      return { key: `own-${agent.id}`, agent: { ...agent, name: t('input.agentMode') } }
    }
    return { key: `own-${agent.id}`, agent }
  })
  const shared = props.sharedAgents
    .map((sharedAgent) => {
      const sourceTenantId = String(sharedAgent.source_tenant_id)
      const agent: CustomAgent = { is_builtin: false, config: {}, ...sharedAgent.agent }
      return { key: `shared-${sourceTenantId}-${agent.id}`, agent, sourceTenantId }
    })
  const subscribed = [...new Map(props.subscribedAgents.filter(entry => entry.can_chat)
    .map(entry => [entry.product_id, entry])).values()].map(entry => ({
      key: `marketplace-${entry.product_id}`,
      marketplaceProductId: entry.product_id,
      agent: { id: entry.agent_id, name: entry.agent_name || entry.product_title, is_builtin: false, config: {} } as CustomAgent,
    }))
  return [...own, ...shared, ...subscribed]
})
const agentOptionId = (key: string) => `${agentListId}-option-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
const modelOptionId = (id: string) => `${modelListId}-option-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
const reasoningOptionId = (value: string) => `${modelListId}-reasoning-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`
const isAgentOptionSelected = (option: ChatAgentOption) =>
  (option.marketplaceProductId || '') === props.selectedMarketplaceProductId
  && option.agent.id === props.selectedAgentId
  && (option.sourceTenantId || '') === (props.selectedAgentSourceTenantId || '')
const activeAgentId = computed(() => {
  const option = chatAgentOptions.value[activeAgentIndex.value]
  return option ? agentOptionId(option.key) : undefined
})
const activeModelId = computed(() => {
  const model = chatModels.value[activeModelIndex.value]
  return model?.id ? modelOptionId(model.id) : undefined
})
const activeReasoningId = computed(() => {
  const option = props.reasoningOptions[activeReasoningIndex.value]
  return option ? reasoningOptionId(option.value) : undefined
})
const modelIndex = (id?: string) => chatModels.value.findIndex(model => model.id === id)

const updateSubmenuPlacement = () => {
  const panelRect = chatPanelRef.value?.getBoundingClientRect()
  if (!panelRect) return
  const spaceOnRight = window.innerWidth - panelRect.right
  const submenuWidth = hoveredSubmenu.value === 'agents' ? 256 : hoveredSubmenu.value === 'reasoning' ? 192 : 224
  submenuPlacement.value = spaceOnRight >= submenuWidth + 11 ? 'right' : 'left'
}

const hoverOpen = (nextView: 'agents' | 'models' | 'reasoning') => {
  // Touch browsers can synthesize mouseenter immediately before click.
  // Let the click own the toggle so the first tap does not close it again.
  if (window.matchMedia('(hover: none)').matches) return
  const task = ++hoverTask
  queueMicrotask(() => {
    if (task !== hoverTask) return
    hoveredSubmenu.value = nextView
    nextTick(updateSubmenuPlacement)
  })
}

const toggleHover = (nextView: 'agents' | 'models' | 'reasoning') => {
  hoverTask += 1
  if (hoveredSubmenu.value === nextView) {
    hoveredSubmenu.value = null
    return
  }
  hoveredSubmenu.value = nextView
  nextTick(() => {
    updateSubmenuPlacement()
    if (nextView === 'agents') flyoutAgentListRef.value?.focus()
    if (nextView === 'models') flyoutModelListRef.value?.focus()
    if (nextView === 'reasoning') flyoutReasoningListRef.value?.focus()
  })
}

const openView = (nextView: 'overview' | 'models' | 'reasoning') => {
  hoveredSubmenu.value = null
  emit('update:view', nextView)
  nextTick(() => {
    if (nextView === 'models') modelListRef.value?.focus()
    if (nextView === 'reasoning') reasoningListRef.value?.focus()
  })
}
const selectChatAgent = (option: ChatAgentOption) => {
  if (option.marketplaceProductId) {
    emit('select-marketplace-agent', option.marketplaceProductId)
    return
  }
  emit('select-agent', option.agent, option.sourceTenantId)
}
const selectChatModel = (value: string) => {
  const option = chatModels.value.find(model => model.id === value)
  if (!option) return
  const isSceneOption = option.locked !== undefined || option.selectable !== undefined
  if (isSceneOption) {
    if (option.locked || !option.selectable) {
      showConsumerUpgradePrompt(String(t('entitlement.advancedModelUpgradeBody')))
      return
    }
  }
  emit('select-model', value)
}
const selectChatReasoning = (value: string) => {
  if (!props.reasoningOptions.some(option => option.value === value)) return
  emit('select-reasoning', value)
}
const moveAgentActive = (delta: number) => {
  const count = chatAgentOptions.value.length
  if (!count) return
  activeAgentIndex.value = (activeAgentIndex.value + delta + count) % count
  nextTick(() => {
    const active = activeAgentId.value ? document.getElementById(activeAgentId.value) : null
    active?.scrollIntoView({ block: 'nearest' })
  })
}
const moveModelActive = (delta: number) => {
  const count = chatModels.value.length
  if (!count) return
  activeModelIndex.value = (activeModelIndex.value + delta + count) % count
  nextTick(() => {
    const active = activeModelId.value ? document.getElementById(activeModelId.value) : null
    active?.scrollIntoView({ block: 'nearest' })
  })
}
const moveReasoningActive = (delta: number) => {
  const count = props.reasoningOptions.length
  if (!count) return
  activeReasoningIndex.value = (activeReasoningIndex.value + delta + count) % count
  nextTick(() => {
    const option = props.reasoningOptions[activeReasoningIndex.value]
    const active = option ? document.getElementById(reasoningOptionId(option.value)) : null
    active?.scrollIntoView({ block: 'nearest' })
  })
}
const handleAgentKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
    event.stopPropagation()
  }
  if (event.key === 'ArrowDown') { event.preventDefault(); moveAgentActive(1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); moveAgentActive(-1) }
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const option = chatAgentOptions.value[activeAgentIndex.value]
    if (option) selectChatAgent(option)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    hoveredSubmenu.value = null
    nextTick(() => overviewFirstRef.value?.focus())
  }
}
const handleModelKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
    event.stopPropagation()
  }
  if (event.key === 'ArrowDown') { event.preventDefault(); moveModelActive(1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); moveModelActive(-1) }
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const model = chatModels.value[activeModelIndex.value]
    if (model?.id) selectChatModel(model.id)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    emit('update:view', 'overview')
  }
}
const handleReasoningKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
    event.stopPropagation()
  }
  if (event.key === 'ArrowDown') { event.preventDefault(); moveReasoningActive(1) }
  else if (event.key === 'ArrowUp') { event.preventDefault(); moveReasoningActive(-1) }
  else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const option = props.reasoningOptions[activeReasoningIndex.value]
    if (option) selectChatReasoning(option.value)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    emit('update:view', 'overview')
  }
}
const handlePanelKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (props.view === 'overview') emit('close')
    else emit('update:view', 'overview')
  }
}

watch(() => props.view, (view) => {
  if (view !== 'overview') hoveredSubmenu.value = null
  if (view === 'overview') {
    nextTick(() => overviewFirstRef.value?.focus())
  }
  if (view === 'models') {
    activeModelIndex.value = Math.max(0, chatModels.value.findIndex(model => model.id === props.selectedModelId))
    nextTick(() => modelListRef.value?.focus())
  }
  if (view === 'reasoning') {
    activeReasoningIndex.value = Math.max(0, props.reasoningOptions.findIndex(option => option.value === props.reasoningEffort))
    nextTick(() => reasoningListRef.value?.focus())
  }
}, { immediate: true })
watch(
  [chatAgentOptions, () => props.selectedAgentId, () => props.selectedAgentSourceTenantId, () => props.selectedMarketplaceProductId],
  () => {
    activeAgentIndex.value = Math.max(0, chatAgentOptions.value.findIndex(isAgentOptionSelected))
  },
  { immediate: true },
)
watch(() => props.models, () => { activeModelIndex.value = Math.max(0, chatModels.value.findIndex(model => model.id === props.selectedModelId)) }, { deep: true })

defineExpose({
  refresh: loadModels
})

onMounted(() => {
  // The chat branch receives the already plan-filtered catalog from the
  // frozen composer controller.  Never perform a second unrestricted model
  // read from this presentation component.
  if (props.mode === 'catalog' && !props.allModels) {
    loadModels()
  }
  window.addEventListener('resize', updateSubmenuPlacement)
  window.addEventListener('resize', updateConsumerSelectPlacement)
  document.addEventListener('scroll', updateConsumerSelectPlacement, true)
  document.addEventListener('click', handleConsumerOutsideClick)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateSubmenuPlacement)
  window.removeEventListener('resize', updateConsumerSelectPlacement)
  document.removeEventListener('scroll', updateConsumerSelectPlacement, true)
  document.removeEventListener('click', handleConsumerOutsideClick)
})
</script>

<style scoped lang="less">
.visual-model-selector {
  width: 100%;
  min-width: 0;
}

.visual-model-selector--consumer-scene {
  position: relative;
  flex: 0 0 auto;
  width: min(280px, 100%);
  min-width: min(210px, 100%);
}

.visual-model-selector__consumer {
  position: relative;
  width: 100%;
  user-select: none;
}

.visual-model-selector__consumer-control {
  width: 100%;
  min-height: 36px;
  padding: 8px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  background: #fff;
  color: #9ca3af;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  text-align: left;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  cursor: pointer;
  transition: all 150ms ease;
}

.visual-model-selector__consumer-control:hover,
.visual-model-selector__consumer-control:focus-visible {
  outline: none;
  border-color: #d1d5db;
  background: #fff;
}

.visual-model-selector__consumer-control:focus-visible {
  box-shadow: 0 0 0 2px rgb(17 24 39 / 8%);
}

.visual-model-selector__consumer-control:disabled {
  opacity: .55;
  cursor: not-allowed;
}

.visual-model-selector__consumer-control[aria-expanded='true'] { color: #1f2937; }

.visual-model-selector__consumer-control > :deep(.t-icon) {
  flex: 0 0 14px;
  color: #9ca3af;
  font-size: 14px;
}

.visual-model-selector__consumer-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #1f2937;
}

.visual-model-selector__consumer-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  width: 288px;
  max-width: min(288px, calc(100vw - 32px));
  max-height: 256px;
  overflow-y: auto;
  padding: 6px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.visual-model-selector__consumer-fade-enter-active,
.visual-model-selector__consumer-fade-leave-active {
  transition: opacity 100ms ease, transform 100ms ease;
  transform-origin: top right;
}
.visual-model-selector__consumer-fade-enter-from,
.visual-model-selector__consumer-fade-leave-to {
  opacity: 0;
  transform: scale(.95);
}
.visual-model-selector__consumer-dropdown.is-above {
  top: auto;
  bottom: calc(100% + 6px);
  transform-origin: bottom right;
}
.visual-model-selector__consumer-state {
  padding: 8px 12px;
  color: #9ca3af;
  font-size: 12px;
  line-height: 16px;
}

.visual-model-selector__consumer-option {
  width: 100%;
  min-height: 36px;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  background: transparent;
  color: #374151;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms ease, color 150ms ease;
}

.visual-model-selector__consumer-option:hover,
.visual-model-selector__consumer-option:focus-visible {
  outline: none;
  background: #f9fafb;
}

.visual-model-selector__consumer-option.is-selected {
  background: #f3f4f6;
  color: #111827;
  font-weight: 600;
}

.visual-model-selector__consumer-option.is-locked {
  color: #6b7280;
  cursor: not-allowed;
}

.visual-model-selector__consumer-option.is-locked:hover,
.visual-model-selector__consumer-option.is-locked:focus-visible { background: #f9fafb; }

.visual-model-selector__consumer-option.is-clear,
.visual-model-selector__consumer-option.is-add {
  color: #6b7280;
  font-weight: 500;
}

.visual-model-selector__consumer-option.is-clear {
  border-top: 1px solid #f3f4f6;
  border-radius: 0 0 12px 12px;
  margin-top: 2px;
}

.visual-model-selector__consumer-option.is-clear > :deep(.t-icon),
.visual-model-selector__consumer-option.is-add > :deep(.t-icon) {
  flex: 0 0 auto;
  color: #9ca3af;
  font-size: 14px;
}

.visual-model-selector__consumer-option-copy {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.visual-model-selector__consumer-option-copy strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: inherit;
}

.visual-model-selector__consumer-check,
.visual-model-selector__consumer-lock {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.visual-model-selector__consumer-check {
  width: 14px;
  height: 14px;
  justify-content: center;
  color: #374151;
}

.visual-model-selector__consumer-check :deep(.t-icon) { font-size: 14px; }

.visual-model-selector__consumer-lock {
  width: 16px;
  height: 16px;
  justify-content: center;
  color: #6b7280;
}

.visual-model-selector__consumer-lock :deep(.t-icon) { font-size: 14px; }

@media (min-width: 640px) {
  .visual-model-selector__consumer-control,
  .visual-model-selector__consumer-option,
  .visual-model-selector__consumer-state { font-size: 14px; line-height: 20px; }
}

.visual-model-selector__control {
  width: 100%;
}

.visual-model-selector__control :deep(.t-input) {
  min-height: 32px;
  padding: 8px 14px;
  border-color: #e5e7eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  color: #1f2937;
  font-size: 12px;
  line-height: 16px;
  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
}

.visual-model-selector__control :deep(.t-input:hover:not(.t-is-disabled)),
.visual-model-selector__control :deep(.t-input.t-is-focused) {
  border-color: #d1d5db;
  background: #f9fafb;
}

.visual-model-selector__control :deep(.t-input.t-is-focused) {
  box-shadow: 0 0 0 2px rgb(17 24 39 / 6%);
}

.visual-model-selector__control :deep(.t-input__inner) {
  font: inherit;
  font-size: 12px;
  line-height: 16px;
}

.visual-model-selector__option {
  min-width: 0;
  width: 100%;
  min-height: 36px;
  padding: 8px 12px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #4b5563;
  font-size: 11px;
  line-height: 16px;
}

.visual-model-selector__option-check {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.visual-model-selector__option-check :deep(.t-icon) {
  font-size: 13px;
}

.visual-model-selector__option-copy {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.visual-model-selector__option-copy strong,
.visual-model-selector__option-copy small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-model-selector__option-copy strong {
  color: #374151;
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}

.visual-model-selector__option-copy small {
  color: #9ca3af;
  font-size: 10px;
  line-height: 14px;
}

.visual-model-selector__badges {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
}

.visual-model-selector__badge {
  padding: 2px 5px;
  border-radius: 5px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 9px;
  line-height: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.visual-model-selector__badge.is-default {
  background: #ecfdf5;
  color: #047857;
}

.visual-model-selector__option.is-add {
  color: #4b5563;
  font-weight: 600;
}

.visual-model-selector__option.is-locked { color: #6b7280; }
.visual-model-selector__chat-option.is-locked { color: #9ca3af; cursor: not-allowed; }

.visual-model-selector__option.is-locked strong { color: #6b7280; }
.visual-model-selector__chat-option.is-locked strong { color: #9ca3af; }

.visual-model-selector__badge.is-locked {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #fef3c7;
  color: #92400e;
}

/* The chat picker mirrors the compact Codex-style menu: a three-row overview
 * and single-line listbox views.  The caller still owns model availability. */
.visual-model-selector--chat {
  width: 100%;
  min-width: 0;
}

.visual-model-selector__chat-panel {
  --chat-picker-ink: #1f2937;
  --chat-picker-title: #111827;
  --chat-picker-copy: #374151;
  --chat-picker-muted: #6b7280;
  --chat-picker-subtle: #9ca3af;
  --chat-picker-hover: #f9fafb;
  --chat-picker-selected: #f3f4f6;
  --chat-picker-selected-hover: #f3f4f6;
  --chat-picker-soft: #f3f4f6;
  --chat-picker-focus-ring: rgb(17 24 39 / 20%);
  min-width: 0;
  position: relative;
  overflow: visible;
  color: var(--chat-picker-ink);
  width: 224px;
  max-width: min(224px, calc(100vw - 32px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid rgb(229 231 235 / 90%);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%);
}

.visual-model-selector__chat-row {
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.visual-model-selector__chat-row:hover,
.visual-model-selector__chat-row:focus-visible {
  outline: none;
  background: var(--chat-picker-hover);
}

.visual-model-selector__chat-row.is-disabled {
  opacity: .58;
  cursor: not-allowed;
}

.visual-model-selector__chat-row-trailing {
  min-width: 0;
  margin-left: auto;
  padding-right: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.visual-model-selector__chat-row-label {
  color: var(--chat-picker-title);
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
}

.visual-model-selector__chat-row-value {
  min-width: 0;
  max-width: 90px;
  overflow: hidden;
  color: #4b5563;
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-model-selector__chat-row-value.is-model {
  flex: 0 1 132px;
  max-width: 132px;
  overflow: visible;
  overflow-wrap: anywhere;
  text-align: right;
  text-overflow: clip;
  white-space: normal;
}

.visual-model-selector__chat-row-trailing > :deep(.t-icon) {
  flex: 0 0 14px;
  color: var(--chat-picker-subtle);
  font-size: 14px;
}

/* The reference chat picker keeps the two-row overview visible while a
 * submenu flies out on hover.  Placement is selected by the script from the
 * available viewport width so the menu never disappears behind the edge. */
.visual-model-selector__chat-flyout {
  position: absolute;
  bottom: 0;
  z-index: 3;
  width: 224px;
  max-width: min(224px, calc(100vw - 32px));
  padding: 6px;
  box-sizing: border-box;
  border: 1px solid rgb(229 231 235 / 90%);
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%);
  transition: opacity 160ms cubic-bezier(.16,1,.3,1), transform 160ms cubic-bezier(.16,1,.3,1);
}

.visual-model-selector__chat-flyout.is-right { left: 100%; margin-left: 6px; transform-origin: left bottom; }
.visual-model-selector__chat-flyout.is-left { right: 100%; margin-right: 6px; transform-origin: right bottom; }
.visual-model-selector__chat-flyout.is-agents { width: 256px; max-width: min(256px, calc(100vw - 32px)); max-height: 320px; overflow-y: auto; }
.visual-model-selector__chat-flyout.is-models { max-height: 256px; overflow-y: auto; }
.visual-model-selector__chat-flyout.is-reasoning { width: 192px; max-width: min(192px, calc(100vw - 32px)); }
.visual-model-selector__chat-flyout .visual-model-selector__chat-list { max-height: none; overflow: visible; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.visual-model-selector__chat-flyout-heading { padding: 4px 10px; color: #9ca3af; font-size: 11px; line-height: 16px; font-weight: 500; }
.visual-model-selector__chat-flyout.is-right { --chat-flyout-enter-x: -10px; --chat-flyout-exit-x: -6px; }
.visual-model-selector__chat-flyout.is-left { --chat-flyout-enter-x: 10px; --chat-flyout-exit-x: 6px; }
.visual-model-selector__chat-flyout-enter-active,
.visual-model-selector__chat-flyout-leave-active { transition: opacity 160ms cubic-bezier(.16,1,.3,1), transform 160ms cubic-bezier(.16,1,.3,1); }
.visual-model-selector__chat-flyout-enter-from { opacity: 0; transform: translateX(var(--chat-flyout-enter-x)) scale(.96); }
.visual-model-selector__chat-flyout-leave-to { opacity: 0; transform: translateX(var(--chat-flyout-exit-x)) scale(.97); }

.visual-model-selector__chat-header {
  min-height: 36px;
  padding: 0 4px 3px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.visual-model-selector__chat-back {
  width: 30px;
  height: 30px;
  padding: 5px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--chat-picker-muted);
  cursor: pointer;
}

.visual-model-selector__chat-back:hover,
.visual-model-selector__chat-back:focus-visible {
  outline: none;
  background: var(--chat-picker-soft);
  color: var(--chat-picker-title);
}

.visual-model-selector__chat-back :deep(.t-icon) {
  font-size: 18px;
}

.visual-model-selector__chat-title {
  min-width: 0;
  overflow: hidden;
  color: var(--chat-picker-title);
  font-size: 15px;
  line-height: 22px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-model-selector__chat-header-spacer {
  width: 30px;
  flex: 0 0 30px;
}

.visual-model-selector__chat-list {
  max-height: min(250px, calc(var(--visual-model-menu-max-height, 340px) - 52px), 48vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 3px 2px;
  scrollbar-width: thin;
}

.visual-model-selector__chat-list:focus-visible {
  outline: 2px solid var(--chat-picker-focus-ring);
  outline-offset: -2px;
  border-radius: 10px;
}

.visual-model-selector__chat-option {
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: transparent;
  color: var(--chat-picker-copy);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.visual-model-selector__chat-option:hover,
.visual-model-selector__chat-option.is-active {
  outline: none;
  background: var(--chat-picker-hover);
}

.visual-model-selector__chat-option.is-selected {
  background: var(--chat-picker-selected);
}

.visual-model-selector__chat-option.is-selected.is-active,
.visual-model-selector__chat-option.is-selected:hover {
  background: var(--chat-picker-selected-hover);
}

.visual-model-selector__chat-option.is-locked:hover,
.visual-model-selector__chat-option.is-locked.is-active { background: rgb(249 250 251 / 50%); }

.visual-model-selector__chat-option-copy {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.visual-model-selector__chat-option-copy strong {
  min-width: 0;
  display: block;
  overflow: hidden;
  color: var(--chat-picker-copy);
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-model-selector__chat-option.is-selected:not(.is-locked) strong { color: var(--chat-picker-title); font-weight: 500; }
.visual-model-selector__chat-option.is-reasoning strong { color: var(--chat-picker-title); line-height: 15px; }

.visual-model-selector__chat-check {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--chat-picker-title);
}

.visual-model-selector__chat-check :deep(.t-icon) {
  font-size: 14px;
}

.visual-model-selector__chat-lock {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
}

.visual-model-selector__chat-lock :deep(.t-icon) {
  font-size: 14px;
}

.visual-model-selector__chat-empty {
  padding: 24px 10px;
  color: var(--chat-picker-subtle);
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

@media (max-width: 540px) {
  .visual-model-selector__chat-flyout,
  .visual-model-selector__chat-flyout.is-left,
  .visual-model-selector__chat-flyout.is-right {
    right: 0 !important;
    bottom: calc(100% + 6px);
    left: auto !important;
    margin: 0 !important;
    transform-origin: right bottom;
  }
}

@media (max-width: 430px) {
  .visual-model-selector__chat-list {
    max-height: min(250px, calc(var(--visual-model-menu-max-height, 340px) - 52px), 52vh);
  }
}

:root[theme-mode="dark"] .visual-model-selector__chat-panel {
  --chat-picker-ink: #f1f3f4;
  --chat-picker-title: #f8f9fa;
  --chat-picker-copy: #e0e3e7;
  --chat-picker-muted: #bdc1c6;
  --chat-picker-subtle: #9aa0a6;
  --chat-picker-hover: #292c31;
  --chat-picker-selected: #30343a;
  --chat-picker-selected-hover: #373b42;
  --chat-picker-soft: #303238;
  --chat-picker-focus-ring: rgb(138 180 248 / 55%);
  background: #202124;
  border-color: rgb(95 99 104 / 90%);
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%);
}

@media (prefers-color-scheme: dark) {
  :root:not([theme-mode="light"]) .visual-model-selector__chat-panel {
    --chat-picker-ink: #f1f3f4;
    --chat-picker-title: #f8f9fa;
    --chat-picker-copy: #e0e3e7;
    --chat-picker-muted: #bdc1c6;
    --chat-picker-subtle: #9aa0a6;
    --chat-picker-hover: #292c31;
    --chat-picker-selected: #30343a;
    --chat-picker-selected-hover: #373b42;
    --chat-picker-soft: #303238;
    --chat-picker-focus-ring: rgb(138 180 248 / 55%);
    background: #202124;
    border-color: rgb(95 99 104 / 90%);
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .visual-model-selector__control :deep(.t-input) {
    transition: none !important;
  }

  .visual-model-selector__chat-flyout { transition: none !important; }
}
</style>
