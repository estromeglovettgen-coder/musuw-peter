import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const controller = readFileSync(
  new URL('./KnowledgeBaseList.vue', import.meta.url),
  'utf8',
)
const api = readFileSync(
  new URL('../../api/knowledge-base/index.ts', import.meta.url),
  'utf8',
)

test('duplicate UI reuses the native asynchronous content-copy contract and refreshes without navigation', () => {
  const duplicateRequest = api.match(
    /export function duplicateKnowledgeBase\(id: string\) \{[\s\S]*?\n\}/,
  )?.[0] ?? ''
  const duplicateFlow = controller.match(
    /const copyById = async \(id: string\) => \{[\s\S]*?\n      \}/,
  )?.[0] ?? ''

  assert.match(duplicateRequest, /return copyKnowledgeBase\(\{ source_id: id \}\)/)
  assert.doesNotMatch(duplicateRequest, /\/duplicate/)
  assert.match(api, /export function getKnowledgeBaseCopyProgress\(taskId: string\)/)
  assert.match(api, /knowledge-bases\/copy\/progress\/\$\{taskId\}/)
  assert.match(duplicateFlow, /await duplicateKnowledgeBase\(id\)/)
  assert.match(duplicateFlow, /response\.data\?\.task_id/)
  assert.match(duplicateFlow, /void pollCopy\(taskId, targetId\)/)
  assert.doesNotMatch(duplicateFlow, /goDetail|router\.(?:push|replace)/)

  assert.match(controller, /const pollCopy = async \(taskId: string, targetId\?: string\) =>/)
  assert.match(controller, /await getKnowledgeBaseCopyProgress\(taskId\)/)
  assert.match(controller, /progress\?\.status === 'completed'/)
  assert.match(controller, /progress\?\.status === 'failed'/)
  assert.match(controller, /await state\.fetchList\(true\)/)
})
