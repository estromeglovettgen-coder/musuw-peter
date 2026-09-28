import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./Input-field.vue', import.meta.url), 'utf8')
const baseline = readFileSync(new URL('../assets/business-baselines/Input-field.pre-view.vue', import.meta.url), 'utf8')

test('composer selects scene options from known retrieval intent and keeps the runtime baseline frozen', () => {
  assert.match(baseline, /effectiveConsumerScene/)
  assert.match(baseline, /resolveComposerConsumerScene/)
  assert.match(baseline, /hasBuiltinAllKnowledgeScope/)
  assert.match(baseline, /if \(isCustomAgent\.value\) return false/)
  assert.match(baseline, /agentKBSelectionMode\.value === ["']all["']/)
  assert.match(baseline, /BUILTIN_QUICK_ANSWER_ID \|\| agentId === BUILTIN_SMART_REASONING_ID/)
  assert.match(baseline, /selectedKnowledgeBases/)
  assert.match(baseline, /selectedFiles/)
  assert.match(baseline, /selectedTags/)
  assert.match(baseline, /isWebSearchEnabled/)
  assert.match(baseline, /ensureConsumerSceneOptions/)
  assert.match(baseline, /getConsumerSceneModel/)
  assert.match(baseline, /updateConsumerSceneModel/)
  assert.match(baseline, /resolveConsumerSceneCandidate/)
  assert.match(source, /scene-options="sceneOptionsFor\(effectiveConsumerScene\)"/)
  assert.match(baseline, /option\.locked \|\| !option\.selectable/)
  assert.match(baseline, /isConsumerSceneOptionsFresh/)
  assert.match(baseline, /sceneOptionsStale/)
})

test('Lite platform agent pins the model picker and candidate storage to rag', () => {
  assert.match(baseline, /authStore\.isLiteMode && !isCustomAgent\.value/)
  assert.match(baseline, /resolveComposerConsumerScene\([\s\S]*authStore\.isLiteMode && !isCustomAgent\.value[\s\S]*\)/)
  assert.match(baseline, /settingsStore\.getConsumerSceneModel\(scene\)/)
  assert.match(baseline, /settingsStore\.updateConsumerSceneModel\(effectiveConsumerScene\.value, val\)/)
  assert.doesNotMatch(baseline, /ensureConsumerSceneOptions\(\s*["']chat["']/)
  assert.doesNotMatch(baseline, /getConsumerSceneModel\(\s*["']chat["']/)
  assert.doesNotMatch(baseline, /updateConsumerSceneModel\(\s*["']chat["']/)
})

test('custom agents stay on the existing non-consumer model path', () => {
  assert.match(baseline, /if \(isCustomAgent\.value\) return false/)
  assert.match(baseline, /if \(!sceneManagedByConsumerResolver\.value\) return settingsStore\.conversationModels\.selectedChatModelId \|\| ""/)
  assert.match(baseline, /sceneManagedByConsumerResolver\.value\s*\n\s*\? chatResources\.ensureConsumerSceneOptions/)
})
