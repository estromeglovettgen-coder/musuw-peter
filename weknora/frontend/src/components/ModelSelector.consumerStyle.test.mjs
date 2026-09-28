import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const selector = readFileSync(new URL('./ModelSelector.vue', import.meta.url), 'utf8')

test('non-chat catalog selectors can reuse the scene-model surface without dropping catalog actions', () => {
  assert.match(selector, /useConsumerStyle\?: boolean/)
  assert.match(selector, /props\.mode === 'catalog' && \(!props\.showAddModel \|\| props\.useConsumerStyle\)/)
  assert.match(selector, /const addModelFromConsumerSelect = \(\) =>/)
  assert.match(selector, /emit\('add-model'\)/)
  assert.match(selector, /const clearConsumerSelection = \(\) =>/)
  assert.match(selector, /emit\('update:selectedModelId', ''\)/)
})

test('consumer-style selectors still load a normal catalog when no scene projection is supplied', () => {
  assert.match(selector, /if \(props\.allModels \|\| \(isConsumerSceneSelector\.value && props\.sceneOptions\.length\)\)/)
  assert.match(selector, /catalogModels\.value = filterModelsByType\(result, props\.modelType\)/)
})
