import assert from 'node:assert/strict'
import test from 'node:test'
import { modelReasoningEfforts, resolveModelReasoning, type ReasoningModel } from './modelReasoning.ts'

const model = (id: string, efforts: string[], mandatory = false): ReasoningModel => ({
  id,
  parameters: { reasoning: { supported: true, mandatory, supported_efforts: efforts, default_effort: 'high' } },
})
const qwen = model('qwen', ['xhigh', 'high', 'medium', 'low', 'minimal'], true)
const grok = model('grok', ['xhigh', 'high', 'medium', 'low'], true)
const nemotron = model('nemotron', ['high', 'medium'])

test('unloaded model metadata must not turn a saved choice off', () => {
  assert.equal(resolveModelReasoning(undefined, 'high', 'grok'), null)
})

test('new model selection starts at its lowest enabled effort', () => {
  assert.deepEqual(resolveModelReasoning(qwen, 'high', 'grok'), { effort: 'minimal', modelId: 'qwen' })
  assert.deepEqual(resolveModelReasoning(grok, 'high', 'qwen'), { effort: 'low', modelId: 'grok' })
  assert.deepEqual(resolveModelReasoning(nemotron, 'none', 'grok'), { effort: 'medium', modelId: 'nemotron' })
})

test('a fresh browser starts reasoning on at the lowest effort', () => {
  assert.deepEqual(resolveModelReasoning(qwen, '', ''), { effort: 'minimal', modelId: 'qwen' })
  assert.deepEqual(resolveModelReasoning(nemotron, '', ''), { effort: 'medium', modelId: 'nemotron' })
})

test('reload and metadata refresh preserve an explicit choice for the same model', () => {
  assert.deepEqual(resolveModelReasoning(grok, 'high', 'grok'), { effort: 'high', modelId: 'grok' })
  assert.deepEqual(resolveModelReasoning(nemotron, 'none', 'nemotron'), { effort: 'none', modelId: 'nemotron' })
})

test('a removed or unsupported effort falls back to the minimum enabled effort', () => {
  assert.deepEqual(resolveModelReasoning(grok, 'none', 'grok'), { effort: 'low', modelId: 'grok' })
  assert.deepEqual(resolveModelReasoning(nemotron, 'low', 'nemotron'), { effort: 'medium', modelId: 'nemotron' })
})

test('the menu lists supported levels in ascending order and never disables mandatory reasoning', () => {
  assert.deepEqual(modelReasoningEfforts(qwen), ['minimal', 'low', 'medium', 'high', 'xhigh'])
  assert.deepEqual(modelReasoningEfforts(model('mandatory', ['none', 'high', 'low', 'low', 'invalid'], true)), ['low', 'high'])
  assert.deepEqual(modelReasoningEfforts(nemotron), ['medium', 'high', 'none'])
})

test('models without reasoning have no depth menu and send thinking off', () => {
  const plain = { id: 'plain', parameters: { reasoning: { supported: false } } }
  assert.deepEqual(modelReasoningEfforts(plain), [])
  assert.deepEqual(resolveModelReasoning(plain, 'high', 'grok'), { effort: 'none', modelId: 'plain' })
})

test('scene placeholder rows do not disable reasoning before the real model catalog arrives', () => {
  assert.equal(resolveModelReasoning({ id: 'grok', parameters: {} }, 'high', 'grok'), null)
})


test('a catalog refresh retains Nano ID while replacing its retired minimal depth', () => {
  const nano = model('builtin-openrouter-gpt-5-nano', ['xhigh', 'high', 'medium', 'low', 'none'])
  assert.deepEqual(resolveModelReasoning(nano, 'minimal', nano.id), { effort: 'low', modelId: nano.id })
  assert.deepEqual(resolveModelReasoning(nano, 'none', nano.id), { effort: 'none', modelId: nano.id })
  assert.deepEqual(resolveModelReasoning(nano, 'xhigh', nano.id), { effort: 'xhigh', modelId: nano.id })
  assert.deepEqual(modelReasoningEfforts(nano), ['low', 'medium', 'high', 'xhigh', 'none'])
})
