import assert from 'node:assert/strict'
import test from 'node:test'

import {
  consumerSceneModelType,
  filterConsumerModelCatalog,
  normalizeConsumerModelIds,
  resolveComposerConsumerScene,
  resolveConsumerSceneCandidate,
} from './consumerSceneModels'

const catalog = [
  {
    id: 'free-chat',
    name: 'free-chat',
    type: 'KnowledgeQA' as const,
    source: 'remote' as const,
    parameters: { provider: 'OpenRouter' },
    status: 'active',
    is_builtin: true,
  },
  {
    id: 'paid-chat',
    name: 'paid-chat',
    type: 'KnowledgeQA' as const,
    source: 'remote' as const,
    parameters: { provider: 'openrouter' },
    status: 'active',
    is_builtin: true,
  },
  {
    id: 'disabled-chat',
    name: 'disabled-chat',
    type: 'KnowledgeQA' as const,
    source: 'remote' as const,
    parameters: { provider: 'openrouter' },
    status: 'disabled',
    is_builtin: true,
  },
  {
    id: 'tenant-chat',
    name: 'tenant-chat',
    type: 'KnowledgeQA' as const,
    source: 'remote' as const,
    parameters: { provider: 'openrouter' },
    status: 'active',
    is_builtin: false,
  },
  {
    id: 'embedding',
    name: 'embedding',
    type: 'Embedding' as const,
    source: 'remote' as const,
    parameters: { provider: 'openrouter' },
    status: 'active',
    is_builtin: true,
  },
  {
    id: 'unknown-status',
    name: 'unknown-status',
    type: 'KnowledgeQA' as const,
    source: 'remote' as const,
    parameters: { provider: 'openrouter' },
    is_builtin: true,
  },
]

test('consumer model catalog is limited to active builtin OpenRouter models', () => {
  assert.deepEqual(
    filterConsumerModelCatalog(catalog).map((model) => model.id),
    ['free-chat', 'paid-chat', 'embedding'],
  )
})

test('typed consumer boundaries filter only the matching native catalog', () => {
  const typedCatalog = [
    ...catalog,
    ...(['Rerank', 'VLLM', 'ASR'] as const).map((type) => ({
      id: type.toLowerCase(),
      name: type,
      type,
      source: 'remote' as const,
      parameters: { provider: 'openrouter' },
      status: 'active',
      is_builtin: true,
    } as const)),
  ]
  for (const scene of ['rag', 'wiki', 'rerank', 'vision', 'asr'] as const) {
    const types = filterConsumerModelCatalog(typedCatalog, scene).map((model) => model.type)
    assert.ok(types.length > 0)
    assert.deepEqual([...new Set(types)], [consumerSceneModelType[scene]])
  }
  assert.equal(filterConsumerModelCatalog(typedCatalog, 'rag').some((model) => model.type === 'Embedding'), false)
})

test('policy model IDs are deduplicated and retain configured order', () => {
  assert.deepEqual(
    normalizeConsumerModelIds(['paid-chat', 'missing', 'free-chat', 'paid-chat'], catalog),
    ['paid-chat', 'free-chat'],
  )
})

test('stale browser candidates are replaced by the effective selectable scene model', () => {
  const options = [
    {
      model_id: 'free-chat',
      display_name: 'Free chat',
      model_type: 'KnowledgeQA' as const,
      selectable: true,
      locked: false,
      required_plan: 'free',
      is_scene_default: true,
      is_effective: true,
    },
    {
      model_id: 'paid-chat',
      display_name: 'Paid chat',
      model_type: 'KnowledgeQA' as const,
      selectable: false,
      locked: true,
      required_plan: 'plus',
      is_scene_default: false,
      is_effective: false,
    },
  ]
  assert.equal(resolveConsumerSceneCandidate(options, 'removed-model', 'free-chat'), 'free-chat')
  assert.equal(resolveConsumerSceneCandidate(options, 'paid-chat', 'free-chat'), 'free-chat')
  assert.equal(resolveConsumerSceneCandidate(options, undefined, 'free-chat'), 'free-chat')
})

test('composer distinguishes plain chat from built-in all-KB retrieval', () => {
  assert.equal(resolveComposerConsumerScene(false, false, false), 'chat')
  assert.equal(resolveComposerConsumerScene(false, false, true), 'rag')
  assert.equal(resolveComposerConsumerScene(true, false, false), 'rag')
  assert.equal(resolveComposerConsumerScene(false, true, false), 'rag')
})

test('Lite platform agent always resolves its picker to the rag scene', () => {
  const scopeStates = [
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
  ] as const

  for (const [hasExplicitRetrievalScope, webSearchEnabled, hasBuiltinAllKnowledgeScope] of scopeStates) {
    assert.equal(
      resolveComposerConsumerScene(
        hasExplicitRetrievalScope,
        webSearchEnabled,
        hasBuiltinAllKnowledgeScope,
        true,
      ),
      'rag',
    )
  }
})
