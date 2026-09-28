import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SystemSettings.vue', import.meta.url), 'utf8')

test('SystemSettings exposes a fixed Models policy section backed by the ten typed scene settings', () => {
  for (const token of [
    'value="models"',
    'filterConsumerModelCatalog',
    'listModels',
    'ordered',
    'first',
    'consumerModelDisplayName',
    'model.defaultTag',
    'paidRequired',
    'Promise.all([loadSettings(), loadConsumerModelCatalog(), loadAdmins()])',
  ]) assert.ok(source.includes(token), `models policy surface lost ${token}`)
  const declaration = source.match(/const consumerScenes[^\n]*/)?.[0] || ''
  assert.match(declaration, /\['rag',\s*'rerank',\s*'wiki',\s*'vision',\s*'asr'\]/)
  assert.doesNotMatch(declaration, /chat|embedding|tts/)
  assert.ok(source.includes('`consumer_models.${scene}.${kind}`'))
})

test('SystemSettings policy controls only persist values selected from the safe catalog', () => {
  const modelsSection = source.slice(
    source.indexOf('activeSettingsSection === \'models\''),
    source.indexOf('activeSettingsSection === \'models\'', source.indexOf('activeSettingsSection === \'models\'') + 1),
  )
  assert.match(source, /@change="onConsumerSceneFreeChange/)
  assert.match(source, /@change="onConsumerScenePaidChange/)
  assert.match(source, /normalizeConsumerModelIds/)
  assert.ok(modelsSection.length > 0)
})

test('legacy Chat policy keys stay hidden during rolling upgrades', () => {
  assert.match(source, /HIDDEN_COMPATIBILITY_SETTING_KEYS/)
  assert.match(source, /consumer_models\.chat\.free_default/)
  assert.match(source, /consumer_models\.chat\.paid_options/)
  assert.match(source, /\.\.\.HIDDEN_COMPATIBILITY_SETTING_KEYS/)
})
