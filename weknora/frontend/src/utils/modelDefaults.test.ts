import { strict as assert } from 'node:assert'
import test from 'node:test'

import { selectInitialModelId } from './modelDefaults'

const models = [
  { id: 'builtin-deepseek-v4-pro', type: 'KnowledgeQA', is_default: true, status: 'active' },
  { id: 'builtin-deepseek-v4-flash', type: 'KnowledgeQA', is_default: false, status: 'active' },
]

test('selectInitialModelId honors an active product preference over catalog default', () => {
  assert.equal(
    selectInitialModelId(models, 'KnowledgeQA', 'builtin-deepseek-v4-flash'),
    'builtin-deepseek-v4-flash',
  )
})

test('selectInitialModelId falls back when the product preference is unavailable', () => {
  assert.equal(
    selectInitialModelId(models, 'KnowledgeQA', 'missing-model'),
    'builtin-deepseek-v4-pro',
  )
})
