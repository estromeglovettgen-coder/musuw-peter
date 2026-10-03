import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldShowModelProvider, shouldShowOllamaUnavailableTip } from './modelEditorSourceState.ts'

test('Peter provider choices exclude cloud in API and fallback lists regardless of casing', () => {
  for (const providers of [
    ['generic', 'WeKnoraCloud', 'deepseek'],
    ['openai', ' weknoracloud ', 'openrouter'],
  ]) {
    assert.deepEqual(providers.filter(p => shouldShowModelProvider(p, true)),
      providers.filter(p => p.trim().toLowerCase() !== 'weknoracloud'))
  }
})

test('existing cloud provider stays editable without enabling it for other Peter models', () => {
  assert.equal(shouldShowModelProvider('weknoracloud', true, 'WeKnoraCloud'), true)
  assert.equal(shouldShowModelProvider('weknoracloud', true, 'deepseek'), false)
  assert.equal(shouldShowModelProvider('weknoracloud', false), true)
  assert.equal(shouldShowModelProvider('deepseek', true), true)
})

test('hides Ollama unavailable tip while configuring a remote model', () => {
  assert.equal(shouldShowOllamaUnavailableTip('remote', 'chat', false), false)
})

test('shows Ollama unavailable tip only for local non-rerank models', () => {
  assert.equal(shouldShowOllamaUnavailableTip('local', 'chat', false), true)
  assert.equal(shouldShowOllamaUnavailableTip('local', 'embedding', false), true)
  assert.equal(shouldShowOllamaUnavailableTip('local', 'rerank', false), false)
})

test('does not show Ollama unavailable tip before status is known or when Ollama is available', () => {
  assert.equal(shouldShowOllamaUnavailableTip('local', 'chat', null), false)
  assert.equal(shouldShowOllamaUnavailableTip('local', 'chat', true), false)
})
