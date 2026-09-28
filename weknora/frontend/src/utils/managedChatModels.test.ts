import assert from 'node:assert/strict'
import test from 'node:test'

import { filterChatModelsForPlan, resolveChatModelId } from './managedChatModels'

const models = [
  { id: 'custom-chat-model', is_default: true, is_builtin: false },
  { id: 'builtin-deepseek-v4-pro', is_default: true, is_builtin: true },
  { id: 'builtin-deepseek-v4-flash', is_default: false, is_builtin: true },
]

test('keeps any valid user-selected chat model', () => {
  assert.equal(resolveChatModelId('builtin-deepseek-v4-pro', models), 'builtin-deepseek-v4-pro')
})

test('falls back to a tenant default before the shared platform default', () => {
  assert.equal(resolveChatModelId('removed-model', models), 'custom-chat-model')
})

test('falls back to Flash when no model is marked default', () => {
  const withoutDefault = models.map((model) => ({ ...model, is_default: false }))
  assert.equal(resolveChatModelId('', withoutDefault), 'builtin-deepseek-v4-flash')
})

test('keeps the admin maintenance catalog out of a Free Lite chat picker', () => {
  assert.deepEqual(
    filterChatModelsForPlan(models, 'free').map((model) => model.id),
    ['builtin-deepseek-v4-flash'],
  )
  assert.equal(filterChatModelsForPlan(models, 'pro').length, models.length)
})
