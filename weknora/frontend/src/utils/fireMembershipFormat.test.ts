import test from 'node:test'
import assert from 'node:assert/strict'
import { formatTokens, tokenPercent, formatMembershipDate, remainingUsageLabel } from './fireMembershipFormat'

test('token counts preserve exact remaining units without rounding a partial token upward', () => {
  assert.equal(formatTokens(0, 'en-US'), '0')
  assert.equal(formatTokens(999999, 'en-US'), '999,999')
  assert.equal(formatTokens('9007199254740993', 'en-US'), '9,007,199,254,740,993')
  assert.equal(formatTokens(0.9, 'en-US'), '—')
  assert.equal(formatTokens(-1, 'en-US'), '—')
  assert.equal(formatTokens(Number.MAX_SAFE_INTEGER + 1, 'en-US'), '—')
  assert.equal(formatTokens(undefined), '—')
  assert.equal(tokenPercent(1, 1000000), 0.0001)
  assert.equal(tokenPercent(20, 10), 100)
})

test('membership dates honor the caller locale and reject invalid expiry values', () => {
  assert.equal(formatMembershipDate('', 'zh-CN'), '—')
  assert.equal(formatMembershipDate('not-a-date', 'zh-CN'), '—')
  assert.match(formatMembershipDate('2026-10-17T12:00:00Z', 'en-US'), /2026/)
})

test('user allowance shows percentage only with honest near-zero and unknown states',()=>{
 assert.equal(remainingUsageLabel(15813,30000),'52.7%')
 assert.equal(remainingUsageLabel(1,1000000),'<1%')
 assert.equal(remainingUsageLabel(0,1000000),'0%')
 assert.equal(remainingUsageLabel(10,10),'100%')
 assert.equal(remainingUsageLabel(2,0),'—')
 assert.equal(remainingUsageLabel('unknown',10),'—')
})

test('membership percentage follows the smaller of token and optional question allowances', async () => {
  const { membershipUsageLabel, membershipUsagePercent } = await import('./fireMembershipFormat')
  const tokenOnly = { token_limit: 100, remaining_tokens: 80 } as any
  assert.equal(membershipUsageLabel(tokenOnly), '80%')
  assert.equal(membershipUsageLabel({ ...tokenOnly, question_limit: 0, remaining_questions: 0 }), '80%')
  assert.equal(membershipUsageLabel({ ...tokenOnly, question_limit: 10, remaining_questions: 2 }), '20%')
  assert.equal(membershipUsagePercent({ ...tokenOnly, question_limit: 10, remaining_questions: 2 }), 20)
  assert.equal(membershipUsageLabel({ ...tokenOnly, remaining_tokens: 10, question_limit: 10, remaining_questions: 9 }), '10%')
  assert.equal(membershipUsageLabel({ ...tokenOnly, question_limit: '10', remaining_questions: '0' }), '0%')
  assert.equal(membershipUsageLabel({ ...tokenOnly, question_limit: '1000000', remaining_questions: '1' }), '<1%')
  assert.equal(membershipUsageLabel({ ...tokenOnly, question_limit: 10 }), '—')
})
