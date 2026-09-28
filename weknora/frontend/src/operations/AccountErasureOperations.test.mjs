import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8')

test('account erasure exists only as an operations-console action', async () => {
  const usersPage = await read('./pages/UsersPage.vue')
  const operationsApi = await read('./api.ts')
  const userProfile = await read('../views/settings/UserProfile.vue')
  const authApi = await read('../api/auth/index.ts')

  assert.match(usersPage, />彻底注销</)
  assert.match(usersPage, /确认彻底注销/)
  assert.match(usersPage, /operationsApi\.eraseUser\(selected\.value\.id\)/)
  assert.doesNotMatch(usersPage, /normalizeEmail|emailConfirmation|确认邮箱|账户邮箱.*确认/)
  assert.match(usersPage, /停止后续自动续费/)
  assert.match(usersPage, /不会自动退款/)
  assert.match(usersPage, /立即停用/)
  assert.doesNotMatch(usersPage, /仍可计费的订阅会直接阻止注销/)
  assert.match(operationsApi, /method:\s*['"]DELETE['"]/)
  assert.match(operationsApi, /system\/admin\/users\/\$\{encodeURIComponent\(userId\)\}/)

  assert.doesNotMatch(userProfile, /account-erasure|deleteAccount\(/)
  assert.doesNotMatch(authApi, /deleteAccount\s*\(/)
})
