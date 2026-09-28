import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const page = fs.readFileSync(path.join(root, 'src/operations/pages/ModelsPolicyPage.vue'), 'utf8')
const app = fs.readFileSync(path.join(root, 'src/operations/OperationsApp.vue'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/operations/api.ts'), 'utf8')
const types = fs.readFileSync(path.join(root, 'src/operations/types.ts'), 'utf8')

test('operations console exposes the five real consumer model policy boundaries', () => {
  for (const scene of ['rag', 'rerank', 'wiki', 'vision', 'asr']) {
    assert.match(page, new RegExp(`['"]${scene}['"]`), scene)
  }
  for (const label of ['智能体模型', 'Rerank', 'Wiki', '视觉模型', '语音模型']) {
    assert.match(page, new RegExp(label), label)
  }
  assert.doesNotMatch(page, /Chat|Embedding|TTS|DeepSeek-V3|Claude 3\.7|GPT-4o|Gemini 2\.0|fake/i)
})

test('policy page renders real typed defaults and ordered paid options with loading and error states', () => {
  assert.match(page, /free_default/)
  assert.match(page, /paid_model_ids/)
  assert.match(page, /display_name/)
  assert.match(page, /model_type/)
  assert.match(page, /model_id/)
  assert.match(page, /loading/)
  assert.match(page, /error/)
  assert.match(page, /重试/)
  assert.match(page, /paid_model_ids\.length|paidModelIds\.length/)
  assert.match(page, /updateModelPolicy|modelPolicyUpdate|PUT|put\(/)
})

test('policy page submits the current scene and IDs through the operations API', () => {
  assert.match(page, /scene/)
  assert.match(page, /free_default_model_id|freeDefaultModelId/)
  assert.match(page, /paid_model_ids|paidModelIds/)
  assert.match(page, /operationsApi\.updateModelPolicy/)
})

test('operations API owns the model-policy GET and PUT seam', () => {
  assert.match(api, /modelPolicy/)
  assert.match(api, /updateModelPolicy/)
  assert.match(api, /['"]\/admin-api\/model-policy['"]/)
  assert.match(api, /method:\s*['"]PUT['"]/)
})

test('policy DTO types preserve native model type and ordered selections', () => {
  assert.match(types, /interface\s+ModelPolicyOption/)
  assert.match(types, /interface\s+ModelPolicyScene/)
  assert.match(types, /interface\s+ModelPolicyData/)
  assert.match(types, /model_type/)
  assert.match(types, /free_default/)
  assert.match(types, /paid_model_ids/)
})

test('operations navigation mounts the model policy page', () => {
  assert.match(app, /ModelsPolicyPage/)
  assert.match(app, /model-policy/)
  assert.match(app, /模型策略/)
})
