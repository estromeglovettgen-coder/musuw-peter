import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const overlayBridge = readFileSync(new URL('../assets/musuw-tdesign-overlay-bridge.css', import.meta.url), 'utf8')
const consumerSurfaces = [
  'views/agent/AgentEditorModal.vue',
  'views/knowledge/KnowledgeBaseEditorModal.vue',
  'views/knowledge/components/UploadConfirmDialog.vue',
  'views/knowledge/settings/KBAdvancedSettings.vue',
  'views/knowledge/settings/KBModelConfig.vue',
  'views/settings/ChatHistorySettings.vue',
  'views/settings/RetrievalSettings.vue',
]

test('all non-homepage ModelSelector catalog consumers opt into the scene-model surface', () => {
  for (const relativePath of consumerSurfaces) {
    const source = readFileSync(new URL(relativePath, root), 'utf8')
    const tags = source.match(/<ModelSelector\b[\s\S]*?\/>/g) || []
    assert.ok(tags.length, `${relativePath} should retain a ModelSelector consumer`)
    for (const tag of tags) {
      assert.match(tag, /use-consumer-style/, `${relativePath} has a catalog selector without scene-model chrome`)
    }
  }
})

test('the homepage composer remains on its frozen chat picker branch', () => {
  const inputField = readFileSync(new URL('Input-field.vue', new URL('./', import.meta.url)), 'utf8')
  const tags = inputField.match(/<ModelSelector\b[\s\S]*?\/>/g) || []
  assert.equal(tags.length, 1)
  assert.match(tags[0], /mode="chat"/)
  assert.doesNotMatch(tags[0], /use-consumer-style/)
})

test('plain non-chat selects opt into the same trigger tokens without changing TDesign behavior', () => {
  const knowledgeEditor = readFileSync(new URL('../views/knowledge/KnowledgeBaseEditorModal.vue', import.meta.url), 'utf8')
  const agentEditor = readFileSync(new URL('../views/agent/AgentEditorModal.vue', import.meta.url), 'utf8')
  const metadataEditor = readFileSync(new URL('./doc-content.vue', import.meta.url), 'utf8')
  const wikiBrowser = readFileSync(new URL('../views/knowledge/wiki/WikiBrowser.vue', import.meta.url), 'utf8')
  assert.match(knowledgeEditor, /extractionGranularity[\s\S]*class="visual-scene-select"/)
  assert.match(agentEditor, /v-model="mcpSelectionMode" class="visual-scene-select agent-scope-select"/)
  assert.match(metadataEditor, /metadata-type-select visual-scene-select/)
  assert.match(metadataEditor, /metadata-value-input visual-scene-select/)
  assert.match(wikiBrowser, /class="graph-search-select visual-scene-select"/)
  assert.match(wikiBrowser, /v-model="createPageForm\.pageType" class="visual-scene-select"/)
  for (const token of [
    '.visual-scene-select.visual-scene-select .t-select-input .t-input',
    'min-height: 36px !important',
    'border-radius: 12px !important',
    'box-shadow: 0 1px 2px rgb(0 0 0 / 5%) !important',
  ]) assert.ok(overlayBridge.includes(token), `scene select bridge lost ${token}`)
})
