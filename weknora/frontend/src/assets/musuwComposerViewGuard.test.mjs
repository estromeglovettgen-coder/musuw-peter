import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('migrated composer surfaces use visual roots and no active legacy presentation shells', () => {
  const cases = [
    ['../components/Input-field.vue', 'class="visual-chat-composer"', ['class="answers-input"', 'class="rich-input-container"', 'class="control-bar"', 'class="control-right"', 'class="model-selector-trigger"']],
    ['../components/ModelSelector.vue', 'class="visual-model-selector"', ['class="model-selector"', 'class="model-option"']],
    ['../components/AttachmentUpload.vue', 'class="visual-attachment-upload"', ['class="attachment-upload"', 'class="attachment-preview-bar"', 'class="attachment-preview-item"']],
    ['../components/KnowledgeBaseSelector.vue', 'class="visual-kb-selector"', ['class="kb-overlay"', 'class="kb-dropdown"', 'class="kb-item"', 'class="kb-actions"']],
    ['../components/ChatAttachmentPreviewDrawer.vue', 'class="visual-attachment-preview"', ['<t-drawer', 'class="chat-attachment-drawer-header"', 'class="chat-attachment-drawer-body"', 'chat-attachment-preview-drawer']],
    ['../components/MentionSelector.vue', 'class="visual-mention-menu"', ['class="mention-menu"', 'class="mention-list"', 'class="mention-item"', 'class="mention-group-entry"', 'mention-detail-popup-wrap']],
    ['../components/ModelDebugDrawer.vue', 'class="visual-model-debug"', ['class="model-debug"', 'class="setting-drawer__section"', 'class="history-item"', 'class="debug-result"']],
  ]
  for (const [path, root, legacy] of cases) {
    const source = read(path)
    assert.ok(source.includes(root), `${path} lost ${root}`)
    for (const token of legacy) assert.equal(source.includes(token), false, `${path} still contains ${token}`)
  }
})

test('model selector keeps the native filterable selection and emit contract under the new View', () => {
  const source = read('../components/ModelSelector.vue')
  for (const token of [
    '<t-select',
    'filterable',
    ':value="selectedModelId"',
    '@change="handleModelChange"',
    "value=\"__add_model__\"",
    "emit('add-model')",
    'defineExpose({',
    'refresh: loadModels',
  ]) assert.ok(source.includes(token), `ModelSelector lost native selection contract: ${token}`)
  assert.match(source, /emit\('update:selectedModelId', value(?: \|\| '')?\)/)
})

test('composer presents every native resource and generation control in the new View', () => {
  const source = read('../components/Input-field.vue')
  for (const token of [
    'showImageUploadButton',
    'attachmentUploadRef?.triggerFileSelect()',
    'triggerMention',
    'showWebSearchButton',
    'toggleWebSearch',
    'selectedModelDisplayName',
    'selectedReasoningLabel',
    'reasoningOptions',
    'openModelPicker',
    'isReplying',
    'handleStop',
    'createSession(query)',
    'uploadedImages.length',
    'uploadedAttachments.length',
    'allSelectedItems.length',
  ]) assert.ok(source.includes(token), `Input-field lost control surface: ${token}`)
  assert.equal(source.includes('__thinking-switch'), false)
  assert.equal(source.includes('<AgentSelector'), false, 'composer must not mount a second agent popup')
  assert.ok(source.includes(':agents="enabledAgents"'), 'shared model picker must receive native agents')
  assert.ok(source.includes('@select-agent="selectAgentFromPicker"'), 'shared model picker must preserve native agent selection')
  assert.ok(source.includes('class="visual-chat-composer__combined-picker"'))
  assert.equal(source.includes('agentPickerOpen'), false)
  assert.equal(source.includes('v-for="agent in enabledAgents"'), false)
})

test('agent-disabled mention control preserves native remediation and native warning behavior without becoming unhoverable', () => {
  const source = read('../components/Input-field.vue')
  for (const token of [
    'isMentionDisabled && isKnowledgeBaseDisabledByAgent',
    "handleGoToAgentSettings('knowledge')",
    "input.goToAgentSettings",
    ':aria-disabled="isMentionDisabled"',
    '@mousedown.prevent="triggerMention"',
  ]) assert.ok(source.includes(token), `Input-field lost disabled mention remediation: ${token}`)
  assert.equal(source.includes(':disabled="isMentionDisabled"'), false, 'disabled mention trigger must remain hoverable for remediation tooltip')
})

test('attachment visual layer exposes every native upload/parse terminal state', () => {
  const source = read('../components/AttachmentUpload.vue')
  for (const token of ["attachment.status === 'uploading'","attachment.status === 'uploaded'","attachment.status === 'processing'","attachment.status === 'ready'","attachment.status === 'failed'",'attachment.progress','visual-attachment-card__progress']) {
    assert.ok(source.includes(token), `AttachmentUpload lost state presentation: ${token}`)
  }
})

test('attachment preview keeps persistent resizable drawer semantics in the new shell', () => {
  const source = read('../components/ChatAttachmentPreviewDrawer.vue')
  for (const token of ['weknora-chat-attachment-drawer-width','clampMainDrawerWidth','onMainDrawerResizeStart','onMainDrawerResizeMove','onMainDrawerResizeEnd',':session-id="target.sessionId"',':attachment-id="target.attachmentId"',':file-type="target.fileType"',':file-name="target.fileName"']) {
    assert.ok(source.includes(token), `ChatAttachmentPreviewDrawer lost ${token}`)
  }
})

test('mention visual layer still renders every native business group and shared-agent detail state', () => {
  const source = read('../components/MentionSelector.vue')
  for (const token of ['type: "kb"','type: "tag"','type: "mcp"','type: "skill"','type: "file"','agentIdForDetail','agentSourceTenantIdForDetail','visual-mention-detail__error','visual-mention-loading','readOnlyFromAgent']) {
    assert.ok(source.includes(token), `MentionSelector lost ${token}`)
  }
})

test('model debug visual layer keeps every native model-type and result state', () => {
  const source = read('../components/ModelDebugDrawer.vue')
  for (const token of ["KnowledgeQA: { short: 'chat'", "Embedding: { short: 'embedding'", "Rerank: { short: 'rerank'", "VLLM: { short: 'vllm'", "ASR: { short: 'asr'", 'needsFile', 'supportsThinking', 'history.length > 1', 'resultMetrics.length > 0', "resultTab === 'response'", 'running', 'canRun']) {
    assert.ok(source.includes(token), `ModelDebugDrawer lost ${token}`)
  }
})

test('model debug keeps the native persistent resize contract after shell replacement', () => {
  const source = read('../components/ModelDebugDrawer.vue')
  for (const token of [
    "'setting-drawer:width:model-debug'",
    'MODEL_DEBUG_DEFAULT_WIDTH = 560',
    'MODEL_DEBUG_MIN_WIDTH = 480',
    'MODEL_DEBUG_MAX_WIDTH = 900',
    'clampDrawerWidth',
    'onResizeStart',
    'onResizeMove',
    'onResizeEnd',
    'persistDrawerWidth',
    'window.localStorage.setItem',
    'visual-model-debug__resize-handle',
  ]) assert.ok(source.includes(token), `ModelDebugDrawer lost resize contract: ${token}`)
})
