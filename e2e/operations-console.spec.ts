// Browser acceptance for the production-shaped local operations console.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys)
    return keys
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      keys.add(key.toLowerCase())
      collectKeys(item, keys)
    }
  }
  return keys
}

test('operator workflow uses real data and guarded actions', async ({ page }) => {
  const consoleErrors: string[] = []
  let guardedMutationCsrf = ''
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.route(/\/api\/v1\/system\/admin\/runtime\/queues\/[^/]+\/tasks\/[^/]+\/actions\/run_now$/, async (route) => {
    guardedMutationCsrf = route.request().headers()['x-musuw-csrf'] || ''
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
  })

  await page.goto('/')
  await expect(page).toHaveTitle('Musuw Operations')
  await expect(page).toHaveURL(/#\/overview$/)
  await expect(page.getByRole('heading', { name: '概览', exact: true })).toBeVisible()
  await expect(page.getByText(/\d+ 活跃 · 近 30 天新增 \d+/)).toBeVisible()
  await expect(page.getByText(/\d+ \/ \d+/)).toBeVisible()
  await expect(page.getByText('管理 API 已连接')).toBeVisible()

  await page.getByRole('button', { name: '用户', exact: true }).click()
  await expect(page.getByRole('heading', { name: '用户', exact: true })).toBeVisible()
  await expect(page.getByText(/\d+ 位用户/)).toBeVisible()
  await expect.poll(async () => page.getByRole('row').count()).toBeGreaterThan(1)
  await page.getByRole('button', { name: '详情', exact: true }).nth(1).click()
  await expect(page.getByRole('heading', { name: '支持调查（严格脱敏）' })).toBeVisible()
  await expect(page.getByText('OpenRouter 已用')).toBeVisible()
  await page.getByRole('button', { name: '管理用户', exact: true }).click()
  const confirmationInput = page.getByPlaceholder(/^UPDATE:/)
  await expect(confirmationInput).toBeVisible()
  await expect(page.getByRole('button', { name: '确认执行', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.locator('.t-drawer__close-btn').click()

  await page.getByRole('button', { name: '知识库与文档', exact: true }).click()
  await expect(page.getByText(/\d+ 份文档/)).toBeVisible()
  await expect.poll(async () => page.getByRole('row').count()).toBeGreaterThan(1)
  await page.getByRole('button', { name: '详情', exact: true }).first().click()
  await expect(page.getByText('索引 storage_size', { exact: true })).toBeVisible()
  await expect(page.getByText('物理对象引用', { exact: true })).toBeVisible()
  await page.locator('.t-drawer__close-btn').click()

  await page.getByRole('button', { name: '账单', exact: true }).click()
  await expect(page.getByText('Paddle 订阅')).toBeVisible()
  await expect(page.getByText('Paddle 交易')).toBeVisible()
  const billingResponse = await page.request.get('/admin-api/billing')
  expect(billingResponse.status()).toBe(200)
  const billing = (await billingResponse.json()).data
  await expect(page.locator('.ops-metric').filter({ hasText: 'Paddle 订阅' }).locator('.ops-metric__value'))
    .toHaveText(billing.provider.subscriptions_available ? String(billing.provider.subscriptions.length) : '—')
  await expect(page.locator('.ops-metric').filter({ hasText: 'Paddle 交易' }).locator('.ops-metric__value'))
    .toHaveText(billing.provider.transactions_available ? String(billing.provider.transactions.length) : '—')
  const paddleCallout = page.locator('.ops-callout').filter({ hasText: 'Paddle 官方 API' })
  if (!billing.provider.subscriptions_available) {
    await expect(paddleCallout).toContainText(billing.provider.subscriptions_reason)
  }
  if (!billing.provider.transactions_available) {
    await expect(paddleCallout).toContainText(billing.provider.transactions_reason)
  }
  await expect(page.getByText('Paddle 官方数据')).toBeVisible()
  await expect(page.getByText('服务端最小权限凭据读取，浏览器不接触密钥')).toBeVisible()

  await page.getByRole('button', { name: '身份', exact: true }).click()
  const identityResponse = await page.request.get('/admin-api/identity')
  expect(identityResponse.status()).toBe(200)
  const identity = (await identityResponse.json()).data
  await expect(page.getByText(identity.provider.available ? 'Supabase Auth Admin 已连接' : 'Supabase Auth Admin unavailable')).toBeVisible()
  await expect(page.getByText('achfnnicetupvtoqiwqd')).toBeVisible()
  await expect(page.getByText('phtveqtlswzokwsztsvu')).toBeVisible()

  await page.getByRole('button', { name: '存储', exact: true }).click()
  await expect(page.getByText(/\d+ 个对象引用/)).toBeVisible()
  const storageResponse = await page.request.get('/admin-api/storage?page=1&page_size=25')
  expect(storageResponse.status()).toBe(200)
  const storage = (await storageResponse.json()).data
  if (storage.provider.available) {
    await expect(page.getByText('R2 operator available')).toBeVisible()
    await expect(page.getByText('Cloudflare R2 官方对象查询 已连接')).toBeVisible()
    await expect(page.getByText('S3 API CONNECTED')).toBeVisible()
  } else if (storage.provider.applicable === false) {
    await expect(page.getByText('TEST 本地存储')).toBeVisible()
    await expect(page.getByText('TEST 使用本地存储')).toBeVisible()
  } else {
    await expect(page.getByText('R2 operator unavailable')).toBeVisible()
    await expect(page.getByText('Cloudflare R2 官方对象查询 unavailable')).toBeVisible()
  }
  await expect(page.getByText('原文件 file_size', { exact: true })).toBeVisible()
  await expect(page.getByText('索引 storage_size', { exact: true })).toBeVisible()
  await expect(page.getByText('tenant.storage_used', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '日志与追踪', exact: true }).click()
  const langfuseResponse = await page.request.get('/admin-api/langfuse')
  expect(langfuseResponse.status()).toBe(200)
  const langfuse = (await langfuseResponse.json()).data
  await expect(page.getByText(`Langfuse ${langfuse.available ? 'available' : 'unavailable'}`)).toBeVisible()
  await page.getByRole('button', { name: 'Langfuse 追踪', exact: true }).click()
  if (langfuse.available) {
    await expect(page.getByRole('heading', { name: 'Langfuse 官方 Observations' })).toBeVisible()
    if (langfuse.observations.length) {
      await expect.poll(async () => page.locator('.langfuse-host tbody tr').count()).toBeGreaterThan(0)
    }
  } else {
    await expect(page.getByText('Langfuse unavailable')).toBeVisible()
  }
  await page.getByRole('button', { name: '运行队列', exact: true }).click()
  const autoRefresh = page.getByRole('switch', { name: '自动刷新（每 5 秒）' })
  await expect(autoRefresh).toHaveAttribute('aria-checked', 'true')
  await autoRefresh.press('Space')
  await expect(autoRefresh).toHaveAttribute('aria-checked', 'false')
  await autoRefresh.press('Space')
  await expect(autoRefresh).toHaveAttribute('aria-checked', 'true')

  const runtimeResponse = await page.request.get('/api/v1/system/admin/runtime/queues')
  expect(runtimeResponse.status()).toBe(200)
  const runtime = await runtimeResponse.json() as {
    queues: Array<Record<'name' | 'retry' | 'archived' | 'scheduled', string | number>>
  }
  const actionableStates = ['retry', 'archived', 'scheduled'] as const
  let actionable: { queueIndex: number; state: typeof actionableStates[number] } | null = null
  for (const [queueIndex, queue] of runtime.queues.entries()) {
    for (const state of actionableStates) {
      if (Number(queue[state]) < 1) continue
      const tasksResponse = await page.request.get(
        `/api/v1/system/admin/runtime/queues/${encodeURIComponent(String(queue.name))}/tasks?state=${state}&page_size=20`,
      )
      expect(tasksResponse.status()).toBe(200)
      const taskPage = await tasksResponse.json() as { tasks: Array<{ allowed_actions: string[] }> }
      if (taskPage.tasks.some((task) => task.allowed_actions.includes('run_now'))) {
        actionable = { queueIndex, state }
        break
      }
    }
    if (actionable) break
  }
  expect(actionable, 'isolated TEST runtime must expose a real task that supports run_now').not.toBeNull()
  if (!actionable) throw new Error('no actionable TEST runtime task')
  const taskStateColumn = { retry: 3, archived: 4, scheduled: 2 } as const
  const runtimeRow = page.locator('.rq-table-shell').first().locator('tbody tr').nth(actionable.queueIndex)
  await runtimeRow.locator('td').nth(taskStateColumn[actionable.state]).getByRole('button').click()
  await page.getByRole('button', { name: '立即执行', exact: true }).first().click()
  await expect(page.getByText('该任务将立即进入待执行队列，重试次数不会重置。确认继续？')).toBeVisible()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => guardedMutationCsrf.length).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.rq-failed-drawer')).toBeHidden()
  await page.getByRole('button', { name: '系统审计', exact: true }).click()
  await expect.poll(async () => page.getByRole('row').count()).toBeGreaterThan(1)

  expect(consoleErrors).toEqual([])
})

test('security boundary and redaction remain enforced', async ({ page, request }) => {
  const unauthenticated = await request.get('/admin-api/config')
  expect(unauthenticated.status()).toBe(401)

  const documentResponse = await page.goto('/')
  expect(documentResponse?.status()).toBe(200)
  expect(documentResponse?.headers()['content-security-policy']).toContain("default-src 'self'")
  expect(documentResponse?.headers()['x-frame-options']).toBe('DENY')

  const deniedSettings = await page.request.get('/api/v1/system/settings')
  expect(deniedSettings.status()).toBe(404)
  const deniedSystemInfo = await page.request.get('/api/v1/system/info')
  expect(deniedSystemInfo.status()).toBe(404)
  const deniedApiKeys = await page.request.get('/api/v1/system/admin/api-keys')
  expect(deniedApiKeys.status()).toBe(404)
  const deniedMutation = await page.request.patch('/api/v1/system/admin/tenants/10005', { data: {} })
  expect(deniedMutation.status()).toBe(403)

  const usersResponse = await page.request.get('/admin-api/users?page_size=1')
  expect(usersResponse.status()).toBe(200)
  const usersPayload = await usersResponse.json()
  const user = usersPayload.data.rows[0]
  const investigationResponse = await page.request.get(`/api/v1/system/admin/users/${user.id}/investigation`)
  expect(investigationResponse.status()).toBe(200)
  const investigationKeys = collectKeys(await investigationResponse.json())
  for (const forbidden of ['prompt', 'content', 'attachments', 'keys', 'payload', 'api_key', 'secret']) {
    expect(investigationKeys.has(forbidden)).toBe(false)
  }
})

test('all operations pages have no serious accessibility violations', async ({ page }) => {
  const routes = [
    ['overview', '概览'],
    ['users', '用户'],
    ['knowledge', '知识库与文档'],
    ['billing', '账单'],
    ['identity', '身份'],
    ['storage', '存储'],
    ['logs', '日志与追踪'],
  ] as const

  for (const [route, heading] of routes) {
    await page.goto(`/#/${route}`)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const blocking = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact || ''))
    expect(blocking, `${heading} has blocking accessibility violations`).toEqual([])
  }
})
