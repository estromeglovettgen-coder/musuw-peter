import assert from 'node:assert/strict'
import test from 'node:test'

import { isKnowledgeBaseRuntimeReady, isKnowledgeBaseStorageReady } from './knowledgeBaseRuntime.ts'

test('safe capability readiness replaces hidden model identifiers', () => {
  assert.equal(isKnowledgeBaseRuntimeReady({ capabilities: { ready: true } }), true)
  assert.equal(isKnowledgeBaseRuntimeReady({ capabilities: { ready: false } }), false)
})

test('legacy and Standard payloads retain the model-id fallback', () => {
  assert.equal(isKnowledgeBaseRuntimeReady({
    summary_model_id: 'summary',
    embedding_model_id: 'embedding',
    indexing_strategy: { vector_enabled: true },
  }), true)
  assert.equal(isKnowledgeBaseRuntimeReady({
    summary_model_id: 'summary',
    indexing_strategy: { vector_enabled: true },
  }), false)
  assert.equal(isKnowledgeBaseRuntimeReady({
    summary_model_id: 'summary',
    indexing_strategy: { wiki_enabled: true },
  }), true)
})

test('safe storage readiness replaces hidden backend identity', () => {
  assert.equal(isKnowledgeBaseStorageReady({ capabilities: { storage_ready: true } }), true)
  assert.equal(isKnowledgeBaseStorageReady({ capabilities: { storage_ready: false } }), false)
})

test('legacy and Standard payloads retain the storage binding fallback', () => {
  assert.equal(isKnowledgeBaseStorageReady({ storage_backend_id: 'backend-id' }), true)
  assert.equal(isKnowledgeBaseStorageReady({ storage_provider_config: { provider: 'local' } }), true)
  assert.equal(isKnowledgeBaseStorageReady({}), false)
})
