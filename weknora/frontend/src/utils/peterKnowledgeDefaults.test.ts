import test from 'node:test'
import assert from 'node:assert/strict'
import { createPeterProcessingDefaults, selectPeterMediaModelIds, withPeterGraphExtractionDefaults } from './peterKnowledgeDefaults'

test('Peter customer and knowledge-base creation start with retrieval, Wiki, and standard extraction', () => {
  for (const customer of [false, true]) {
    const defaults = createPeterProcessingDefaults(customer)
    assert.equal(defaults.indexingStrategy.vectorEnabled, true)
    assert.equal(defaults.indexingStrategy.keywordEnabled, true)
    assert.equal(defaults.indexingStrategy.wikiEnabled, true)
    assert.equal(defaults.wikiConfig.extractionGranularity, 'standard')
  }
})

test('new Peter document libraries and customer projects start with media and graph processing', () => {
  for (const customer of [false, true]) {
    const defaults = createPeterProcessingDefaults(customer)
    assert.equal(defaults.multimodalConfig.enabled, true)
    assert.equal(defaults.asrConfig.enabled, true)
    assert.equal(defaults.indexingStrategy.graphEnabled, true)
    assert.equal(defaults.nodeExtractConfig.enabled, true)
    assert.ok(defaults.nodeExtractConfig.text.length > 0)
    assert.ok(defaults.nodeExtractConfig.tags.length > 0)
    assert.ok(defaults.nodeExtractConfig.nodes.length >= 2)
    assert.ok(defaults.nodeExtractConfig.relations.length >= 1)
}
})

test('Peter media defaults select active configured provider records and reject stale IDs', () => {
  const models = [
    { id: 'vision-old', type: 'VLLM', status: 'inactive', is_default: true },
    { id: 'vision-live', type: 'VLLM', status: 'active', is_default: true },
    { id: 'asr-old', type: 'ASR', status: 'inactive', is_default: true },
    { id: 'asr-live', type: 'ASR', status: 'active', is_default: true },
  ]
  assert.deepEqual(selectPeterMediaModelIds(models), { visionModelId: 'vision-live', asrModelId: 'asr-live' })
  assert.deepEqual(selectPeterMediaModelIds(models, 'vision-old', 'asr-old'), { visionModelId: 'vision-live', asrModelId: 'asr-live' })
  assert.deepEqual(selectPeterMediaModelIds([], 'vision-old', 'asr-old'), { visionModelId: '', asrModelId: '' })
})

test('customer templates retain their own extraction schema while missing fields get defaults', () => {
  const custom = {
    text: 'Mira 为客户 Kai 提供课程咨询。',
    tags: ['咨询'],
    nodes: [{ name: 'Mira', attributes: ['销售顾问'] }, { name: 'Kai', attributes: ['客户'] }],
    relations: [{ node1: 'Mira', node2: 'Kai', type: '咨询' }],
    customInstructions: '只抽取课程相关关系',
  }
  assert.deepEqual(withPeterGraphExtractionDefaults(custom, true), { enabled: true, ...custom })
  const fallback = withPeterGraphExtractionDefaults({ customInstructions: '保留说明' }, true)
  assert.equal(fallback.customInstructions, '保留说明')
  assert.ok(fallback.text.length > 0)
  assert.ok(fallback.nodes.length > 0)
  assert.ok(fallback.relations.length > 0)
})
