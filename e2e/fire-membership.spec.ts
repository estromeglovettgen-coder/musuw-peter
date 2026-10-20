import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const baseMembership = { managed: true, unlimited: false, plan_name: '火种月度', status: 'active', starts_at: '2026-10-01T00:00:00Z', expires_at: '2026-11-01T00:00:00Z', token_limit: 1000000, used_tokens: 999999, reserved_tokens: 0, remaining_tokens: 1, input_tokens: 800000, output_tokens: 199999, estimated_tokens: 10 }
const usage = [{ id: 'usage-1', input_tokens: 800, output_tokens: 200, total_tokens: 1000, estimated: true, purpose: 'chat', created_at: '2026-10-17T12:00:00Z' }]
const plan = { id: 'plan-monthly', name: '火种月度', duration_days: 30, token_limit: 1000000, active: true }
async function api(page: Page, options: { admin?: boolean; status?: string; unavailable?: boolean } = {}) {
  const admin = !!options.admin, writes: Array<{ path: string; body: any }> = [], calls: string[] = []
  const state = { membership: { ...baseMembership, status: options.status || 'active' }, unavailable: !!options.unavailable, createFailure: false, adjustmentFailure: false, plans: [{ ...plan }], imageCalls: [] as any[] }
  const member = { id: 'member-fixture', username: 'Taylor学员', email: 'fixture@example.test', tenant_id: 42, is_system_admin: false, created_at: '2026-10-01T00:00:00Z' }
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname
    calls.push(path)
    if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() })
    if (path.includes('/fire/') || path.endsWith('/users/create')) expect(request.headers().authorization).toBe('Bearer membership-fixture-token')
    const ok = (data: any) => route.fulfill({ json: { success: true, data } })
    if (path === '/api/v1/auth/me') return ok({ user: admin ? { ...member, id: 'admin-fixture', username: '管理者', is_system_admin: true } : member, tenant: { id: 42, name: '火种' }, memberships: [] })
    if (path === '/api/v1/fire/membership') {
      if (state.unavailable) return route.fulfill({ status: 503, json: { success: false, error: { message: '会员服务暂不可用' } } })
      return ok(state.membership)
    }
    if (path === '/api/v1/fire/usage') return ok({ items: usage, total: 1, page: 1, page_size: 20 })
    if (path.endsWith('/fire/overview')) return ok({ users_total: 2, active_users: 1, expired_users: 1, total_tokens: 12345 })
    if (path.endsWith('/fire/plans')) {
      if (request.method() === 'POST') { const next = { ...request.postDataJSON(), id: 'new-plan' }; state.plans.push(next); return ok(next) }
      return ok(state.plans)
    }
    if (/\/fire\/plans\//.test(path)) return ok({ ...request.postDataJSON(), id: plan.id })
    if (path.endsWith('/fire/users')) return ok({ items: [{ ...member, membership: state.membership }], total: 1, page: 1, page_size: 20 })
    if (path.endsWith('/adjustments')) {
      if (state.adjustmentFailure) { state.adjustmentFailure = false; return route.fulfill({ status: 503, json: { success: false, message: '调整暂时失败' } }) }
      const mutation = request.postDataJSON()
      if (mutation.kind === 'resolve_image') {
        const call = state.imageCalls.find(item => item.task_id === mutation.image_task_id)
        if (call) call.status = mutation.image_outcome
      } else if (mutation.kind === 'set_image_limit' || mutation.images != null) {
        const current = state.membership as any
        const limit = mutation.kind === 'set_image_limit' ? mutation.image_limit : Number(current.image_limit || 0) + mutation.images
        Object.assign(state.membership, { image_limit: limit, remaining_images: limit - Number(current.used_images || 0) - Number(current.reserved_images || 0) })
      } else if (mutation.kind === 'set_question_limit' || mutation.questions) {
        const current = state.membership as any
        const limit = mutation.kind === 'set_question_limit' ? mutation.question_limit : Number(current.question_limit || 0) + mutation.questions
        Object.assign(state.membership, { question_limit: limit, remaining_questions: limit ? limit - Number(current.used_questions || 0) - Number(current.reserved_questions || 0) : 0 })
      } else state.membership = { ...state.membership, remaining_tokens: 501 }
      return ok(state.membership)
    }
    if (/\/fire\/users\//.test(path)) return ok({ user: member, membership: state.membership, usage, adjustments: [], image_calls: state.imageCalls })
    if (path.endsWith('/users/create')) {
      if (state.createFailure) { state.createFailure = false; return route.fulfill({ status: 503, json: { success: false, message: '创建暂时失败' } }) }
      return route.fulfill({ status: 201, json: { user: { ...member, id: 'created-user', username: 'taylor001', email: 'taylor001@fire.localhost.test' }, generated_password: 'Ty123456', membership: state.membership } })
    }
    return ok([])
  })
  return { state, writes, calls }
}

test('membership stays inside the avatar menu and exposes percentages without user details', async ({ page }, info) => {
 const mock=await api(page)
 await page.goto('/e2e/fire-membership-harness.html')
 await expect(page.getByRole('region',{name:'会员套餐'})).toHaveCount(0)
 await page.locator('.visual-user-menu__trigger').click()
 const card=page.getByRole('region',{name:'会员套餐'})
 await expect(card).toContainText('火种月度')
 await expect(card).toContainText('<1%')
 await expect(card).toContainText('2026')
 await expect(card).not.toContainText(/Token|明细|999,999|1,000,000|管理账户/i)
 await expect(page.getByRole('link',{name:'用量明细'})).toHaveCount(0)
 mock.state.membership.remaining_tokens=0
 await page.evaluate(()=>window.dispatchEvent(new Event('fire-membership-updated')))
 await expect(card).toContainText('0%')
 await page.locator('.visual-user-menu__trigger').click()
 await expect(card).toHaveCount(0)
 expect(mock.calls.filter(path=>path==='/api/v1/fire/usage')).toEqual([])
 await page.screenshot({path:info.outputPath('member-usage.png'),fullPage:true})
})

for (const [status, label] of [['not_activated', '未开通'], ['expired', '已到期'], ['exhausted', '额度已用完'], ['suspended', '已暂停']]) test(`membership ${status} remains visible without blocking history`, async ({ page }) => {
  await api(page, { status })
  await page.goto('/e2e/fire-membership-harness.html')
  await page.locator('.visual-user-menu__trigger').click()
  const card = page.locator('.fixture-sidebar').getByRole('region', { name: '会员套餐' })
  await expect(card).toContainText(label)
  await expect(page.getByText('历史和新对话入口', { exact: true })).toBeVisible()
  await expect(card.getByRole('link')).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
})

test('membership read failure is honest and retryable without a fake free plan', async ({ page }) => {
  const mock = await api(page, { unavailable: true })
  await page.goto('/e2e/fire-membership-harness.html')
  await page.locator('.visual-user-menu__trigger').click()
  const card = page.locator('.fixture-sidebar').getByRole('region', { name: '会员套餐' })
  await expect(card).toContainText('套餐读取失败')
  await expect(card).not.toContainText('免费')
  mock.state.unavailable = false
  await card.getByRole('button', { name: '重试' }).click()
  await expect(card).toContainText('火种月度')
})

test('non-admin management page renders no users or mutation controls and calls no admin API', async ({ page }) => {
  const mock = await api(page)
  await page.goto('/e2e/fire-membership-harness.html?page=manage')
  await expect(page.getByRole('alert')).toContainText('仅系统管理员')
  await expect(page.getByRole('button', { name: '新建账号' })).toHaveCount(0)
  expect(mock.calls.filter(path => path.includes('/system/admin/'))).toEqual([])
})

test('administrator creates a plan, creates an account with retry-safe operation ID, and adjusts native membership', async ({ page }, info) => {
  const mock = await api(page, { admin: true })
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  const card = page.locator('.fixture-sidebar').getByRole('region', { name: '会员套餐' })
  await expect(card).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '会员管理', exact: true })).toBeVisible()
  await expect(page.locator('.fire-management__table')).toContainText('Taylor学员')
  await page.locator('.t-tabs__nav-item').filter({ hasText: /^套餐$/ }).click()
  await page.getByRole('button', { name: '新建套餐', exact: true }).click()
  const planDialog = page.getByRole('dialog').filter({ hasText: '新建套餐' })
  await planDialog.getByLabel('套餐名称', { exact: true }).fill('年度成长')
  await planDialog.getByLabel('套餐天数', { exact: true }).fill('365')
  await planDialog.getByLabel('套餐 Token', { exact: true }).fill('5000000')
  await planDialog.getByRole('button', { name: '保存套餐' }).click()
  await expect(page.locator('.fire-management__plans')).toContainText('年度成长')
  mock.state.createFailure = true
  await page.getByRole('button', { name: '新建账号', exact: true }).click()
  const createDialog = page.getByRole('dialog').filter({ hasText: '新建账号' })
  await createDialog.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(createDialog.getByRole('alert')).toContainText('创建暂时失败')
  await createDialog.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(createDialog.getByTestId('generated-password')).toHaveText('Ty123456')
  const creates = mock.writes.filter(write => write.path.endsWith('/users/create'))
  expect(creates).toHaveLength(2)
  expect(creates[0].body).toEqual(creates[1].body)
  expect(creates[0].body.operation_id).toMatch(/^[0-9a-f-]{36}$/)
  expect(creates[0].body).not.toHaveProperty('password')
  await createDialog.getByRole('button', { name: '我已保存，关闭' }).click()
  await expect(page.getByText('Ty123456', { exact: true })).toHaveCount(0)
  const saved = await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)].join(' '))
  expect(saved).not.toContain('Ty123456')
  await page.locator('.t-tabs__nav-item').filter({ hasText: /^用户$/ }).click()
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '调整会员', exact: true }).click()
  const adjustDialog = page.getByRole('dialog').filter({ hasText: '调整会员 ·' })
  await adjustDialog.getByLabel('会员操作').selectOption('topup')
  await adjustDialog.getByLabel('调整 Token', { exact: true }).fill('500')
  mock.state.adjustmentFailure = true
  await adjustDialog.getByRole('button', { name: '确认调整' }).click()
  await expect(adjustDialog.getByRole('alert')).toContainText('调整暂时失败')
  await adjustDialog.getByRole('button', { name: '确认调整' }).click()
  await expect(page.locator('.fire-management__definition')).toContainText('501')
  const adjustments = mock.writes.filter(write => write.path.endsWith('/adjustments'))
  expect(adjustments).toHaveLength(2)
  expect(adjustments[0].body).toEqual(adjustments[1].body)
  expect(adjustments[0].body).toMatchObject({ kind: 'topup', tokens: 500 })
  await expect(adjustDialog).toBeHidden()
  await page.screenshot({ path: info.outputPath('admin-membership.png'), fullPage: true })
})

test('account creation requires an enabled plan instead of advertising an unsupported unactivated account', async ({ page }) => {
  const mock = await api(page, { admin: true }); mock.state.plans = []
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.getByRole('button', { name: '新建账号', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建账号', exact: true })
  await expect(dialog).toContainText('暂无可用套餐')
  await expect(dialog.getByRole('button', { name: '创建账号', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('option', { name: '暂不开通' })).toHaveCount(0)
  expect(mock.writes.filter(write => write.path.endsWith('/users/create'))).toEqual([])
})

test('a late membership response from a previous identity cannot replace the new account snapshot', async ({ page }) => {
  await api(page)
  await page.goto('/e2e/fire-membership-harness.html')
  await page.locator('.visual-user-menu__trigger').click()
  const card = page.locator('.fixture-sidebar').getByRole('region', { name: '会员套餐' })
  await expect(card).toContainText('火种月度')
  let release!: () => void, started!: () => void
  const pending = new Promise<void>(resolve => { release = resolve }), requested = new Promise<void>(resolve => { started = resolve })
  let request = 0
  await page.route('**/api/v1/fire/membership', async route => {
    if (++request === 1) { started(); await pending; return route.fulfill({ json: { success: true, data: { ...baseMembership, plan_name: '旧账号私有套餐' } } }) }
    return route.fulfill({ json: { success: true, data: { ...baseMembership, plan_name: '新账号套餐', remaining_tokens: 42 } } })
  })
  await page.evaluate(() => { const fixture = (window as any).__fireFixture; fixture.pending = fixture.membership.refresh() })
  await requested
  await page.evaluate(() => { const auth = (window as any).__fireFixture.auth; auth.setToken('next-account-token'); auth.setUser({ ...auth.user, id: 'member-two', username: '二号用户', tenant_id: 99 }); auth.setTenant({ id: 99, name: '二号空间' }) })
  await expect(card).toContainText('新账号套餐')
  const oldResponse = page.waitForResponse(response => response.url().includes('/fire/membership'))
  release(); await oldResponse
  await page.evaluate(async () => { await (window as any).__fireFixture.pending })
  await expect(card).not.toContainText('旧账号私有套餐')
  await expect(card).toContainText('<1%')
  await expect(card).not.toContainText(/Token/i)
})

test('mobile avatar menu shows allowance percentage without a detail page',async({page},info)=>{
 await page.setViewportSize({width:390,height:844})
 const mock=await api(page)
 await page.goto('/e2e/fire-membership-harness.html?page=usage')
 await expect(page.getByRole('table')).toHaveCount(0)
 await page.locator('.visual-user-menu__trigger').click()
 await expect(page.getByRole('region',{name:'会员套餐'})).toContainText('<1%')
 await expect(page.getByRole('region',{name:'会员套餐'})).not.toContainText(/Token|明细/i)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
 expect(mock.calls.filter(path=>path==='/api/v1/fire/usage')).toEqual([])
 await page.screenshot({path:info.outputPath('member-mobile.png'),fullPage:true})
})

for (const kind of ['grant', 'renew', 'extend', 'suspend', 'resume']) test(`administrator ${kind} sends only applicable fields using the native adjustment API`, async ({ page }) => {
  const mock = await api(page, { admin: true })
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '调整会员', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '调整会员', exact: true })
  await dialog.getByLabel('会员操作').selectOption(kind)
  if (kind === 'extend') await dialog.getByLabel('调整天数', { exact: true }).fill('7')
  await dialog.getByLabel('调整备注').fill('离线验收')
  await dialog.getByRole('button', { name: '确认调整' }).click()
  await expect(dialog).toBeHidden()
  const mutation = mock.writes.find(write => write.path.endsWith('/adjustments'))?.body
  expect(mutation).toMatchObject({ kind, note: '离线验收' })
  if (kind === 'grant' || kind === 'renew') expect(mutation.plan_id).toBe(plan.id)
  else expect(mutation).not.toHaveProperty('plan_id')
  if (kind === 'extend') expect(mutation.duration_days).toBe(7)
  if (kind === 'suspend' || kind === 'resume') { expect(mutation).not.toHaveProperty('tokens'); expect(mutation).not.toHaveProperty('duration_days') }
})

test('native HTTP deployment without crypto.randomUUID can still provision accounts safely', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true }))
  const mock = await api(page, { admin: true })
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.getByRole('button', { name: '新建账号', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建账号', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(dialog.getByTestId('generated-password')).toHaveText('Ty123456')
  expect(mock.writes.find(write => write.path.endsWith('/users/create'))?.body.operation_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('administrator read denial remains an error and recovers through the existing retry control', async ({ page }) => {
  const mock = await api(page, { admin: true })
  let denied = true
  await page.route('**/api/v1/system/admin/fire/users?*', route => denied ? route.fulfill({ status: 403, json: { success: false, message: '没有会员管理权限' } }) : route.fallback())
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await expect(page.getByRole('alert')).toContainText('没有会员管理权限')
  await expect(page.locator('.fire-management__table')).not.toContainText('Taylor学员')
  denied = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.locator('.fire-management__table')).toContainText('Taylor学员')
  expect(mock.writes.filter(write => write.path.includes('/system/admin/'))).toEqual([])
})

test('administrator edits native plan settings including its active flag', async ({ page }) => {
  const mock = await api(page, { admin: true })
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.locator('.t-tabs__nav-item').filter({ hasText: /^套餐$/ }).click()
  await page.getByRole('button', { name: '编辑套餐', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑套餐', exact: true })
  await dialog.getByLabel('套餐名称', { exact: true }).fill('季度套餐')
  await dialog.getByLabel('套餐天数', { exact: true }).fill('90')
  await dialog.getByLabel('套餐 Token', { exact: true }).fill('2000000')
  await dialog.getByRole('checkbox', { name: '启用套餐' }).uncheck()
  await dialog.getByRole('button', { name: '保存套餐', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(mock.writes.find(write => write.path.endsWith(`/plans/${plan.id}`))?.body).toEqual({ name: '季度套餐', duration_days: 90, token_limit: 2000000, question_limit: 0, image_limit: 0, active: false })
})

test('an empty Go plans slice is rendered as an empty catalog without a fake service failure', async ({ page }) => {
  await api(page, { admin: true })
  await page.route('**/api/v1/system/admin/fire/plans', route => route.fulfill({ json: { success: true, data: null } }))
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await expect(page.getByRole('region', { name: '会员概览' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.locator('.t-tabs__nav-item').filter({ hasText: /^套餐$/ }).click()
  await expect(page.getByText('暂无套餐，请先创建。', { exact: true })).toBeVisible()
})


test('lost account credentials recover through the native admin password reset without persisting secrets', async ({ page }) => {
  await api(page, { admin: true })
  let createAttempts = 0
  const recoveredUser = { id: 'member-fixture', username: 'Taylor学员', email: 'fixture@example.test', tenant_id: 42, is_system_admin: false }
  await page.route('**/api/v1/system/admin/users/create', route => ++createAttempts === 1 ? route.abort('failed') : route.fulfill({ status: 200, json: { user: recoveredUser, membership: baseMembership } }))
  const resets: Array<{ email: string; new_password: string }> = []
  await page.route('**/api/v1/system/admin/users/reset-password', route => {
    expect(route.request().headers().authorization).toBe('Bearer membership-fixture-token')
    resets.push(route.request().postDataJSON())
    return resets.length === 1 ? route.fulfill({ status: 503, json: { error: '密码重置暂时失败' } }) : route.fulfill({ json: { message: 'Password reset successfully' } })
  })
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.getByRole('button', { name: '新建账号', exact: true }).click()
  const createDialog = page.getByRole('dialog', { name: '新建账号', exact: true })
  await createDialog.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(createDialog.getByRole('alert')).toBeVisible()
  await createDialog.getByRole('button', { name: '创建账号', exact: true }).click()
  await expect(createDialog).toContainText('密码仅首次创建时返回')
  await createDialog.getByRole('button', { name: '我已保存，关闭' }).click()
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  const resetDialog = page.getByRole('dialog', { name: '重置密码', exact: true })
  await expect(resetDialog).toContainText(recoveredUser.email)
  await expect(resetDialog).toContainText('已有登录将失效')
  await resetDialog.getByRole('button', { name: '确认重置', exact: true }).click()
  await expect(resetDialog.getByRole('alert')).toBeVisible()
  await resetDialog.getByRole('button', { name: '确认重置', exact: true }).click()
  expect(resets).toHaveLength(2)
  expect(resets[0]).toEqual(resets[1])
  expect(resets[1]).toMatchObject({ email: recoveredUser.email, new_password: expect.stringMatching(/^Ty[0-9]{6}$/) })
  const password = resets[1].new_password
  await expect(resetDialog.getByTestId('reset-password')).toHaveText(password)
  await resetDialog.getByRole('button', { name: '我已保存，关闭', exact: true }).click()
  await expect(page.getByText(password, { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)].join(' '))).not.toContain(password)
  await page.getByRole('button', { name: '重置密码', exact: true }).click()
  await expect(resetDialog.getByLabel('重置后的密码', { exact: true })).toHaveValue('')
  await resetDialog.getByLabel('重置后的密码', { exact: true }).fill('Custom12')
  await resetDialog.getByRole('button', { name: '确认重置', exact: true }).click()
  await expect(resetDialog.getByTestId('reset-password')).toHaveText('Custom12')
  expect(resets[2]).toEqual({ email: recoveredUser.email, new_password: 'Custom12' })
})

test('administrator creates a ten-question plan, inherits or overrides it at signup, and manages individual limits', async ({ page }) => {
  const mock = await api(page, { admin: true })
  Object.assign(mock.state.membership, { question_limit: 10, used_questions: 2, reserved_questions: 1, remaining_questions: 7 })
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.locator('.t-tabs__nav-item').filter({ hasText: /^套餐$/ }).click()
  await page.getByRole('button', { name: '新建套餐', exact: true }).click()
  const planDialog = page.getByRole('dialog').filter({ hasText: '新建套餐' })
  await planDialog.getByLabel('套餐名称', { exact: true }).fill('十问体验')
  await planDialog.getByLabel('套餐天数', { exact: true }).fill('7')
  await planDialog.getByLabel('套餐问答上限', { exact: true }).fill('10')
  await planDialog.getByRole('button', { name: '保存套餐' }).click()
  await expect(page.locator('.fire-management__plans')).toContainText('10 条问答')
  expect(mock.writes.find(write => write.path.endsWith('/plans'))?.body).toMatchObject({ name: '十问体验', question_limit: 10, token_limit: 1000000 })

  for (const override of ['', '7', '0']) {
    await page.getByRole('button', { name: '新建账号', exact: true }).click()
    const createDialog = page.getByRole('dialog').filter({ hasText: '新建账号' })
    await createDialog.getByLabel('新账号套餐', { exact: true }).selectOption('new-plan')
    await expect(createDialog).toContainText('套餐默认：10 条问答')
    await createDialog.getByLabel('新账号问答上限', { exact: true }).fill(override)
    await createDialog.getByRole('button', { name: '创建账号', exact: true }).click()
    await expect(createDialog.getByTestId('generated-password')).toBeVisible()
    const mutation = mock.writes.filter(write => write.path.endsWith('/users/create')).at(-1)?.body
    expect(mutation.fire_plan_id).toBe('new-plan')
    if (override === '') expect(mutation).not.toHaveProperty('fire_questions')
    else expect(mutation.fire_questions).toBe(Number(override))
    await createDialog.getByRole('button', { name: '我已保存，关闭' }).click()
  }

  await page.locator('.t-tabs__nav-item').filter({ hasText: /^用户$/ }).click()
  await page.getByRole('button', { name: '详情', exact: true }).click()
  const detail = page.locator('.t-drawer')
  for (const label of ['问答总上限', '已用问答', '剩余问答', '预占问答']) await expect(detail.getByText(label, { exact: true })).toBeVisible()

  async function adjust(kind: string, value: string) {
    await detail.getByRole('button', { name: '调整会员', exact: true }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: '调整会员' })
    await dialog.getByLabel('会员操作').selectOption(kind)
    if (kind === 'set_question_limit') await dialog.getByLabel('用户问答总上限', { exact: true }).fill(value)
    else {
      if (kind === 'renew') await dialog.getByLabel('调整套餐', { exact: true }).selectOption('new-plan')
      await dialog.getByLabel('调整问答条数', { exact: true }).fill(value)
      if (kind === 'topup') await dialog.getByLabel('调整 Token', { exact: true }).fill('0')
    }
    await dialog.getByRole('button', { name: '确认调整', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    return mock.writes.filter(write => write.path.endsWith('/adjustments')).at(-1)?.body
  }
  const firstLimit = await adjust('set_question_limit', '12')
  expect(firstLimit).toMatchObject({ kind: 'set_question_limit', question_limit: 12 })
  expect(Object.keys(firstLimit).sort()).toEqual(['kind', 'operation_id', 'question_limit'])
  await expect(detail.locator('div').filter({ has: page.locator('dt', { hasText: /^剩余问答$/ }) }).last()).toContainText('9')
  expect(await adjust('topup', '5')).toMatchObject({ kind: 'topup', tokens: 0, questions: 5 })
  await expect(detail.locator('dd').filter({ hasText: /^17$/ })).toHaveCount(1)
  await expect(detail.locator('dd').filter({ hasText: /^14$/ })).toHaveCount(1)
  expect(await adjust('renew', '10')).toMatchObject({ kind: 'renew', plan_id: 'new-plan', questions: 10 })
  expect(await adjust('set_question_limit', '0')).toMatchObject({ kind: 'set_question_limit', question_limit: 0 })
  await detail.getByRole('button', { name: '调整会员', exact: true }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: '调整会员' })
  await dialog.getByLabel('会员操作').selectOption('set_question_limit')
  await dialog.getByLabel('用户问答总上限', { exact: true }).fill('2')
  const previous = mock.writes.length
  await dialog.getByRole('button', { name: '确认调整', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('不能低于已用和预占问答')
  expect(mock.writes).toHaveLength(previous)
})

for (const [tokenRemaining, questionRemaining, label] of [[80, 2, '20%'], [20, 9, '20%'], [80, 0, '0%']] as const) test(`ordinary percentage respects token ${tokenRemaining}% and question ${questionRemaining}/10 without exposing counts`, async ({ page }) => {
  const mock = await api(page)
  Object.assign(mock.state.membership, { token_limit: 100, remaining_tokens: tokenRemaining, question_limit: 10, remaining_questions: questionRemaining, used_questions: 10 - questionRemaining, reserved_questions: 0 })
  await page.goto('/e2e/fire-membership-harness.html')
  await page.locator('.visual-user-menu__trigger').click()
  const card = page.getByRole('region', { name: '会员套餐' })
  await expect(card).toContainText(label)
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', label.slice(0, -1))
  await expect(card).not.toContainText(/Token|问答|明细/i)
})


test('image allowance plans, signup overrides and adjustments preserve independent chat allowances', async ({ page }) => {
  const mock = await api(page, { admin: true })
  Object.assign(mock.state.membership, { image_limit: 10, used_images: 2, reserved_images: 1, remaining_images: 7 })
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.locator('.t-tabs__nav-item').filter({ hasText: /^套餐$/ }).click()
  await page.getByRole('button', { name: '新建套餐', exact: true }).click()
  const planDialog = page.getByRole('dialog', { name: '新建套餐', exact: true })
  await planDialog.getByLabel('套餐名称', { exact: true }).fill('十图体验')
  await planDialog.getByLabel('套餐图片张数', { exact: true }).fill('10')
  await planDialog.getByRole('button', { name: '保存套餐' }).click()
  await expect(page.locator('.fire-management__plans')).toContainText('10 张图片')
  expect(mock.writes.find(item => item.path.endsWith('/plans'))?.body).toMatchObject({ image_limit: 10, question_limit: 0, token_limit: 1000000 })
  for (const override of ['', '0', '4']) {
    await page.getByRole('button', { name: '新建账号', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '新建账号', exact: true })
    await dialog.getByLabel('新账号套餐', { exact: true }).selectOption('new-plan')
    await expect(dialog).toContainText('10 张图片')
    await dialog.getByLabel('新账号图片张数', { exact: true }).fill(override)
    await dialog.getByRole('button', { name: '创建账号', exact: true }).click()
    await expect(dialog.getByTestId('generated-password')).toBeVisible()
    const body = mock.writes.filter(item => item.path.endsWith('/users/create')).at(-1)?.body
    if (override === '') expect(body).not.toHaveProperty('fire_images')
    else expect(body.fire_images).toBe(Number(override))
    await dialog.getByRole('button', { name: '我已保存，关闭' }).click()
  }
  await page.locator('.t-tabs__nav-item').filter({ hasText: /^用户$/ }).click()
  await page.getByRole('button', { name: '详情', exact: true }).click()
  const detail = page.locator('.t-drawer')
  for (const label of ['图片总额度', '已用图片', '剩余图片', '预占图片']) await expect(detail.getByText(label, { exact: true })).toBeVisible()
  for (const [kind, amount] of [['topup', '5'], ['renew', '2'], ['set_image_limit', '20']]) {
    await detail.getByRole('button', { name: '调整会员', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '调整会员', exact: true })
    await dialog.getByLabel('会员操作').selectOption(kind)
    await dialog.getByLabel(kind === 'set_image_limit' ? '用户图片总额度' : '调整图片张数', { exact: true }).fill(amount)
    await dialog.getByRole('button', { name: '确认调整', exact: true }).click()
    await expect(dialog).toBeHidden()
    const body = mock.writes.filter(item => item.path.endsWith('/adjustments')).at(-1)?.body
    expect(body).toMatchObject(kind === 'set_image_limit' ? { kind, image_limit: 20 } : { kind, images: Number(amount) })
    if (kind === 'topup') { expect(body.tokens).toBe(0); expect(body).not.toHaveProperty('duration_days'); expect(body).not.toHaveProperty('questions') }
  }
  await detail.getByRole('button', { name: '调整会员', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '调整会员', exact: true })
  await dialog.getByLabel('会员操作').selectOption('set_image_limit')
  await dialog.getByLabel('用户图片总额度', { exact: true }).fill('0')
  const before = mock.writes.length
  await dialog.getByRole('button', { name: '确认调整', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('不能低于已用和预占图片')
  expect(mock.writes).toHaveLength(before)
})

for (const outcome of ['failed', 'succeeded'] as const) test(`administrator explicitly reconciles uncertain image tasks as ${outcome} without rerunning generation`, async ({ page }) => {
  const mock = await api(page, { admin: true })
  mock.state.imageCalls = [{ id: 'image-call-1', task_id: 'uncertain-image-1', status: 'unknown', created_at: '2026-10-19T12:00:00Z' }]
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: outcome === 'failed' ? '确认失败释放' : '确认已交付', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '调整会员', exact: true })
  await expect(dialog).toContainText('不会重新生成图片')
  expect(mock.writes.filter(item => item.path.endsWith('/adjustments'))).toHaveLength(0)
  await dialog.getByLabel('调整备注').fill('已核对实际交付结果')
  await dialog.getByRole('button', { name: '确认调整', exact: true }).click()
  await expect(dialog).toBeHidden()
  const mutations = mock.writes.filter(item => item.path.endsWith('/adjustments'))
  expect(mutations).toHaveLength(1)
  expect(mutations[0].body).toMatchObject({ kind: 'resolve_image', image_task_id: 'uncertain-image-1', image_outcome: outcome, note: '已核对实际交付结果' })
  expect(Object.keys(mutations[0].body).sort()).toEqual(['image_outcome', 'image_task_id', 'kind', 'note', 'operation_id'])
  await expect(page.getByRole('button', { name: '确认失败释放', exact: true })).toHaveCount(0)
})

test('zero image allowance neither grants unlimited images nor changes ordinary chat percentage', async ({ page }) => {
  const mock = await api(page)
  Object.assign(mock.state.membership, { token_limit: 100, remaining_tokens: 80, image_limit: 0, used_images: 0, reserved_images: 0, remaining_images: 0 })
  await page.goto('/e2e/fire-membership-harness.html')
  await page.locator('.visual-user-menu__trigger').click()
  const card = page.getByRole('region', { name: '会员套餐' })
  await expect(card).toContainText('80%')
  await expect(card).not.toContainText(/图片|Token|明细/i)
  expect(mock.calls.filter(path => path.includes('/system/admin/'))).toEqual([])
})


test('showcase establishes native identity before embedding and recovers from bootstrap failure', async ({ page }, info) => {
  await api(page)
  let available = false, bootstraps = 0, frames = 0
  await page.route('**/api/v1/fire-showcase/bootstrap', route => {
    bootstraps++
    expect(route.request().headers().authorization).toBe('Bearer membership-fixture-token')
    return available ? route.fulfill({ json: { success: true, data: { user_id: 'member-fixture', tenant_id: 42 } } }) : route.fulfill({ status: 503, json: { success: false, message: '暂不可用' } })
  })
  await page.route('**/tools/fire-showcase/', route => {
    frames++
    expect(available).toBe(true)
    expect(route.request().url()).not.toContain('token')
    return route.fulfill({ contentType: 'text/html', body: '<body class="fire-workbench"><main><h1>素材工作台</h1><button>上传参考照片</button></main></body>' })
  })
  await page.goto('/e2e/fire-membership-harness.html?page=showcase')
  await expect(page.getByRole('alert')).toContainText('展示面暂时无法打开')
  expect(frames).toBe(0)
  available = true
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.frameLocator('iframe').getByRole('button', { name: '上传参考照片' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(bootstraps).toBe(2); expect(frames).toBe(1)
  await page.screenshot({ path: info.outputPath('showcase-native-frame.png') })
})

test('showcase rejects an unavailable embedded route and retries without a second login UI', async ({ page }) => {
  await api(page)
  await page.route('**/api/v1/fire-showcase/bootstrap', route => route.fulfill({ json: { success: true, data: { user_id: 'member-fixture', tenant_id: 42 } } }))
  let available = false
  await page.route('**/tools/fire-showcase/', route => route.fulfill({ status: available ? 200 : 503, contentType: 'text/html', body: available ? '<body class="fire-workbench"><main>素材工作台</main></body>' : '<h1>503 Service Unavailable</h1>' }))
  await page.goto('/e2e/fire-membership-harness.html?page=showcase')
  await expect(page.getByRole('alert')).toContainText('展示面暂时无法打开')
  await expect(page.getByRole('textbox', { name: /密码|账号/ })).toHaveCount(0)
  available = true
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.frameLocator('iframe').locator('main')).toHaveText('素材工作台')
})


test('native showcase navigation follows agents in expanded and collapsed sidebar', async ({ page }) => {
  await api(page)
  await page.route('**/api/v1/fire-showcase/bootstrap', route => route.fulfill({ json: { success: true, data: { user_id: 'member-fixture', tenant_id: 42 } } }))
  await page.route('**/tools/fire-showcase/', route => route.fulfill({ contentType: 'text/html', body: '<body class="fire-workbench"><main>展示面原工作台</main></body>' }))
  await page.goto('/e2e/fire-membership-harness.html?nav')
  const sidebar = page.locator('.visual-sidebar')
  const order = await sidebar.locator('.visual-sidebar__primary-actions button').allTextContents()
  expect(order.findIndex(text => text.trim() === '展示面')).toBe(order.findIndex(text => text.trim() === '智能体') + 1)
  await sidebar.getByRole('button', { name: '展示面', exact: true }).click()
  await expect(page.frameLocator('iframe').locator('main')).toHaveText('展示面原工作台')
  await expect(sidebar.locator('[data-guide="nav-showcase"]')).toHaveClass(/is-active/)
  await sidebar.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await expect(sidebar.getByRole('button', { name: '展示面', exact: true })).toHaveClass(/is-active/)
})

test('showcase clears private frame on native identity change before loading the next workspace', async ({ page }) => {
  await api(page)
  let nextAccount = false, release: (() => void) | undefined
  await page.route('**/api/v1/fire-showcase/bootstrap', async route => {
    if (nextAccount) await new Promise<void>(resolve => { release = resolve })
    return route.fulfill({ json: { success: true, data: { user_id: nextAccount ? 'member-two' : 'member-fixture', tenant_id: nextAccount ? 99 : 42 } } })
  })
  await page.route('**/tools/fire-showcase/', route => route.fulfill({ contentType: 'text/html', body: '<body class="fire-workbench"><main>私有作品</main></body>' }))
  await page.goto('/e2e/fire-membership-harness.html?page=showcase')
  await expect(page.frameLocator('iframe').locator('main')).toHaveText('私有作品')
  nextAccount = true
  await page.evaluate(() => { const auth = (window as any).__fireFixture.auth; auth.setToken('next-account'); auth.setUser({ ...auth.user, id: 'member-two' }); auth.setTenant({ id: 99 }) })
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('正在打开工作台')
  await expect.poll(() => !!release).toBe(true)
  release!()
  await expect(page.frameLocator('iframe').locator('main')).toHaveText('私有作品')
})


test('administrator can explicitly set zero image grant on an unused account', async ({ page }) => {
  const mock = await api(page, { admin: true })
  Object.assign(mock.state.membership, { image_limit: 10, used_images: 0, reserved_images: 0, remaining_images: 10 })
  await page.goto('/e2e/fire-membership-harness.html?admin&page=manage')
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '调整会员', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '调整会员', exact: true })
  await dialog.getByLabel('会员操作').selectOption('set_image_limit')
  await dialog.getByLabel('用户图片总额度', { exact: true }).fill('0')
  await dialog.getByRole('button', { name: '确认调整', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(mock.writes.find(item => item.path.endsWith('/adjustments'))?.body).toMatchObject({ kind: 'set_image_limit', image_limit: 0 })
  await expect(page.locator('.t-drawer dl div').filter({ has: page.locator('dt', { hasText: /^剩余图片$/ }) })).toContainText('0')
})

test('showcase waits for embedded native app readiness and surfaces late host failure', async ({ page }) => {
  await api(page)
  await page.route('**/api/v1/fire-showcase/bootstrap', route => route.fulfill({ json: { success: true, data: { user_id: 'member-fixture', tenant_id: 42 } } }))
  await page.route('**/tools/fire-showcase/', route => route.fulfill({ contentType: 'text/html', body: '<body class="fire-workbench auth-pending" data-fire-host-state="ready"><main>原生工作台</main></body>' }))
  await page.goto('/e2e/fire-membership-harness.html?page=showcase')
  await expect(page.frameLocator('iframe').locator('main')).toHaveText('原生工作台')
  await expect(page.getByRole('status')).toContainText('正在打开工作台')
  const frame = page.frames().find(frame => frame.url().endsWith('/tools/fire-showcase/'))!
  await frame.evaluate(() => document.body.classList.remove('auth-pending'))
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.locator('iframe')).toHaveClass(/is-ready/)
  await page.locator('iframe').evaluate((element: HTMLIFrameElement) => { element.contentDocument!.body.dataset.fireHostState = 'failed' })
  await expect(page.getByRole('alert')).toContainText('展示面暂时无法打开')
  await expect(page.locator('iframe')).toHaveCount(0)
})

test('showcase gives retry after embedded initialization timeout without automatic reload', async ({ page }) => {
  await page.clock.install()
  await api(page)
  let calls = 0
  await page.route('**/api/v1/fire-showcase/bootstrap', route => { calls++; return route.fulfill({ json: { success: true, data: { user_id: 'member-fixture', tenant_id: 42 } } }) })
  await page.route('**/tools/fire-showcase/', route => route.fulfill({ contentType: 'text/html', body: '<body class="fire-workbench auth-pending"><main>正在初始化</main></body>' }))
  await page.goto('/e2e/fire-membership-harness.html?page=showcase')
  await expect(page.frameLocator('iframe').locator('main')).toHaveText('正在初始化')
  await expect(page.getByRole('status')).toContainText('正在打开工作台')
  await page.clock.fastForward(21000)
  await expect(page.getByRole('alert')).toContainText('展示面暂时无法打开')
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  expect(calls).toBe(1)
})

test('showcase treats sidecar JSON 502 as failure instead of a ready workspace', async ({ page }) => {
  await api(page)
  await page.route('**/api/v1/fire-showcase/bootstrap', route => route.fulfill({ json: { success: true, data: { user_id: 'member-fixture', tenant_id: 42 } } }))
  await page.route('**/tools/fire-showcase/', route => route.fulfill({ status: 502, json: { success: false, error: 'sidecar unavailable' } }))
  await page.goto('/e2e/fire-membership-harness.html?page=showcase')
  await expect(page.getByRole('alert')).toContainText('展示面暂时无法打开')
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  await expect(page.locator('main')).not.toContainText('sidecar unavailable')
})


async function delayedShowcase(page: Page, realHost = true) {
  await api(page)
  await page.route('**/api/v1/fire-showcase/bootstrap', route => route.fulfill({ json: { success: true, data: { user_id: 'member-fixture', tenant_id: 42, allowance: { status: 'active', remaining_images: 10 } } } }))
  let release!: () => void, pendingImage = false
  const heldImage = new Promise<void>(resolve => { release = resolve })
  await page.route('**/tools/fire-showcase/held-original.png', async route => {
    pendingImage = true; await heldImage; pendingImage = false
    try { await route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64') }) } catch { /* removed iframe cancels the intentionally held image */ }
  })
  await page.route('**/tools/fire-showcase/*.js*', route => {
    const path = new URL(route.request().url()).pathname
    const body = path.endsWith('/fire-host.js') ? readFileSync(new URL('../tools/fire-showcase/site/fire-host.js', import.meta.url), 'utf8') : path.endsWith('/workbench.js') ? "document.body.classList.remove('auth-pending')" : ''
    return route.fulfill({ contentType: 'text/javascript', body })
  })
  await page.route('**/tools/fire-showcase/', route => route.fulfill({ contentType: 'text/html', body: `<body class="fire-workbench auth-pending"><nav class="app-rail"></nav><section class="setting-section"><h3 id="model-label"></h3></section><main>已经可以编辑的工作台</main><img src="/tools/fire-showcase/held-original.png">${realHost ? '<script src="/tools/fire-showcase/fire-host.js"></script>' : ''}</body>` }))
  return { release, pending: () => pendingImage }
}

test('showcase becomes ready before iframe load while a restored original image remains pending for 25 seconds', async ({ page }) => {
  await page.clock.install()
  const image = await delayedShowcase(page)
  try {
    await page.goto('/e2e/fire-membership-harness.html?page=showcase')
    await expect(page.frameLocator('iframe').locator('body')).not.toHaveClass(/auth-pending/)
    expect(image.pending()).toBe(true)
    await expect(page.locator('iframe')).toHaveClass(/is-ready/, { timeout: 1000 })
    await page.clock.fastForward(25000)
    expect(image.pending()).toBe(true)
    await expect(page.locator('iframe')).toHaveCount(1)
    await expect(page.locator('iframe')).toHaveClass(/is-ready/)
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally { image.release() }
})

test('showcase ignores forged ready sources and origins and still requires the real child DOM state', async ({ page }) => {
  const image = await delayedShowcase(page, false)
  try {
    await page.goto('/e2e/fire-membership-harness.html?page=showcase')
    await expect(page.frameLocator('iframe').locator('main')).toHaveText('已经可以编辑的工作台')
    await page.locator('iframe').evaluate((element: HTMLIFrameElement) => { element.contentDocument!.body.dataset.fireHostState = 'ready'; element.contentDocument!.body.classList.remove('auth-pending') })
    await page.evaluate(() => {
      const source = document.querySelector('iframe')!.contentWindow
      const data = { type: 'fire-showcase:state', state: 'ready' }
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://untrusted.invalid', source, data }))
      window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data }))
      window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source, data: { ...data, type: 'other-tool:state' } }))
    })
    await expect(page.getByRole('status')).toContainText('正在打开工作台')
    await page.locator('iframe').evaluate((element: HTMLIFrameElement) => element.contentDocument!.body.classList.add('auth-pending'))
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: document.querySelector('iframe')!.contentWindow, data: { type: 'fire-showcase:state', state: 'ready' } })))
    await expect(page.getByRole('status')).toContainText('正在打开工作台')
    await page.locator('iframe').evaluate((element: HTMLIFrameElement) => element.contentDocument!.body.classList.remove('auth-pending'))
    await expect(page.locator('iframe')).toHaveClass(/is-ready/)
  } finally { image.release() }
})

test('showcase host failure before iframe load remains retryable and removes its message listener on unmount', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<any>(), add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window)
    ;(window as any).__messageListeners = listeners
    window.addEventListener = ((type: string, listener: any, options: any) => { if (type === 'message') listeners.add(listener); return add(type, listener, options) }) as any
    window.removeEventListener = ((type: string, listener: any, options: any) => { if (type === 'message') listeners.delete(listener); return remove(type, listener, options) }) as any
  })
  const image = await delayedShowcase(page)
  try {
    await page.goto('/e2e/fire-membership-harness.html?page=showcase')
    await expect(page.locator('iframe')).toHaveClass(/is-ready/)
    const listenerCount = await page.evaluate(() => (window as any).__messageListeners.size)
    expect(listenerCount).toBeGreaterThan(0)
    await page.locator('iframe').evaluate((element: HTMLIFrameElement) => { element.contentDocument!.body.dataset.fireHostState = 'failed' })
    await expect(page.getByRole('alert')).toContainText('展示面暂时无法打开')
    await expect(page.locator('iframe')).toHaveCount(0)
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await expect(page.locator('iframe')).toHaveClass(/is-ready/)
    expect(await page.evaluate(() => (window as any).__messageListeners.size)).toBe(listenerCount)
    await page.evaluate(async () => {
      ;(window as any).__oldShowcaseWindow = document.querySelector('iframe')!.contentWindow
      await (window as any).__fireFixture.router.push('/platform/creatChat')
    })
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).__messageListeners.size)).toBe(listenerCount - 1)
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: (window as any).__oldShowcaseWindow, data: { type: 'fire-showcase:state', state: 'failed' } })))
    await expect(page.getByText('历史和新对话入口', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  } finally { image.release() }
})
