import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const editor = readFileSync(new URL('./KnowledgeBaseEditorModal.vue', import.meta.url), 'utf8')
test('consumer editor keeps Lite scene ownership while exposing full main settings to Standard', () => {
  const template = editor.slice(0, editor.indexOf('<script setup'))
  assert.match(template, /KBModelConfig/)
  assert.match(template, /v-if="!authStore\.isLiteMode && currentSection === 'models'"/)
  assert.doesNotMatch(template, /wiki-scene-options|wikiSynthesisModelId/)
  assert.doesNotMatch(editor, /syncWikiSceneCandidate/)
  assert.match(editor, /resolveConsumerSceneCandidate/)
  assert.match(editor, /wikiSynthesisModelId: kb\.wiki_config\?\.synthesis_model_id \|\| ''/)
  assert.match(editor, /synthesis_model_id: formData\.value\.modelConfig\?\.wikiSynthesisModelId/)
  assert.match(editor, /embeddingModelId: data\.embedding_model_id/)
  assert.match(editor, /embedding_model_id: formData\.value\.modelConfig\.embeddingModelId/)
  assert.match(editor, /consumerSceneModelsForCreate/)
  assert.match(editor, /const sceneModels = consumerSceneModelsForCreate\(\)/)
  assert.match(editor, /\.\.\.sceneModels/)
  const doSubmit = editor.slice(editor.indexOf('const doSubmit = async () => {'), editor.indexOf('// 重置所有状态'))
  const createStart = doSubmit.indexOf("if (editorMode.value === 'create')")
  const editStart = doSubmit.indexOf('const data = buildSubmitData()')
  assert.ok(createStart >= 0 && editStart > createStart, 'expected create and edit branches')
  assert.doesNotMatch(doSubmit.slice(createStart, editStart), /embedding_model_id/)
})
