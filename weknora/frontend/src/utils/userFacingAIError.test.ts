import assert from 'node:assert/strict'
import test from 'node:test'
import { userFacingAIError } from './userFacingAIError'

test('hides provider internals behind the localized fallback', () => {
  const fallback = 'AI service is temporarily unavailable'
  assert.equal(
    userFacingAIError(
      'LLM call failed: Post "https://openrouter.ai/api/v1/chat/completions": OPENROUTER_MANAGEMENT_API_KEY is not configured',
      fallback,
    ),
    fallback,
  )
})

test('keeps ordinary actionable errors', () => {
  assert.equal(userFacingAIError('Attachment is still processing', 'fallback'), 'Attachment is still processing')
  assert.equal(userFacingAIError('', 'fallback'), 'fallback')
})

test('prefers a stable billing code over provider error text', () => {
  assert.equal(
    userFacingAIError(
      'LLM call failed: provider returned a payment error',
      'AI service unavailable',
      'billing_renewal_pending',
      'Billing confirmation is pending or needs repair',
    ),
    'Billing confirmation is pending or needs repair',
  )
})

test('maps exhausted AI credits by stable code instead of provider copy', () => {
  assert.equal(
    userFacingAIError(
      'Monthly AI Credits exhausted',
      'AI service unavailable',
      'openrouter_credits_exhausted',
      'Billing pending',
      'Monthly AI allowance exhausted; upgrade or wait for reset',
    ),
    'Monthly AI allowance exhausted; upgrade or wait for reset',
  )
})
