<template>
  <div
    class="kb-advanced-settings"
    :class="{
      'kb-advanced-settings--embedded': embedded,
      'kb-advanced-settings--consumer': consumerMode,
    }"
  >
    <div v-if="!embedded" class="section-header">
      <h2>{{ $t('knowledgeEditor.advanced.title') }}</h2>
      <p class="section-description">{{ $t('knowledgeEditor.advanced.description') }}</p>
    </div>

    <div class="settings-group">
      <!-- Question Generation feature (only useful for RAG indexing) -->
      <template v-if="!consumerMode && ragEnabled !== false">
      <div class="setting-row">
        <div class="setting-info">
          <label>{{ $t('knowledgeEditor.advanced.questionGeneration.label') }}</label>
          <p class="desc">{{ $t('knowledgeEditor.advanced.questionGeneration.description') }}</p>
        </div>
        <div class="setting-control">
          <t-switch
            v-model="localQuestionGeneration.enabled"
            @change="handleQuestionGenerationToggle"
            size="medium"
          />
        </div>
      </div>

      <!-- Question Generation configuration -->
      <div v-if="localQuestionGeneration.enabled" class="subsection">
        <div class="setting-row">
          <div class="setting-info">
            <label>{{ $t('knowledgeEditor.advanced.questionGeneration.countLabel') }}</label>
            <p class="desc">{{ $t('knowledgeEditor.advanced.questionGeneration.countDescription') }}</p>
          </div>
          <div class="setting-control">
            <t-input-number
              v-model="localQuestionGeneration.questionCount"
              :min="1"
              :max="10"
              :step="1"
              theme="normal"
              @change="handleQuestionGenerationChange"
              style="width: 120px;"
            />
          </div>
        </div>
        <div class="setting-row setting-row-vertical">
          <div class="setting-info">
            <label>{{ $t('knowledgeEditor.advanced.questionGeneration.instructionsLabel') }}</label>
            <p class="desc">{{ $t('knowledgeEditor.advanced.questionGeneration.instructionsDescription') }}</p>
          </div>
          <div class="setting-control">
            <t-textarea
              v-model="localQuestionGeneration.customInstructions"
              :placeholder="$t('knowledgeEditor.advanced.questionGeneration.instructionsPlaceholder')"
              :maxlength="4000"
              :autosize="{ minRows: 3, maxRows: 8 }"
              @change="handleQuestionGenerationChange"
            />
          </div>
        </div>
      </div>
      </template>

      <div class="setting-row">
        <div class="setting-info">
          <label>{{ $t('knowledgeEditor.advanced.autoTag.label') }}</label>
          <p class="desc">{{ $t('knowledgeEditor.advanced.autoTag.description') }}</p>
        </div>
        <div class="setting-control">
          <t-switch v-model="localAutoTag.enabled" size="medium" @change="emitAutoTag" />
        </div>
      </div>

      <div v-if="!consumerMode && localAutoTag.enabled" class="subsection">
        <div class="setting-row setting-row-vertical">
          <div class="setting-info">
            <label>{{ $t('knowledgeEditor.advanced.autoTag.modelLabel') }}</label>
            <p class="desc">{{ $t('knowledgeEditor.advanced.autoTag.modelDescription') }}</p>
          </div>
          <div class="setting-control">
            <ModelSelector
              model-type="KnowledgeQA"
              use-consumer-style
              :selected-model-id="localAutoTag.modelId"
              :all-models="allModels"
              clearable
              :placeholder="$t('knowledgeEditor.advanced.autoTag.modelPlaceholder')"
              @update:selected-model-id="(value: string) => { localAutoTag.modelId = value; emitAutoTag() }"
            />
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <label>{{ $t('knowledgeEditor.advanced.autoTag.maxTagsLabel') }}</label>
            <p class="desc">{{ $t('knowledgeEditor.advanced.autoTag.maxTagsDescription') }}</p>
          </div>
          <div class="setting-control">
            <t-input-number
              v-model="localAutoTag.maxTags"
              :min="1"
              :max="10"
              :step="1"
              theme="normal"
              style="width: 120px;"
              @change="emitAutoTag"
            />
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <label>{{ $t('knowledgeEditor.advanced.autoTag.skipIfTaggedLabel') }}</label>
            <p class="desc">{{ $t('knowledgeEditor.advanced.autoTag.skipIfTaggedDescription') }}</p>
          </div>
          <div class="setting-control">
            <t-switch v-model="localAutoTag.skipIfTagged" size="medium" @change="emitAutoTag" />
          </div>
        </div>
      </div>

      <div v-if="!consumerMode" class="setting-row setting-row-vertical">
        <div class="setting-info">
          <label>{{ $t('knowledgeEditor.advanced.tableMetadataInstructions.label') }}</label>
          <p class="desc">{{ $t('knowledgeEditor.advanced.tableMetadataInstructions.description') }}</p>
        </div>
        <div class="setting-control">
          <t-textarea
            :model-value="tableMetadataInstructions"
            :placeholder="$t('knowledgeEditor.advanced.tableMetadataInstructions.placeholder')"
            :maxlength="4000"
            :autosize="{ minRows: 3, maxRows: 8 }"
            @change="(value: string) => emit('update:tableMetadataInstructions', value)"
          />
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ModelSelector from '@/components/ModelSelector.vue'

interface QuestionGenerationConfig {
  enabled: boolean
  questionCount: number
  customInstructions?: string
}

interface AutoTagConfig {
  enabled: boolean
  modelId: string
  maxTags: number
  skipIfTagged: boolean
}

const LITE_AUTO_TAG_MODEL_ID = 'builtin-deepseek-v4-flash'

interface Props {
  questionGeneration?: QuestionGenerationConfig
  autoTag?: AutoTagConfig
  ragEnabled?: boolean
  allModels?: any[]
  embedded?: boolean
  /** Render only the managed consumer auto-tag switch. */
  consumerMode?: boolean
  tableMetadataInstructions?: string
}

const props = withDefaults(defineProps<Props>(), {
  embedded: false,
  consumerMode: false,
})

const emit = defineEmits<{
  'update:questionGeneration': [value: QuestionGenerationConfig]
  'update:autoTag': [value: AutoTagConfig]
  'update:tableMetadataInstructions': [value: string]
}>()

const localQuestionGeneration = ref<QuestionGenerationConfig>(
  props.questionGeneration
    ? { ...props.questionGeneration, customInstructions: props.questionGeneration.customInstructions || '' }
    : { enabled: false, questionCount: 3, customInstructions: '' }
)

const normalizeAutoTag = (value?: Partial<AutoTagConfig>): AutoTagConfig => ({
  enabled: Boolean(value?.enabled),
  modelId: props.consumerMode ? LITE_AUTO_TAG_MODEL_ID : (value?.modelId || ''),
  maxTags: props.consumerMode ? 3 : (value?.maxTags || 3),
  skipIfTagged: props.consumerMode ? true : (value?.skipIfTagged ?? true),
})

const localAutoTag = ref<AutoTagConfig>(normalizeAutoTag(props.autoTag))

watch(() => props.questionGeneration, (newVal) => {
  if (newVal) {
    localQuestionGeneration.value = { customInstructions: '', ...newVal }
  }
}, { deep: true })

watch(() => props.autoTag, (newVal) => {
  if (newVal) localAutoTag.value = normalizeAutoTag(newVal)
}, { deep: true })

watch(() => props.consumerMode, () => {
  localAutoTag.value = normalizeAutoTag(localAutoTag.value)
})

const emitAutoTag = () => {
  if (props.consumerMode) {
    localAutoTag.value = normalizeAutoTag(localAutoTag.value)
    emit('update:autoTag', { ...localAutoTag.value })
    return
  }
  if (!localAutoTag.value.maxTags) localAutoTag.value.maxTags = 3
  localAutoTag.value.maxTags = Math.min(10, Math.max(1, Math.trunc(localAutoTag.value.maxTags)))
  emit('update:autoTag', { ...localAutoTag.value })
}

const handleQuestionGenerationToggle = () => {
  if (!localQuestionGeneration.value.enabled) {
    localQuestionGeneration.value.questionCount = 3
  }
  emit('update:questionGeneration', localQuestionGeneration.value)
}

const handleQuestionGenerationChange = () => {
  emit('update:questionGeneration', localQuestionGeneration.value)
}
</script>

<style lang="less" scoped>
.kb-advanced-settings {
  width: 100%;
}

.section-header {
  margin-bottom: 20px;

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--td-text-color-primary);
    margin: 0 0 6px 0;
  }

  .section-description {
    font-size: 14px;
    color: var(--td-text-color-secondary);
    margin: 0;
    line-height: 1.5;
  }
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.setting-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 0;
  border-bottom: 1px solid var(--td-component-stroke);

  &:last-child {
    border-bottom: none;
  }
}

.setting-info {
  flex: 0 0 40%;
  max-width: 40%;
  padding-right: 24px;

  label {
    font-size: 15px;
    font-weight: 500;
    color: var(--td-text-color-primary);
    display: block;
    margin-bottom: 4px;
  }

  .desc {
    font-size: 13px;
    color: var(--td-text-color-secondary);
    margin: 0;
    line-height: 1.5;
  }

  .hint {
    font-size: 12px;
    color: var(--td-text-color-placeholder);
    margin: 6px 0 0 0;
    line-height: 1.5;
  }
}

.setting-control {
  flex: 0 0 55%;
  max-width: 55%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.setting-row-vertical {
  flex-direction: column;
  gap: 12px;

  .setting-info,
  .setting-control {
    flex: none;
    width: 100%;
    max-width: none;
    padding-right: 0;
  }

  .setting-control {
    display: block;
  }
}

.subsection {
  padding: 16px 20px;
  margin: 12px 0 0 0;
  background: var(--td-bg-color-container);
  border-radius: 8px;
  border-left: 3px solid var(--td-brand-color);
  position: relative;
}

.required {
  color: var(--td-error-color);
  margin-left: 2px;
  font-weight: 500;
}

.kb-advanced-settings--embedded {
  .setting-row {
    padding: 12px 0;
  }

  .setting-row:has(.t-switch) {
    flex-direction: row;
    align-items: center;
    gap: 16px;

    .setting-info {
      flex: 1;
      min-width: 0;
      max-width: none;
      padding-right: 0;
    }

    .setting-control {
      flex: none;
      align-self: center;
    }
  }

  .subsection .setting-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;

    .setting-info {
      flex: none;
      max-width: none;
      padding-right: 0;
    }

    .setting-control {
      align-self: flex-start;
    }
  }

  .subsection {
    margin-top: 0;
    padding: 0;
    border: none;
    background: none;
  }
}

// The consumer editor lives inside the existing `.kb-config-*` modal rather
// than the upstream settings shell.  Keep its one managed switch on the same
// compact row rhythm and typography as the surrounding Musuw form.
.kb-advanced-settings--consumer {
  .section-header {
    margin-bottom: 8px;

    h2 {
      margin-bottom: 2px;
      color: #111827;
      font-size: 16px;
      line-height: 24px;
      font-weight: 700;
    }

    .section-description {
      color: #9ca3af;
      font-size: 12px;
      line-height: 16px;
    }
  }

  .setting-row {
    min-height: 0;
    padding: 14px 0;
    border-bottom-color: #f3f4f6;
  }

  .setting-info {
    flex: 1 1 auto;
    max-width: none;
    padding-right: 20px;

    label {
      margin-bottom: 0;
      color: #111827;
      font-size: 14px;
      line-height: 20px;
      font-weight: 600;
    }

    .desc {
      margin-top: 4px;
      color: #6b7280;
      font-size: 12px;
      line-height: 18px;
    }
  }

  .setting-control {
    flex: 0 0 auto;
    max-width: none;
  }
}

:global(:root[theme-mode="dark"] .kb-advanced-settings--consumer) {
  .section-header h2,
  .setting-info label {
    color: #f4f4f5;
  }

  .section-header .section-description,
  .setting-info .desc {
    color: #a1a1aa;
  }

  .setting-row {
    border-bottom-color: #27272a;
  }
}

</style>
