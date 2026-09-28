import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

test('scene options client unwraps standard API envelopes without changing /models', () => {
  assert.match(source, /getConsumerSceneOptions[\s\S]*?response\?\.success && response\.data[\s\S]*?return response\.data/)
  assert.match(source, /\/api\/v1\/models\/scene-options\//)
  assert.match(source, /model_type: ModelConfig\['type'\]/)
  assert.match(source, /required_plan: string/)
})
