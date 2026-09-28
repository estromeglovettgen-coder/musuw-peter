import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8')

test('operations API exposes only the dedicated complimentary grant and revoke mutations without manual confirmations', async () => {
  const api = await read('./api.ts')
  const types = await read('./types.ts')

  assert.match(api, /grantComplimentaryPlan/)
  assert.match(api, /revokeComplimentaryPlan/)
  assert.match(api, /complimentary-entitlement/)
  assert.match(api, /method:\s*['"]PUT['"]/)
  assert.match(api, /method:\s*['"]DELETE['"]/)
  assert.match(types, /ComplimentaryPlanGrantRequest/)
  assert.match(types, /ComplimentaryPlanRevokeRequest/)
  assert.match(types, /expires_at: string/)
  assert.match(types, /grant_id: string/)
  assert.doesNotMatch(types, /confirmation: string/)
})

test('selected user drawer requires an eligible Free, Paddle-unbound tenant and uses explicit action buttons', async () => {
  const page = await read('./pages/UsersPage.vue')

  assert.match(page, /configured_plan/)
  assert.match(page, /paddle_customer_id/)
  assert.match(page, /paddle_subscription_id/)
  assert.doesNotMatch(page, /GRANT:\$\{selected\.tenant_id\}/)
  assert.doesNotMatch(page, /REVOKE:\$\{selected\.tenant_id\}/)
  assert.doesNotMatch(page, /gift\.confirmation|revoke\.confirmation|confirmation: gift\.confirmation|confirmation: revoke\.confirmation/)
  assert.match(page, /赠送套餐已提交/)
  assert.match(page, /赠送套餐已撤销/)
  assert.match(page, /complimentaryEligible/)
  assert.match(page, /complimentary_expires_at/)
  assert.match(page, /toISOString\(\)/)
  assert.match(page, /randomUUID|xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx/)
  assert.match(page, /操作 ID 将在重试时复用/)
  assert.match(page, /refreshSelectedUser/)
})
