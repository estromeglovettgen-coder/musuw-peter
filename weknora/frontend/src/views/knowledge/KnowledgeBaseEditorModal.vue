<template>
  <VisualSettingsShell
    :visible="visible"
    :dialog-label="editorTitle"
    :content-label="currentSectionLabel"
    content-wide
    modal-class="kb-settings-shell"
    content-class="kb-settings-content"
    @close="handleClose"
  >
    <template #nav>
      <button
        v-for="item in navItems"
        :key="item.key"
        type="button"
        class="visual-settings-nav__item"
        :class="{ 'is-active': currentSection === item.key }"
        :aria-current="currentSection === item.key ? 'page' : undefined"
        :data-guide="`kb-editor-nav-${item.key}`"
        @click="currentSection = item.key"
      >
        <span class="nav-label">{{ item.label }}</span>
        <span v-if="item.badge" class="kb-settings-nav-badge">{{ item.badge }}</span>
      </button>
    </template>

    <div v-if="loading && !formData" class="kb-settings-loading">
      <t-loading size="medium" />
    </div>

    <form v-if="formData" class="kb-settings-scroll" @submit.prevent="handleSubmit">
      <div v-show="currentSection === 'basic'" class="kb-config-section section">
        <div class="section-header">
          <h2>{{ $t('knowledgeEditor.sidebar.basic') }}</h2>
          <p class="section-description">{{ $t('knowledgeEditor.modalDescription') }}</p>
        </div>

        <div class="settings-group">
          <section v-if="editorMode === 'edit' && activeKbId" class="setting-row">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.basic.kbId') }}</label>
              <p class="desc">{{ $t('knowledgeEditor.basic.kbIdDesc') }}</p>
            </div>
            <div class="setting-control">
              <div class="kb-config-id-control">
                <code class="kb-config-id-value" :title="activeKbId">{{ activeKbId }}</code>
                <t-button variant="text" shape="square" size="small" :title="$t('common.copy')" @click="copyKbId">
                  <t-icon name="file-copy" aria-hidden="true" />
                </t-button>
              </div>
            </div>
          </section>

          <section v-if="!authStore.isLiteMode" class="setting-row">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.basic.typeLabel') }} <span class="is-required">*</span></label>
              <p class="desc">{{ $t('knowledgeEditor.basic.typeDescription') }}</p>
            </div>
            <div class="setting-control">
              <t-radio-group
                v-model="formData.type"
                :disabled="editorMode === 'edit'"
                data-guide="kb-create-type"
              >
                <t-radio-button value="document">{{ $t('knowledgeEditor.basic.typeDocument') }}</t-radio-button>
                <t-radio-button value="faq">{{ $t('knowledgeEditor.basic.typeFAQ') }}</t-radio-button>
              </t-radio-group>
            </div>
          </section>

          <section v-if="!isFAQ" class="setting-row" data-guide="kb-create-indexing">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.indexing.searchTitle') }}</label>
              <p class="desc">{{ $t('knowledgeEditor.indexing.searchDesc') }}</p>
            </div>
            <div class="setting-control">
              <t-switch
                v-model="formData.indexingStrategy.vectorEnabled"
                :disabled="isIndexingLocked"
                @change="handleVectorIndexingChange"
              />
            </div>
          </section>

          <section v-if="!isFAQ" class="setting-row">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.indexing.wikiTitle') }}</label>
              <p class="desc">{{ $t('knowledgeEditor.indexing.wikiDesc') }}</p>
              <p v-if="isIndexingLocked" class="kb-config-locked-tip">
                {{ $t('knowledgeEditor.indexing.lockedTip') }}
              </p>
            </div>
            <div class="setting-control">
              <t-switch
                v-model="formData.indexingStrategy.wikiEnabled"
                :disabled="isIndexingLocked"
              />
            </div>
          </section>

          <section v-if="!isFAQ && formData.indexingStrategy.wikiEnabled" class="setting-row">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.wiki.extractionGranularityLabel') }}</label>
              <p class="desc">{{ $t('knowledgeEditor.wiki.extractionGranularityTip') }}</p>
              <p class="desc kb-settings-hint">{{ granularityHint }}</p>
            </div>
            <div class="setting-control">
              <t-select v-model="formData.wikiConfig.extractionGranularity" class="visual-scene-select">
                <t-option value="focused" :label="$t('knowledgeEditor.wiki.granularityFocused')" />
                <t-option value="standard" :label="$t('knowledgeEditor.wiki.granularityStandard')" />
                <t-option value="exhaustive" :label="$t('knowledgeEditor.wiki.granularityExhaustive')" />
              </t-select>
            </div>
          </section>

          <section v-if="!isFAQ && formData.indexingStrategy.wikiEnabled" class="setting-row setting-row-vertical">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.wiki.contentInstructionsLabel') }}</label>
              <p class="desc">{{ $t('knowledgeEditor.wiki.contentInstructionsTip') }}</p>
            </div>
            <div class="setting-control setting-control-full kb-settings-textarea">
              <t-textarea
                v-model="formData.wikiConfig.contentInstructions"
                :placeholder="$t('knowledgeEditor.wiki.contentInstructionsPlaceholder')"
                :maxlength="4000"
                :autosize="{ minRows: 3, maxRows: 7 }"
              />
            </div>
          </section>

          <section v-if="!isFAQ && formData.indexingStrategy.wikiEnabled" class="setting-row setting-row-vertical">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.wiki.extractionInstructionsLabel') }}</label>
              <p class="desc">{{ $t('knowledgeEditor.wiki.extractionInstructionsTip') }}</p>
            </div>
            <div class="setting-control setting-control-full kb-settings-textarea">
              <t-textarea
                v-model="formData.wikiConfig.extractionInstructions"
                :placeholder="$t('knowledgeEditor.wiki.extractionInstructionsPlaceholder')"
                :maxlength="4000"
                :autosize="{ minRows: 3, maxRows: 7 }"
              />
            </div>
          </section>

          <section class="setting-row" data-guide="kb-create-name">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.basic.nameLabel') }} <span class="is-required">*</span></label>
            </div>
            <div class="setting-control">
              <t-input
                v-model="formData.name"
                name="name"
                :placeholder="$t('knowledgeEditor.basic.namePlaceholder')"
                :maxlength="50"
                @enter="handleSubmit"
              />
            </div>
          </section>

          <section class="setting-row setting-row-vertical">
            <div class="setting-info">
              <label>{{ $t('knowledgeEditor.basic.descriptionLabel') }}</label>
            </div>
            <div class="setting-control setting-control-full kb-settings-textarea">
              <t-textarea
                v-model="formData.description"
                :placeholder="$t('knowledgeEditor.basic.descriptionPlaceholder')"
                :maxlength="200"
                :autosize="{ minRows: 3, maxRows: 5 }"
              />
            </div>
          </section>
        </div>
      </div>

            <!-- Standard-tier settings remain available through the compact section navigator. -->
            <div v-if="!authStore.isLiteMode && currentSection === 'models'" class="kb-config-section">
              <KBModelConfig
                ref="modelConfigRef"
                v-if="formData"
                :config="formData.modelConfig"
                :has-files="hasFiles"
                :wiki-enabled="formData.indexingStrategy?.wikiEnabled"
                :rag-enabled="formData.indexingStrategy?.vectorEnabled || formData.indexingStrategy?.keywordEnabled"
                :all-models="allModels"
                @update:config="handleModelConfigUpdate"
              />
            </div>

            <div v-if="!authStore.isLiteMode && currentSection === 'vectorStore'" class="kb-config-section">
              <KBVectorStoreSettings
                v-if="formData"
                :mode="editorMode"
                :vector-store-id="formData.vectorStoreId"
                :bound-source="formData.vectorStoreInfo?.source"
                :bound-name="formData.vectorStoreInfo?.name"
                :bound-engine-type="formData.vectorStoreInfo?.engineType"
                :bound-status="formData.vectorStoreInfo?.status"
                @update:vector-store-id="handleVectorStoreIdUpdate"
              />
            </div>

            <div v-if="!authStore.isLiteMode && isFAQ && currentSection === 'faq'" class="kb-config-section">
              <div class="kb-config-field__heading">
                <label>{{ $t('knowledgeEditor.faq.title') }}</label>
                <p>{{ $t('knowledgeEditor.faq.description') }}</p>
              </div>
              <div class="kb-config-field">
                <label>{{ $t('knowledgeEditor.faq.indexModeLabel') }}</label>
                <t-radio-group v-model="formData.faqConfig.indexMode">
                  <t-radio-button value="question_only">{{ $t('knowledgeEditor.faq.modes.questionOnly') }}</t-radio-button>
                  <t-radio-button value="question_answer">{{ $t('knowledgeEditor.faq.modes.questionAnswer') }}</t-radio-button>
                </t-radio-group>
                <p class="kb-config-field__hint">{{ $t('knowledgeEditor.faq.indexModeDescription') }}</p>
              </div>
              <div class="kb-config-field">
                <label>{{ $t('knowledgeEditor.faq.questionIndexModeLabel') }}</label>
                <t-radio-group v-model="formData.faqConfig.questionIndexMode">
                  <t-radio-button value="combined">{{ $t('knowledgeEditor.faq.modes.combined') }}</t-radio-button>
                  <t-radio-button value="separate">{{ $t('knowledgeEditor.faq.modes.separate') }}</t-radio-button>
                </t-radio-group>
                <p class="kb-config-field__hint">{{ $t('knowledgeEditor.faq.questionIndexModeDescription') }}</p>
              </div>
            </div>

            <div v-if="!authStore.isLiteMode && !isFAQ && currentSection === 'parser'" class="kb-config-section">
              <KBParserSettings
                v-if="formData"
                :parser-engine-rules="formData.chunkingConfig.parserEngineRules"
                @update:parser-engine-rules="handleParserEngineRulesUpdate"
              />
            </div>

            <div v-if="!authStore.isLiteMode && !isFAQ && currentSection === 'storage'" class="kb-config-section">
              <KBStorageSettings
                v-if="formData"
                :storage-backend-id="formData.storageBackendId"
                :storage-provider="formData.storageProvider"
                :has-files="editorMode === 'edit' && hasFiles"
                @update:storage-backend-id="handleStorageBackendUpdate"
                @update:storage-provider="handleStorageProviderUpdate"
              />
            </div>

            <div v-if="!authStore.isLiteMode && !isFAQ && currentSection === 'chunking'" class="kb-config-section">
              <KBChunkingSettings
                v-if="formData"
                :config="formData.chunkingConfig"
                @update:config="handleChunkingConfigUpdate"
              />
            </div>

            <div v-if="!authStore.isLiteMode && !isFAQ && currentSection === 'multimodal'" class="kb-config-section">
              <div class="kb-config-field__heading">
                <label>{{ $t('knowledgeEditor.multimodal.title') }}</label>
                <p>{{ $t('knowledgeEditor.multimodal.description') }}</p>
              </div>
              <div class="kb-config-settings-group">
                <div class="kb-config-setting-row">
                  <div class="kb-config-setting-info">
                    <label>{{ $t('knowledgeEditor.advanced.multimodal.label') }}</label>
                    <p>{{ $t('knowledgeEditor.advanced.multimodal.description') }}</p>
                  </div>
                  <t-switch v-model="formData.multimodalConfig.enabled" @change="handleMultimodalToggle" />
                </div>
                <div v-if="formData.multimodalConfig.enabled" class="kb-config-setting-row">
                  <div class="kb-config-setting-info">
                    <label>{{ $t('knowledgeEditor.advanced.multimodal.vllmLabel') }} <span class="is-required">*</span></label>
                    <p>{{ $t('knowledgeEditor.advanced.multimodal.vllmDescription') }}</p>
                  </div>
                  <ModelSelector
                    model-type="VLLM"
                    use-consumer-style
                    :selected-model-id="formData.multimodalConfig.vllmModelId"
                    :all-models="allModels"
                    @update:selected-model-id="handleMultimodalVLLMChange"
                    @add-model="handleAddVLLMModel"
                    :placeholder="$t('knowledgeEditor.advanced.multimodal.vllmPlaceholder')"
                  />
                </div>
                <div v-if="formData.multimodalConfig.enabled" class="kb-config-setting-row">
                  <div class="kb-config-setting-info">
                    <label>{{ $t('knowledgeEditor.advanced.multimodal.descriptionLanguageLabel') }}</label>
                    <p>{{ $t('knowledgeEditor.advanced.multimodal.descriptionLanguageDescription') }}</p>
                  </div>
                  <t-select v-model="formData.multimodalConfig.descriptionLanguage" class="visual-scene-select" clearable :placeholder="$t('knowledgeEditor.advanced.multimodal.descriptionLanguageAuto')">
                    <t-option value="Chinese" :label="$t('language.zhCN')" />
                    <t-option value="English" :label="$t('language.enUS')" />
                    <t-option value="Korean" :label="$t('language.koKR')" />
                    <t-option value="Russian" :label="$t('language.ruRU')" />
                  </t-select>
                </div>
                <div v-if="formData.multimodalConfig.enabled" class="kb-config-setting-row kb-config-setting-row--vertical">
                  <div class="kb-config-setting-info">
                    <label>{{ $t('knowledgeEditor.advanced.multimodal.customInstructionsLabel') }}</label>
                    <p>{{ $t('knowledgeEditor.advanced.multimodal.customInstructionsDescription') }}</p>
                  </div>
                  <t-textarea v-model="formData.multimodalConfig.customInstructions" :placeholder="$t('knowledgeEditor.advanced.multimodal.customInstructionsPlaceholder')" :maxlength="4000" :autosize="{ minRows: 3, maxRows: 8 }" />
                </div>
              </div>
            </div>

            <div v-if="!authStore.isLiteMode && !isFAQ && currentSection === 'asr'" class="kb-config-section">
              <div class="kb-config-field__heading">
                <label>{{ $t('knowledgeEditor.asr.title') }}</label>
                <p>{{ $t('knowledgeEditor.asr.description') }}</p>
              </div>
              <div class="kb-config-settings-group">
                <div class="kb-config-setting-row">
                  <div class="kb-config-setting-info">
                    <label>{{ $t('knowledgeEditor.asr.label') }}</label>
                    <p>{{ $t('knowledgeEditor.asr.desc') }}</p>
                  </div>
                  <t-switch v-model="formData.asrConfig.enabled" />
                </div>
                <div v-if="formData.asrConfig.enabled" class="kb-config-setting-row">
                  <div class="kb-config-setting-info">
                    <label>{{ $t('knowledgeEditor.asr.modelLabel') }} <span class="is-required">*</span></label>
                    <p>{{ $t('knowledgeEditor.asr.modelDescription') }}</p>
                  </div>
                  <ModelSelector
                    model-type="ASR"
                    use-consumer-style
                    :selected-model-id="formData.asrConfig.modelId"
                    :all-models="allModels"
                    @update:selected-model-id="(val: string) => { if (formData) formData.asrConfig.modelId = val }"
                    @add-model="handleAddASRModel"
                    :placeholder="$t('knowledgeEditor.asr.modelPlaceholder')"
                  />
                </div>
              </div>
            </div>

            <div v-if="!authStore.isLiteMode && !isFAQ && currentSection === 'graph'" class="kb-config-section">
              <GraphSettings
                v-if="formData"
                :graph-extract="formData.nodeExtractConfig"
                :model-id="formData.modelConfig.llmModelId"
                :all-models="allModels"
                @update:graph-extract="handleNodeExtractUpdate"
              />
            </div>

            <div v-if="!isFAQ && currentSection === 'advanced'" class="kb-config-section">
              <KBAdvancedSettings
                ref="advancedSettingsRef"
                v-if="formData"
                :question-generation="formData.questionGenerationConfig"
                :auto-tag="formData.autoTagConfig"
                :rag-enabled="formData.indexingStrategy?.vectorEnabled || formData.indexingStrategy?.keywordEnabled"
                :all-models="authStore.isLiteMode ? [] : allModels"
                :consumer-mode="authStore.isLiteMode"
                :table-metadata-instructions="formData.chunkingConfig.tableMetadataInstructions"
                @update:question-generation="handleQuestionGenerationUpdate"
                @update:auto-tag="(value) => { if (formData) formData.autoTagConfig = value }"
                @update:table-metadata-instructions="(value: string) => { if (formData) formData.chunkingConfig.tableMetadataInstructions = value }"
              />
            </div>

            <div v-if="!authStore.isLiteMode && editorMode === 'edit' && activeKbId && currentSection === 'datasource'" class="kb-config-section">
              <DataSourceSettings v-if="activeKbId" :kb-id="activeKbId" @count="dsCount = $event" />
            </div>

            <div v-if="!authStore.isLiteMode && editorMode === 'edit' && activeKbId && currentSection === 'share'" class="kb-config-section">
              <KBShareSettings v-if="activeKbId" :kb-id="activeKbId" :can-share="canShareKB" />
            </div>

            <div v-if="!authStore.isLiteMode && editorMode === 'edit' && activeKbId && canViewActivity && currentSection === 'activity'" class="kb-config-section">
              <KnowledgeBaseActivitySettings v-if="activeKbId" :kb-id="activeKbId" :active="currentSection === 'activity'" />
            </div>

    </form>

    <template #footer>
      <t-button variant="outline" @click="handleClose">
        {{ $t('common.cancel') }}
      </t-button>
      <t-button
        v-if="formData"
        theme="primary"
        data-guide="kb-create-submit"
        :loading="saving"
        :disabled="saving || (authStore.isLiteMode && !isFAQ && !formData.indexingStrategy.vectorEnabled && !formData.indexingStrategy.keywordEnabled && !formData.indexingStrategy.wikiEnabled)"
        @click="handleSubmit"
      >
        {{ saveButtonLabel }}
      </t-button>
    </template>
  </VisualSettingsShell>

  <KbCreateContextualGuide
    :when="visible && editorMode === 'create'"
    :is-faq="isFAQ"
    :needs-embedding="kbCreateNeedsEmbedding"
  />
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import KbCreateContextualGuide from '@/components/KbCreateContextualGuide.vue'
import VisualSettingsShell from '@/views/settings/components/VisualSettingsShell.vue'
import { KB_EDITOR_FOCUS_SECTION_EVENT, markContextualGuideDone } from '@/config/contextualGuides'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { createKnowledgeBase, getKnowledgeBaseById, listKnowledgeFiles, updateKnowledgeBase } from '@/api/knowledge-base'
import { updateKBConfig, type KBModelConfigRequest } from '@/api/initialization'
import { useChatResourcesStore } from '@/stores/chatResources'
import { selectInitialModelId } from '@/utils/modelDefaults'
import { copyWithToast } from '@/utils/clipboard'
import { useEditorResourcesStore } from '@/stores/editorResources'
import { useSettingsStore } from '@/stores/settings'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import KBModelConfig from './settings/KBModelConfig.vue'
import KBParserSettings from './settings/KBParserSettings.vue'
import KBStorageSettings from './settings/KBStorageSettings.vue'
import KBChunkingSettings from './settings/KBChunkingSettings.vue'
import KBVectorStoreSettings from './settings/KBVectorStoreSettings.vue'
import KBAdvancedSettings from './settings/KBAdvancedSettings.vue'
import ModelSelector from '@/components/ModelSelector.vue'
import GraphSettings from './settings/GraphSettings.vue'
import KBShareSettings from './settings/KBShareSettings.vue'
import DataSourceSettings from './settings/DataSourceSettings.vue'
import KnowledgeBaseActivitySettings from './settings/KnowledgeBaseActivitySettings.vue'
import { useI18n } from 'vue-i18n'
import { resolveConsumerSceneCandidate } from '@/utils/consumerSceneModels'
import { nextAvailableLocalizedName } from '@/utils/localizedDefaultName'
import { useConsumerUpgradePrompt } from '@/hooks/useConsumerUpgradePrompt'
import { consumerPlanErrorKeyFromError } from '@/utils/consumerPlanError'

const uiStore = useUIStore()
const authStore = useAuthStore()
const chatResources = useChatResourcesStore()
const editorResources = useEditorResourcesStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const showConsumerUpgradePrompt = useConsumerUpgradePrompt()

// Lite keeps the full upstream processing pipeline behind the server-owned
// product boundary.  The browser only needs this fixed scene model when it
// submits a managed automatic-tag request; it must never become a selector.
const LITE_AUTO_TAG_MODEL_ID = 'builtin-deepseek-v4-flash'
const LITE_KB_EDITOR_SECTIONS = [
  { key: 'basic', icon: 'info-circle' },
  { key: 'advanced', icon: 'setting' },
] as const

// Props
const props = defineProps<{
  visible: boolean
  mode: 'create' | 'edit'
  kbId?: string
  initialType?: 'document' | 'faq'
}>()

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'success', kbId: string): void
}>()

const editorMode = computed(() => props.mode)
const activeKbId = computed(() => props.kbId)
const editorTitle = computed(() =>
  editorMode.value === 'create'
    ? t('knowledgeEditor.titleCreate')
    : t('knowledgeEditor.titleEdit')
)
const saveButtonLabel = computed(() =>
  editorMode.value === 'create'
    ? t('knowledgeEditor.buttons.confirmCreate')
    : t('knowledgeEditor.buttons.save')
)

const copyKbId = async () => {
  await copyWithToast(activeKbId.value, 'common.copied')
}

const currentSection = ref<string>('basic')

/**
 * Consumer deep links are intentionally outcome-oriented.  Keep the
 * supported Basic/Advanced pair stable while letting Standard retain its
 * existing section names and navigation contract.
 */
const normalizeKnowledgeBaseSection = (section?: string | null): string => {
  if (!authStore.isLiteMode) return section || 'basic'
  return section === 'advanced' ? 'advanced' : 'basic'
}

const normalizeKnowledgeBaseType = (type?: unknown): 'document' | 'faq' => {
  if (authStore.isLiteMode) return 'document'
  return type === 'faq' ? 'faq' : 'document'
}

const onKbEditorFocusSection = (event: Event) => {
  const section = (event as CustomEvent<{ section?: string }>).detail?.section
  if (section) {
    const normalized = normalizeKnowledgeBaseSection(section)
    if (navItems.value.some((item) => item.key === normalized)) {
      currentSection.value = normalized
    }
  }
}

onMounted(() => {
  window.addEventListener(KB_EDITOR_FOCUS_SECTION_EVENT, onKbEditorFocusSection)
})

onBeforeUnmount(() => {
  window.removeEventListener(KB_EDITOR_FOCUS_SECTION_EVENT, onKbEditorFocusSection)
})
const saving = ref(false)
const loading = ref(false)
const allModels = ref<any[]>([])
const hasFiles = ref(false)
const initialStorageProvider = ref<string>('')
/** Tenant-wide default from Settings → Storage engine (used when creating a KB). */
const tenantDefaultStorageProvider = ref('local')
const dsCount = ref(0)
// Identifier of the user who created this KB. Empty for older rows
// that predate per-KB ownership tracking; those KBs have no "owner" and
// only tenant Admin+ can mutate their share settings.
const kbCreatorId = ref<string>('')
const kbTenantId = ref<number>(0)

// Backend gate for /knowledge-bases/:id/shares (POST/PUT/DELETE) is
// g.OwnedKBOrAdmin(): only the KB creator or tenant Admin+ may mutate
// shares. Org-admins on a shared KB do NOT pass this guard, so they
// would only see 403s if we let them try. Mirror the matrix here so
// the buttons disappear instead of failing.
const canShareKB = computed(() => {
  if (!activeKbId.value) return false
  const userId = authStore.user?.id || ''
  if (kbCreatorId.value && userId && kbCreatorId.value === userId) return true
  return authStore.hasRole('admin')
})

const isKbOwner = computed(() => {
  const userId = authStore.user?.id || ''
  return Boolean(kbCreatorId.value && userId && kbCreatorId.value === userId)
})

const canViewActivity = computed(() => {
  if (editorMode.value !== 'edit' || !activeKbId.value) return false
  if (Number(kbTenantId.value || 0) !== Number(authStore.currentTenantId || 0)) return false
  return isKbOwner.value || authStore.hasRole('admin')
})
// 用户是否在分块设置中手动改过任何值。一旦为 true，就不再根据索引策略自动调整默认分块参数。
const chunkingDirty = ref(false)

// 仅 Wiki 索引模式下的分块预设：更大 chunk、无 overlap、关闭父子分块。
// 该预设只在「创建模式」下、且用户尚未手动调整分块参数时生效，避免覆盖既有 KB 的配置。
const WIKI_ONLY_CHUNKING_PRESET = {
  chunkSize: 2048,
  chunkOverlap: 0,
  enableParentChild: false,
} as const

// Non-Wiki-only fallback. Mirrors chunker.DefaultChunkSize and
// DefaultChunkOverlap on the backend so a freshly created KB uses
// the same numbers whether the editor sets them or the splitter
// falls back to its package defaults.
const DEFAULT_CHUNKING_PRESET = {
  chunkSize: 512,
  chunkOverlap: 80,
  enableParentChild: true,
} as const

const navItems = computed(() => {
  const items: { key: string; icon: string; label: string; badge?: number }[] = [
    { key: 'basic', icon: 'info-circle', label: t('knowledgeEditor.sidebar.basic') },
  ]
  if (authStore.isLiteMode) {
    const liteItems: { key: string; icon: string; label: string; badge?: number }[] = LITE_KB_EDITOR_SECTIONS.map((item) => ({
      key: item.key,
      icon: item.icon,
      label: t(`knowledgeEditor.sidebar.${item.key}`),
    }))
    return liteItems
  }
  items.push(
    { key: 'models', icon: 'control-platform', label: t('knowledgeEditor.sidebar.models') },
    // VectorStore binding section — present in both create and edit
    // modes. Create mode shows a dropdown; edit mode shows the bound
    // store read-only with an immutability hint.
    { key: 'vectorStore', icon: 'data-base', label: t('knowledgeEditor.sidebar.vectorStore') },
  )
  if (formData.value?.type === 'faq') {
    items.push({ key: 'faq', icon: 'help-circle', label: t('knowledgeEditor.sidebar.faq') })
  } else {
    items.push(
      { key: 'parser', icon: 'file-search', label: t('settings.parserEngine') },
      { key: 'multimodal', icon: 'image', label: t('knowledgeEditor.sidebar.multimodal') },
      { key: 'asr', icon: 'sound', label: t('knowledgeEditor.sidebar.asr') },
      { key: 'storage', icon: 'cloud', label: t('knowledgeEditor.sidebar.storage') },
      { key: 'chunking', icon: 'file-copy', label: t('knowledgeEditor.sidebar.chunking') },
      { key: 'graph', icon: 'chart-bubble', label: t('knowledgeEditor.sidebar.graph') },
      { key: 'advanced', icon: 'setting', label: t('knowledgeEditor.sidebar.advanced') }
    )
    if (editorMode.value === 'edit' && activeKbId.value) {
      items.push({ key: 'datasource', icon: 'cloud-download', label: t('knowledgeEditor.sidebar.datasource'), badge: dsCount.value || undefined })
    }
  }
  if (editorMode.value === 'edit' && activeKbId.value && !authStore.isLiteMode) {
    items.push({ key: 'share', icon: 'share', label: t('knowledgeEditor.sidebar.share') })
  }
  if (canViewActivity.value) {
    items.push({ key: 'activity', icon: 'history', label: t('knowledgeEditor.sidebar.activity') })
  }
  return items
})

const currentSectionLabel = computed(() =>
  navItems.value.find((item) => item.key === currentSection.value)?.label || editorTitle.value
)

// 左侧导航分组（与 AgentEditorModal 对齐）
const navGroups = computed(() => {
  const itemMap = new Map(navItems.value.map((item) => [item.key, item]))
  const pickItems = (keys: string[]) =>
    keys.map((key) => itemMap.get(key)).filter(Boolean) as typeof navItems.value
  return [
    {
      key: 'basic',
      label: t('knowledgeEditor.navGroups.basic'),
      items: pickItems(['basic', 'models', 'vectorStore', 'faq']),
    },
    {
      key: 'processing',
      label: t('knowledgeEditor.navGroups.processing'),
      items: pickItems(['parser', 'chunking', 'multimodal', 'asr', 'graph', 'advanced']),
    },
    {
      key: 'data',
      label: t('knowledgeEditor.navGroups.data'),
      items: pickItems(['storage', 'datasource']),
    },
    {
      key: 'integration',
      label: t('knowledgeEditor.navGroups.integration'),
      items: pickItems(['share']),
    },
    {
      key: 'management',
      label: t('knowledgeEditor.navGroups.management'),
      items: pickItems(['activity']),
    },
  ].filter((group) => group.items.length > 0)
})

// 模型配置引用
const modelConfigRef = ref<InstanceType<typeof KBModelConfig>>()
const advancedSettingsRef = ref<InstanceType<typeof KBAdvancedSettings>>()

// 表单数据
const formData = ref<any>(null)
// FAQ remains a Standard/admin capability.  Lite's form is document-only
// even if stale state or a crafted deep link tries to inject another type.
const isFAQ = computed(() => !authStore.isLiteMode && formData.value?.type === 'faq')

const kbCreateNeedsEmbedding = computed(() => {
  if (!formData.value || normalizeKnowledgeBaseType(formData.value.type) === 'faq') return false
  const s = formData.value.indexingStrategy
  return Boolean(s?.vectorEnabled || s?.keywordEnabled)
})

const applyDefaultModelsIfEmpty = () => {
  if (!formData.value || editorMode.value !== 'create') return
  const chatModelId = selectInitialModelId(allModels.value, 'KnowledgeQA')
  const embeddingModelId = selectInitialModelId(allModels.value, 'Embedding')
  if (!formData.value.modelConfig.llmModelId && chatModelId) {
    formData.value.modelConfig.llmModelId = chatModelId
  }
  if (!formData.value.modelConfig.embeddingModelId && embeddingModelId) {
    formData.value.modelConfig.embeddingModelId = embeddingModelId
  }
}

watch(
  () => formData.value?.type,
  (newType, oldType) => {
    if (!formData.value) return
    if (authStore.isLiteMode && newType !== 'document') {
      formData.value.type = 'document'
      currentSection.value = normalizeKnowledgeBaseSection(currentSection.value)
      return
    }
    if (newType === 'faq') {
      if (!formData.value.faqConfig) {
        formData.value.faqConfig = { indexMode: 'question_only', questionIndexMode: 'separate' }
      }
      if (!['basic', 'models', 'faq'].includes(currentSection.value)) {
        currentSection.value = 'faq'
      }
    } else if (oldType === 'faq' && currentSection.value === 'faq') {
      currentSection.value = 'basic'
    }
  }
)

/**
 * Lite creates a personal knowledge base without asking the user to invent a
 * name first. Use the names already present in the shared resource cache so
 * repeated creates remain predictable without adding a uniqueness endpoint.
 */
const getLiteDefaultKnowledgeBaseName = (): string => {
  const baseName = t('knowledgeEditor.basic.defaultName').trim()
  const loadedNames = Array.isArray(chatResources.rawKnowledgeBases)
    ? chatResources.rawKnowledgeBases.map((kb: any) => kb?.name)
    : []
  return nextAvailableLocalizedName(
    baseName,
    loadedNames,
    (index) => t('knowledgeEditor.basic.defaultNameWithIndex', {
      name: baseName,
      index,
    }),
  )
}

const initFormData = (type: 'document' | 'faq' = 'document') => ({
  type: normalizeKnowledgeBaseType(type),
  name: authStore.isLiteMode ? getLiteDefaultKnowledgeBaseName() : '',
  description: '',
  chunkingConfig: {
    tableMetadataInstructions: '',
  },
  modelConfig: {
    llmModelId: settingsStore.getConsumerSceneModel('rag').trim(),
  },
  indexingStrategy: {
    vectorEnabled: true,
    keywordEnabled: true,
    wikiEnabled: true,
    graphEnabled: true,
  },
  wikiConfig: {
    extractionGranularity: 'standard' as 'focused' | 'standard' | 'exhaustive',
    contentInstructions: '',
    extractionInstructions: '',
  },
  questionGenerationConfig: {
    enabled: true,
    questionCount: 3,
    customInstructions: ''
  },
  autoTagConfig: {
    enabled: false,
    modelId: authStore.isLiteMode ? LITE_AUTO_TAG_MODEL_ID : '',
    maxTags: 3,
    skipIfTagged: true
  },
})

const consumerSceneModelsForCreate = () => {
  const payload: Record<string, unknown> = {}
  const rag = settingsStore.getConsumerSceneModel('rag').trim()
  const wiki = settingsStore.getConsumerSceneModel('wiki').trim()
  const vision = settingsStore.getConsumerSceneModel('vision').trim()
  const asr = settingsStore.getConsumerSceneModel('asr').trim()

  if (rag) payload.summary_model_id = rag
  if (wiki) payload.wiki_config = { synthesis_model_id: wiki }
  if (vision) payload.vlm_config = { enabled: true, model_id: vision }
  if (asr) payload.asr_config = { enabled: true, model_id: asr }

  return payload
}

// 加载所有模型
const loadAllModels = async (force = false) => {
  try {
    await chatResources.ensureModels(force)
    allModels.value = chatResources.allModels || []
    applyDefaultModelsIfEmpty()
  } catch (error) {
    console.error('Failed to load model list:', error)
    MessagePlugin.error(t('knowledgeEditor.messages.loadModelsFailed'))
    allModels.value = []
  }
}

const loadSummaryModelOptions = async (force = false) => {
  if (!authStore.isLiteMode) {
    await loadAllModels(force)
    return
  }

  allModels.value = []
  try {
    await chatResources.ensureConsumerSceneOptions('rag', force)
    if (editorMode.value === 'create' && formData.value) {
      const response = chatResources.consumerSceneOptions.rag
      formData.value.modelConfig.llmModelId = resolveConsumerSceneCandidate(
        response?.options || [],
        formData.value.modelConfig.llmModelId,
        response?.effective_model_id,
      )
    }
  } catch (error) {
    console.error('Failed to load summary model options:', error)
    MessagePlugin.error(t('knowledgeEditor.messages.loadModelsFailed'))
  }
}

// 加载知识库数据（编辑模式）
const loadKBData = async (kbIdOverride?: string) => {
  const kbId = kbIdOverride ?? activeKbId.value
  if (editorMode.value !== 'edit' || !kbId) return
  
  loading.value = true
  try {
    const [kbInfo, filesResult] = await Promise.all([
      getKnowledgeBaseById(kbId),
      listKnowledgeFiles(kbId, { page: 1, page_size: 1 })
    ])
    
    if (!kbInfo || !kbInfo.data) {
      throw new Error(t('knowledgeEditor.messages.notFound'))
    }

    const kb = kbInfo.data
    hasFiles.value = (filesResult as any)?.total > 0
    kbCreatorId.value = (kb as any).creator_id || ''
    kbTenantId.value = Number((kb as any).tenant_id || 0)

    // 设置表单数据
    const kbType = normalizeKnowledgeBaseType(kb.type)
    formData.value = {
      type: kbType,
      name: kb.name || '',
      description: kb.description || '',
      faqConfig: {
        indexMode: kb.faq_config?.index_mode || 'question_only',
        questionIndexMode: kb.faq_config?.question_index_mode || 'separate'
      },
      modelConfig: {
        llmModelId: kb.summary_model_id || '',
        embeddingModelId: kb.embedding_model_id || '',
        wikiSynthesisModelId: kb.wiki_config?.synthesis_model_id || ''
      },
      chunkingConfig: {
        chunkSize: kb.chunking_config?.chunk_size || 512,
        // Fallback only used when the loaded KB has no chunk_overlap stored.
        // Aligned with chunker.DefaultChunkOverlap on the backend.
        chunkOverlap: kb.chunking_config?.chunk_overlap || 80,
        separators: kb.chunking_config?.separators || ['\n\n', '\n', '。', '！', '？', ';', '；'],
        parserEngineRules: kb.chunking_config?.parser_engine_rules || undefined,
        enableParentChild: kb.chunking_config?.enable_parent_child || false,
        parentChunkSize: kb.chunking_config?.parent_chunk_size || 4096,
        childChunkSize: kb.chunking_config?.child_chunk_size || 384,
        // Existing KBs without strategy field render as empty (= legacy behavior).
        // The user has to actively pick a value to opt in to the new tiers.
        strategy: kb.chunking_config?.strategy || '',
        tokenLimit: kb.chunking_config?.token_limit || 0,
        languages: kb.chunking_config?.languages || [],
        tableMetadataInstructions: kb.chunking_config?.table_metadata_instructions || ''
      },
      storageBackendId: (kb.storage_backend_id || '') as string,
      storageProvider: (kb.storage_provider_config?.provider || kb.storage_config?.provider || 'local') as string,
      multimodalConfig: {
        enabled: !!kb.vlm_config?.enabled,
        vllmModelId: kb.vlm_config?.model_id || '',
        descriptionLanguage: kb.vlm_config?.description_language || '',
        customInstructions: kb.vlm_config?.custom_instructions || ''
      },
      asrConfig: {
        enabled: !!kb.asr_config?.enabled,
        modelId: kb.asr_config?.model_id || '',
        language: kb.asr_config?.language || ''
      },
      nodeExtractConfig: {
        enabled: kb.extract_config?.enabled || false,
        text: kb.extract_config?.text || '',
        tags: kb.extract_config?.tags || [],
        nodes: (kb.extract_config?.nodes || []).map((node: any) => ({
          name: node.name,
          attributes: node.attributes || []
        })),
        relations: kb.extract_config?.relations || [],
        customInstructions: kb.extract_config?.custom_instructions || ''
      },
      questionGenerationConfig: {
        enabled: kb.question_generation_config?.enabled || false,
        questionCount: kb.question_generation_config?.question_count || 3,
        customInstructions: kb.question_generation_config?.custom_instructions || ''
      },
      autoTagConfig: {
        enabled: kb.auto_tag_config?.enabled || false,
        modelId: authStore.isLiteMode
          ? LITE_AUTO_TAG_MODEL_ID
          : (kb.auto_tag_config?.model_id || ''),
        maxTags: authStore.isLiteMode ? 3 : (kb.auto_tag_config?.max_tags || 3),
        skipIfTagged: authStore.isLiteMode
          ? true
          : (kb.auto_tag_config?.skip_if_tagged ?? true)
      },
      wikiConfig: {
        synthesisModelId: kb.wiki_config?.synthesis_model_id || '',
        maxPagesPerIngest: kb.wiki_config?.max_pages_per_ingest || 0,
        extractionGranularity: (
          kb.wiki_config?.extraction_granularity === 'focused' ||
          kb.wiki_config?.extraction_granularity === 'exhaustive'
            ? kb.wiki_config.extraction_granularity
            : 'standard'
        ) as 'focused' | 'standard' | 'exhaustive',
        contentInstructions: kb.wiki_config?.content_instructions || '',
        extractionInstructions: kb.wiki_config?.extraction_instructions || '',
      },
      indexingStrategy: {
        vectorEnabled: kb.indexing_strategy?.vector_enabled ?? true,
        keywordEnabled: kb.indexing_strategy?.keyword_enabled ?? true,
        wikiEnabled: kb.indexing_strategy?.wiki_enabled ?? false,
        graphEnabled: kb.indexing_strategy?.graph_enabled ?? false,
      },
      // Vector-store binding. vectorStoreId is editor-only state; it
      // is only included in the create request, never the update
      // request, because the binding is immutable after creation.
      // vectorStoreInfo carries the read-only display fields that the
      // edit view renders below; they come straight from the KB
      // response.
      vectorStoreId: '',
      vectorStoreInfo: {
        source: kb.vector_store_source,
        name: kb.vector_store_name,
        engineType: kb.vector_store_engine_type,
        status: kb.vector_store_status,
      },
    }
    initialStorageProvider.value = formData.value.storageProvider
  } catch (error) {
    console.error('Failed to load knowledge base data:', error)
    MessagePlugin.error(t('knowledgeEditor.messages.loadDataFailed'))
    handleClose()
  } finally {
    loading.value = false
  }
}

// 处理配置更新
const handleModelConfigUpdate = (config: any) => {
  if (formData.value) {
    formData.value.modelConfig = { ...config }
  }
}

// 粒度选择器：从 formData.wikiConfig 读出并规范化，未知值回退到 'standard'，
// 与后端 WikiExtractionGranularity.Normalize() 的契约保持一致。
const resolvedGranularity = computed<'focused' | 'standard' | 'exhaustive'>(() => {
  const g = formData.value?.wikiConfig?.extractionGranularity
  if (g === 'focused' || g === 'standard' || g === 'exhaustive') {
    return g
  }
  return 'standard'
})

const granularityHint = computed<string>(() => {
  switch (resolvedGranularity.value) {
    case 'focused':
      return t('knowledgeEditor.wiki.granularityFocusedHint')
    case 'exhaustive':
      return t('knowledgeEditor.wiki.granularityExhaustiveHint')
    default:
      return t('knowledgeEditor.wiki.granularityStandardHint')
  }
})

const handleGranularityChange = (value: string | number | boolean) => {
  if (!formData.value) return
  const next: 'focused' | 'standard' | 'exhaustive' =
    value === 'focused' || value === 'exhaustive'
      ? (value as 'focused' | 'exhaustive')
      : 'standard'
  formData.value.wikiConfig = {
    ...formData.value.wikiConfig,
    extractionGranularity: next,
  }
}

const isIndexingLocked = computed(() => editorMode.value === 'edit' && hasFiles.value)

const handleVectorIndexingChange = (value: string | number | boolean) => {
  if (!formData.value) return
  const enabled = value === true
  formData.value.indexingStrategy.vectorEnabled = enabled
  formData.value.indexingStrategy.keywordEnabled = enabled
}

const handleChunkingConfigUpdate = (config: any) => {
  if (formData.value) {
    formData.value.chunkingConfig = { ...config }
    // 用户已经手动触达分块设置，后续索引策略切换不再覆盖这些值
    chunkingDirty.value = true
  }
}

// 判断当前是否为「仅 Wiki 索引」：只开了 Wiki，关了向量/关键词检索
const isWikiOnlyStrategy = computed(() => {
  const s = formData.value?.indexingStrategy
  if (!s) return false
  return !!s.wikiEnabled && !s.vectorEnabled && !s.keywordEnabled
})

// 仅在创建模式、用户未改过分块设置时，随索引策略自动应用/撤销 Wiki-only 预设。
// 编辑模式严格保持后端已有配置不变，避免误改。
watch(isWikiOnlyStrategy, (wikiOnly) => {
  if (editorMode.value !== 'create') return
  if (!formData.value) return
  if (chunkingDirty.value) return
  const preset = wikiOnly ? WIKI_ONLY_CHUNKING_PRESET : DEFAULT_CHUNKING_PRESET
  formData.value.chunkingConfig = {
    ...formData.value.chunkingConfig,
    ...preset,
  }
})

const handleParserEngineRulesUpdate = (rules: any[]) => {
  if (formData.value) {
    formData.value.chunkingConfig.parserEngineRules = rules?.length ? rules : undefined
  }
}

const handleMultimodalToggle = () => {
  if (formData.value && !formData.value.multimodalConfig.enabled) {
    formData.value.multimodalConfig.vllmModelId = ''
  }
}

const handleMultimodalVLLMChange = (modelId: string) => {
  if (formData.value) {
    formData.value.multimodalConfig.vllmModelId = modelId
  }
}

const handleAddVLLMModel = () => {
  uiStore.openSettings('models', 'vllm')
}

const handleAddASRModel = () => {
  uiStore.openSettings('models', 'asr')
}

const handleAddWikiModel = () => {
  uiStore.openSettings('models', 'knowledgeqa')
}

const handleStorageProviderUpdate = (value: string) => {
  if (formData.value) {
    formData.value.storageProvider = editorMode.value === 'create'
      ? editorResources.resolveUsableStorageProvider(value || tenantDefaultStorageProvider.value)
      : (value || tenantDefaultStorageProvider.value || 'local')
  }
}

const handleStorageBackendUpdate = (value: string) => {
  if (formData.value) {
    formData.value.storageBackendId = value
  }
}

async function loadTenantDefaultStorageProvider(force = false) {
  try {
    await editorResources.ensureStorageEngine(force)
    tenantDefaultStorageProvider.value = editorResources.resolveUsableStorageProvider(
      editorResources.storageConfig?.default_provider,
    )
  } catch {
    tenantDefaultStorageProvider.value = editorResources.resolveUsableStorageProvider()
  }
}

/** Resolved storage provider for create payload (never silently default to local before tenant config loads). */
function resolvedStorageProvider(): string {
  const explicit = formData.value?.storageProvider?.trim()
  if (editorMode.value === 'create') {
    return editorResources.resolveUsableStorageProvider(explicit || tenantDefaultStorageProvider.value)
  }
  if (explicit) return explicit
  return tenantDefaultStorageProvider.value || 'local'
}

const handleVectorStoreIdUpdate = (id: string) => {
  if (formData.value) {
    // Empty string here means "use system default" (env-store fallback).
    // The create-payload assembly below converts this back to `omit` so
    // the backend stores NULL — keeping the wire shape identical to
    // pre-Phase-2 clients.
    formData.value.vectorStoreId = id || ''
  }
}

const handleQuestionGenerationUpdate = (config: any) => {
  if (formData.value) {
    formData.value.questionGenerationConfig = { ...config }
  }
}

const handleNodeExtractUpdate = (config: any) => {
  if (formData.value) {
    formData.value.nodeExtractConfig = { ...config }
  }
}

// 验证表单
const validateForm = (): boolean => {
  if (!formData.value) return false

  // 验证基本信息
  if (!formData.value.name || !formData.value.name.trim()) {
    MessagePlugin.warning(t('knowledgeEditor.messages.nameRequired'))
    currentSection.value = 'basic'
    return false
  }

  // Consumer document libraries expose RAG and Wiki as their only selectable
  // indexing strategies. Graph stays platform-owned and hidden, so it must
  // never make an otherwise unconfigured create request appear valid.
  if (authStore.isLiteMode && normalizeKnowledgeBaseType(formData.value.type) === 'document') {
    const s = formData.value.indexingStrategy
    if (!s || (!s.vectorEnabled && !s.keywordEnabled && !s.wikiEnabled)) {
      MessagePlugin.warning(t('knowledgeEditor.indexing.atLeastOne'))
      currentSection.value = 'basic'
      return false
    }
  }

  // Lite edits only carry outcome-level fields; model, vector, parser,
  // multimodal, chunking, and storage validation stay server-owned.
  if (authStore.isLiteMode) return true

  // Creation is server-owned zero configuration. The client may forward the
  // four persisted scene candidates during submit, but does not require any
  // edit-only model/settings validation while opening the modal.
  if (editorMode.value === 'create') return true

  // 验证模型配置 - embedding 模型仅在检索索引启用时必须
  const needsEmbedding = formData.value.indexingStrategy?.vectorEnabled || formData.value.indexingStrategy?.keywordEnabled
  if (needsEmbedding && !formData.value.modelConfig.embeddingModelId) {
    MessagePlugin.warning(t('knowledgeEditor.indexing.embeddingRequired'))
    currentSection.value = 'models'
    return false
  }

  if (!formData.value.modelConfig.llmModelId) {
    MessagePlugin.warning(t('knowledgeEditor.messages.summaryRequired'))
    currentSection.value = 'models'
    return false
  }

  // 验证多模态配置（如果启用）
  if (formData.value.multimodalConfig.enabled && !formData.value.multimodalConfig.vllmModelId) {
    MessagePlugin.warning(t('knowledgeEditor.messages.multimodalInvalid'))
    currentSection.value = 'multimodal'
    return false
  }

  if (normalizeKnowledgeBaseType(formData.value.type) === 'faq' && !formData.value.faqConfig?.indexMode) {
    MessagePlugin.warning(t('knowledgeEditor.messages.indexModeRequired'))
    currentSection.value = 'faq'
    return false
  }

  return true
}

// 构建提交数据
const buildSubmitData = () => {
  if (!formData.value) return null

  const data: any = {
    name: formData.value.name,
    description: formData.value.description,
    type: normalizeKnowledgeBaseType(formData.value.type),
    chunking_config: {
      chunk_size: formData.value.chunkingConfig.chunkSize,
      chunk_overlap: formData.value.chunkingConfig.chunkOverlap,
      separators: formData.value.chunkingConfig.separators,
      enable_parent_child: formData.value.chunkingConfig.enableParentChild,
      parent_chunk_size: formData.value.chunkingConfig.parentChunkSize,
      child_chunk_size: formData.value.chunkingConfig.childChunkSize,
      // Adaptive chunking fields are always sent (empty/zero values
      // included) so the user can clear them — backend uses pointer DTOs
      // to distinguish "not in payload" from "explicitly empty".
      strategy: formData.value.chunkingConfig.strategy ?? '',
      token_limit: formData.value.chunkingConfig.tokenLimit ?? 0,
      languages: formData.value.chunkingConfig.languages ?? [],
      table_metadata_instructions: formData.value.chunkingConfig.tableMetadataInstructions || '',
      ...(formData.value.chunkingConfig.parserEngineRules?.length
        ? { parser_engine_rules: formData.value.chunkingConfig.parserEngineRules }
        : {})
    },
    embedding_model_id: formData.value.modelConfig.embeddingModelId,
    summary_model_id: formData.value.modelConfig.llmModelId
  }

  // Vector-store binding. Only attach the field when the user actively
  // selected a non-default store. The server treats an empty string as
  // NULL, but keeping the field absent on the wire matches what a
  // client that doesn't know about this binding would send — which
  // makes A/B response diffs easier to read.
  if (formData.value.vectorStoreId) {
    data.vector_store_id = formData.value.vectorStoreId
  }

  // 添加多模态配置
  data.vlm_config = {
    enabled: formData.value.multimodalConfig.enabled,
    model_id: formData.value.multimodalConfig.enabled
      ? (formData.value.multimodalConfig.vllmModelId || '')
      : '',
    description_language: formData.value.multimodalConfig.descriptionLanguage || '',
    custom_instructions: formData.value.multimodalConfig.customInstructions || ''
  }

  // 添加ASR语音识别配置
  data.asr_config = {
    enabled: formData.value.asrConfig?.enabled || false,
    model_id: formData.value.asrConfig?.enabled
      ? (formData.value.asrConfig?.modelId || '')
      : '',
    language: formData.value.asrConfig?.language || ''
  }

  // storage_backend_id is authoritative. Keep provider projection for old clients
  // and for rolling upgrades where a node has not picked up the new schema yet.
  if (formData.value.storageBackendId) {
    data.storage_backend_id = formData.value.storageBackendId
  }
  const storageProvider = resolvedStorageProvider()
  data.storage_provider_config = {
    provider: storageProvider
  }
  data.storage_config = {
    provider: storageProvider
  }

  // 添加知识图谱配置 — now synced via indexingStrategy.graphEnabled
  // extract_config is sent below along with indexing_strategy

  // 添加问题生成配置
  if (formData.value.questionGenerationConfig?.enabled) {
    data.question_generation_config = {
      enabled: true,
      question_count: formData.value.questionGenerationConfig.questionCount || 3,
      custom_instructions: formData.value.questionGenerationConfig.customInstructions || ''
    }
  } else {
    data.question_generation_config = {
      enabled: false,
      question_count: 3,
      custom_instructions: formData.value.questionGenerationConfig?.customInstructions || ''
    }
  }

  data.auto_tag_config = authStore.isLiteMode
    ? {
        enabled: formData.value.autoTagConfig?.enabled || false,
        model_id: LITE_AUTO_TAG_MODEL_ID,
        max_tags: 3,
        skip_if_tagged: true,
      }
    : {
        enabled: formData.value.autoTagConfig?.enabled || false,
        model_id: formData.value.autoTagConfig?.modelId || '',
        max_tags: formData.value.autoTagConfig?.maxTags || 3,
        skip_if_tagged: formData.value.autoTagConfig?.skipIfTagged ?? true,
      }

  if (normalizeKnowledgeBaseType(formData.value.type) === 'faq') {
    data.faq_config = {
      index_mode: formData.value.faqConfig?.indexMode || 'question_only',
      question_index_mode: formData.value.faqConfig?.questionIndexMode || 'separate'
    }
  }

  // Wiki enablement is carried solely by indexing_strategy.wiki_enabled.
  // wiki_config only holds wiki-specific tunables.
  if (normalizeKnowledgeBaseType(formData.value.type) !== 'faq') {
    data.wiki_config = {
      synthesis_model_id: formData.value.modelConfig?.wikiSynthesisModelId || '',
      max_pages_per_ingest: formData.value.wikiConfig?.maxPagesPerIngest || 0,
      extraction_granularity: formData.value.wikiConfig?.extractionGranularity || 'standard',
      content_instructions: formData.value.wikiConfig?.contentInstructions || '',
      extraction_instructions: formData.value.wikiConfig?.extractionInstructions || '',
    }
  }

  // Send indexing strategy
  if (normalizeKnowledgeBaseType(formData.value.type) !== 'faq') {
    data.indexing_strategy = {
      vector_enabled: formData.value.indexingStrategy?.vectorEnabled ?? true,
      keyword_enabled: formData.value.indexingStrategy?.keywordEnabled ?? true,
      wiki_enabled: formData.value.indexingStrategy?.wikiEnabled ?? false,
      graph_enabled: formData.value.indexingStrategy?.graphEnabled ?? false,
    }
  }

  // Always persist extract_config so the toggle state from GraphSettings is saved,
  // regardless of whether the graph indexing strategy is currently enabled.
  if (formData.value.nodeExtractConfig) {
    data.extract_config = {
      enabled: !!formData.value.nodeExtractConfig.enabled,
      text: formData.value.nodeExtractConfig.text || '',
      tags: formData.value.nodeExtractConfig.tags || [],
      nodes: formData.value.nodeExtractConfig.nodes || [],
      relations: formData.value.nodeExtractConfig.relations || [],
      custom_instructions: formData.value.nodeExtractConfig.customInstructions || ''
    }
  }

  return data
}

// 提交表单
const handleSubmit = async () => {
  if (!validateForm()) {
    return
  }

  // 编辑模式下，若已有文件且存储引擎发生了变化，弹窗确认
  if (
    editorMode.value === 'edit' &&
    hasFiles.value &&
    formData.value &&
    initialStorageProvider.value &&
    formData.value.storageProvider !== initialStorageProvider.value
  ) {
    const dialog = DialogPlugin.confirm({
      header: t('common.confirm'),
      body: t('knowledgeEditor.messages.storageChangeConfirm'),
      confirmBtn: t('common.confirm'),
      cancelBtn: t('common.cancel'),
      onConfirm: () => {
        dialog.destroy()
        doSubmit()
      },
      onCancel: () => {
        dialog.destroy()
      },
    })
    return
  }

  doSubmit()
}

const doSubmit = async () => {
  saving.value = true
  try {
    if (editorMode.value === 'create') {
      const sceneModels = consumerSceneModelsForCreate()
      const createPayload: any = {
        name: formData.value.name.trim(),
        description: formData.value.description.trim(),
        type: normalizeKnowledgeBaseType(formData.value.type),
        ...sceneModels,
        summary_model_id: formData.value.modelConfig.llmModelId.trim()
          || String(sceneModels.summary_model_id || ''),
      }
      if (normalizeKnowledgeBaseType(formData.value.type) === 'faq') {
        // FAQ is a distinct native knowledge-base type. Do not leak the
        // document-only Wiki/VLM/ASR scene configuration into its create
        // request, and preserve the native FAQ indexing choices.
        delete createPayload.wiki_config
        delete createPayload.vlm_config
        delete createPayload.asr_config
        createPayload.faq_config = {
          index_mode: formData.value.faqConfig?.indexMode || 'question_only',
          question_index_mode: formData.value.faqConfig?.questionIndexMode || 'separate',
        }
      } else {
        createPayload.indexing_strategy = {
          vector_enabled: !!formData.value.indexingStrategy.vectorEnabled,
          keyword_enabled: !!formData.value.indexingStrategy.keywordEnabled,
          wiki_enabled: !!formData.value.indexingStrategy.wikiEnabled,
          graph_enabled: true,
        }
        createPayload.wiki_config = {
          ...((sceneModels.wiki_config as Record<string, unknown>) || {}),
          extraction_granularity: formData.value.wikiConfig.extractionGranularity,
          content_instructions: formData.value.wikiConfig.contentInstructions.trim(),
          extraction_instructions: formData.value.wikiConfig.extractionInstructions.trim(),
        }
        createPayload.auto_tag_config = authStore.isLiteMode
          ? {
              enabled: formData.value.autoTagConfig?.enabled || false,
              model_id: LITE_AUTO_TAG_MODEL_ID,
              max_tags: 3,
              skip_if_tagged: true,
            }
          : {
              enabled: formData.value.autoTagConfig?.enabled || false,
              model_id: formData.value.autoTagConfig?.modelId || '',
              max_tags: formData.value.autoTagConfig?.maxTags || 3,
              skip_if_tagged: formData.value.autoTagConfig?.skipIfTagged ?? true,
            }
      }
      const result: any = await createKnowledgeBase(createPayload)
      if (!result.success || !result.data?.id) {
        throw new Error(result.message || t('knowledgeEditor.messages.createFailed'))
      }
      const createdKbId = result.data.id as string
      MessagePlugin.success(t('knowledgeEditor.messages.createSuccess'))
      markContextualGuideDone('kbCreate')
      emit('success', createdKbId)
      handleClose()
      return
    }

    const data = buildSubmitData()
    if (!data) {
      throw new Error(t('knowledgeEditor.messages.buildDataFailed'))
    }

    // 编辑模式：分别更新基本信息和配置
    const kbId = activeKbId.value
    if (!kbId) {
      throw new Error(t('knowledgeEditor.messages.missingId'))
    }

      // 1. 更新基本信息（名称、描述）和 FAQ/Wiki 配置
      const updateConfig: any = {}
      if (normalizeKnowledgeBaseType(formData.value.type) === 'faq' && formData.value.faqConfig) {
        updateConfig.faq_config = {
          index_mode: formData.value.faqConfig.indexMode || 'question_only',
          question_index_mode: formData.value.faqConfig.questionIndexMode || 'separate'
        }
      }
      if (formData.value.wikiConfig && normalizeKnowledgeBaseType(formData.value.type) !== 'faq') {
        updateConfig.wiki_config = {
          extraction_granularity: formData.value.wikiConfig.extractionGranularity || 'standard',
          content_instructions: formData.value.wikiConfig.contentInstructions || '',
          extraction_instructions: formData.value.wikiConfig.extractionInstructions || '',
        }
        if (!authStore.isLiteMode) {
          updateConfig.wiki_config.synthesis_model_id = formData.value.modelConfig?.wikiSynthesisModelId || ''
          updateConfig.wiki_config.max_pages_per_ingest = formData.value.wikiConfig.maxPagesPerIngest || 0
        }
      }
      if (normalizeKnowledgeBaseType(formData.value.type) !== 'faq') {
        updateConfig.auto_tag_config = data.auto_tag_config
        updateConfig.indexing_strategy = {
          vector_enabled: formData.value.indexingStrategy?.vectorEnabled ?? true,
          keyword_enabled: formData.value.indexingStrategy?.keywordEnabled ?? true,
          wiki_enabled: formData.value.indexingStrategy?.wikiEnabled ?? false,
        }
        if (!authStore.isLiteMode) {
          updateConfig.indexing_strategy.graph_enabled = formData.value.indexingStrategy?.graphEnabled ?? false
        }
      }
      await updateKnowledgeBase(kbId, {
        name: data.name,
        description: data.description,
        config: updateConfig
      })

      // 2. 更新完整配置（模型、分块、多模态、存储引擎、知识图谱等）
      const config: KBModelConfigRequest = {
        llmModelId: data.summary_model_id,
        embeddingModelId: data.embedding_model_id,
        vlm_config: data.vlm_config,
        asr_config: data.asr_config,
        documentSplitting: {
          chunkSize: data.chunking_config.chunk_size,
          chunkOverlap: data.chunking_config.chunk_overlap,
          separators: data.chunking_config.separators,
          parserEngineRules: data.chunking_config.parser_engine_rules || undefined,
          enableParentChild: data.chunking_config.enable_parent_child || false,
          parentChunkSize: data.chunking_config.parent_chunk_size || 4096,
          childChunkSize: data.chunking_config.child_chunk_size || 384,
          // Always send strategy / tokenLimit / languages — backend treats
          // empty/0/[] as a valid clear, so we must include them in the
          // payload to let users reset back to defaults.
          strategy: formData.value?.chunkingConfig.strategy ?? '',
          tokenLimit: formData.value?.chunkingConfig.tokenLimit ?? 0,
          languages: formData.value?.chunkingConfig.languages ?? [],
          tableMetadataInstructions: formData.value?.chunkingConfig.tableMetadataInstructions ?? ''
        },
        multimodal: {
          enabled: !!data.vlm_config?.enabled
        },
        storageBackendId: formData.value?.storageBackendId || '',
        storageProvider: data.storage_provider_config?.provider || data.storage_config?.provider || 'local',
        nodeExtract: {
          enabled: data.extract_config?.enabled || false,
          text: data.extract_config?.text || '',
          tags: data.extract_config?.tags || [],
          nodes: data.extract_config?.nodes || [],
          relations: data.extract_config?.relations || [],
          customInstructions: data.extract_config?.custom_instructions || ''
        },
        questionGeneration: {
          enabled: data.question_generation_config?.enabled || false,
          questionCount: data.question_generation_config?.question_count || 3,
          customInstructions: data.question_generation_config?.custom_instructions || ''
        }
      }

      // Lite's managed surface updates only the safe KB-level config above;
      // sending the hidden infrastructure payload would let stale browser
      // state overwrite server-owned defaults.
      if (!authStore.isLiteMode) {
        await updateKBConfig(kbId, config)
      }
      MessagePlugin.success(t('knowledgeEditor.messages.updateSuccess'))

    emit('success', kbId)
    handleClose()
  } catch (error: any) {
    console.error('Knowledge base operation failed:', error)
    const planErrorKey = consumerPlanErrorKeyFromError(error)
    if (planErrorKey) {
      showConsumerUpgradePrompt(String(t(planErrorKey)))
      return
    }
    // Vector-store-binding error codes from the server. Both indicate
    // the selected store cannot be used: 2200 is "the binding itself
    // is invalid" (e.g. unknown id, foreign tenant), 2201 is "the
    // store is currently unreachable". For either, swap in a localized
    // message and jump the user back to the Vector Store section so
    // they can pick a different store or fall back to the system
    // default.
    const code = error?.response?.data?.error?.code ?? error?.code
    if (code === 2200) {
      MessagePlugin.error(t('knowledgeEditor.errors.vectorStoreBindingInvalid'))
      currentSection.value = 'vectorStore'
    } else if (code === 2201) {
      MessagePlugin.error(t('knowledgeEditor.errors.vectorStoreUnavailable'))
      currentSection.value = 'vectorStore'
    } else {
      MessagePlugin.error(error?.message || t('common.operationFailed'))
    }
  } finally {
    saving.value = false
  }
}

// 重置所有状态
const resetState = () => {
  currentSection.value = 'basic'
  formData.value = null
  hasFiles.value = false
  initialStorageProvider.value = ''
  tenantDefaultStorageProvider.value = 'local'
  saving.value = false
  loading.value = false
  chunkingDirty.value = false
  kbCreatorId.value = ''
  kbTenantId.value = 0
}

// 关闭弹窗
const handleClose = () => {
  emit('update:visible', false)
  setTimeout(() => {
    resetState()
  }, 300)
}

// 监听弹窗打开/关闭
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    // 打开弹窗时，先重置状态
    resetState()
    
    if (props.mode === 'create') {
      currentSection.value = normalizeKnowledgeBaseSection(
        authStore.isLiteMode ? uiStore.kbEditorInitialSection : 'basic',
      )
      formData.value = initFormData(props.initialType || 'document')
      hasFiles.value = false
      await loadSummaryModelOptions()
      return
    }

    // Lite remains a single consumer form; never leave it on a hidden
    // Standard-only section when a stale deep-link is present.
    if (authStore.isLiteMode) {
      currentSection.value = normalizeKnowledgeBaseSection(uiStore.kbEditorInitialSection)
    } else if (uiStore.kbEditorInitialSection) {
      currentSection.value = uiStore.kbEditorInitialSection
    }

    await Promise.all([
      loadSummaryModelOptions(),
      loadTenantDefaultStorageProvider(),
    ])
    if (props.kbId) {
      await loadKBData()
    }
    // Keep stale deep-links from selecting a section that this KB/type does
    // not expose (for example a document-only section on an FAQ). This also
    // gives Lite a deterministic basic form when an old launcher hint leaks
    // through.
    if (!navItems.value.some((item) => item.key === currentSection.value)) {
      currentSection.value = 'basic'
    }
  } else {
    // 关闭弹窗时，延迟重置状态（等待动画结束）
    setTimeout(() => {
      resetState()
      currentSection.value = 'basic' // 重置为默认 section
    }, 300)
  }
})

// 监听全局设置弹窗关闭后刷新模型列表
watch(
  () => uiStore.showSettingsModal,
  async (visible, previous) => {
    if (!visible && previous && props.visible && editorMode.value !== 'create') {
      await loadSummaryModelOptions(true)
    }
  }
)
</script>

<style scoped lang="less">
.kb-config-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  box-sizing: border-box;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 50%);
  backdrop-filter: blur(4px);
}

.kb-config-modal {
  position: relative;
  width: min(672px, calc(100vw - 24px));
  max-width: 672px;
  max-height: 90dvh;
  min-width: 0;
  min-height: 0;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  color: #111827;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 25%);
}

.kb-config-header {
  flex: 0 0 auto;
  padding: 24px 32px 16px;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.kb-config-header__copy {
  min-width: 0;

  h2 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #111827;
    font-size: 18px;
    line-height: 28px;
    font-weight: 700;

    :deep(.t-icon) {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
      color: #1f2937;
      font-size: 20px;
    }
  }

  p {
    margin: 4px 0 0;
    color: #6b7280;
    font-size: 12px;
    line-height: 18px;
  }
}

.kb-config-close {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  padding: 5px;
  border: 1px solid rgb(229 231 235 / 90%);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #6b7280;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  cursor: pointer;
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease;

  &:hover {
    border-color: #d1d5db;
    background: #f3f4f6;
    color: #111827;
  }

  &:focus-visible {
    outline: 2px solid #9ca3af;
    outline-offset: 2px;
  }

  :deep(.t-icon) {
    width: 14px;
    height: 14px;
    font-size: 14px;
  }
}

.kb-config-loading {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-config-form {
  min-height: 0;
  padding: 20px 32px;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  overflow-x: hidden;
  color: #111827;
  font-size: 14px;
  line-height: 20px;
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}

.kb-config-nav {
  flex: 0 0 auto;
  margin: -4px -8px 4px;
  padding: 4px;
  border: 1px solid #f3f4f6;
  border-radius: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  background: #f9fafb;
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}

.kb-config-nav__item {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 7px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: #6b7280;
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease;

  :deep(.t-icon) {
    width: 14px;
    height: 14px;
    font-size: 14px;
  }

  &:hover {
    border-color: #e5e7eb;
    color: #111827;
  }

  &.is-active {
    border-color: #e5e7eb;
    background: #fff;
    color: #111827;
    box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  }
}

.kb-config-nav__badge {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #374151;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
}

.kb-config-section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.kb-config-field__hint {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 18px;
}

.kb-config-id-control {
  min-height: 40px;
  padding: 0 8px 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #f9fafb;
}

.kb-config-id-value {
  min-width: 0;
  overflow: hidden;
  color: #4b5563;
  font-family: var(--app-font-family-mono);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-config-id-copy {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #6b7280;
  cursor: pointer;

  &:hover {
    background: #f3f4f6;
    color: #111827;
  }

  :deep(.t-icon) {
    width: 14px;
    height: 14px;
    font-size: 14px;
  }
}

.kb-config-settings-group {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.kb-config-setting-row {
  min-width: 0;
  padding: 16px 0;
  border-bottom: 1px solid #f3f4f6;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;

  &:last-child {
    border-bottom: 0;
  }

  > :deep(.visual-model-selector),
  > :deep(.t-select),
  > :deep(.t-textarea) {
    flex: 0 1 280px;
    min-width: 220px;
  }
}

.kb-config-setting-row--vertical {
  flex-direction: column;
}

.kb-config-setting-info {
  min-width: 0;
  flex: 1 1 auto;

  label {
    display: block;
    color: #111827;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;
  }

  p {
    margin: 4px 0 0;
    color: #6b7280;
    font-size: 12px;
    line-height: 18px;
  }

  .is-required {
    color: #ef4444;
  }
}

.kb-config-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kb-config-field__heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    color: #111827;
    font-size: 14px;
    line-height: 20px;
    font-weight: 600;

    &.is-required::after {
      margin-left: 4px;
      color: #ef4444;
      content: '*';
    }
  }

  p {
    margin: 0;
    color: #6b7280;
    font-size: 12px;
    line-height: 18px;
  }
}

.kb-config-strategies {
  padding-top: 4px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.kb-config-strategy {
  min-width: 0;
  min-height: 104px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: #fff;
  color: #111827;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: none;
  transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;

  &:hover:not(:disabled) {
    border-color: #d1d5db;
  }

  &.is-selected {
    border-color: #111827;
    background: rgb(249 250 251 / 80%);
    box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  }

  &.is-disabled {
    opacity: .65;
    cursor: not-allowed;
  }
}

.kb-config-strategy__check {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: #fff;

  .is-selected & {
    border-color: #111827;
    background: #111827;
  }

  :deep(.t-icon) {
    width: 14px;
    height: 14px;
    font-size: 14px;
    font-weight: 700;
  }
}

.kb-config-strategy__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  strong {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #111827;
    font-size: 14px;
    line-height: 20px;
    font-weight: 700;
  }

  small {
    color: #6b7280;
    font-size: 12px;
    line-height: 19px;
    font-weight: 400;
  }
}

.kb-config-new-badge {
  min-height: 18px;
  padding: 1px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  background: #111827;
  color: #fff;
  font-size: 10px;
  line-height: 14px;
  font-weight: 700;
  letter-spacing: .04em;
}

.kb-config-locked-tip {
  margin: 0;
  color: #b45309;
  font-size: 12px;
  line-height: 18px;
}

.kb-config-granularity {
  width: fit-content;
  max-width: 100%;
  padding: 4px;
  border: 1px solid rgb(229 231 235 / 80%);
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  overflow-x: auto;
  background: #f3f4f6;

  button {
    flex: 0 0 auto;
    min-height: 30px;
    padding: 6px 16px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: #4b5563;
    font: inherit;
    font-size: 12px;
    line-height: 18px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: color 150ms ease, background-color 150ms ease, box-shadow 150ms ease;

    &:hover {
      color: #111827;
    }

    &.is-selected {
      background: #fff;
      color: #111827;
      box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
    }
  }
}

.kb-config-granularity__hint {
  margin: 0;
  color: #4b5563;
  font-size: 12px;
  line-height: 18px;
}

.kb-config-field :deep(.t-input) {
  width: 100%;
  min-height: 40px;
  border-color: #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  box-shadow: none;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.kb-config-field :deep(.t-select-input) {
  min-height: 36px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.kb-config-field :deep(.t-input:hover),
.kb-config-field :deep(.t-textarea__inner:hover) {
  border-color: #d1d5db;
}

.kb-config-field :deep(.t-input.t-is-focused),
.kb-config-field :deep(.t-textarea__inner:focus) {
  border-color: #9ca3af;
  box-shadow: 0 0 0 2px rgb(17 24 39 / 5%);
}

.kb-config-field :deep(.t-input__inner) {
  color: #111827;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
}

.kb-config-field :deep(.t-textarea__inner) {
  min-height: 92px;
  padding: 12px;
  border-color: #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #111827;
  box-shadow: none;
  font-size: 14px;
  line-height: 22px;
  resize: none;
}

.kb-config-textarea :deep(.t-textarea__info_wrapper) {
  display: none;
}

.kb-config-field :deep(input::placeholder),
.kb-config-field :deep(textarea::placeholder) {
  color: #9ca3af;
}

.kb-config-count {
  align-self: flex-end;
  color: #9ca3af;
  font-family: var(--app-font-family-mono);
  font-size: 12px;
  line-height: 16px;
}

.kb-config-summary-model :deep(.visual-model-selector) {
  width: 100%;
}

.kb-config-actions {
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.kb-config-button {
  min-height: 34px;
  padding: 8px 16px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease;

  &.is-secondary {
    border: 1px solid #e5e7eb;
    background: #fff;
    color: #374151;

    &:hover {
      background: #f9fafb;
    }
  }

  &.is-primary {
    padding-inline: 20px;
    border: 1px solid #111827;
    background: #111827;
    color: #fff;
    font-weight: 700;

    &:hover:not(:disabled) {
      border-color: #000;
      background: #000;
    }
  }

  &:disabled {
    opacity: .6;
    cursor: wait;
  }

  :deep(.t-icon) {
    width: 14px;
    height: 14px;
    font-size: 14px;
  }

  .is-spinning {
    animation: kb-config-spin .8s linear infinite;
  }
}

.kb-config-enter-active,
.kb-config-leave-active {
  transition: opacity 150ms ease;

  .kb-config-modal {
    transition: transform 150ms ease;
  }
}

.kb-config-enter-from,
.kb-config-leave-to {
  opacity: 0;

  .kb-config-modal {
    transform: scale(.95);
  }
}

@keyframes kb-config-spin {
  to { transform: rotate(360deg); }
}

@media (min-width: 640px) {
  .kb-config-overlay {
    padding: 16px;
  }
}

@media (max-width: 639px) {
  .kb-config-header {
    padding: 20px 24px 16px;
  }

  .kb-config-form {
    padding: 20px 24px;
  }

  .kb-config-strategies {
    grid-template-columns: 1fr;
  }

  .kb-config-nav {
    margin-inline: -4px;
  }

  .kb-config-setting-row {
    flex-direction: column;

    > :deep(.visual-model-selector),
    > :deep(.t-select),
    > :deep(.t-textarea) {
      width: 100%;
      min-width: 0;
      flex-basis: auto;
    }
  }
}

@media (max-width: 420px) {
  .kb-config-overlay {
    padding: 8px;
  }

  .kb-config-modal {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px);
    border-radius: 18px;
  }

  .kb-config-header,
  .kb-config-form {
    padding-inline: 18px;
  }

  .kb-config-granularity {
    width: 100%;

    button {
      min-width: 0;
      flex: 1 1 0;
      padding-inline: 10px;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .kb-config-close,
  .kb-config-strategy,
  .kb-config-granularity button,
  .kb-config-button,
  .kb-config-enter-active,
  .kb-config-leave-active,
  .kb-config-enter-active .kb-config-modal,
  .kb-config-leave-active .kb-config-modal {
    transition: none !important;
  }

  .kb-config-button .is-spinning {
    animation: none;
  }
}
</style>

<style lang="less">
:root[theme-mode="dark"] body .kb-config-modal {
  border-color: #27272a;
  background: #18181b;
  color: #f4f4f5;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 55%);
}

:root[theme-mode="dark"] body .kb-config-header {
  border-bottom-color: rgb(39 39 42 / 80%);
}

:root[theme-mode="dark"] body .kb-config-header__copy h2,
:root[theme-mode="dark"] body .kb-config-header__copy h2 .t-icon,
:root[theme-mode="dark"] body .kb-config-field,
:root[theme-mode="dark"] body .kb-config-field__heading label,
:root[theme-mode="dark"] body .kb-config-strategy__copy strong {
  color: #f4f4f5;
}

:root[theme-mode="dark"] body .kb-config-header__copy p,
:root[theme-mode="dark"] body .kb-config-field__heading p,
:root[theme-mode="dark"] body .kb-config-strategy__copy small,
:root[theme-mode="dark"] body .kb-config-granularity__hint {
  color: #a1a1aa;
}

:root[theme-mode="dark"] body .kb-config-close {
  border-color: #3f3f46;
  background: #27272a;
  color: #a1a1aa;
}

:root[theme-mode="dark"] body .kb-config-close:hover {
  border-color: #52525b;
  background: #3f3f46;
  color: #fff;
}

:root[theme-mode="dark"] body .kb-config-strategy {
  border-color: #27272a;
  background: #18181b;
  color: #f4f4f5;
}

:root[theme-mode="dark"] body .kb-config-strategy:hover:not(:disabled) {
  border-color: #3f3f46;
}

:root[theme-mode="dark"] body .kb-config-strategy.is-selected {
  border-color: #f4f4f5;
  background: rgb(39 39 42 / 60%);
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
}

:root[theme-mode="dark"] body .kb-config-strategy__check {
  border-color: #52525b;
  background: #27272a;
}

:root[theme-mode="dark"] body .kb-config-strategy.is-selected .kb-config-strategy__check {
  border-color: #f4f4f5;
  background: #f4f4f5;
  color: #18181b;
}

:root[theme-mode="dark"] body .kb-config-new-badge {
  background: #f4f4f5;
  color: #18181b;
}

:root[theme-mode="dark"] body .kb-config-locked-tip {
  color: #fbbf24;
}

:root[theme-mode="dark"] body .kb-config-granularity {
  border-color: rgb(63 63 70 / 80%);
  background: rgb(39 39 42 / 80%);
}

:root[theme-mode="dark"] body .kb-config-granularity button {
  color: #a1a1aa;
}

:root[theme-mode="dark"] body .kb-config-granularity button:hover,
:root[theme-mode="dark"] body .kb-config-granularity button.is-selected {
  color: #fff;
}

:root[theme-mode="dark"] body .kb-config-granularity button.is-selected {
  background: #3f3f46;
  box-shadow: 0 1px 2px rgb(0 0 0 / 30%);
}

:root[theme-mode="dark"] body .kb-config-field .t-input,
:root[theme-mode="dark"] body .kb-config-field .t-textarea__inner {
  border-color: #3f3f46;
  background: #27272a;
  color: #f4f4f5;
}
:root[theme-mode="dark"] body .kb-config-field .t-select-input {
  min-height: 36px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
:root[theme-mode="dark"] body .kb-config-field .t-select-input .t-input {
  border-color: #3f3f46;
  background: #27272a;
  color: #f4f4f5;
}

:root[theme-mode="dark"] body .kb-config-field .t-input:hover,
:root[theme-mode="dark"] body .kb-config-field .t-textarea__inner:hover {
  border-color: #52525b;
}

:root[theme-mode="dark"] body .kb-config-field .t-input.t-is-focused,
:root[theme-mode="dark"] body .kb-config-field .t-textarea__inner:focus {
  border-color: #a1a1aa;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 6%);
}
:root[theme-mode="dark"] body .kb-config-field .t-select-input:hover .t-input,
:root[theme-mode="dark"] body .kb-config-field .t-select-input.t-is-focused .t-input {
  border-color: #a1a1aa;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 8%);
}

:root[theme-mode="dark"] body .kb-config-field .t-input__inner,
:root[theme-mode="dark"] body .kb-config-field input,
:root[theme-mode="dark"] body .kb-config-field textarea {
  color: #f4f4f5;
  caret-color: #f4f4f5;
}

:root[theme-mode="dark"] body .kb-config-field input::placeholder,
:root[theme-mode="dark"] body .kb-config-field textarea::placeholder {
  color: #71717a;
}

:root[theme-mode="dark"] body .kb-config-count {
  color: #71717a;
}

:root[theme-mode="dark"] body .kb-config-summary-model .visual-model-selector__control .t-input {
  border-color: #3f3f46 !important;
  background: #27272a !important;
  color: #f4f4f5 !important;
}

:root[theme-mode="dark"] body .kb-config-summary-model .visual-model-selector__control .t-input:hover,
:root[theme-mode="dark"] body .kb-config-summary-model .visual-model-selector__control .t-input.t-is-focused {
  border-color: #71717a !important;
  background: #27272a !important;
}

:root[theme-mode="dark"] body .kb-config-summary-model .visual-model-selector__control .t-input__inner,
:root[theme-mode="dark"] body .kb-config-summary-model .visual-model-selector__control .t-icon {
  color: #f4f4f5 !important;
}

:root[theme-mode="dark"] body .kb-config-actions {
  border-top-color: #27272a;
}

:root[theme-mode="dark"] body .kb-config-nav {
  border-color: #27272a;
  background: #18181b;
}

:root[theme-mode="dark"] body .kb-config-nav__item {
  color: #a1a1aa;
}

:root[theme-mode="dark"] body .kb-config-nav__item:hover,
:root[theme-mode="dark"] body .kb-config-nav__item.is-active {
  border-color: #3f3f46;
  background: #27272a;
  color: #fff;
}

:root[theme-mode="dark"] body .kb-config-nav__badge {
  background: #3f3f46;
  color: #e4e4e7;
}

:root[theme-mode="dark"] body .kb-config-setting-row {
  border-bottom-color: #27272a;
}

:root[theme-mode="dark"] body .kb-config-setting-info label {
  color: #f4f4f5;
}

:root[theme-mode="dark"] body .kb-config-setting-info p,
:root[theme-mode="dark"] body .kb-config-field__hint {
  color: #a1a1aa;
}

:root[theme-mode="dark"] body .kb-config-id-control {
  border-color: #3f3f46;
  background: #27272a;
}

:root[theme-mode="dark"] body .kb-config-id-value {
  color: #d4d4d8;
}

:root[theme-mode="dark"] body .kb-config-id-copy {
  border-color: #3f3f46;
  background: #18181b;
  color: #a1a1aa;
}

:root[theme-mode="dark"] body .kb-config-id-copy:hover {
  background: #3f3f46;
  color: #fff;
}

:root[theme-mode="dark"] body .kb-config-button.is-secondary {
  border-color: #3f3f46;
  background: #18181b;
  color: #d4d4d8;
}

:root[theme-mode="dark"] body .kb-config-button.is-secondary:hover {
  background: #27272a;
}

:root[theme-mode="dark"] body .kb-config-button.is-primary {
  border-color: #f4f4f5;
  background: #f4f4f5;
  color: #18181b;
}

:root[theme-mode="dark"] body .kb-config-button.is-primary:hover:not(:disabled) {
  border-color: #fff;
  background: #fff;
}
</style>

<style lang="less">
/*
 * The knowledge editor intentionally delegates modal geometry, navigation,
 * focus management, responsive behavior and footer layout to the same Musuw
 * shell as Settings and AgentEditor. Only domain-specific scrolling remains.
 */
.kb-settings-content > .visual-settings-content__inner {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.kb-settings-scroll {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 32px;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}

.kb-settings-loading {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-settings-scroll .kb-config-section {
  width: 100%;
  min-width: 0;
}

.kb-settings-scroll .setting-row-vertical {
  align-items: stretch !important;
  flex-direction: column !important;
  gap: 12px !important;
}

.kb-settings-scroll .kb-settings-textarea {
  max-width: none !important;
  align-items: stretch !important;
  flex-direction: column;
  gap: 4px;
}

.kb-settings-scroll .kb-settings-textarea .t-textarea,
.kb-settings-scroll .kb-settings-textarea .t-textarea__inner,
.kb-settings-scroll .kb-config-id-control {
  width: 100%;
}

.kb-settings-scroll .kb-settings-hint {
  margin-top: 4px !important;
}

.kb-settings-nav-badge {
  min-width: 16px;
  height: 16px;
  margin-left: auto;
  padding: 0 4px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 10px;
  line-height: 1;
}

@media (max-width: 560px) {
  .kb-settings-scroll {
    padding: 24px;
  }
}

:root[theme-mode="dark"] .kb-settings-nav-badge {
  background: #3f3f46;
  color: #d4d4d8;
}
</style>
