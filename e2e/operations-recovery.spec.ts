import { expect, test, type Page } from '@playwright/test'

const user = {
  id: '11111111-1111-4111-8111-111111111111', username: '恢复验收用户', email: 'recovery@example.test',
  tenant_id: 10001, tenant_name: '验收空间', plan: 'free', is_active: true, tenant_status: 'active',
  knowledge_base_count: 0, document_count: 0, storage_used_bytes: 0, storage_quota_bytes: 5368709120,
}
const users = { rows: [user], total: 1, page: 1, page_size: 25 }
const config = {
  environment: 'PRODUCTION', target: 'production', csrf_token: 'test-csrf', links: {},
  providers: Object.fromEntries(['weknora', 'paddle', 'supabase', 'r2', 'langfuse'].map((key) => [key, { available: true, authority: 'test' }])),
}

async function mockConfig(page: Page) {
  await page.route('**/admin-api/config', (route) => route.fulfill({ json: { data: config } }))
}

test('failed users read recovers when connectivity returns and stops retrying after success', async ({ page }) => {
  await mockConfig(page)
  await page.clock.install()
  let requests = 0
  let available = false
  await page.route('**/admin-api/users?**', (route) => {
    requests += 1
    return !available
      ? route.fulfill({ status: 503, json: { error: 'service unavailable' } })
      : route.fulfill({ json: { data: users } })
  })
  await page.goto('/operations.html#/users')
  await expect(page.getByText('用户加载失败', { exact: true })).toBeVisible()
  available = true
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText(user.email, { exact: true })).toBeVisible()
  await expect(page.getByText('用户加载失败', { exact: true })).toBeHidden()
  const settledRequests = requests
  await page.clock.runFor(15_000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  expect(requests).toBe(settledRequests)
})

for (const event of ['focus', 'visibilitychange'] as const) {
  test(`failed users read retries on ${event} without overlapping requests`, async ({ page }) => {
    await mockConfig(page)
    await page.clock.install()
    let available = false
    let requests = 0
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/admin-api/users?**', async (route) => {
      requests += 1
      if (!available) return route.fulfill({ status: 503, json: { error: 'service unavailable' } })
      await pending
      return route.fulfill({ json: { data: users } })
    })
    await page.goto('/operations.html#/users')
    await expect(page.getByText('用户加载失败', { exact: true })).toBeVisible()
    const failedRequests = requests
    available = true
    await page.evaluate((name) => (name === 'visibilitychange' ? document : window).dispatchEvent(new Event(name)), event)
    await expect.poll(() => requests).toBe(failedRequests + 1)
    await page.evaluate(() => {
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.clock.runFor(15_000)
    expect(requests).toBe(failedRequests + 1)
    release()
    await expect(page.getByText(user.email, { exact: true })).toBeVisible()
  })
}

test('five-second read recovery preserves the open management form and never replays a failed write', async ({ page }) => {
  await mockConfig(page)
  await page.clock.install()
  let available = true
  let reads = 0
  let writes = 0
  await page.route('**/admin-api/users?**', (route) => {
    reads += 1
    return available ? route.fulfill({ json: { data: users } }) : route.fulfill({ status: 503, json: { error: 'service unavailable' } })
  })
  await page.route('**/api/v1/system/admin/tenants/10001/entitlement', (route) => route.fulfill({ json: { data: { plan: 'free', configured_plan: 'free' } } }))
  await page.route('**/api/v1/system/admin/users/*/investigation', (route) => route.fulfill({ json: { data: {} } }))
  await page.route('**/api/v1/system/admin/tenants/10001', (route) => {
    writes += 1
    return route.fulfill({ status: 503, json: { error: '模拟写入失败' } })
  })
  await page.goto('/operations.html#/users')
  await expect(page.getByText(user.email, { exact: true })).toBeVisible()
  available = false
  const failedRead = page.waitForResponse((response) => response.url().includes('/admin-api/users?') && response.status() === 503)
  await page.getByRole('button', { name: '刷新当前页面', exact: true }).click()
  await failedRead
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '管理用户', exact: true }).click()
  const confirmation = page.getByPlaceholder('UPDATE:10001', { exact: true })
  await confirmation.fill('UPDATE:10001')
  await page.getByRole('button', { name: '确认执行', exact: true }).click()
  await expect(page.getByText('模拟写入失败', { exact: true })).toBeVisible()
  const failedReads = reads
  available = true
  await page.clock.runFor(5_000)
  await expect.poll(() => reads).toBeGreaterThan(failedReads)
  await expect(confirmation).toBeVisible()
  await expect(confirmation).toHaveValue('UPDATE:10001')
  await page.clock.runFor(15_000)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(confirmation).toHaveValue('UPDATE:10001')
  expect(writes).toBe(1)
})

test('failed overview automatically retries after five seconds', async ({ page }) => {
  await mockConfig(page)
  await page.clock.install()
  let available = false
  await page.route('**/admin-api/overview', (route) => !available
    ? route.fulfill({ status: 503, json: { error: 'service unavailable' } })
    : route.fulfill({ json: { data: {
      users: { total: 35, active: 34, new_30d: 30 },
      tenants: { total: 35, active: 34, paid: 2, storage_used_bytes: 0, storage_quota_bytes: 0 },
      knowledge: { knowledge_bases: 2, documents: 3, processing: 0, failed: 0, source_bytes: 0, index_bytes: 0 },
      recent_documents: [], storage_backends: [],
    } } }))
  await page.goto('/operations.html#/overview')
  await expect(page.getByText('概览加载失败', { exact: true })).toBeVisible()
  available = true
  await page.clock.runFor(5_000)
  await expect(page.getByText('34 活跃 · 近 30 天新增 30', { exact: true })).toBeVisible()
})

test('failed bootstrap read recovers without reloading the document', async ({ page }) => {
  await page.clock.install()
  let available = false
  let documents = 0
  page.on('request', (request) => { if (request.isNavigationRequest()) documents += 1 })
  await page.route('**/admin-api/config', (route) => available
    ? route.fulfill({ json: { data: config } })
    : route.fulfill({ status: 503, json: { error: 'service unavailable' } }))
  await page.route('**/admin-api/users?**', (route) => route.fulfill({ json: { data: users } }))
  await page.goto('/operations.html#/users')
  await expect(page.getByText('运营中台启动失败', { exact: true })).toBeVisible()
  available = true
  await page.clock.runFor(5_000)
  await expect(page.getByText('运营中台启动失败', { exact: true })).toBeHidden()
  await expect(page.getByText(user.email, { exact: true })).toBeVisible()
  expect(documents).toBe(1)
})

test('expired read session renews privately, updates CSRF, and never replays an unauthorized write', async ({ page }) => {
  await page.clock.install()
  let renewed = false
  let renewals = 0
  let writes = 0
  let mutationCsrf = ''
  await page.route('**/operations.html', (route) => {
    if (route.request().isNavigationRequest()) return route.fallback()
    renewals += 1
    renewed = true
    return route.fulfill({ contentType: 'text/html', body: '<html>private session renewed</html>' })
  })
  await page.route('**/admin-api/config', (route) => route.fulfill({ json: { data: { ...config, csrf_token: renewed ? 'renewed-csrf' : 'expired-csrf' } } }))
  await page.route('**/admin-api/users?**', (route) => renewed
    ? route.fulfill({ json: { data: users } })
    : route.fulfill({ status: 401, json: { error: 'operator session expired' } }))
  await page.route('**/api/v1/system/admin/tenants/10001/entitlement', (route) => route.fulfill({ json: { data: { plan: 'free', configured_plan: 'free' } } }))
  await page.route('**/api/v1/system/admin/users/*/investigation', (route) => route.fulfill({ json: { data: {} } }))
  await page.route('**/api/v1/system/admin/tenants/10001', (route) => {
    writes += 1
    mutationCsrf = route.request().headers()['x-musuw-csrf'] || ''
    return route.fulfill({ status: 401, json: { error: '写入会话已失效' } })
  })
  await page.goto('/operations.html#/users')
  await expect(page.getByText(user.email, { exact: true })).toBeVisible()
  expect(renewals).toBe(1)
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '管理用户', exact: true }).click()
  await page.getByPlaceholder('UPDATE:10001', { exact: true }).fill('UPDATE:10001')
  await page.getByRole('button', { name: '确认执行', exact: true }).click()
  await expect(page.getByText('写入会话已失效', { exact: true })).toBeVisible()
  await page.clock.runFor(15_000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByPlaceholder('UPDATE:10001', { exact: true })).toHaveValue('UPDATE:10001')
  expect(mutationCsrf).toBe('renewed-csrf')
  expect(writes).toBe(1)
  expect(renewals).toBe(1)
})

test('concurrent expired reads including a late old 401 establish only one new session', async ({ page }) => {
  let renewed = false
  let renewals = 0
  let initialConfig = true
  let releaseOldConfig!: () => void
  const pendingConfig = new Promise<void>((resolve) => { releaseOldConfig = resolve })
  await page.route('**/operations.html', (route) => {
    if (route.request().isNavigationRequest()) return route.fallback()
    renewals += 1
    renewed = true
    return route.fulfill({ contentType: 'text/html', body: '<html>private session renewed</html>' })
  })
  await page.route('**/admin-api/config', async (route) => {
    if (initialConfig) {
      initialConfig = false
      await pendingConfig
      return route.fulfill({ status: 401, json: { error: 'operator session expired' } })
    }
    return route.fulfill({ json: { data: { ...config, csrf_token: 'renewed-csrf' } } })
  })
  await page.route('**/admin-api/users?**', (route) => renewed
    ? route.fulfill({ json: { data: users } })
    : route.fulfill({ status: 401, json: { error: 'operator session expired' } }))
  await page.goto('/operations.html#/users')
  await expect(page.getByText(user.email, { exact: true })).toBeVisible()
  releaseOldConfig()
  await expect(page.getByRole('button', { name: 'PRODUCTION', exact: true })).toBeVisible()
  expect(renewals).toBe(1)
})

test('simultaneous expired reads share the pending session renewal', async ({ page }) => {
  let renewed = false
  let renewals = 0
  let expiredReads = 0
  let releaseRenewal!: () => void
  const pendingRenewal = new Promise<void>((resolve) => { releaseRenewal = resolve })
  await page.route('**/operations.html', async (route) => {
    if (route.request().isNavigationRequest()) return route.fallback()
    renewals += 1
    await pendingRenewal
    renewed = true
    return route.fulfill({ contentType: 'text/html', body: '<html>private session renewed</html>' })
  })
  await page.route(/\/admin-api\/(config|users)(\?|$)/, (route) => {
    if (!renewed) {
      expiredReads += 1
      return route.fulfill({ status: 401, json: { error: 'operator session expired' } })
    }
    const data = route.request().url().endsWith('/config') ? { ...config, csrf_token: 'renewed-csrf' } : users
    return route.fulfill({ json: { data } })
  })
  await page.goto('/operations.html#/users')
  await expect.poll(() => expiredReads).toBeGreaterThanOrEqual(2)
  await expect.poll(() => renewals).toBe(1)
  releaseRenewal()
  await expect(page.getByText(user.email, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'PRODUCTION', exact: true })).toBeVisible()
  expect(renewals).toBe(1)
})

test('failed session renewal reports the original read error without a request loop', async ({ page }) => {
  await mockConfig(page)
  await page.clock.install()
  let renewals = 0
  let reads = 0
  await page.route('**/operations.html', (route) => {
    if (route.request().isNavigationRequest()) return route.fallback()
    renewals += 1
    return route.fulfill({ status: 503, body: 'session service unavailable' })
  })
  await page.route('**/admin-api/users?**', (route) => {
    reads += 1
    return route.fulfill({ status: 401, json: { error: 'operator session expired' } })
  })
  await page.goto('/operations.html#/users')
  await expect(page.getByText('用户加载失败', { exact: true })).toBeVisible()
  await expect(page.getByText('operator session expired', { exact: true })).toBeVisible()
  expect(renewals).toBeGreaterThan(0)
  const settledReads = reads
  const settledRenewals = renewals
  await page.clock.runFor(1_000)
  expect(reads).toBe(settledReads)
  expect(renewals).toBe(settledRenewals)
})

test('an already-open user form uses the cookie refreshed by another tab', async ({ page }) => {
  await mockConfig(page)
  await page.route('**/admin-api/users?**', (route) => route.fulfill({ json: { data: users } }))
  await page.route('**/api/v1/system/admin/tenants/10001/entitlement', (route) => route.fulfill({ json: { data: { plan: 'free', configured_plan: 'free' } } }))
  await page.route('**/api/v1/system/admin/users/*/investigation', (route) => route.fulfill({ json: { data: {} } }))
  let mutationCsrf = ''
  let writes = 0
  await page.route('**/api/v1/system/admin/tenants/10001', (route) => {
    writes += 1
    mutationCsrf = route.request().headers()['x-musuw-csrf'] || ''
    return route.fulfill({ status: 403, json: { error: '模拟写入拒绝' } })
  })
  await page.goto('/operations.html#/users')
  await expect(page.getByText(user.email, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '详情', exact: true }).click()
  await page.getByRole('button', { name: '管理用户', exact: true }).click()
  await page.getByPlaceholder('UPDATE:10001', { exact: true }).fill('UPDATE:10001')
  // Browser cookies are shared across tabs, while this page's in-memory token is stale.
  await page.context().addCookies([{ name: 'musuw_admin_csrf', value: 'another-tab-csrf', url: 'http://127.0.0.1:4193' }])
  await page.getByRole('button', { name: '确认执行', exact: true }).click()
  await expect(page.getByText('模拟写入拒绝', { exact: true })).toBeVisible()
  expect(mutationCsrf).toBe('another-tab-csrf')
  expect(writes).toBe(1)
})

test('RuntimeQueues uses the refreshed cookie directly and never replays its write', async ({ page }) => {
  await mockConfig(page)
  await page.clock.install()
  await page.route('**/admin-api/langfuse', (route) => route.fulfill({ json: { data: { available: true, observations: [] } } }))
  await page.route('**/api/v1/system/admin/runtime/queues', (route) => route.fulfill({ json: {
    available: true, pools: [], models: [],
    queues: [{ name: 'default', pool: 'parse', weight: 1, size: 1, pending: 0, active: 0, scheduled: 0, retry: 1, archived: 0, completed: 0, processed: 0, failed: 1, paused: false, latency_ms: 0, memory_usage_bytes: 0 }],
  } }))
  await page.route('**/api/v1/system/admin/runtime/queues/default/tasks?**', (route) => route.fulfill({ json: {
    available: true, tasks: [{ id: 'recovery-task', queue: 'default', type: 'knowledge:parse', state: 'retry', retried: 0, max_retry: 3, allowed_actions: ['run_now'] }], page_size: 20, has_more: false,
  } }))
  let mutationCsrf = ''
  let writes = 0
  await page.route('**/api/v1/system/admin/runtime/queues/default/tasks/recovery-task/actions/run_now', (route) => {
    writes += 1
    mutationCsrf = route.request().headers()['x-musuw-csrf'] || ''
    return route.fulfill({ status: 403, json: { error: '模拟队列操作拒绝' } })
  })
  await page.goto('/operations.html#/logs')
  await expect(page.getByRole('button', { name: 'PRODUCTION', exact: true })).toBeVisible()
  await page.locator('.rq-table-shell').first().locator('tbody tr').first().locator('td').nth(3).getByRole('button').click()
  await expect(page.getByRole('button', { name: '立即执行', exact: true })).toBeVisible()
  await page.context().addCookies([{ name: 'musuw_admin_csrf', value: 'another-tab-csrf', url: 'http://127.0.0.1:4193' }])
  await page.getByRole('button', { name: '立即执行', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => writes).toBe(1)
  expect(mutationCsrf).toBe('another-tab-csrf')
  await page.clock.runFor(15_000)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  expect(writes).toBe(1)
})
