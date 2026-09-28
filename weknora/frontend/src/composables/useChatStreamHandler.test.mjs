import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { shouldRenderAssistantMessage } from './useChatStreamHandler.ts'

const source = readFileSync(new URL('./useChatStreamHandler.ts', import.meta.url), 'utf8')

test('failed tool results keep stdout/output instead of replacing it with the short error', () => {
  assert.match(source, /toolCallEvent\.output = dataPayload\.output \|\| data\.content/)
  assert.doesNotMatch(
    source,
    /toolCallEvent\.output = success\s*\?[\s\S]*dataPayload\.error/,
  )
})

test('renders a completed agent error row when the mapped error content is present', () => {
  assert.equal(
    shouldRenderAssistantMessage({
      role: 'assistant',
      isAgentMode: true,
      is_completed: true,
      agent_error: true,
      content: 'AI service is temporarily unavailable',
    }),
    true,
  )
})

test('does not expose arbitrary completed agent content without an error marker', () => {
  assert.equal(
    shouldRenderAssistantMessage({
      role: 'assistant',
      isAgentMode: true,
      is_completed: true,
      content: 'stale hidden shell content',
    }),
    false,
  )
})

test('keeps an empty completed agent shell hidden', () => {
  assert.equal(
    shouldRenderAssistantMessage({
      role: 'assistant',
      isAgentMode: true,
      is_completed: true,
      content: '',
    }),
    false,
  )
})

test('marks both terminal agent error branches explicitly', () => {
  assert.equal((source.match(/message\.agent_error = true/g) || []).length, 2)
})

test('monthly credit exhaustion uses one localized upgrade prompt in the primary product', () => {
  assert.match(source, /OPENROUTER_CREDITS_EXHAUSTED_CODE/)
  assert.match(source, /showCreditUpgradePrompt && errorCode === OPENROUTER_CREDITS_EXHAUSTED_CODE/)
  assert.match(source, /showConsumerUpgradePrompt\(errorMsg\)/)
  assert.match(source, /t\('chat\.aiCreditsExhausted'\)/)
})
