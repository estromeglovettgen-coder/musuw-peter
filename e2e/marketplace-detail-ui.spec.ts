import { expect, test, type Page } from '@playwright/test'

const title = '专属知识服务'
const description = '这是一段完整的商品介绍，用于确认手机端先展示主要操作，再展示详细内容。'.repeat(18)
const introduction = '从日常记录中整理决策依据，理解长期选择。'
const topics = [
  { title: '观察与记录', body: '区分事实、判断与待验证的假设。' },
  { title: '决策与复盘', body: '记录备选方案与取舍依据，再用实际结果检查判断。'.repeat(24) },
  { title: '长期实践', body: '保留行动记录，持续检查变化；这是完整介绍的最后一段。' },
]
const structuredDescription = [introduction, ...topics.map(topic => `## ${topic.title}\n\n${topic.body}`)].join('\n\n')
// Four recorded-conversation shaped fixtures; production chat bodies stay private.
const questions = ['女生提起别人的男朋友有几辆奔驰，怎么回应？', '女朋友提起前任对她很好，怎么理解？', '演唱会想亲女朋友被拒绝，当时应该怎么做？', '女生抱怨工作时，要直接给建议吗？']
const scopeNote = '支持提问和查看必要引用；有效付费订阅还可只读浏览已发布的 Wiki 与图谱。原始资料、智能体提示词与整库下载不公开。'
const allowanceNote = '知识订阅与 Musuw 会员分别计费；AI 问答消耗您自己的 Musuw 模型额度。'
const freeAllowanceNote = 'AI 问答消耗您自己的 Musuw 模型额度。'
const directoryTitles = ['真正的知识目录：行动记录', '真正的知识目录：情绪复盘', '真正的知识目录：长期决策']

async function visitDetail(page: Page, mode: 'free' | 'paid' | 'unpaid', productDescription = description, sampleQuestions = questions) {
  const product = {
    id: 'detail-service', title, description: productDescription, category: '知识', agent_id: 'delivery-agent', agent_name: title,
    knowledge_base_ids: ['delivery-kb'], knowledge_base_names: ['服务知识库'], sample_questions: sampleQuestions,
    default_model_id: 'builtin-deepseek-v4-flash', currency: 'USD', monthly_amount: mode === 'free' ? 0 : 1900,
    yearly_amount: mode === 'free' ? 0 : 19000, status: 'published', featured: true, fixture: false,
    checkout_available: mode === 'unpaid', created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z',
    access: { can_chat: mode !== 'unpaid', cancel_at_period_end: false, paid_through: '2099-10-22T00:00:00Z' },
  }
  const traffic = { mutations: [] as string[], payments: [] as string[], generations: [] as string[] }
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') traffic.mutations.push(path)
    if (/\/checkout|\/portal|\/transactions/.test(path)) traffic.payments.push(path)
    if (/\/agent-chat\/|\/knowledge-chat\/|suggested-questions|\/chat\/completions/.test(path)) traffic.generations.push(path)
    if (/\/creator-marketplace\/products\/detail-service(?:-next)?\/preview$/.test(path)) return route.fulfill({ json: { data: {
      directory: sampleQuestions.length ? directoryTitles.map((title, index) => ({ id: `entry-${index}`, title, path: ['服务知识库'], page_type: 'concept' })) : [],
      examples: sampleQuestions.map((question, index) => ({ question, answer: `这是第${index + 1}个问题对应的完整历史回答。` })),
    } } })
    if (path.endsWith('/creator-marketplace/products/detail-service')) return route.fulfill({ json: { data: product } })
    if (path.endsWith('/creator-marketplace/products/detail-service-next')) return route.fulfill({ json: { data: { ...product, id: 'detail-service-next', title: '另一项知识服务' } } })
    if (path.endsWith('/models')) return route.fulfill({ json: { success: true, data: [{ id: 'builtin-deepseek-v4-flash', name: 'DeepSeek V4 Flash', type: 'KnowledgeQA', status: 'active', is_builtin: true, parameters: { provider: 'openrouter' } }] } })
    if (path.includes('/models/scene-options/')) return route.fulfill({ json: { success: true, data: { effective_model_id: 'builtin-deepseek-v4-flash', options: [{ model_id: 'builtin-deepseek-v4-flash', display_name: 'DeepSeek V4 Flash', selectable: true, locked: false, is_scene_default: true, is_effective: true }] } } })
    return route.fulfill({ json: { success: true, data: [] } })
  })
  await page.goto(`/e2e/marketplace-harness.html?path=${encodeURIComponent('/platform/marketplace/detail-service')}`)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  return traffic
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

async function expectUsageDetails(page: Page, mode: 'free' | 'paid' | 'unpaid') {
  const details = page.locator('details.market-usage-details')
  await expect(details).toHaveCount(1)
  await expect(details).not.toHaveAttribute('open', '')
  const scope = details.getByText(scopeNote, { exact: true })
  const allowance = details.getByText(mode === 'free' ? freeAllowanceNote : allowanceNote, { exact: true })
  await expect(scope).toBeHidden()
  await expect(allowance).toBeHidden()
  await details.locator('summary').filter({ hasText: '使用说明' }).click()
  await expect(details).toHaveAttribute('open', '')
  await expect(scope).toBeVisible()
  await expect(allowance).toBeVisible()
  await details.locator('summary').click()
}

function expectNoSideEffects(traffic: Awaited<ReturnType<typeof visitDetail>>) {
  expect(traffic.mutations).toEqual([])
  expect(traffic.payments).toEqual([])
  expect(traffic.generations).toEqual([])
}

async function expectSelectedDetailTab(page: Page, selected: '概览' | '内容目录' | '示例问答') {
  for (const name of ['概览', '内容目录', '示例问答']) {
    const tab = page.getByRole('button', { name, exact: true })
    await expect(tab).toBeVisible()
    await expect(tab).toHaveAttribute('aria-pressed', String(name === selected))
  }
  await expect(page.locator('.market-detail-content .t-tabs__nav button[aria-pressed="true"]')).toHaveCount(1)
  await expect(page.locator('.market-detail-content [role="region"]')).toHaveCount(1)
  await expect(page.getByRole('region', { name: selected, exact: true })).toBeVisible()
  // TDesign measures item widths when positioning the bar. External item margins
  // used to shift the third tab's bar by 56px; compare actual rendered bounds.
  await expect.poll(async () => {
    const bar = await page.locator('.market-detail-tabs .t-tabs__bar').boundingBox()
    const item = await page.locator('.market-detail-tabs .t-tabs__nav-item.t-is-active').boundingBox()
    if (!bar || !item || item.width <= 0) return Infinity
    return Math.max(Math.abs(bar.x - item.x), Math.abs(bar.x + bar.width - item.x - item.width))
  }).toBeLessThanOrEqual(2)
}

test('mobile free detail has one clear return, accurate capability labels and its sole action before long content', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const traffic = await visitDetail(page, 'free')
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.getByRole('link', { name: '返回市场', exact: true })).toHaveCount(1)
  await expect(page.getByRole('link', { name: '浏览市场', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '订单管理', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '创作者中心', exact: true })).toBeVisible()
  await expect(page.locator('.market-purchase .market-badge')).toHaveCount(0)
  const action = page.getByRole('button', { name: '开始提问', exact: true })
  await expect(action).toHaveCount(1)
  const heading = await page.getByRole('heading', { name: title, exact: true }).boundingBox()
  const button = await action.boundingBox()
  const content = await page.locator('.market-detail-content').boundingBox()
  expect(heading!.y + heading!.height).toBeLessThan(button!.y)
  expect(button!.y + button!.height).toBeLessThan(content!.y)
  expect(button!.y + button!.height).toBeLessThan(932)
  await expect(page.locator('.market-detail-content .market-description')).toHaveText(description)
  await expectNoHorizontalOverflow(page)
  await expectUsageDetails(page, 'free')
  await action.click()
  await expect.poll(() => page.evaluate(() => (window as any).__marketplaceHarness.settings.settings.marketplaceProductId)).toBe('detail-service')
  expectNoSideEffects(traffic)
})

for (const scenario of [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, mode: 'free' as const },
  { name: 'mobile', viewport: { width: 430, height: 932 }, mode: 'unpaid' as const },
]) {
  test(`${scenario.name} detail overview preserves structured scope without duplicating example questions`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport)
    const traffic = await visitDetail(page, scenario.mode, structuredDescription)
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('.market-detail-copy h1')).toHaveText(title)
    await expect(page.locator('.market-detail-cover')).toBeVisible()
    await expect(page.locator('.market-detail-cover')).toHaveText(/\S/)
    await expect(page.locator('.market-detail-cover img')).toHaveCount(0)
    await expect(page.locator('.market-detail-lead')).toHaveText(introduction)
    await expect(page.locator('.market-topic')).toHaveCount(topics.length)
    for (const [index, topic] of topics.entries()) {
      const row = page.locator('.market-topic').nth(index)
      await expect(row.getByRole('heading', { name: topic.title, exact: true })).toBeVisible()
      await expect(row.locator('.market-description')).toHaveText(topic.body)
    }
    await expect(page.locator('.market-detail')).not.toContainText(/不妨|你会在这里读到/)
    await expect(page.getByRole('heading', { name: '示例问题', exact: true })).toHaveCount(0)
    await expect(page.locator('.market-detail-examples, .market-example-list, .market-example-conversation')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)

    const action = page.getByRole('button', { name: scenario.mode === 'free' ? '开始提问' : '订阅使用', exact: true })
    await expect(action).toHaveCount(1)
    await expect(action).toBeEnabled()
    if (scenario.name === 'mobile') {
      const button = await action.boundingBox()
      const content = await page.locator('.market-detail-content').boundingBox()
      expect(button!.y + button!.height).toBeLessThan(content!.y)
      expect(button!.y + button!.height).toBeLessThan(scenario.viewport.height)
      await expect(page.getByRole('button', { name: '开始提问', exact: true })).toHaveCount(0)
      await expect(page.locator('.market-price')).toContainText('19.00')
      await page.getByRole('button', { name: '年付', exact: true }).click()
      await expect(page.locator('.market-price')).toContainText('190.00')
      await expect(page.getByRole('button', { name: '年付', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: '月付', exact: true })).toHaveAttribute('aria-pressed', 'false')
      await expectNoHorizontalOverflow(page)
    }
    await expectUsageDetails(page, scenario.mode)
    await expect(page.locator('.market-detail-copy h1')).toHaveText(title)
    expectNoSideEffects(traffic)
  })
}

test('paid detail shows existing access and opens the service without checkout or generated questions', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  const traffic = await visitDetail(page, 'paid', structuredDescription)
  await expect(page.locator('.market-purchase')).toContainText(/使用权有效至.*2099/)
  await expect(page.getByRole('button', { name: '订阅使用', exact: true })).toHaveCount(0)
  await expect(page.getByRole('group', { name: '计费周期', exact: true })).toHaveCount(0)
  const action = page.getByRole('button', { name: '开始提问', exact: true })
  await expect(action).toHaveCount(1)
  const button = await action.boundingBox()
  expect(button!.y + button!.height).toBeLessThan(932)
  await expectUsageDetails(page, 'paid')
  await expectNoHorizontalOverflow(page)
  await action.click()
  await expect.poll(() => page.evaluate(() => (window as any).__marketplaceHarness.settings.settings.marketplaceProductId)).toBe('detail-service')
  expectNoSideEffects(traffic)
})

for (const compactIntro of [
  {
    name: 'many-line plain text',
    description: Array.from({ length: 30 }, (_, index) => `第${index + 1}项`).join('\n'),
    fullText: Array.from({ length: 30 }, (_, index) => `第${index + 1}项`).join('\n'),
  },
  {
    name: 'fenced code',
    description: '```\n' + 'long_reference_identifier_'.repeat(5) + '\n```',
    fullText: 'long_reference_identifier_'.repeat(5),
  },
]) {
  test(`short ${compactIntro.name} intro keeps the mobile action visible and all content below it`, async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 })
    const traffic = await visitDetail(page, 'free', compactIntro.description)
    const action = page.getByRole('button', { name: '开始提问', exact: true })
    await expect(action).toHaveCount(1)
    const button = await action.boundingBox()
    const content = page.locator('.market-detail-content .market-description')
    await expect(content).toBeVisible()
    const contentBounds = await content.boundingBox()
    expect(button!.y + button!.height).toBeLessThan(932)
    expect(button!.y + button!.height).toBeLessThan(contentBounds!.y)
    expect((await content.innerText()).trim()).toBe(compactIntro.fullText)
    await expectNoHorizontalOverflow(page)
    expectNoSideEffects(traffic)
  })
}

test('formatted product descriptions preserve safe content without executable HTML', async ({ page }) => {
  const unsafeDescription = `${introduction}\n\n## 安全的内容\n\n保留 **重点文字** 和最后一句。\n\n<img src="invalid-image" onerror="window.__marketDescriptionExecuted = true">\n\n<script>window.__marketDescriptionExecuted = true</script>\n\n[不安全的链接](javascript:window.__marketDescriptionExecuted=true)`
  const traffic = await visitDetail(page, 'free', unsafeDescription)
  const content = page.locator('.market-detail-content')
  await expect(content.getByRole('heading', { name: '安全的内容', exact: true })).toBeVisible()
  await expect(content.locator('strong')).toHaveText('重点文字')
  await expect(content).toContainText('和最后一句。')
  await expect(content.locator('script, [onerror], a[href^="javascript:"]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__marketDescriptionExecuted)).toBeUndefined()
  expectNoSideEffects(traffic)
})

for (const scenario of [
  { name: 'desktop', viewport: { width: 1440, height: 1000 }, mode: 'free' as const },
  { name: 'mobile', viewport: { width: 430, height: 932 }, mode: 'unpaid' as const },
]) {
  test(`${scenario.name} detail tabs switch between actual library entries and recorded example answers`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport)
    const traffic = await visitDetail(page, scenario.mode, structuredDescription)
    await expectSelectedDetailTab(page, '概览')
    await expect(page.locator('.market-topic')).toHaveCount(topics.length)
    await expect(page.locator('.market-detail-examples, .market-example-list')).toHaveCount(0)
    await expect(page.locator('.market-detail-directory, .market-detail-qa')).toHaveCount(0)

    const directoryButton = page.getByRole('button', { name: '内容目录', exact: true })
    if (scenario.name === 'desktop') await directoryButton.press('Enter')
    else await directoryButton.click()
    await expectSelectedDetailTab(page, '内容目录')
    const directory = page.locator('.market-detail-directory')
    await expect(directory).toBeVisible()
    for (const entryTitle of directoryTitles) await expect(directory.getByText(entryTitle, { exact: true })).toBeVisible()
    for (const topic of topics) await expect(directory).not.toContainText(topic.title)
    await expect(page.locator('.market-topic, .market-example-list, .market-detail-qa')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: '示例问答', exact: true }).click()
    await expectSelectedDetailTab(page, '示例问答')
    const examples = page.locator('.market-detail-qa')
    await expect(examples).toBeVisible()
    for (const question of questions) await expect(examples.getByRole('button', { name: question, exact: true })).toBeVisible()
    await expect(examples.locator('.market-example-question')).toHaveCount(4)
    await expect(examples.locator('.market-example-answer')).toHaveText('这是第1个问题对应的完整历史回答。')
    await examples.getByRole('button', { name: questions[3], exact: true }).click()
    await expect(examples.locator('.market-example-answer')).toHaveText('这是第4个问题对应的完整历史回答。')
    await expect(page.locator('.market-topic, .market-detail-examples, .market-detail-directory')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
    await examples.getByRole('button', { name: questions[0], exact: true }).click()
    await expect(page.locator('.market-detail-copy h1')).toHaveText(title)

    await page.getByRole('button', { name: '概览', exact: true }).click()
    await expectSelectedDetailTab(page, '概览')
    await expect(page.locator('.market-topic')).toHaveCount(topics.length)
    await expect(page.locator('.market-detail-examples, .market-example-list')).toHaveCount(0)
    await expect(page.locator('.market-detail-directory, .market-detail-qa')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
    expectNoSideEffects(traffic)
  })

  test(`${scenario.name} detail keeps all tabs available with honest empty directory and examples`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport)
    const traffic = await visitDetail(page, scenario.mode, introduction, [])
    await expectSelectedDetailTab(page, '概览')
    await expect(page.locator('.market-detail-lead')).toHaveText(introduction)
    await expect(page.locator('.market-topic, .market-example-list')).toHaveCount(0)
    await page.getByRole('button', { name: '内容目录', exact: true }).click()
    await expectSelectedDetailTab(page, '内容目录')
    const directory = page.getByRole('region', { name: '内容目录', exact: true })
    await expect(directory).toHaveText('暂未提供内容目录')
    await expect(directory.locator('li, .market-description')).toHaveCount(0)
    await expect(page.locator('.market-detail-qa')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
    await page.getByRole('button', { name: '示例问答', exact: true }).click()
    await expectSelectedDetailTab(page, '示例问答')
    const examples = page.getByRole('region', { name: '示例问答', exact: true })
    await expect(examples).toHaveText(/暂无示例(?:问题|问答)/)
    await expect(examples.locator('li, button, a')).toHaveCount(0)
    await expect(page.locator('.market-detail-directory')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
    expectNoSideEffects(traffic)
  })
}

test('detail resets the selected tab when navigating to another product', async ({ page }) => {
  const traffic = await visitDetail(page, 'free', structuredDescription)
  await page.getByRole('button', { name: '示例问答', exact: true }).click()
  await expectSelectedDetailTab(page, '示例问答')
  await page.evaluate(() => (window as any).__marketplaceHarness.router.push('/platform/marketplace/detail-service-next'))
  await expect(page.locator('.market-detail-copy h1')).toHaveText('另一项知识服务')
  await expectSelectedDetailTab(page, '概览')
  await expect(page.locator('.market-topic')).toHaveCount(topics.length)
  await expect(page.locator('.market-detail-directory, .market-detail-qa')).toHaveCount(0)
  expectNoSideEffects(traffic)
})
