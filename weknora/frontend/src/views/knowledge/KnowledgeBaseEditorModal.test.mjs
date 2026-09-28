import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./KnowledgeBaseEditorModal.vue', import.meta.url), 'utf8')
const en = readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8')
const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
const ru = readFileSync(new URL('../../i18n/locales/ru-RU.ts', import.meta.url), 'utf8')
const ko = readFileSync(new URL('../../i18n/locales/ko-KR.ts', import.meta.url), 'utf8')

test('editing a knowledge base closes the editor after a successful save', () => {
  assert.match(source, /emit\('success', kbId\)\s*handleClose\(\)/)
})

test('a successful configured create closes after using the native create contract', () => {
  const doSubmit = source.slice(
    source.indexOf('const doSubmit = async () => {'),
    source.indexOf('// 重置所有状态'),
  )
  const createBranch = doSubmit.match(
    /if \(editorMode\.value === 'create'\) \{([\s\S]*?)^\s{4}\}/m
  )?.[1]

  assert.ok(createBranch, 'expected to find the create branch')
  assert.match(createBranch, /handleClose\(\)/)
  assert.doesNotMatch(createBranch, /savedKbId\.value|loadKBData\(createdKbId\)/)
  assert.match(createBranch, /createPayload\.indexing_strategy =/)
  assert.match(createBranch, /createPayload\.wiki_config =/)
})

test('FAQ create preserves the native type and FAQ configuration contract', () => {
  const doSubmit = source.slice(
    source.indexOf('const doSubmit = async () => {'),
    source.indexOf('// 重置所有状态'),
  )
  assert.match(doSubmit, /type:\s*normalizeKnowledgeBaseType\(formData\.value\.type\)/)
  assert.match(
    doSubmit,
    /if \(normalizeKnowledgeBaseType\(formData\.value\.type\) === 'faq'\) \{[\s\S]*?createPayload\.faq_config = \{[\s\S]*?index_mode:[\s\S]*?question_index_mode:/,
  )
  assert.match(doSubmit, /else \{[\s\S]*?createPayload\.indexing_strategy = \{[\s\S]*?createPayload\.wiki_config = \{/)
})

test('document create requires a visible RAG or Wiki strategy before the zero-config return', () => {
  const validateForm = source.slice(
    source.indexOf('const validateForm = (): boolean => {'),
    source.indexOf('// 构建提交数据'),
  )
  const visibleStrategyGuard = validateForm.match(
    /if \(authStore\.isLiteMode && normalizeKnowledgeBaseType\(formData\.value\.type\) === 'document'\) \{([\s\S]*?)^\s{2}\}/m,
  )?.[0] ?? ''

  assert.match(visibleStrategyGuard, /!s\.vectorEnabled/)
  assert.match(visibleStrategyGuard, /!s\.keywordEnabled/)
  assert.match(visibleStrategyGuard, /!s\.wikiEnabled/)
  assert.doesNotMatch(visibleStrategyGuard, /graphEnabled/)
  assert.ok(
    validateForm.indexOf(visibleStrategyGuard) < validateForm.indexOf("if (editorMode.value === 'create') return true"),
    'visible strategy validation must run before create mode skips edit-only model validation',
  )
  assert.match(zh, /atLeastOne: '请至少选择 RAG 检索或 Wiki 知识库'/)
  assert.match(en, /atLeastOne: 'Select at least RAG retrieval or Wiki'/)
})

test('save button labels match the reference create and edit actions', () => {
  assert.match(
    source,
    /const saveButtonLabel = computed\(\(\) =>\s*editorMode\.value === 'create'\s*\? t\('knowledgeEditor\.buttons\.confirmCreate'\)\s*: t\('knowledgeEditor\.buttons\.save'\)\s*\)/
  )
})

test('create exposes native RAG, Wiki, Wiki instructions, and summary model while leaving embedding platform-owned', () => {
  // Main keeps the model-default helper for the full editor surface; Lite
  // create still forwards only the consumer scene choices below.
  assert.match(source, /applyDefaultModelsIfEmpty/)
  assert.doesNotMatch(source, /type ModelConfig/)
  assert.match(
    source,
    /const initFormData = \(type: 'document' \| 'faq' = 'document'\) => \(\{[\s\S]*indexingStrategy:[\s\S]*wikiConfig:[\s\S]*modelConfig:/,
  )

  const visibilityWatcher = source.slice(
    source.indexOf('watch(() => props.visible'),
    source.indexOf('// 监听全局设置弹窗关闭后刷新模型列表'),
  )
  const createOpenBranch = visibilityWatcher.match(
    /if \(props\.mode === 'create'\) \{([\s\S]*?)^\s{4}\}/m,
  )?.[1]
  assert.ok(createOpenBranch, 'expected the zero-config create open branch')
  assert.match(createOpenBranch, /loadSummaryModelOptions/)
  assert.doesNotMatch(createOpenBranch, /loadTenantDefaultStorageProvider/)

  assert.ok(source.includes('const consumerSceneModelsForCreate = () => {'))
  assert.match(source, /settingsStore\.getConsumerSceneModel\('rag'\)/)
  assert.match(source, /settingsStore\.getConsumerSceneModel\('wiki'\)/)
  assert.match(source, /settingsStore\.getConsumerSceneModel\('vision'\)/)
  assert.match(source, /settingsStore\.getConsumerSceneModel\('asr'\)/)
  assert.match(source, /payload\.summary_model_id = rag/)
  assert.match(source, /payload\.wiki_config = \{ synthesis_model_id: wiki \}/)
  assert.match(source, /payload\.vlm_config = \{ enabled: true, model_id: vision \}/)
  assert.match(source, /payload\.asr_config = \{ enabled: true, model_id: asr \}/)
  assert.doesNotMatch(source, /payload\.embedding_model_id/)
  assert.match(source, /data-guide="kb-create-indexing"/)
  assert.match(source, /v-model="formData\.wikiConfig\.contentInstructions"/)
  assert.match(source, /v-model="formData\.wikiConfig\.extractionInstructions"/)
  assert.match(source, /<KBModelConfig[\s\S]*:config="formData\.modelConfig"/)

  const settingsRefreshWatcher = source.slice(
    source.indexOf('watch(\n  () => uiStore.showSettingsModal'),
    source.indexOf('</script>'),
  )
  assert.match(settingsRefreshWatcher, /editorMode\.value !== 'create'/)
})

test('Wiki-only authoring controls stay hidden until Wiki indexing is enabled', () => {
  const template = source.slice(0, source.indexOf('<script setup'))

  for (const control of [
    'v-model="formData.wikiConfig.extractionGranularity"',
    'v-model="formData.wikiConfig.contentInstructions"',
    'v-model="formData.wikiConfig.extractionInstructions"',
  ]) {
    const controlIndex = template.indexOf(control)
    assert.ok(controlIndex >= 0, `expected Wiki control ${control}`)
    const sectionStart = template.lastIndexOf('<section', controlIndex)
    const sectionTagEnd = template.indexOf('>', sectionStart)
    const sectionTag = template.slice(sectionStart, sectionTagEnd + 1)
    assert.match(
      sectionTag,
      /v-if="!isFAQ && formData\.indexingStrategy\.wikiEnabled"/,
      `${control} must follow the native Wiki enablement contract`,
    )
  }
})

test('Lite knowledge-base creation keeps model choices managed and does not render selectors', () => {
  const template = source.slice(0, source.indexOf('<script setup'))
  const basic = template.slice(template.indexOf('class="kb-config-section"'), template.indexOf('<!-- Standard-tier settings'))
  assert.doesNotMatch(basic, /<ModelSelector/)
  assert.match(template, /<KBAdvancedSettings[\s\S]*?:consumer-mode="authStore\.isLiteMode"/)
  assert.doesNotMatch(source, /summaryModelSceneOptions/)
  assert.match(source, /chatResources\.ensureConsumerSceneOptions\('rag', force\)/)
})

test('create mode reuses native TDesign fields and API payload', () => {
  assert.match(source, /<form v-if="formData" class="kb-settings-scroll" @submit\.prevent="handleSubmit">/)
  assert.match(
    source,
    /<t-textarea[\s\S]*?v-model="formData\.description"[\s\S]*?:placeholder="\$t\('knowledgeEditor\.basic\.descriptionPlaceholder'\)"[\s\S]*?:maxlength="200"/,
  )
  assert.doesNotMatch(source, /visual-kb-create-textarea|<textarea/)
  assert.match(source, /const sceneModels = consumerSceneModelsForCreate\(\)[\s\S]*const createPayload:[\s\S]*name: formData\.value\.name\.trim\(\),[\s\S]*description: formData\.value\.description\.trim\(\),[\s\S]*\.\.\.sceneModels,[\s\S]*createPayload\.indexing_strategy =[\s\S]*createPayload\.wiki_config =[\s\S]*createKnowledgeBase\(createPayload\)/)
})

test('create dialog is a scrollable consumer settings modal with mobile-safe bounds', () => {
  assert.match(source, /<VisualSettingsShell[\s\S]*?:dialog-label="editorTitle"/)
  assert.match(source, /content-class="kb-settings-content"/)
  assert.match(source, /\.kb-settings-content > \.visual-settings-content__inner\s*\{[\s\S]*?overflow:\s*hidden;/)
  assert.match(source, /\.kb-settings-scroll\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow-y:\s*auto;/)
  assert.match(source, /@media \(max-width: 560px\)[\s\S]*?\.kb-settings-scroll\s*\{[\s\S]*?padding:\s*24px;/)
})

test('create and edit mechanically share the reference knowledge-base configuration surface', () => {
  const template = source.slice(0, source.indexOf('<script setup'))

  assert.match(template, /<VisualSettingsShell/)
  assert.match(template, /modal-class="kb-settings-shell"/)
  assert.match(template, /:dialog-label="editorTitle"/)
  assert.match(template, /knowledgeEditor\.modalDescription/)
  assert.match(template, /<form v-if="formData" class="kb-settings-scroll" @submit\.prevent="handleSubmit">/)
  assert.match(template, /class="visual-settings-nav__item"[\s\S]*currentSection === item\.key/)
  assert.match(template, /class="section-header"[\s\S]*class="settings-group"[\s\S]*class="setting-row"/)
  assert.doesNotMatch(template, /kb-config-overlay|kb-config-modal|kb-config-nav/)
  assert.doesNotMatch(template, /:autofocus="editorMode === 'create'"/)

  const orderedFields = [
    'data-guide="kb-create-indexing"',
    'v-model="formData.wikiConfig.extractionGranularity"',
    'v-model="formData.wikiConfig.contentInstructions"',
    'v-model="formData.wikiConfig.extractionInstructions"',
    'data-guide="kb-create-name"',
    'v-model="formData.description"',
  ]
  let previousIndex = -1
  for (const field of orderedFields) {
    const index = template.indexOf(field)
    assert.ok(index > previousIndex, `expected ${field} after the preceding reference field`)
    previousIndex = index
  }

  assert.match(source, /import VisualSettingsShell from '@\/views\/settings\/components\/VisualSettingsShell\.vue'/)
  assert.match(source, /\.kb-settings-scroll\s*\{[\s\S]*?padding:\s*32px;[\s\S]*?overflow-y:\s*auto;/)
  assert.match(template, /<template #footer>[\s\S]*?<t-button[^>]*variant="outline"[\s\S]*?<t-button[^>]*theme="primary"/)
  assert.match(template, /class="setting-control setting-control-full kb-settings-textarea"/)
})

test('consumer editor does not call the unimplemented whole-library rebuild endpoint', () => {
  assert.match(source, /const isIndexingLocked = computed\(\(\) => editorMode\.value === 'edit' && hasFiles\.value\)/)
  assert.doesNotMatch(source, /const isIndexingLocked[^\n]*authStore\.isLiteMode/)
  assert.doesNotMatch(source, /rebuildKBIndex/)
  assert.doesNotMatch(source, /rebuildConfirmTitle|rebuildConfirmBody/)
})

test('description is explicitly optional in every shipped locale', () => {
  assert.match(en, /descriptionLabel: 'Knowledge Base Description \(optional\)'/)
  assert.match(zh, /descriptionLabel: '知识库描述（可选）'/)
  assert.match(ru, /descriptionLabel: 'Описание базы знаний \(необязательно\)'/)
  assert.match(ko, /descriptionLabel: '지식베이스 설명\(선택\)'/)
})
