<template>
  <div class="memory-workspace-settings">
    <header class="visual-settings-page-header">
      <div class="visual-settings-page-header__copy">
        <h2 class="visual-settings-page-header__title">{{ t('memoryWorkspaceSettings.title') }}</h2>
        <p class="visual-settings-page-header__description">{{ t('memoryWorkspaceSettings.description') }}</p>
      </div>
    </header>

    <!-- The switch defaults to off because memory retains what users say
         across sessions. That makes the feature easy to miss, so the intro
         states plainly what turning it on does. -->
    <p class="settings-note">
      <t-icon name="info-circle" aria-hidden="true" />
      <span>
        <strong>{{ t('memoryWorkspaceSettings.introTitle') }}</strong>
        {{ t('memoryWorkspaceSettings.introDescription') }}
      </span>
    </p>

    <div v-if="loadError" class="settings-load-error" role="alert">
      <span class="settings-load-error__message">
        <t-icon name="error-circle-filled" aria-hidden="true" />
        {{ t('memoryWorkspaceSettings.loadError') }}
      </span>
      <t-button
        size="small"
        variant="text"
        :loading="isInitializing"
        :disabled="isInitializing"
        @click="loadConfig"
      >
        {{ t('common.retry') }}
      </t-button>
    </div>

    <div class="settings-group">
      <div class="setting-row">
        <div class="setting-info">
          <label>{{ t('memoryWorkspaceSettings.enableLabel') }}</label>
          <p class="desc">{{ t('memoryWorkspaceSettings.enableDescription') }}</p>
        </div>
        <div class="setting-control">
          <t-switch
            v-model="config.enabled"
            :disabled="!canEdit || !configLoaded"
            @change="debouncedSave"
          />
        </div>
      </div>

      <div class="setting-row" :class="{ 'is-disabled': !config.enabled }">
        <div class="setting-info">
          <label>{{ t('memoryWorkspaceSettings.writeModeLabel') }}</label>
          <p class="desc">{{ t('memoryWorkspaceSettings.writeModeDescription') }}</p>
          <p class="desc hint">
            {{
              config.write_mode === 'auto'
                ? t('memoryWorkspaceSettings.writeModeAutoHint')
                : t('memoryWorkspaceSettings.writeModeExplicitHint')
            }}
          </p>
        </div>
        <div class="setting-control">
          <t-radio-group
            class="agent-segmented-control"
            v-model="config.write_mode"
            :disabled="!canEdit || !configLoaded || !config.enabled"
            @change="debouncedSave"
          >
            <t-radio-button value="explicit_only">
              {{ t('memoryWorkspaceSettings.writeModeExplicit') }}
            </t-radio-button>
            <t-radio-button value="auto">
              {{ t('memoryWorkspaceSettings.writeModeAuto') }}
            </t-radio-button>
          </t-radio-group>
        </div>
      </div>

      <div class="setting-row" :class="{ 'is-disabled': !config.enabled }">
        <div class="setting-info">
          <label>{{ t('memoryWorkspaceSettings.conditioningLabel') }}</label>
          <p class="desc">{{ t('memoryWorkspaceSettings.conditioningDescription') }}</p>
        </div>
        <div class="setting-control">
          <t-switch
            v-model="config.retrieval_conditioning"
            :disabled="!canEdit || !configLoaded || !config.enabled"
            @change="debouncedSave"
          />
        </div>
      </div>

      <div class="setting-row" :class="{ 'is-disabled': !config.enabled }">
        <div class="setting-info">
          <label>{{ t('memoryWorkspaceSettings.maxItemsLabel') }}</label>
          <p class="desc">{{ t('memoryWorkspaceSettings.maxItemsDescription') }}</p>
        </div>
        <div class="setting-control">
          <t-input-number
            v-model="config.max_items"
            :min="10"
            :max="2000"
            :step="10"
            :disabled="!canEdit || !configLoaded || !config.enabled"
            @change="debouncedSave"
          />
        </div>
      </div>

      <button
        type="button"
        class="setting-row setting-row--disclosure advanced-toggle"
        :aria-expanded="advancedOpen"
        aria-controls="memory-advanced-settings"
        @click="advancedOpen = !advancedOpen"
      >
        <t-icon name="chevron-right" class="toggle-arrow" :class="{ open: advancedOpen }" />
        <span class="advanced-toggle-copy">
          <span class="advanced-toggle-title">{{ t('memoryWorkspaceSettings.advancedLabel') }}</span>
          <span class="advanced-toggle-description">
            {{ t('memoryWorkspaceSettings.advancedDescription') }}
          </span>
        </span>
      </button>

      <div v-if="advancedOpen" id="memory-advanced-settings" class="advanced-section">
        <div class="setting-row" :class="{ 'is-disabled': advancedDisabled }">
          <div class="setting-info">
            <label>{{ t('memoryWorkspaceSettings.vectorRecallLabel') }}</label>
            <p class="desc">{{ t('memoryWorkspaceSettings.vectorRecallDescription') }}</p>
          </div>
          <div class="setting-control">
            <t-switch
              v-model="config.vector_recall"
              :disabled="advancedDisabled"
              @change="debouncedSave"
            />
          </div>
        </div>

        <div
          class="setting-row"
          :class="{ 'is-disabled': advancedDisabled || !config.vector_recall }"
        >
          <div class="setting-info">
            <label>{{ t('memoryWorkspaceSettings.embeddingModelLabel') }}</label>
            <p class="desc">{{ t('memoryWorkspaceSettings.embeddingModelDescription') }}</p>
            <p v-if="!config.vector_recall" class="desc hint">
              {{ t('memoryWorkspaceSettings.vectorOnlyHint') }}
            </p>
          </div>
          <div class="setting-control model-control">
            <ModelSelector
              model-type="Embedding"
              :selected-model-id="config.embedding_model_id"
              :disabled="advancedDisabled || !config.vector_recall"
              :clearable="true"
              :use-consumer-style="true"
              @update:selected-model-id="handleEmbeddingModelChange"
              @add-model="handleAddModel('embedding')"
            />
          </div>
        </div>

        <div
          class="setting-row"
          :class="{ 'is-disabled': advancedDisabled || config.write_mode !== 'auto' }"
        >
          <div class="setting-info">
            <label>{{ t('memoryWorkspaceSettings.extractModelLabel') }}</label>
            <p class="desc">{{ t('memoryWorkspaceSettings.extractModelDescription') }}</p>
            <p v-if="config.write_mode !== 'auto'" class="desc hint">
              {{ t('memoryWorkspaceSettings.autoOnlyHint') }}
            </p>
          </div>
          <div class="setting-control model-control">
            <ModelSelector
              model-type="KnowledgeQA"
              :selected-model-id="config.extract_model_id"
              :disabled="advancedDisabled || config.write_mode !== 'auto'"
              :clearable="true"
              :use-consumer-style="true"
              @update:selected-model-id="handleModelChange"
              @add-model="handleAddModel('chat')"
            />
          </div>
        </div>

        <div
          class="setting-row"
          :class="{ 'is-disabled': advancedDisabled || config.write_mode !== 'auto' }"
        >
          <div class="setting-info">
            <label>{{ t('memoryWorkspaceSettings.extractDelayLabel') }}</label>
            <p class="desc">{{ t('memoryWorkspaceSettings.extractDelayDescription') }}</p>
          </div>
          <div class="setting-control">
            <t-input-number
              v-model="config.extract_delay_seconds"
              :min="5"
              :max="3600"
              :step="15"
              suffix="s"
              :disabled="advancedDisabled || config.write_mode !== 'auto'"
              @change="debouncedSave"
            />
          </div>
        </div>

        <div
          class="setting-row"
          :class="{ 'is-disabled': advancedDisabled || config.write_mode !== 'auto' }"
        >
          <div class="setting-info">
            <label>{{ t('memoryWorkspaceSettings.extractMinIntervalLabel') }}</label>
            <p class="desc">{{ t('memoryWorkspaceSettings.extractMinIntervalDescription') }}</p>
          </div>
          <div class="setting-control">
            <t-input-number
              v-model="config.extract_min_interval_seconds"
              :min="1"
              :max="86400"
              :step="60"
              suffix="s"
              :disabled="advancedDisabled || config.write_mode !== 'auto'"
              @change="debouncedSave"
            />
          </div>
        </div>

        <div
          class="setting-row"
          :class="{ 'is-disabled': advancedDisabled || config.write_mode !== 'auto' }"
        >
          <div class="setting-info">
            <label>{{ t('memoryWorkspaceSettings.interestThresholdLabel') }}</label>
            <p class="desc">{{ t('memoryWorkspaceSettings.interestThresholdDescription') }}</p>
          </div>
          <div class="setting-control">
            <t-input-number
              v-model="config.interest_threshold"
              :min="1"
              :max="20"
              :step="1"
              :disabled="advancedDisabled || config.write_mode !== 'auto'"
              @change="debouncedSave"
            />
          </div>
        </div>

        <div
          class="setting-row setting-row-vertical instructions-row"
          :class="{ 'is-disabled': advancedDisabled || config.write_mode !== 'auto' }"
        >
          <div class="setting-info">
            <label>{{ t('memoryWorkspaceSettings.instructionsLabel') }}</label>
            <p class="desc">{{ t('memoryWorkspaceSettings.instructionsDescription') }}</p>
          </div>
          <div class="setting-control setting-control-full instructions-control">
            <t-textarea
              v-model="config.extract_instructions"
              :autosize="{ minRows: 3, maxRows: 8 }"
              :maxlength="1000"
              :disabled="advancedDisabled || config.write_mode !== 'auto'"
              :placeholder="t('memoryWorkspaceSettings.instructionsPlaceholder')"
              @blur="debouncedSave"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import ModelSelector from '@/components/ModelSelector.vue'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { getTenantMemoryConfig, updateTenantMemoryConfig, type MemoryConfig } from '@/api/memory'

const { t } = useI18n()
const authStore = useAuthStore()
const uiStore = useUIStore()

const config = reactive<MemoryConfig>({
  enabled: false,
  write_mode: 'explicit_only',
  extract_model_id: '',
  max_items: 200,
  extract_delay_seconds: 90,
  extract_min_interval_seconds: 300,
  extract_instructions: '',
  interest_threshold: 3,
  retrieval_conditioning: true,
  embedding_model_id: '',
  vector_recall: true,
})
const isInitializing = ref(true)
const configLoaded = ref(false)
const loadError = ref(false)
const advancedOpen = ref(false)

const canEdit = computed(() => authStore.hasRole('admin'))
const advancedDisabled = computed(() => !canEdit.value || !configLoaded.value || !config.enabled)

const loadConfig = async () => {
  isInitializing.value = true
  configLoaded.value = false
  loadError.value = false
  try {
    const response = await getTenantMemoryConfig()
    if (!response.data) throw new Error('Memory workspace configuration was empty')

    config.enabled = response.data.enabled ?? false
    config.write_mode = response.data.write_mode === 'auto' ? 'auto' : 'explicit_only'
    config.extract_model_id = response.data.extract_model_id ?? ''
    config.max_items = response.data.max_items ?? 200
    config.extract_delay_seconds = response.data.extract_delay_seconds ?? 90
    config.extract_min_interval_seconds = response.data.extract_min_interval_seconds ?? 300
    config.extract_instructions = response.data.extract_instructions ?? ''
    config.interest_threshold = response.data.interest_threshold ?? 3
    config.retrieval_conditioning = response.data.retrieval_conditioning !== false
    config.embedding_model_id = response.data.embedding_model_id ?? ''
    config.vector_recall = response.data.vector_recall !== false
    configLoaded.value = true
  } catch (error: any) {
    console.error('Failed to load memory config:', error)
    loadError.value = true
  } finally {
    // Give the switches a tick to settle so binding the loaded values does not
    // immediately fire a save.
    setTimeout(() => {
      isInitializing.value = false
    }, 100)
  }
}

const saveConfig = async () => {
  if (!configLoaded.value || loadError.value || isInitializing.value || !canEdit.value) return

  try {
    const response = await updateTenantMemoryConfig({ ...config })
    Object.assign(config, response.data)
  } catch (error: any) {
    MessagePlugin.error(
      t('memoryWorkspaceSettings.toasts.saveFailed', { message: error?.message || '' }),
    )
  }
}

let saveTimer: number | null = null
const debouncedSave = () => {
  if (isInitializing.value || !configLoaded.value || loadError.value || !canEdit.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    saveTimer = null
    saveConfig().catch(() => {})
  }, 500)
}

const handleModelChange = (modelId: string) => {
  config.extract_model_id = modelId || ''
  debouncedSave()
}

const handleEmbeddingModelChange = (modelId: string) => {
  config.embedding_model_id = modelId || ''
  debouncedSave()
}

const handleAddModel = (subSection: 'chat' | 'embedding') => {
  uiStore.openSettings('models', subSection)
  window.dispatchEvent(
    new CustomEvent('settings-nav', { detail: { section: 'models', subsection: subSection } }),
  )
}

onMounted(loadConfig)

onUnmounted(() => {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer)
    saveTimer = null
  }
})
</script>

<style lang="less" scoped>
.memory-workspace-settings {
  width: 100%;
}

.settings-note {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 8px 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}

.settings-note :deep(.t-icon) {
  flex-shrink: 0;
  color: var(--td-text-color-placeholder);
}

.settings-note strong {
  margin-right: 4px;
  color: var(--td-text-color-primary);
  font-weight: 600;
}

.settings-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border: 1px solid var(--td-error-color-3, #f3b8b8);
  border-radius: 10px;
  background: var(--td-error-color-1, #fff1f0);
  color: var(--td-error-color-7, #c93e3e);
  font-size: 12px;
  line-height: 18px;
}

.settings-load-error__message {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.settings-group {
  display: flex;
  flex-direction: column;
}

.setting-row {
  &.is-disabled {
    .setting-info label,
    .setting-info .desc {
      color: var(--td-text-color-disabled);
    }
  }
}

.model-control {
  width: 100%;
  max-width: 280px;
}

.advanced-toggle {
  align-items: center;
  gap: 10px;
  cursor: pointer;
  color: var(--td-text-color-secondary);

  &:hover {
    color: var(--td-text-color-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--td-brand-color-focus);
    outline-offset: 2px;
    border-radius: 4px;
  }
}

.toggle-arrow {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 16px;
  transition: transform 0.15s ease;

  &.open {
    transform: rotate(90deg);
  }
}

.advanced-toggle-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.advanced-toggle-title {
  color: var(--td-text-color-primary);
  font-size: 14px;
  font-weight: 500;
}

.advanced-toggle-description {
  color: var(--td-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}

// The custom prompt needs room to read, so this row stacks instead of putting a
// paragraph of rules into a narrow right-hand column.
.instructions-row {
  .setting-info {
    max-width: 100%;
    padding-right: 0;
  }
}

.instructions-control {
  width: 100%;
  max-width: none;
  justify-content: stretch;
}

@media (max-width: 720px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 16px 0;
  }

  .setting-info {
    max-width: 100%;
    padding-right: 0;
  }

  .setting-control {
    width: 100%;
    justify-content: flex-start;
  }

  .model-control {
    width: 100%;
  }
}
</style>
