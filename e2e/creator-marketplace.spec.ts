import { test, expect, type Page } from '@playwright/test'

const taylor = { id: 'taylor', title: '泰勒·测试环境样例', description: 'A curated question-answering service.', category: '知识', agent_id: 'platform-agent', agent_name: '泰勒专属智能体', knowledge_base_ids: ['platform-kb'], knowledge_base_names: ['泰勒知识库'], sample_questions: ['如何理解长期主义？'], default_model_id: 'builtin-deepseek-v4-flash', currency: 'USD', monthly_amount: 1900, yearly_amount: 19000, status: 'published', featured: true, fixture: false, checkout_available: true, created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z', access: { can_chat: false, cancel_at_period_end: false } }
async function expectSelectedService(page: Page, productId: string) {
  await expect.poll(() => page.evaluate(() => (window as any).__marketplaceHarness.settings.settings.marketplaceProductId)).toBe(productId)
  await expect(page.locator('.visual-chat-composer__combined-picker')).toBeVisible()
  await expect(page.locator('.market-service-selection')).toHaveCount(0)
}

async function mockMarket(page: Page, options: { paid?: boolean; max?: boolean; pending?: boolean; creatorDraft?: boolean; pendingOrder?: boolean; refundedOrder?: boolean; existingSubscription?: 'refunded' | 'canceled'; checkoutAvailable?: boolean; free?: boolean; unpublished?: boolean; reviewed?: boolean } = {}) {
  let paid = options.paid || false
  const catalog = { ...taylor, ...(options.free ? { monthly_amount: 0, yearly_amount: 0 } : {}), reviewed_at: options.reviewed ? '2026-09-22T00:00:00Z' : undefined }
  const requests: Array<{ path: string; body: any }> = []
  const counts = { chat: 0, suggestion: 0, details: 0 }
  let creatorProduct = options.creatorDraft ? { ...catalog, status: 'draft', contact: 'creator@example.test', authorization: 'I own these materials.', authorization_confirmed: true } : null
  await page.addInitScript(() => {
    // These workspace scenarios exercise an existing user, not the first-run tour.
    localStorage.setItem('WeKnora_mobile-user_musuw:new-user-guide-done:v2', '1')
    let callback: any
    ;(window as any).PaddleBillingV1 = { Environment: { set() {} }, Initialize({ eventCallback }: any) { callback = eventCallback }, Update() {}, Checkout: { open({ transactionId, settings }: any) { const frame = document.createElement('iframe'); frame.title = 'Paddle checkout'; frame.dataset.transactionId = transactionId; document.querySelector(`.${settings.frameTarget}`)?.append(frame) }, close() {} } }
    ;(window as any).__completePaddle = () => callback?.({ name: 'checkout.completed' })
    ;(window as any).__emitPaddleEvent = (name: string) => callback?.({ name })
  })
  const product = () => ({ ...catalog, status: options.unpublished ? 'unpublished' : catalog.status, checkout_available: options.free ? false : options.checkoutAvailable ?? catalog.checkout_available, access: options.free ? { can_chat: !options.unpublished, portal_available: false, status: 'free', cancel_at_period_end: false } : { can_chat: paid, portal_available: paid || Boolean(options.existingSubscription), subscription_id: paid || options.existingSubscription ? 'sub_owned' : undefined, status: options.existingSubscription || (paid ? 'active' : undefined), paid_through: paid || options.existingSubscription ? '2026-10-22T00:00:00Z' : undefined, cancel_at_period_end: false } })
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (method !== 'GET') requests.push({ path, body: route.request().postDataJSON() })
    if (path.includes('suggested-questions')) counts.suggestion++
    if (path.includes('/agent-chat/') || path.includes('/knowledge-chat/')) { counts.chat++; return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"response_type":"complete","data":{"is_completed":true}}\n\n' }) }
    if (path === '/api/v1/sessions' && method === 'POST') return route.fulfill({ json: { data: { id: 'chat-fixture' } } })
    if (path === '/api/v1/sessions/chat-fixture') return route.fulfill({ json: { data: { id: 'chat-fixture', title: 'Marketplace chat' } } })
    if (path.endsWith('/creator-marketplace/products/taylor/checkout')) return route.fulfill({ json: { configured: true, environment: 'sandbox', client_token: 'test_fixture', transaction_id: 'txn_fixture', subscription_id: '' } })
    if (path.endsWith('/creator-marketplace/subscriptions/sub_owned/portal')) return route.fulfill({ json: { authorization_url: `${new URL(route.request().url()).origin}/portal-confirmed` } })
    if (path.endsWith('/creator-marketplace/orders') && options.free) return route.fulfill({ json: { subscriptions: [], transactions: [], membership_management_path: '/plans' } })
    if (path.endsWith('/creator-marketplace/orders')) return route.fulfill({ json: { subscriptions: [{ id: 'sub_owned', portal_available: !options.pendingOrder, product_id: 'taylor', product_title: taylor.title, billing_period: 'monthly', amount: 1900, currency: 'USD', status: options.refundedOrder ? 'refunded' : options.pendingOrder ? 'creating' : 'active', paid_through: '2026-10-22T00:00:00Z', cancel_at_period_end: true, can_chat: !options.pendingOrder && !options.refundedOrder }], transactions: [{ id: 'txn_paid', product_id: 'taylor', product_title: taylor.title, status: 'completed', currency: 'USD', amount: '1900', billing_period: 'monthly', occurred_at: '2026-09-22T00:00:00Z' }], membership_management_path: '/plans' } })
    if (path.endsWith('/system/creator-marketplace/products/taylor/review')) return route.fulfill({ json: { data: product() } })
    if (path.endsWith('/system/creator-marketplace/products')) return route.fulfill({ json: { data: [{ ...product(), status: options.pending ? 'pending' : 'published', platform_agent_id: 'platform-agent', platform_knowledge_base_ids: ['platform-kb'], paddle_product_id: options.free ? '' : 'pro_configured', monthly_price_id: options.free ? '' : 'pri_monthly', yearly_price_id: options.free ? '' : 'pri_yearly', contact: 'creator@example.test', authorization: 'Review fixture rights', authorization_confirmed: true }], total: 1 } })
    if (path.endsWith('/creator-marketplace/creator/products/taylor/submit')) { creatorProduct = { ...creatorProduct!, status: 'pending' }; return route.fulfill({ json: { data: creatorProduct } }) }
    if (path.endsWith('/creator-marketplace/creator/products/taylor') && method === 'PUT') { const input = route.request().postDataJSON(); creatorProduct = { ...creatorProduct!, ...input, yearly_amount: input.monthly_amount * 10 }; return route.fulfill({ json: { data: creatorProduct } }) }
    if (path.endsWith('/creator-marketplace/creator/products')) return route.fulfill({ json: { data: creatorProduct ? [creatorProduct] : [], total: creatorProduct ? 1 : 0 } })
    if (path.endsWith('/creator-marketplace/products/taylor')) { counts.details++; return route.fulfill({ json: { data: product() } }) }
    if (path.endsWith('/creator-marketplace/products')) return route.fulfill({ json: { data: [{ ...product(), id: 'test', title: '测试商品一', fixture: true }, product()], total: 2 } })
    if (path.endsWith('/entitlements/current')) return route.fulfill({ json: { data: { plan: options.max ? 'max' : 'free', plan_status: options.max ? 'complimentary' : 'free', plan_source: 'complimentary', storage_bytes: 100000000, storage_used: 0 }, billing: { configured: false } } })
    if (path.endsWith('/agents')) return route.fulfill({ json: { data: [{ id: 'platform-agent', name: 'Platform delivery agent', is_builtin: false, config: { agent_mode: 'smart-reasoning', knowledge_bases: ['platform-kb'] } }] } })
    if (path.endsWith('/knowledge-bases')) return route.fulfill({ json: { data: [{ id: 'platform-kb', name: 'Platform delivery knowledge', type: 'document' }] } })
    if (path.includes('/models/scene-options/')) return route.fulfill({ json: { success: true, data: { scene: path.split('/').at(-1), effective_model_id: 'builtin-deepseek-v4-flash', options: [{ model_id: 'builtin-deepseek-v4-flash', display_name: 'DeepSeek V4 Flash', model_type: 'KnowledgeQA', selectable: true, locked: false, is_scene_default: true, is_effective: true }] } } })
    if (path.endsWith('/models')) return route.fulfill({ json: { success: true, data: [{ id: 'builtin-deepseek-v4-flash', name: 'DeepSeek V4 Flash', type: 'KnowledgeQA', status: 'active', is_builtin: true, parameters: { provider: 'openrouter' } }] } })
    return route.fulfill({ json: { success: true, data: [] } })
  })
  return { requests, counts, activate: () => { paid = true } }
}
const visit = (page: Page, path = '/platform/marketplace') => page.goto(`/e2e/marketplace-harness.html?path=${encodeURIComponent(path)}`)

test('public marketplace hides test products and private author metadata', async ({ page }) => {
  await mockMarket(page)
  await visit(page)
  await expect(page.locator('.market-featured')).toContainText(taylor.title)
  await expect(page.getByRole('heading', { name: '测试商品', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '测试商品一', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '市场管理', exact: true })).toBeVisible()
  await expect(page.locator('main')).not.toContainText('creator@example.test')
})

test('yearly checkout waits for server access after Paddle completion', async ({ page }) => {
  const api = await mockMarket(page)
  await visit(page, '/platform/marketplace/taylor')
  await page.getByRole('button', { name: '年付', exact: true }).click()
  await expect(page.locator('.market-price')).toContainText('190.00')
  expect(api.requests).toHaveLength(0)
  await page.getByRole('button', { name: '订阅使用', exact: true }).click()
  await expect(page.locator('iframe[title="Paddle checkout"]')).toBeAttached()
  expect(api.requests[0].body.billing_period).toBe('yearly')
  expect(api.requests[0].body.operation_key).toMatch(/^[a-f0-9-]{36}$/)
  await page.evaluate(() => (window as any).__completePaddle())
  await expect(page.getByRole('heading', { name: '已收到付款结果，正在确认订阅。' })).toBeVisible()
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toHaveCount(0)
  api.activate()
  await expect(page.getByRole('heading', { name: '订阅已生效' })).toBeVisible()
  expect(api.counts.chat).toBe(0)
})

test('a declined payment keeps the same checkout available for retry without an opening error', async ({ page }) => {
  const api = await mockMarket(page)
  await visit(page, '/platform/marketplace/taylor')
  await page.getByRole('button', { name: '订阅使用', exact: true }).click()
  const frame = page.locator('iframe[title="Paddle checkout"]')
  await expect(frame).toBeAttached()
  const originalFrame = await frame.elementHandle()
  const initialDetails = api.counts.details
  await page.evaluate(() => (window as any).__emitPaddleEvent('checkout.payment.failed'))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '重试结账', exact: true })).toHaveCount(0)
  expect(await originalFrame!.evaluate(element => element.isConnected)).toBe(true)
  await expect(frame).toHaveAttribute('data-transaction-id', 'txn_fixture')
  expect(api.counts.details).toBe(initialDetails)
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toHaveCount(0)
  // Paddle retries payment inside this checkout; our integration must not reopen it or create another intent.
  await page.evaluate(() => (window as any).__emitPaddleEvent('checkout.payment.initiated'))
  expect(await originalFrame!.evaluate(element => element.isConnected)).toBe(true)
  await page.evaluate(() => (window as any).__completePaddle())
  await expect(page.getByRole('heading', { name: '已收到付款结果，正在确认订阅。' })).toBeVisible()
  api.activate()
  await expect(page.getByRole('heading', { name: '订阅已生效' })).toBeVisible()
  expect(api.requests.filter(request => request.path.endsWith('/checkout'))).toHaveLength(1)
  expect(api.counts.chat).toBe(0)
})

test('an actual checkout opening error still allows retry using the same transaction', async ({ page }) => {
  const api = await mockMarket(page)
  await visit(page, '/platform/marketplace/taylor')
  await page.getByRole('button', { name: '订阅使用', exact: true }).click()
  await expect(page.locator('iframe[title="Paddle checkout"]')).toBeAttached()
  await page.evaluate(() => (window as any).__emitPaddleEvent('checkout.error'))
  await expect(page.getByRole('alert')).toContainText('结账页打开失败')
  await page.getByRole('button', { name: '重试结账', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('iframe[title="Paddle checkout"]').last()).toHaveAttribute('data-transaction-id', 'txn_fixture')
  expect(api.requests.filter(request => request.path.endsWith('/checkout'))).toHaveLength(1)
})

test('paid product returns to the existing composer with draft, agent, KB and Flash, without generating a question', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const api = await mockMarket(page, { paid: true })
  await visit(page, '/platform/creatChat')
  const textarea = page.locator('textarea').first()
  await textarea.fill('This is my unsent draft')
  await expect.poll(() => page.evaluate(() => (window as any).__marketplaceHarness.menu.newChatDraft)).toBe('This is my unsent draft')
  await page.getByRole('button', { name: 'Visit market', exact: true }).click()
  await page.locator('.market-featured').click()
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.menu.newChatDraft)).toBe('This is my unsent draft')
  const priorSuggestions = api.counts.suggestion
  await page.getByRole('button', { name: '开始提问', exact: true }).click()
  await expectSelectedService(page, taylor.id)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.locator('textarea').first()).toHaveValue('This is my unsent draft')
  const state = await page.evaluate(() => { const h = (window as any).__marketplaceHarness; return { product: h.settings.settings.marketplaceProductId, agent: h.settings.selectedAgentId, kbs: h.settings.settings.selectedKnowledgeBases, model: h.settings.conversationModels.selectedChatModelId } })
  expect(state.product).toBe('taylor'); expect(state.agent).toBe('platform-agent'); expect(state.kbs).toEqual(['platform-kb'])
  expect(state.model).toBe('builtin-deepseek-v4-flash')
  await expect(page.locator('.visual-chat-resource__remove')).toHaveCount(0)
  await expect(page.locator('[data-guide="chat-kb-mention"]')).toHaveAttribute('aria-disabled', 'true')
  expect(api.counts.chat).toBe(0); expect(api.counts.suggestion).toBe(priorSuggestions)
})

test('orders consume the top-level API and open the selected subscription portal', async ({ page }) => {
  const api = await mockMarket(page, { paid: true })
  await visit(page, '/platform/orders')
  await expect(page.locator('.subscription-row')).toContainText('已取消续费')
  await expect(page.locator('.subscription-row')).toContainText(/可使用至.*2026/)
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '付款记录' }).click()
  await expect(page.locator('.market-table')).toContainText('txn_paid')
  await expect(page.locator('.market-table')).toContainText('19.00')
  await page.getByRole('tab', { name: '我的订阅' }).click()
  await page.getByRole('button', { name: '管理订阅', exact: true }).click()
  await expect(page).toHaveURL(/portal-confirmed/)
  expect(api.requests.some(r => r.path.endsWith('/subscriptions/sub_owned/portal'))).toBe(true)
})

test('only Max enables a new creator submission', async ({ page }) => {
  await mockMarket(page)
  await visit(page, '/platform/creator-products')
  await expect(page.getByRole('button', { name: '提交新商品' })).toBeDisabled()
  await expect(page.getByText('创建和提交商品需要有效的 Max 会员。')).toBeVisible()
})

test('admin approves explicit platform delivery resources and both prices', async ({ page }) => {
  const api = await mockMarket(page, { max: true, pending: true })
  await visit(page, '/platform/marketplace-admin')
  await page.getByRole('button', { name: '审核商品', exact: true }).click()
  await page.getByRole('button', { name: '通过并上架', exact: true }).click()
  await expect.poll(() => api.requests.find(r => r.path.endsWith('/review'))?.body).toMatchObject({ action: 'approve', platform_agent_id: 'platform-agent', platform_knowledge_base_ids: ['platform-kb'], monthly_price_id: 'pri_monthly', yearly_price_id: 'pri_yearly' })
})

test('historical marketplace references stay snippets-only after the composer changes', async ({ page }) => {
  await mockMarket(page)
  await visit(page, '/references')
  await page.getByRole('button', { name: 'Switch composer to normal' }).click()
  await expect(page.getByRole('link', { name: /查看文档|打开文档/ })).toHaveCount(0)
  await page.locator('.visual-answer-references__header').click()
  await expect(page.locator('.visual-reference-item')).toContainText('Restricted source document')
  await expect(page.locator('.visual-reference-item__open')).toHaveCount(0)
})


test('explicit sending from the paid product reaches the existing chat transport with its product ID', async ({ page }) => {
  const api = await mockMarket(page, { paid: true })
  await visit(page, '/platform/marketplace/taylor')
  await page.getByRole('button', { name: '开始提问', exact: true }).click()
  await expectSelectedService(page, taylor.id)
  await page.locator('textarea').first().fill('Explain this method')
  await page.locator('[data-guide="chat-send"]').click()
  await expect.poll(() => api.requests.find(r => r.path.includes('/agent-chat/'))?.body).toMatchObject({ marketplace_product_id: 'taylor', agent_id: 'platform-agent', query: 'Explain this method', summary_model_id: 'builtin-deepseek-v4-flash' })
  expect(api.requests.find(r => r.path.includes('/agent-chat/'))?.body.agent_source_tenant_id).toBeUndefined()
})


test('Max creator edits exact-cent pricing and submits the saved draft for review', async ({ page }) => {
  const api = await mockMarket(page, { max: true, creatorDraft: true })
  await visit(page, '/platform/creator-products')
  await page.getByRole('button', { name: '编辑商品', exact: true }).click()
  const monthly = page.locator('.market-form label').filter({ hasText: '月费（美元）' }).locator('input')
  await monthly.fill('25.50')
  await expect(page.locator('.market-form label').filter({ hasText: '年费（美元）' }).locator('input')).toHaveValue('255.00')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(() => api.requests.find(r => r.path.endsWith('/creator/products/taylor'))?.body.monthly_amount).toBe(2550)
  await page.getByRole('button', { name: '提交审核', exact: true }).click()
  await expect(page.locator('article')).toContainText('待审核')
  expect(api.requests.some(r => r.path.endsWith('/taylor/submit'))).toBe(true)
})

test('market and product pricing fit a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockMarket(page)
  await visit(page)
  await expect(page.locator('.market-featured')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.locator('.market-featured').click()
  await expect(page.getByRole('button', { name: '订阅使用', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/creator-marketplace-mobile.png', fullPage: true })
})


test('an unbound checkout order shows its status without an unusable portal action', async ({ page }) => {
  await mockMarket(page, { pendingOrder: true })
  await visit(page, '/platform/orders')
  await expect(page.locator('.subscription-row')).toContainText('正在准备结账')
  await expect(page.locator('.subscription-row')).not.toContainText('可使用至')
  await expect(page.getByRole('button', { name: '管理订阅', exact: true })).toHaveCount(0)
})

test('a refunded subscription does not promise access through its retained paid-through date', async ({ page }) => {
  await mockMarket(page, { refundedOrder: true })
  await visit(page, '/platform/orders')
  await expect(page.locator('.subscription-row .market-badge')).toHaveText('已退款')
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toHaveCount(0)
  await expect(page.locator('.subscription-row')).not.toContainText('可使用至')
})

test('mobile market pages own their scrolling and keep payment status labels on one line', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await mockMarket(page, { paid: true })
  await page.goto('/e2e/mobile-harness.html?page=/platform/orders')
  await expect(page.locator('.subscription-row')).toBeVisible()
  const outlet = page.locator('.platform-route-outlet')
  const bounds = await outlet.evaluate(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight }))
  expect.soft(bounds.scrollHeight).toBe(bounds.height)
  await page.getByRole('tab', { name: '付款记录', exact: true }).click()
  const lines = await page.locator('.market-table .market-badge').evaluate(element => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return range.getClientRects().length
  })
  expect.soft(lines).toBe(1)
  // Focus/navigation must not leave the persistent shell scrolled behind its fixed mobile header.
  await outlet.evaluate(element => { element.scrollTop = 32 })
  await page.locator('.market-table').getByRole('link', { name: taylor.title, exact: true }).click()
  await expect(page.locator('.market-detail-copy h1')).toHaveText(taylor.title)
  const headingBounds = await page.locator('.market-detail-copy h1').boundingBox()
  const headerBounds = await page.locator('.visual-mobile-header').boundingBox()
  expect(headingBounds!.y).toBeGreaterThanOrEqual(headerBounds!.y + headerBounds!.height)
  expect(await outlet.evaluate(element => element.scrollTop)).toBe(0)
})

for (const marketplace of [true, false]) {
  test(`restored ${marketplace ? 'marketplace' : 'ordinary'} history keeps citation permissions after changing the composer`, async ({ page }) => {
    const api = await mockMarket(page)
    let chunkRequests = 0
    const reference = { id: '11111111-1111-4111-8111-111111111111', knowledge_id: 'source-doc', knowledge_base_id: 'source-kb', knowledge_title: 'Saved source', content: 'Saved citation snippet', chunk_type: 'text' }
    await page.route('**/api/v1/chunks/by-id/*', route => { chunkRequests++; return route.fulfill({ json: { data: { content: 'Source-only chunk text' } } }) })
    await page.route('**/api/v1/messages/chat-fixture/load?*', route => route.fulfill({ json: { success: true, data: [
      { id: 'saved-user', role: 'user', content: 'A saved question', is_completed: true, created_at: '2026-09-22T00:00:00Z' },
      { id: 'saved-answer', role: 'assistant', marketplace_product_id: marketplace ? 'taylor' : undefined, content: `Saved answer <kb doc="Saved source" chunk_id="${reference.id}" kb_id="source-kb" />`, is_completed: true, created_at: '2026-09-22T00:00:01Z', model_id: 'builtin-deepseek-v4-flash', knowledge_references: [reference], agent_steps: [{ iteration: 0, thought: '', timestamp: '2026-09-22T00:00:01Z', tool_calls: [{ id: 'saved-search', name: 'knowledge_search', args: {}, result: { success: true, data: { results: [reference], count: 1 } } }] }] },
    ] } }))
    await visit(page)
    await expect(page.locator('.market-featured')).toBeVisible()
    await page.evaluate(async () => {
      const harness = (window as any).__marketplaceHarness
      harness.settings.selectAgent('builtin-quick-answer')
      await harness.router.push('/platform/chat/chat-fixture')
    })
    const citation = page.locator('.visual-chat-message-row.is-assistant .citation-kb').first()
    await expect(citation).toBeVisible()
    await page.evaluate(() => (window as any).__marketplaceHarness.settings.selectAgent('builtin-smart-reasoning'))
    await citation.hover()
    await expect(page.locator('.visual-citation-float')).toContainText(/Saved citation snippet|Source-only chunk text/)
    expect.soft(chunkRequests).toBe(marketplace ? 0 : 1)
    await citation.click()
    await expect(page.locator('.visual-references-panel')).toContainText('Saved citation snippet')
    await expect.soft(page.locator('.visual-reference-item__open')).toHaveCount(marketplace ? 0 : 1)
    await page.locator('.visual-references-panel__close').click()
    await page.locator('.visual-rag-pipeline__summary').first().click()
    await page.locator('.visual-rag-step.is-clickable').first().click()
    await expect(page.locator('.visual-references-panel')).toContainText('Saved citation snippet')
    await expect(page.locator('.visual-reference-item__open')).toHaveCount(marketplace ? 0 : 1)
    expect(api.counts.chat).toBe(0)
  })
}

for (const status of ['active', 'refunded'] as const) {
  test(`${status} product routes subscription management through orders only`, async ({ page }) => {
    const refunded = status === 'refunded'
    const api = await mockMarket(page, { paid: !refunded, existingSubscription: refunded ? 'refunded' : undefined, refundedOrder: refunded, checkoutAvailable: false })
    await visit(page, '/platform/marketplace/taylor')
    await expect(page.locator('.market-purchase')).toContainText(refunded ? '已退款' : '使用中')
    await expect(page.getByRole('button', { name: '管理订阅', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '订阅使用', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '开始提问', exact: true })).toHaveCount(refunded ? 0 : 1)
    if (refunded) await expect(page.locator('.market-purchase')).toContainText('请前往订单管理查看和管理现有订阅。')
    expect(api.requests).toHaveLength(0)
    await page.getByRole('link', { name: '订单管理', exact: true }).click()
    await expect(page.locator('.subscription-row .market-badge')).toHaveText(refunded ? '已退款' : '使用中')
    await page.getByRole('button', { name: '管理订阅', exact: true }).click()
    await expect(page).toHaveURL(/portal-confirmed/)
    expect(api.requests.map(request => request.path)).toEqual(['/api/v1/creator-marketplace/subscriptions/sub_owned/portal'])
  })
}

test('a terminal canceled product can start a new checkout when the server allows it', async ({ page }) => {
  const api = await mockMarket(page, { existingSubscription: 'canceled', checkoutAvailable: true })
  await visit(page, '/platform/marketplace/taylor')
  await page.getByRole('button', { name: '年付', exact: true }).click()
  await page.getByRole('button', { name: '订阅使用', exact: true }).click()
  await expect(page.locator('iframe[title="Paddle checkout"]')).toBeAttached()
  expect(api.requests.find(request => request.path.endsWith('/checkout'))?.body.billing_period).toBe('yearly')
})

test('a free product opens native Flash chat without a checkout, expiry or renewal offer', async ({ page }) => {
  const api = await mockMarket(page, { free: true })
  await visit(page, '/platform/creatChat')
  await expect(page.locator('.market-home-entry')).toContainText('免费')
  await page.getByRole('button', { name: 'Visit market', exact: true }).click()
  await expect(page.locator('.market-featured .market-price')).toHaveText('免费')
  await expect(page.locator('.market-card .market-price')).toHaveText('免费')
  await page.locator('.market-featured').click()
  const purchase = page.locator('.market-purchase')
  await expect(purchase.getByRole('heading', { name: '免费', exact: true })).toBeVisible()
  await expect(purchase).not.toContainText(/有效至|可使用至|自动续费|税费|月付|年付/)
  await expect(purchase).toContainText('AI 问答消耗您自己的 Musuw 模型额度。')
  await expect(page.getByRole('button', { name: '订阅使用', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '管理订阅', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '开始提问', exact: true }).click()
  await expectSelectedService(page, taylor.id)
  expect(api.requests).toHaveLength(0)
  expect(api.counts.chat).toBe(0)
  await page.locator('textarea').first().fill('Explain this free service')
  await page.locator('[data-guide="chat-send"]').click()
  await expect.poll(() => api.requests.find(r => r.path.includes('/agent-chat/'))?.body).toMatchObject({ marketplace_product_id: 'taylor', summary_model_id: 'builtin-deepseek-v4-flash' })
  expect(api.requests.some(r => /\/checkout$|\/portal$/.test(r.path))).toBe(false)
  await visit(page, '/platform/orders')
  await expect(page.getByText('您还没有订阅知识商品。')).toBeVisible()
  await page.getByRole('tab', { name: '付款记录', exact: true }).click()
  await expect(page.getByText('暂无知识商品付款记录。')).toBeVisible()
})

test('an unpublished free product cannot start questions or checkout', async ({ page }) => {
  const api = await mockMarket(page, { free: true, unpublished: true })
  await visit(page, '/platform/marketplace/taylor')
  await expect(page.locator('.market-purchase')).toContainText('该免费服务暂不可用。')
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '订阅使用', exact: true })).toHaveCount(0)
  expect(api.requests).toHaveLength(0)
})

test('an explicit free product replaces a persisted Taylor selection on the first composer mount', async ({ page }) => {
  const api = await mockMarket(page, { paid: true })
  const reading = { ...taylor, id: 'reading-free', title: '阅读复盘卡·免费示例', agent_id: 'reading-agent', agent_name: '阅读复盘助手', knowledge_base_ids: ['reading-kb'], knowledge_base_names: ['阅读复盘资料'], sample_questions: ['阅读复盘卡应该记录哪些内容？'], monthly_amount: 0, yearly_amount: 0, checkout_available: false, access: { can_chat: true, status: 'free', portal_available: false, cancel_at_period_end: false } }
  await page.route('**/api/v1/creator-marketplace/products/reading-free', route => route.fulfill({ json: { data: reading } }))
  await visit(page, '/platform/marketplace/reading-free')
  // Existing persisted defaults, without warming the new composer's product cache.
  await page.evaluate(async () => {
    const harness = (window as any).__marketplaceHarness
    await harness.settings.selectMarketplaceProduct({ productId: 'taylor', agentId: 'platform-agent', knowledgeBaseIds: ['platform-kb'] })
    harness.menu.newChatDraft = 'Keep my unsent question'
  })
  await page.getByRole('button', { name: '开始提问', exact: true }).click()
  await expectSelectedService(page, reading.id)
  await expect(page.locator('.visual-chat-resource')).toContainText('阅读复盘资料')
  await expect(page.locator('.visual-new-chat-suggestions')).toContainText(reading.sample_questions[0])
  await expect(page.locator('textarea').first()).toHaveValue('Keep my unsent question')
  const state = await page.evaluate(() => { const h = (window as any).__marketplaceHarness; return { product: h.settings.settings.marketplaceProductId, agent: h.settings.selectedAgentId, kbs: h.settings.settings.selectedKnowledgeBases, model: h.settings.conversationModels.selectedChatModelId, pendingProduct: h.router.currentRoute.value.query.marketplace_product } })
  expect(state).toEqual({ product: reading.id, agent: reading.agent_id, kbs: reading.knowledge_base_ids, model: 'builtin-deepseek-v4-flash', pendingProduct: undefined })
  expect(api.requests).toHaveLength(0)
  expect(api.counts.chat).toBe(0)
  expect(api.counts.suggestion).toBe(0)
})

for (const outcome of ['denied', 'failed'] as const) {
  test(`a ${outcome} free entry cannot send through warm Taylor and returns to its own detail`, async ({ page }) => {
    const api = await mockMarket(page, { paid: true })
    const reading = { ...taylor, id: 'reading-free', title: '阅读复盘卡·免费示例', agent_id: 'reading-agent', knowledge_base_ids: ['reading-kb'], monthly_amount: 0, yearly_amount: 0, checkout_available: false, access: { can_chat: true, status: 'free', portal_available: false, cancel_at_period_end: false } }
    let reads = 0
    let entryRequested!: () => void
    const requested = new Promise<void>(resolve => { entryRequested = resolve })
    let releaseEntry!: () => void
    const blocked = new Promise<void>(resolve => { releaseEntry = resolve })
    await page.route('**/api/v1/creator-marketplace/products/reading-free', async route => {
      if (++reads === 1) return route.fulfill({ json: { data: reading } })
      if (reads === 2) { entryRequested(); await blocked }
      return outcome === 'failed'
        ? route.fulfill({ status: 503, json: { message: 'Product temporarily unavailable' } })
        : route.fulfill({ json: { data: { ...reading, status: 'unpublished', access: { ...reading.access, can_chat: false } } } })
    })
    await visit(page, '/platform/marketplace/taylor')
    await page.getByRole('button', { name: '开始提问', exact: true }).click()
    await expectSelectedService(page, taylor.id)
    await page.locator('textarea').first().fill('Keep this draft while changing products')
    await page.evaluate(() => (window as any).__marketplaceHarness.router.push('/platform/marketplace/reading-free'))
    await page.getByRole('button', { name: '开始提问', exact: true }).click()
    await requested
    await expect(page.locator('textarea').first()).toHaveValue('Keep this draft while changing products')
    await page.locator('[data-guide="chat-send"]').click()
    await expect(page.getByRole('status')).toHaveText('正在打开专属服务…')
    await expect.poll(() => api.requests.length).toBe(0)
    await expect(page.locator('textarea').first()).toHaveValue('Keep this draft while changing products')
    releaseEntry()
    await expect.poll(() => page.evaluate(() => (window as any).__marketplaceHarness.router.currentRoute.value.path)).toBe('/platform/marketplace/reading-free')
    await expect(page.getByRole('status')).toHaveCount(0)
    await expect(page.locator('main')).toContainText(outcome === 'failed' ? '加载失败' : '该免费服务暂不可用。')
    await expect.poll(() => page.evaluate(() => (window as any).__marketplaceHarness.menu.newChatDraft)).toBe('Keep this draft while changing products')
    expect(api.requests).toHaveLength(0)
    expect(api.counts.chat).toBe(0)
    expect(api.counts.suggestion).toBe(0)
  })
}

test('a late failed entry cannot redirect a newer same-page product selection', async ({ page }) => {
  const api = await mockMarket(page, { paid: true })
  let entryRequested!: () => void
  const requested = new Promise<void>(resolve => { entryRequested = resolve })
  let releaseEntry!: () => void
  const blocked = new Promise<void>(resolve => { releaseEntry = resolve })
  await page.route('**/api/v1/creator-marketplace/products/reading-free', async route => {
    entryRequested(); await blocked
    await route.fulfill({ status: 503, json: { message: 'Product temporarily unavailable' } })
  })
  const nextProduct = { ...taylor, id: 'next-free', title: '问题拆解练习·免费示例', agent_id: 'next-agent', knowledge_base_ids: ['next-kb'], monthly_amount: 0, yearly_amount: 0, checkout_available: false, access: { can_chat: true, status: 'free', portal_available: false, cancel_at_period_end: false } }
  await page.route('**/api/v1/creator-marketplace/products/next-free', route => route.fulfill({ json: { data: nextProduct } }))
  await visit(page, '/platform/marketplace/taylor')
  await page.getByRole('button', { name: '开始提问', exact: true }).click()
  await expectSelectedService(page, taylor.id)
  await page.evaluate(() => (window as any).__marketplaceHarness.router.push({ path: '/platform/creatChat', query: { marketplace_product: 'reading-free' } }))
  await requested
  await page.evaluate(() => (window as any).__marketplaceHarness.router.push({ path: '/platform/creatChat', query: { marketplace_product: 'next-free' } }))
  await expectSelectedService(page, nextProduct.id)
  const staleResponse = page.waitForResponse(response => response.url().endsWith('/products/reading-free'))
  releaseEntry()
  await staleResponse
  await page.waitForLoadState('networkidle')
  await expectSelectedService(page, nextProduct.id)
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.router.currentRoute.value.path)).toBe('/platform/creatChat')
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.settings.settings.marketplaceProductId)).toBe(nextProduct.id)
  expect(api.requests).toHaveLength(0)
  expect(api.counts.chat).toBe(0)
})

test('Max creator saves and submits a zero-price draft as a free product', async ({ page }) => {
  const api = await mockMarket(page, { max: true, creatorDraft: true })
  await visit(page, '/platform/creator-products')
  await page.getByRole('button', { name: '编辑商品', exact: true }).click()
  await page.locator('.market-form label').filter({ hasText: '月费（美元）' }).locator('input').fill('0')
  await expect(page.locator('.market-form label').filter({ hasText: '年费（美元）' }).locator('input')).toHaveValue('0.00')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(() => api.requests.find(r => r.path.endsWith('/creator/products/taylor'))?.body.monthly_amount).toBe(0)
  await expect(page.locator('article .market-note')).toHaveText('免费')
  await page.getByRole('button', { name: '提交审核', exact: true }).click()
  await expect(page.locator('article')).toContainText('待审核')
})

test('admin publishes a free product using platform resources without Paddle configuration', async ({ page }) => {
  const api = await mockMarket(page, { free: true, max: true, pending: true })
  await visit(page, '/platform/marketplace-admin')
  await page.getByRole('button', { name: '审核商品', exact: true }).click()
  await expect(page.getByText('免费服务无需配置 Paddle 商品或价格。')).toBeVisible()
  await expect(page.locator('.market-form label').filter({ hasText: 'Paddle 商品 ID' })).toHaveCount(0)
  await page.getByRole('button', { name: '通过并上架', exact: true }).click()
  await expect.poll(() => api.requests.find(r => r.path.endsWith('/review'))?.body).toMatchObject({ action: 'approve', platform_agent_id: 'platform-agent', platform_knowledge_base_ids: ['platform-kb'], paddle_product_id: '', monthly_price_id: '', yearly_price_id: '' })
  await expect(page.locator('.market-table tbody tr td').nth(2)).toHaveText('免费')
})

test('the sidebar omits orders in both widths while the marketplace header retains billing access', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await mockMarket(page, { paid: true })
  await page.goto('/e2e/mobile-harness.html?page=/platform/marketplace/taylor')
  const sidebar = page.locator('.visual-sidebar')
  await expect(sidebar.getByRole('button', { name: '知识市场', exact: true })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: '订单管理', exact: true })).toHaveCount(0)
  await sidebar.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await expect(sidebar).toHaveClass(/is-collapsed/)
  await expect(sidebar.getByRole('button', { name: '订单管理', exact: true })).toHaveCount(0)
  await page.locator('.market-header').getByRole('link', { name: '订单管理', exact: true }).click()
  await expect(page.locator('.subscription-row').getByRole('button', { name: '管理订阅', exact: true })).toBeVisible()
})

for (const free of [true, false]) {
  test(`reviewed ${free ? 'free' : 'paid'} products cannot change their pricing mode in the editor`, async ({ page }) => {
    const api = await mockMarket(page, { free, max: true, reviewed: true })
    await visit(page, '/platform/marketplace-admin')
    await page.getByRole('button', { name: '编辑商品', exact: true }).click()
    const monthly = page.locator('.market-form label').filter({ hasText: '月费（美元）' }).locator('input')
    await expect(monthly).toHaveValue(free ? '0.00' : '19.00')
    await monthly.fill(free ? '1' : '0')
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('已审核商品不能在免费与付费之间切换。')
    expect(api.requests).toHaveLength(0)
  })
}


const libraryEntry = { product_id: 'taylor', product_title: taylor.title, agent_id: 'platform-agent', agent_name: '泰勒专属智能体', can_chat: true, knowledge_base_id: 'platform-kb', name: '已订阅泰勒知识库', description: 'Published Wiki and graph.', wiki_enabled: true, can_read: true, status: 'active', paid_through: '2026-10-22T00:00:00Z', cancel_at_period_end: true }
async function mockLibrary(page: Page, options: { denied?: boolean; empty?: boolean } = {}) {
  await mockMarket(page, { paid: true })
  const reads: string[] = []
  const forbidden: string[] = []
  let contentFailure = 0
  const entry = { ...libraryEntry, can_chat: !options.denied, can_read: !options.denied, wiki_enabled: !options.empty, status: options.denied ? 'refunded' : 'active' }
  const second = { ...libraryEntry, product_id: 'other', knowledge_base_id: 'other-kb', name: '第二个订阅库' }
  const wikiPage = (name: string) => ({ id: name, slug: 'published', title: name, page_type: 'concept', status: 'published', content: `# ${name}\n公开 Wiki 正文。[[other|下一页]]\n![private](/api/v1/knowledge/platform-kb/file)\n[原文件](/api/v1/knowledge/source-doc/download)\n<svg><image href="/api/v1/knowledge/source-doc/file" /></svg><span style="background-image:url(/api/v1/knowledge/source-doc/background)">已发布文本</span>`, source_refs: ['source-doc'], in_links: [], out_links: ['other'], aliases: [], category_path: [], version: 1, created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z' })
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/knowledge-bases') return route.fulfill({ json: { success: true, data: [] } })
    if (path === '/api/v1/creator-marketplace/library') return route.fulfill({ json: { data: [entry, second] } })
    if (path.includes('/wiki') || path.includes('/knowledge/') || path.includes('/files/')) {
      reads.push(path)
      if (route.request().method() !== 'GET' || !path.includes('/creator-marketplace/') || /issues|revisions|file|download/.test(path)) forbidden.push(path)
      if (contentFailure && path.includes('/pages/')) return route.fulfill({ status: contentFailure, json: { message: 'Access unavailable' } })
      const name = path.includes('/other/') ? '第二个订阅库正文' : '泰勒公开页面'
      if (path.endsWith('/pages')) return route.fulfill({ json: { data: { pages: [wikiPage(name)], total: 1, page: 1, page_size: 100, total_pages: 1 } } })
      if (path.endsWith('/folders')) return route.fulfill({ json: { data: { folders: [{ id: 'folder', name: '已发布目录', path: '已发布目录', depth: 0, page_count: 1, has_children: false }] } } })
      if (path.endsWith('/index')) return route.fulfill({ json: { data: { intro: `[[published|${name}]]`, groups: [] } } })
      if (path.endsWith('/stats')) return route.fulfill({ json: { data: { total_pages: 1, pages_by_type: { concept: 1 }, total_links: 1, orphan_count: 0, recent_updates: [], pending_tasks: 0, pending_issues: 2, is_active: false } } })
      if (path.endsWith('/graph')) return route.fulfill({ json: { data: { nodes: [{ slug: 'published', title: name, page_type: 'concept', link_count: 0 }], edges: [], meta: { mode: 'overview', total: 1, returned: 1, truncated: false } } } })
      if (path.endsWith('/search')) return route.fulfill({ json: { data: { pages: [wikiPage(name)] } } })
      return route.fulfill({ json: { data: wikiPage(name) } })
    }
    return route.fallback()
  })
  return { reads, forbidden, fail: (status: number) => { contentFailure = status } }
}
const libraryPath = '/platform/marketplace/taylor/knowledge-bases/platform-kb'

test('subscribed knowledge cards open existing read-only Wiki and retain the product chat entry', async ({ page }) => {
  const api = await mockLibrary(page)
  await visit(page, '/platform/knowledge-bases')
  const section = page.getByRole('region', { name: '已订阅知识库', exact: true })
  await expect(section).toContainText('已订阅泰勒知识库')
  await expect(section).not.toContainText('只读')
  await expect(section.locator('.visual-reference-kb-card__footer').first()).toContainText('2026')
  await expect(section.locator('.visual-reference-kb-card__footer').first()).toContainText('已取消续费')
  await expect(page.locator('.visual-kb-empty')).toHaveCount(0)
  await expect(section.getByRole('button', { name: /更多|收藏|复制/ })).toHaveCount(0)
  await section.getByText('已订阅泰勒知识库', { exact: true }).click()
  await expect(page.locator('.visual-knowledge-page .visual-knowledge-header')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Wiki', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.visual-knowledge-header')).toContainText('已取消续费')
  await expect(page.locator('.visual-knowledge-header')).not.toContainText('分别计费')
  await expect(page.locator('.visual-knowledge-header')).not.toContainText('只读')
  await expect(page.locator('.visual-knowledge-wiki-host .wiki-browser')).toBeVisible()
  await page.locator('.wiki-content-link').filter({ hasText: '泰勒公开页面' }).first().click()
  await expect(page.locator('.wiki-reader')).toContainText('公开 Wiki 正文')
  await expect(page.getByRole('button', { name: /编辑|历史|删除|新建|修复|导出|下载/ })).toHaveCount(0)
  await expect(page.locator('.wiki-browser [draggable="true"]')).toHaveCount(0)
  await expect(page.locator('.wiki-reader img')).toHaveCount(0)
  await expect(page.locator('.wiki-reader a[href*="/api/v1/"]')).toHaveCount(0)
  expect(api.forbidden).toEqual([])
  await page.getByRole('button', { name: '开始提问', exact: true }).click()
  await expectSelectedService(page, taylor.id)
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.settings.settings.marketplaceProductId)).toBe('taylor')
})

test('expired subscriptions remain visible but never request Wiki content', async ({ page }) => {
  const api = await mockLibrary(page, { denied: true })
  await visit(page, '/platform/knowledge-bases')
  const section = page.getByRole('region', { name: '已订阅知识库', exact: true })
  await expect(section).toContainText('已退款')
  await expect(section).toContainText('2026')
  await section.getByText('已订阅泰勒知识库', { exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('当前订阅不可访问')
  await expect(page.getByRole('link', { name: '订单管理', exact: true })).toBeVisible()
  await expect(page.locator('.wiki-browser')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toHaveCount(0)
  expect(api.reads).toEqual([])
})

test('subscribed library handles absent Wiki without fetching native assets', async ({ page }) => {
  const api = await mockLibrary(page, { empty: true })
  await visit(page, libraryPath)
  await expect(page.getByRole('status')).toContainText('暂未发布 Wiki')
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toBeVisible()
  expect(api.reads).toEqual([])
})

test('subscription changes clear the previous Wiki and graph fits mobile', async ({ page }) => {
  let mainFrameNavigations = 0
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) mainFrameNavigations++ })
  await page.setViewportSize({ width: 430, height: 932 })
  const api = await mockLibrary(page)
  await visit(page, libraryPath)
  await expect(page.locator('.wiki-content-link').first()).toContainText('泰勒公开页面')
  const navigationsBeforeInteraction = mainFrameNavigations
  await page.evaluate(() => (window as any).__marketplaceHarness.router.push('/platform/marketplace/other/knowledge-bases/other-kb'))
  await expect(page.locator('.wiki-content-link').first()).toContainText('第二个订阅库正文')
  await expect(page.locator('.wiki-browser')).not.toContainText('泰勒公开页面')
  await page.getByRole('tab', { name: '图谱', exact: true }).click()
  await expect.poll(() => api.reads.some(path => path.includes('/other/') && path.endsWith('/graph'))).toBe(true)
  await expect(page.locator('.wiki-graph-search-container')).toBeVisible()
  await expect(page.locator('.visual-knowledge-breadcrumb__current')).toHaveText('第二个订阅库')
  expect(mainFrameNavigations).toBe(navigationsBeforeInteraction)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(api.forbidden).toEqual([])
})

for (const status of [403, 503]) test(`a fresh Wiki ${status} clears content without restoring another library`, async ({ page }) => {
  const api = await mockLibrary(page)
  await visit(page, libraryPath)
  await expect(page.locator('.wiki-content-link').first()).toContainText('泰勒公开页面')
  api.fail(status)
  await page.locator('.wiki-content-link').first().click()
  await expect(page.locator('.wiki-browser')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText(status === 403 ? '当前订阅不可访问' : '暂时无法加载')
  if (status === 503) await expect(page.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  expect(api.forbidden).toEqual([])
})


for (const editable of [true, false]) test(`native Wiki preserves ${editable ? 'editing' : 'ordinary read-only history'} without market scope`, async ({ page }) => {
  await mockMarket(page)
  const requests: string[] = []
  const entry = { id: 'own-page', slug: 'own-page', title: '自建知识页面', page_type: 'concept', status: 'published', content: 'Own Wiki text', source_refs: [], in_links: [], out_links: [], aliases: [], version: 1 }
  await page.route('**/api/v1/knowledgebase/own-kb/wiki/**', route => {
    const path = new URL(route.request().url()).pathname
    requests.push(path)
    if (path.endsWith('/index')) return route.fulfill({ json: { data: { intro: '[[own-page|自建知识页面]]', groups: [] } } })
    if (path.endsWith('/pages')) return route.fulfill({ json: { data: { pages: [entry], total: 1 } } })
    if (path.endsWith('/folders')) return route.fulfill({ json: { data: { folders: [] } } })
    if (path.endsWith('/issues')) return route.fulfill({ json: { data: [] } })
    if (path.endsWith('/stats')) return route.fulfill({ json: { data: { total_pages: 1, pages_by_type: { concept: 1 }, pending_tasks: 0, pending_issues: 0, is_active: false } } })
    if (path.includes('/revisions/')) return route.fulfill({ json: { data: { revisions: [], total: 0 } } })
    return route.fulfill({ json: { data: entry } })
  })
  await page.goto(`/e2e/marketplace-harness.html?path=/native-wiki&editable=${editable}`)
  await page.locator('.wiki-content-link').filter({ hasText: '自建知识页面' }).first().click()
  await expect(page.locator('.wiki-reader')).toContainText('Own Wiki text')
  await page.getByRole('button', { name: '历史', exact: true }).click()
  await expect.poll(() => requests.some(path => path.includes('/revisions/'))).toBe(true)
  if (editable) await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
  else await expect(page.getByRole('button', { name: '编辑', exact: true })).toHaveCount(0)
})


test('a stale unpublished Wiki link reports page absence without locking the subscription', async ({ page }) => {
  const api = await mockLibrary(page)
  await visit(page, libraryPath)
  await expect(page.locator('.wiki-content-link').first()).toContainText('泰勒公开页面')
  api.fail(404)
  await page.locator('.wiki-content-link').first().click()
  await expect(page.getByText('页面不存在或尚未公开。', { exact: true })).toBeVisible()
  await expect(page.locator('.wiki-browser')).toBeVisible()
  await expect(page.locator('.wiki-content-link').first()).toContainText('泰勒公开页面')
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toBeVisible()
  await expect(page.locator('.market-library-reader [role="alert"]')).toHaveCount(0)
  expect(api.forbidden).toEqual([])
})


test('subscription cards share native grid geometry and Wiki badges without invented metadata', async ({ page }) => {
  await mockLibrary(page)
  await page.route('**/api/v1/knowledge-bases', route => route.fulfill({ json: { data: [{ id: 'own-kb', name: '我的对照知识库', description: libraryEntry.description, type: 'document', tenant_id: 42, knowledge_count: 7, indexing_strategy: { wiki_enabled: true } }] } }))
  await page.route('**/api/v1/creator-marketplace/library', route => route.fulfill({ json: { data: [libraryEntry, { ...libraryEntry, product_id: 'without-wiki', knowledge_base_id: 'plain-kb', name: '未公开索引配置的订阅库', wiki_enabled: false }] } }))
  await visit(page, '/platform/knowledge-bases')
  const subscribed = page.getByRole('region', { name: '已订阅知识库', exact: true })
  const nativeCard = page.locator('.visual-reference-kb-card').filter({ hasText: '我的对照知识库' })
  const subscribedCard = subscribed.locator('.visual-reference-kb-card').first()
  await expect(nativeCard).toBeVisible()
  await expect(subscribedCard.locator('[data-indexing-strategy="wiki"]')).toHaveText('Wiki')
  await expect(subscribed.locator('[data-indexing-strategy="unconfigured"]')).toHaveCount(0)
  await expect(subscribed.locator('.visual-reference-kb-card__footer').first()).toContainText('2026')
  await expect(subscribedCard.locator('.market-access-status')).toBeVisible()
  await expect(nativeCard.locator('.visual-reference-kb-card__footer')).toContainText('7')
  await expect(subscribed).not.toContainText('只读')
  await expect(subscribed).toContainText('可使用至')
  const badgeStyle = (el: Element) => { const css = getComputedStyle(el); return [css.padding, css.borderRadius, css.backgroundColor, css.fontSize, css.lineHeight] }
  expect(await subscribedCard.locator('[data-indexing-strategy="wiki"]').evaluate(badgeStyle)).toEqual(await nativeCard.locator('[data-indexing-strategy="wiki"]').evaluate(badgeStyle))
  for (const width of [1440, 900, 430]) {
    await page.setViewportSize({ width, height: 932 })
    const owned = await nativeCard.boundingBox(), bought = await subscribedCard.boundingBox()
    expect(owned).not.toBeNull()
    expect(bought).not.toBeNull()
    expect(Math.abs(owned!.width - bought!.width)).toBeLessThanOrEqual(1)
    expect(bought!.height).toBeGreaterThanOrEqual(owned!.height - 1)
    expect(Math.abs(owned!.x - bought!.x)).toBeLessThanOrEqual(1)
    const ownedTitle = await nativeCard.locator('strong').boundingBox(), boughtTitle = await subscribedCard.locator('strong').boundingBox()
    const ownedBadge = await nativeCard.locator('[data-indexing-strategy="wiki"]').boundingBox(), boughtBadge = await subscribedCard.locator('[data-indexing-strategy="wiki"]').boundingBox()
    expect(Math.abs((ownedTitle!.y - owned!.y) - (boughtTitle!.y - bought!.y))).toBeLessThanOrEqual(1)
    expect(Math.abs((ownedBadge!.y - owned!.y) - (boughtBadge!.y - bought!.y))).toBeLessThanOrEqual(1)
    const gridStyle = (el: Element) => { const css = getComputedStyle(el.closest('.visual-kb-grid')!); return [css.gridTemplateColumns.split(' ').length, css.gap] }
    expect(await subscribedCard.evaluate(gridStyle)).toEqual(await nativeCard.evaluate(gridStyle))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await subscribedCard.focus()
  await subscribedCard.press('Enter')
  await expect(page.locator('.wiki-browser')).toBeVisible()
})


test('subscribed reader uses the native workspace shell on desktop and mobile', async ({ page }, testInfo) => {
  const api = await mockLibrary(page)
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`/e2e/mobile-harness.html?page=${libraryPath}`)
  const main = page.locator('.visual-knowledge-page')
  await expect(main.locator('.visual-knowledge-wiki-host .wiki-browser')).toBeVisible()
  await expect(main.getByRole('tab', { name: 'Wiki', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(main).not.toContainText('分别计费')
  await expect(main).toContainText('已取消续费')
  await expect(main.getByRole('button', { name: /编辑|历史|删除|新建|修复|导出|下载/ })).toHaveCount(0)
  for (const width of [1440, 430]) {
    await page.setViewportSize({ width, height: 932 })
    const actionBounds = await main.getByRole('button', { name: '开始提问', exact: true }).boundingBox()
    expect(actionBounds).not.toBeNull()
    expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath(`subscribed-wiki-${width}.png`), animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(main.locator('.wiki-reader')).toBeVisible()
  }
  await main.getByRole('tab', { name: '图谱', exact: true }).click()
  await expect(main).toHaveClass(/is-graph-tab/)
  await expect(main.locator('.wiki-graph-search-container')).toBeVisible()
  expect(api.forbidden).toEqual([])
})


test('library source filters separate owned and subscribed sections and retain expiry', async ({ page }) => {
  await mockLibrary(page)
  await page.route('**/api/v1/knowledge-bases', route => route.fulfill({ json: { data: [{ id: 'own-kb', name: '我的测试资料', description: 'Only owned', type: 'document', tenant_id: 42, knowledge_count: 2, indexing_strategy: { wiki_enabled: true } }] } }))
  await visit(page, '/platform/knowledge-bases')
  const filters = page.getByRole('tablist', { name: '来源筛选', exact: true })
  await expect(filters.getByRole('tab', { name: '全部', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: /我的知识库/, level: 2 })).toBeVisible()
  await expect(page.getByRole('heading', { name: /订阅知识库/, level: 2 })).toBeVisible()
  await expect(page.locator('.market-library-cards')).toContainText('2026')
  await filters.getByRole('tab', { name: '我的', exact: true }).click()
  await expect(page.getByText('我的测试资料', { exact: true })).toBeVisible()
  await expect(page.getByText('已订阅泰勒知识库', { exact: true })).not.toBeVisible()
  await filters.getByRole('tab', { name: '已订阅', exact: true }).click()
  await expect(page.getByText('已订阅泰勒知识库', { exact: true })).toBeVisible()
  await expect(page.getByText('我的测试资料', { exact: true })).not.toBeVisible()
  await filters.getByRole('tab', { name: '全部', exact: true }).click()
  await expect(page.getByText('我的测试资料', { exact: true })).toBeVisible()
})

test('purchased agents appear once per service and open scoped chat without exposing editing', async ({ page }) => {
  const api = await mockLibrary(page)
  await page.route('**/api/v1/creator-marketplace/library', route => route.fulfill({ json: { data: [libraryEntry, { ...libraryEntry, knowledge_base_id: 'second-kb', name: '第二份订阅资料' }] } }))
  await page.route('**/api/v1/agents', route => route.fulfill({ json: { data: [{ id: 'own-agent', name: '我的测试智能体', is_builtin: false, config: { agent_mode: 'smart-reasoning' } }] } }))
  await visit(page, '/platform/agents')
  const filters = page.getByRole('tablist', { name: '来源筛选', exact: true })
  await expect(filters.getByRole('tab', { name: '全部', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('我的测试智能体', { exact: true })).toBeVisible()
  const subscribed = page.getByRole('region', { name: '已订阅智能体', exact: true })
  await expect(subscribed.getByText('泰勒专属智能体', { exact: true })).toHaveCount(1)
  await expect(subscribed).toContainText('2026')
  await expect(subscribed.getByRole('button', { name: /编辑|复制|分享|删除/ })).toHaveCount(0)
  await filters.getByRole('tab', { name: '我的', exact: true }).click()
  await expect(subscribed).not.toBeVisible()
  await filters.getByRole('tab', { name: '已订阅', exact: true }).click()
  await expect(subscribed).toBeVisible()
  await expect(page.getByText('我的测试智能体', { exact: true })).not.toBeVisible()
  await subscribed.getByText('泰勒专属智能体', { exact: true }).click()
  await expectSelectedService(page, taylor.id)
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.settings.settings.marketplaceProductId)).toBe('taylor')
  expect(api.forbidden).toEqual([])
})

for (const directory of ['knowledge-bases', 'agents']) test(`${directory} source groups use the real workspace at desktop and phone widths`, async ({ page }, testInfo) => {
  await mockLibrary(page)
  await page.route('**/api/v1/knowledge-bases', route => route.fulfill({ json: { data: [{ id: 'own-kb', name: '我的研究资料', description: '整理我自己的资料和笔记。', type: 'document', tenant_id: 42, knowledge_count: 2, indexing_strategy: { wiki_enabled: true } }] } }))
  await page.route('**/api/v1/agents', route => route.fulfill({ json: { data: [{ id: 'own-agent', name: '我的研究助手', description: '帮助整理我的资料和笔记。', is_builtin: false, config: { agent_mode: 'smart-reasoning' } }] } }))
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`/e2e/mobile-harness.html?page=/platform/${directory}`)
  const filters = page.getByRole('tablist', { name: '来源筛选', exact: true })
  await expect(filters.getByRole('tab', { name: '全部', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.market-access-status').first()).toContainText('2026')
  for (const width of [1440, 430]) {
    await page.setViewportSize({ width, height: 932 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    for (const label of ['全部', '我的', '已订阅']) await expect(filters.getByRole('tab', { name: label, exact: true })).toBeVisible()
    if (directory === 'agents') {
      await expect(page.locator('.market-agent-cards .agent-avatar')).toHaveCount(0)
      const header = await page.locator('.agent-list-content > .header').boundingBox()
      const tabs = await filters.boundingBox()
      expect(tabs!.y - header!.y - header!.height).toBeLessThanOrEqual(20)
    }
    await page.screenshot({ path: testInfo.outputPath(`${directory}-${width}.png`), animations: 'disabled' })
  }
  await filters.getByRole('tab', { name: '已订阅', exact: true }).click()
  await expect(page.getByText(directory === 'agents' ? '我的研究助手' : '我的研究资料', { exact: true })).not.toBeVisible()
})

test('a locked subscribed agent shows its actual status and opens service details without sending a question', async ({ page }) => {
  const api = await mockLibrary(page, { denied: true })
  await page.route('**/api/v1/agents', route => route.fulfill({ json: { data: [] } }))
  await visit(page, '/platform/agents')
  const subscribed = page.getByRole('region', { name: '已订阅智能体', exact: true })
  await expect(subscribed).toContainText('已退款')
  await subscribed.getByRole('button', { name: '泰勒专属智能体', exact: true }).filter({ hasText: '已退款' }).click()
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.router.currentRoute.value.path)).toBe('/platform/marketplace/taylor')
  expect(api.reads).toEqual([])
  expect(api.forbidden).toEqual([])
})

const flashModelId = 'builtin-deepseek-v4-flash'
const proModelId = 'builtin-deepseek-v4-pro'
async function mockComposerChoices(page: Page, paidMembership = true) {
  const api = await mockMarket(page, { paid: true, max: paidMembership })
  const models = [flashModelId, proModelId].map((id, index) => ({ id, name: index ? 'DeepSeek V4 Pro' : 'DeepSeek V4.1 Flash', display_name: index ? 'DeepSeek V4 Pro' : 'DeepSeek V4.1 Flash', type: 'KnowledgeQA', source: 'remote', status: 'active', is_builtin: true, parameters: { provider: 'openrouter', reasoning: { supported: true, mandatory: false, supported_efforts: ['low', 'high', 'max'], default_effort: 'low' } } }))
  const owned = { id: 'own-agent', name: '我的研究助手', is_builtin: false, config: { model_id: flashModelId, rerank_model_id: 'test-rerank', agent_mode: 'smart-reasoning', kb_selection_mode: 'selected', knowledge_bases: ['own-kb'] } }
  const writing = { ...taylor, id: 'writing', title: '清晰写作', agent_id: 'writing-agent', agent_name: '写作助手', knowledge_base_ids: ['writing-kb'], knowledge_base_names: ['写作资料'], access: { can_chat: true, status: 'active', cancel_at_period_end: false } }
  const entries = [libraryEntry, { ...libraryEntry, product_id: 'writing', product_title: writing.title, agent_id: writing.agent_id, agent_name: writing.agent_name, knowledge_base_id: 'writing-kb', name: '写作资料' }, { ...libraryEntry, product_id: 'expired', agent_name: '已过期助手', can_chat: false, can_read: false }]
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/models') return route.fulfill({ json: { success: true, data: [...models, { id: 'test-rerank', name: 'Rerank', type: 'Rerank', status: 'active', is_builtin: true, parameters: { provider: 'openrouter' } }] } })
    if (path.startsWith('/api/v1/models/scene-options/')) return route.fulfill({ json: { success: true, data: { scene: path.split('/').at(-1), effective_model_id: flashModelId, options: models.map((m, i) => ({ model_id: m.id, display_name: m.display_name, model_type: 'KnowledgeQA', selectable: i === 0 || paidMembership, locked: i > 0 && !paidMembership, required_plan: 'paid', is_scene_default: i === 0, is_effective: i === 0 })) } } })
    if (path === '/api/v1/creator-marketplace/library') return route.fulfill({ json: { data: entries } })
    if (path === '/api/v1/creator-marketplace/products/writing') return route.fulfill({ json: { data: writing } })
    if (path === '/api/v1/agents') return route.fulfill({ json: { success: true, data: [owned] } })
    if (path === '/api/v1/agents/own-agent') return route.fulfill({ json: { success: true, data: owned } })
    if (path === '/api/v1/knowledge-bases') return route.fulfill({ json: { success: true, data: [{ id: 'own-kb', name: '我的资料', type: 'document', tenant_id: 42, capabilities: { ready: true } }] } })
    return route.fallback()
  })
  return api
}
async function openComposerSection(page: Page, section: '智能体' | '模型' | '推理强度') {
  const trigger = page.locator('.visual-chat-composer__combined-picker')
  if (await trigger.getAttribute('aria-expanded') !== 'true') {
    await expect(page.locator('.visual-model-selector__chat-panel')).toBeHidden()
    await trigger.click()
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.locator('.visual-model-selector__chat-row').filter({ has: page.locator('span').filter({ hasText: new RegExp(`^${section}$`) }) }).hover()
  return page.getByRole('listbox', { name: section, exact: true })
}

test('composer selects subscribed and owned agents with draft, member model and reasoning freedom', async ({ page }) => {
  const api = await mockComposerChoices(page)
  await visit(page, '/platform/creatChat')
  await page.locator('textarea').first().fill('保留我的草稿')
  let picker = await openComposerSection(page, '智能体')
  await expect(picker.getByRole('option', { name: '我的研究助手', exact: true })).toBeVisible()
  await expect(picker.getByRole('option', { name: '已过期助手', exact: true })).toHaveCount(0)
  await picker.getByRole('option', { name: '泰勒专属智能体', exact: true }).click()
  await expectSelectedService(page, taylor.id)
  await expect(page.locator('textarea').first()).toHaveValue('保留我的草稿')
  picker = await openComposerSection(page, '模型')
  await picker.getByRole('option', { name: 'DeepSeek V4 Pro', exact: true }).click()
  picker = await openComposerSection(page, '推理强度')
  await picker.getByRole('option', { name: '最高', exact: true }).click()
  await expect(page.locator('.visual-chat-composer__combined-picker')).toContainText('DeepSeek V4 Pro')
  await expect(page.locator('.visual-chat-composer__combined-picker')).toContainText('最高')
  // Same-agent selection must preserve the user's model and reasoning, not reset Flash.
  picker = await openComposerSection(page, '智能体')
  await picker.getByRole('option', { name: '泰勒专属智能体', exact: true }).click()
  await expect(page.locator('.visual-chat-composer__combined-picker')).toContainText('DeepSeek V4 Pro')
  await page.locator('[data-guide="chat-send"]').click()
  await expect.poll(() => api.requests.find(r => r.path.includes('/agent-chat/'))?.body).toMatchObject({ marketplace_product_id: 'taylor', agent_id: 'platform-agent', summary_model_id: proModelId, thinking: true, reasoning_effort: 'max', query: '保留我的草稿' })
})

test('composer switching service then owned agent clears stale scope and retains draft', async ({ page }) => {
  const api = await mockComposerChoices(page)
  await visit(page, '/platform/creatChat?marketplace_product=taylor')
  await expectSelectedService(page, taylor.id)
  await page.locator('textarea').first().fill('切换时保留草稿')
  let picker = await openComposerSection(page, '智能体')
  await picker.getByRole('option', { name: '写作助手', exact: true }).click()
  await expectSelectedService(page, 'writing')
  await expect(page.locator('.visual-chat-resource')).toContainText('写作资料')
  await expect(page.locator('textarea').first()).toHaveValue('切换时保留草稿')
  picker = await openComposerSection(page, '智能体')
  await picker.getByRole('option', { name: '我的研究助手', exact: true }).click()
  await expect(page.locator('.market-service-selection')).toHaveCount(0)
  await expect(page.locator('textarea').first()).toHaveValue('切换时保留草稿')
  const state = await page.evaluate(() => { const s = (window as any).__marketplaceHarness.settings; return { product: s.settings.marketplaceProductId, agent: s.selectedAgentId, kbs: s.settings.selectedKnowledgeBases } })
  expect(state.product).toBeFalsy()
  expect(state.agent).toBe('own-agent')
  expect(state.kbs).not.toContain('writing-kb')
  expect(state.kbs).not.toContain('platform-kb')
  expect(api.counts.chat).toBe(0)
})

test('subscribed composer respects membership locked models', async ({ page }) => {
  await mockComposerChoices(page, false)
  await visit(page, '/platform/creatChat?marketplace_product=taylor')
  await expectSelectedService(page, taylor.id)
  const picker = await openComposerSection(page, '模型')
  const pro = picker.getByRole('option', { name: /DeepSeek V4 Pro/ })
  await expect(pro).toHaveAttribute('aria-disabled', 'true')
  await expect(pro).toBeDisabled()
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.settings.conversationModels.selectedChatModelId)).toBe(flashModelId)
})

for (const target of ['写作助手', '我的研究助手']) test(`historical composer switches to ${target} in a fresh conversation with its draft`, async ({ page }) => {
  const api = await mockComposerChoices(page)
  await page.route('**/api/v1/sessions/chat-fixture', route => route.fulfill({ json: { success: true, data: { id: 'chat-fixture', title: '保存的泰勒对话', last_request_state: { marketplace_product_id: 'taylor', agent_id: 'platform-agent', agent_enabled: true, model_id: proModelId, thinking: true, reasoning_effort: 'max', knowledge_base_ids: ['platform-kb'] } } } }))
  await page.route('**/api/v1/messages/chat-fixture/load?*', route => route.fulfill({ json: { success: true, data: [{ id: 'saved-question', role: 'user', content: '原来的问题', is_completed: true }, { id: 'saved-answer', role: 'assistant', content: '原来的回答', is_completed: true, marketplace_product_id: 'taylor', model_id: proModelId }] } }))
  await visit(page, '/platform/chat/chat-fixture')
  await expect(page.getByText('原来的回答', { exact: true })).toBeVisible()
  await expect(page.locator('.visual-chat-composer__combined-picker')).toContainText('DeepSeek V4 Pro')
  await page.locator('textarea').first().fill('旧对话中的未发草稿')
  // Reasoning remains adjustable in history without changing its product scope.
  let picker = await openComposerSection(page, '推理强度')
  await picker.getByRole('option', { name: '高', exact: true }).click()
  await expect(page.locator('.visual-chat-composer__combined-picker')).toContainText('高')
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.router.currentRoute.value.path)).toBe('/platform/chat/chat-fixture')
  picker = await openComposerSection(page, '智能体')
  await picker.getByRole('option', { name: target, exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__marketplaceHarness.router.currentRoute.value.path)).toBe('/platform/creatChat')
  await expect(page.locator('textarea').first()).toHaveValue('旧对话中的未发草稿')
  await expect(page.locator('.visual-chat-composer__combined-picker')).toContainText(target)
  const state = await page.evaluate(() => { const h = (window as any).__marketplaceHarness; return { product: h.settings.settings.marketplaceProductId, agent: h.settings.selectedAgentId, kbs: h.settings.settings.selectedKnowledgeBases } })
  expect(state.product || '').toBe(target === '写作助手' ? 'writing' : '')
  expect(state.kbs).not.toContain('platform-kb')
  expect(api.counts.chat).toBe(0)
})


test('ordinary history keeps owned agent changes in the current conversation', async ({ page }) => {
  await mockComposerChoices(page)
  await page.route('**/api/v1/sessions/chat-fixture', route => route.fulfill({ json: { success: true, data: { id: 'chat-fixture', last_request_state: { agent_id: 'builtin-smart-reasoning', agent_enabled: true, model_id: proModelId, knowledge_base_ids: [] } } } }))
  await page.route('**/api/v1/messages/chat-fixture/load?*', route => route.fulfill({ json: { success: true, data: [{ id: 'saved', role: 'user', content: '普通对话', is_completed: true }] } }))
  await visit(page, '/platform/chat/chat-fixture')
  await expect(page.getByText('普通对话', { exact: true })).toBeVisible()
  await page.locator('textarea').first().fill('继续这个对话')
  const picker = await openComposerSection(page, '智能体')
  await picker.getByRole('option', { name: '我的研究助手', exact: true }).click()
  await expect(page.locator('.visual-chat-composer__combined-picker')).toContainText('我的研究助手')
  await expect(page.locator('textarea').first()).toHaveValue('继续这个对话')
  expect(await page.evaluate(() => (window as any).__marketplaceHarness.router.currentRoute.value.path)).toBe('/platform/chat/chat-fixture')
})

test('local workspace sidebar opens marketplace and returns from product details', async ({ page }) => {
  await mockMarket(page, { paid: true })
  await page.goto('/e2e/mobile-harness.html?page=/platform/agents')
  await page.locator('.visual-sidebar').getByRole('button', { name: '知识市场', exact: true }).click()
  await expect(page.locator('.market-featured')).toContainText(taylor.title, { timeout: 3000 })
  await page.locator('.market-featured').click()
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toBeVisible()
  await page.locator('.visual-sidebar').getByRole('button', { name: '知识市场', exact: true }).click()
  await expect(page.locator('.market-featured')).toContainText(taylor.title)
})


test('marketplace categories, price, access and sorting filters compose with search', async ({ page }) => {
  await mockMarket(page)
  const catalog = [
    { ...taylor, title: '泰勒', category: '成长', monthly_amount: 1900 },
    { ...taylor, id: 'writing', title: '写作方法', category: '写作', featured: false, monthly_amount: 0, yearly_amount: 0 },
    { ...taylor, id: 'career', title: '职场成长', category: '成长', featured: false, monthly_amount: 900, created_at: '2026-09-23T00:00:00Z', access: { can_chat: true } },
  ]
  await page.route('**/api/v1/creator-marketplace/products', route => route.fulfill({ json: { data: catalog, total: 3 } }))
  await visit(page)
  await page.getByRole('tab', { name: '成长', exact: true }).click()
  await expect(page.locator('.market-grid .market-card')).toHaveCount(2)
  await page.getByRole('combobox', { name: '排序', exact: true }).click()
  await page.locator('.t-select__dropdown:visible').getByText('价格从低到高', { exact: true }).click()
  await expect(page.locator('.market-grid .market-card').first()).toContainText('职场成长')
  await page.getByRole('combobox', { name: '排序', exact: true }).click()
  await page.locator('.t-select__dropdown:visible').getByText('最新上线', { exact: true }).click()
  await expect(page.locator('.market-grid .market-card').first()).toContainText('职场成长')
  await page.getByRole('combobox', { name: '状态', exact: true }).click()
  await page.locator('.t-select__dropdown:visible').getByText('已开通', { exact: true }).click()
  await expect(page.locator('.market-grid .market-card')).toHaveCount(1)
  await expect(page.locator('.market-grid')).toContainText('职场成长')
  await page.getByRole('combobox', { name: '状态', exact: true }).click()
  await page.locator('.t-select__dropdown:visible').getByText('全部状态', { exact: true }).click()
  await page.getByRole('tab', { name: '全部推荐', exact: true }).click()
  await page.getByRole('combobox', { name: '价格', exact: true }).click()
  await page.locator('.t-select__dropdown:visible').getByText('免费', { exact: true }).click()
  await expect(page.locator('.market-grid .market-card')).toHaveCount(1)
  await expect(page.locator('.market-grid')).toContainText('写作方法')
  await page.getByRole('textbox', { name: '搜索商品', exact: true }).fill('不存在的资料')
  await expect(page.locator('.market-grid .market-card')).toHaveCount(0)
  await expect(page.getByText('没有符合筛选条件的商品。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(page.locator('.market-grid .market-card')).toHaveCount(3)
})


test('marketplace filters fit a Pro Max viewport and an individual featured item stays static', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await mockMarket(page)
  await visit(page)
  await expect(page.getByRole('combobox', { name: '价格', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '状态', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '排序', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '下一条推荐', exact: true })).toHaveCount(0)
  await expect(page.locator('.market-cover')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  for (const width of [430, 1440]) {
    await page.setViewportSize({ width, height: 932 })
    for (const name of ['价格', '状态', '排序']) {
      const trigger = page.getByRole('combobox', { name, exact: true })
      await trigger.click()
      const panel = page.locator('.t-select__dropdown:visible > .t-popup__content')
      await expect(panel).toBeVisible()
      await expect.poll(async () => Math.abs((await panel.boundingBox())!.width - (await trigger.boundingBox())!.width)).toBeLessThan(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.getByRole('heading', { name: '知识市场', exact: true }).click()
      await expect(panel).toHaveCount(0)
    }
  }
  const trigger = page.getByRole('combobox', { name: '排序', exact: true })
  await trigger.click()
  await page.setViewportSize({ width: 430, height: 932 })
  const panel = page.locator('.t-select__dropdown:visible > .t-popup__content')
  await expect(panel).toBeVisible()
  await expect.poll(async () => Math.abs((await panel.boundingBox())!.width - (await trigger.boundingBox())!.width)).toBeLessThan(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})


test('marketplace filtering includes products beyond the first catalog page', async ({ page }) => {
  await mockMarket(page)
  await page.route('**/api/v1/creator-marketplace/products*', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') || 0)
    return route.fulfill({ json: { data: offset ? [{ ...taylor, id: 'later', title: '下一页的写作知识', category: '写作', featured: false }] : [taylor], total: 2 } })
  })
  await visit(page)
  await page.getByRole('tab', { name: '写作', exact: true }).click()
  await expect(page.locator('.market-grid .market-card')).toHaveCount(1)
  await expect(page.locator('.market-grid')).toContainText('下一页的写作知识')
})

test('featured recommendations rotate, support arrows and dots, and pause while being read', async ({ page }) => {
  await page.clock.install()
  await mockMarket(page)
  const recommendations = [taylor, { ...taylor, id: 'second', title: '第二个精选', category: '写作' }]
  await page.route('**/api/v1/creator-marketplace/products', route => route.fulfill({ json: { data: recommendations, total: 2 } }))
  await visit(page)
  const active = page.locator('.market-featured-swiper .swiper-slide-active h2')
  await expect(page.getByRole('button', { name: /暂停轮播|继续轮播|停止轮播/ })).toHaveCount(0)
  await expect(active).toHaveText(taylor.title)
  await page.mouse.move(0, 0)
  await page.clock.runFor(5600)
  await expect(active).toHaveText('第二个精选')
  await page.getByRole('button', { name: '上一条推荐', exact: true }).click()
  await page.clock.runFor(400)
  await expect(active).toHaveText(taylor.title)
  await page.clock.runFor(6000)
  await expect(active).toHaveText(taylor.title)
  await page.getByRole('button', { name: '精选推荐: 第二个精选', exact: true }).click()
  await page.clock.runFor(400)
  await expect(active).toHaveText('第二个精选')
  await page.getByRole('textbox', { name: '搜索商品', exact: true }).click()
  await page.mouse.move(0, 0)
  await page.clock.runFor(5600)
  await expect(active).toHaveText(taylor.title)
  await page.locator('.market-featured-carousel').hover()
  await page.clock.runFor(6000)
  await expect(active).toHaveText(taylor.title)
})

test('reduced-motion users get manual featured navigation without automatic movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await mockMarket(page)
  await page.route('**/api/v1/creator-marketplace/products', route => route.fulfill({ json: { data: [taylor, { ...taylor, id: 'second', title: '第二个精选' }], total: 2 } }))
  await visit(page)
  const active = page.locator('.market-featured-swiper .swiper-slide-active h2')
  await expect(active).toHaveText(taylor.title)
  await expect(page.getByRole('button', { name: /暂停轮播|继续轮播|停止轮播/ })).toHaveCount(0)
  await page.clock.runFor(6000)
  await expect(active).toHaveText(taylor.title)
  await page.getByRole('button', { name: '下一条推荐', exact: true }).click()
  await expect(active).toHaveText('第二个精选')
})


test('marketplace cards open from the card body and support keyboard navigation without detail buttons', async ({ page }) => {
  await mockMarket(page, { paid: true })
  await visit(page)
  await expect(page.getByRole('button', { name: '查看详情', exact: true })).toHaveCount(0)
  const card = page.locator('.market-grid').getByRole('link', { name: taylor.title, exact: true })
  await card.locator('.market-card-description').click()
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回市场', exact: true }).click()
  await card.focus()
  await card.press('Enter')
  await expect(page.getByRole('button', { name: '开始提问', exact: true })).toBeVisible()
})
