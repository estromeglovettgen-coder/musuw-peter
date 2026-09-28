import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(process.cwd(), 'src/views/settings/ModelSettings.vue'), 'utf8')

test('consumer model settings show exactly the five real configurable boundaries', () => {
  assert.match(source, /ModelSelector/)
  assert.match(source, /consumerSceneOptionsFor\(scene\)/)
  assert.match(source, /show-add-model="false"/)
  const declaration = source.match(/const consumerScenes[^\n]*/)?.[0] || ''
  assert.match(declaration, /\['rag',\s*'rerank',\s*'wiki',\s*'vision',\s*'asr'\]/)
  assert.doesNotMatch(declaration, /chat|embedding|tts/)
  assert.match(source, /getConsumerSceneModel/)
  assert.match(source, /updateConsumerSceneModel/)
})

test('consumer scene controls are shown only in Lite mode through the existing persisted/runtime seam', () => {
  assert.match(source, /<section\s+v-if="authStore\.isLiteMode"\s+class="consumer-scene-settings"\s+data-persisted-capability="consumer-scene-models"/)
  assert.match(source, /const consumerScenes/)
  assert.match(source, /getConsumerSceneModel/)
  assert.match(source, /updateConsumerSceneModel/)
})

test('consumer model settings omit the redundant scene-model heading and explanation', () => {
  const consumerSurface = source.slice(
    source.indexOf('<section\n      v-if="authStore.isLiteMode"'),
    source.indexOf('<template v-if="!authStore.isLiteMode">'),
  )

  assert.doesNotMatch(consumerSurface, /consumer-scene-settings__header/)
  assert.doesNotMatch(consumerSurface, /modelSettings\.sceneModels\.(?:title|description)/)
})

test('consumer settings options come only from the typed scene-options API', () => {
  assert.match(source, /ensureConsumerSceneOptions\(scene\)/)
  assert.doesNotMatch(source, /all-models=/)
  assert.doesNotMatch(source, /consumerSceneOptionsFor\(scene\)\.length \? allModels/)
  assert.doesNotMatch(source, /SCENARIO_(?:WIKI|EMBEDDING|RERANK|VISION|AUDIO)_MODELS/)
  const consumerSurface = source.slice(
    source.indexOf('<section class="consumer-scene-settings"'),
    source.indexOf('<template v-if="!authStore.isLiteMode">'),
  )
  assert.doesNotMatch(consumerSurface, /DeepSeek-V3|DeepSeek-R1|Claude 3\.7|GPT-4o|Gemini 2\.0|fake/i)
})

test('rerank consumer selection uses the existing tenant retrieval-config seam', () => {
  assert.match(source, /getTenantRetrievalConfig/)
  assert.match(source, /updateTenantRetrievalConfig/)
  assert.match(source, /scene === 'rerank'/)
  assert.match(source, /rerank_model_id/)
})
