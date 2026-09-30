import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveKbFilterFromTools, evaluateToolRequirement } from './tool-capabilities'

test('graph-only customer KB offers graph query but not vector search', () => {
  const scope = { vector: false, keyword: false, wiki: true, graph: true, faq: false }
  assert.deepEqual(evaluateToolRequirement('query_knowledge_graph', scope, true), { ok: true, missKind: 'none' })
  assert.deepEqual(evaluateToolRequirement('knowledge_search', scope, true), { ok: false, missKind: 'needsRag' })
  assert.deepEqual(deriveKbFilterFromTools(['query_knowledge_graph']), { any_of: ['graph'] })
})
