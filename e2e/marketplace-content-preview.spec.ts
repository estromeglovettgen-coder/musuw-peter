import { expect, test, type Page, type Route } from '@playwright/test'

const descriptionHeading = '营销介绍里的主题'
const questionOne = '女生提到别人的男朋友有好几辆奔驰，怎么回应？'
const questionTwo = '女生抱怨工作时，该直接给建议吗？'
const answerOne = '先分清是在聊天，还是在拿别人作比较。'.repeat(20) + '第一条回答的结尾。'
const answerTwo = '先听清她是在倾诉，还是明确需要建议。第二条回答的结尾。'
const preview = {
  directory: [
    ...Array.from({ length: 34 }, (_, i) => ({ id: `concept-${i + 1}`, title: `真实知识条目${String(i + 1).padStart(2, '0')}`, path: ['泰勒', '个人成长', '实践与复盘'], page_type: 'concept' })),
    { id: 'concept-communication', title: '倾诉与给建议的区别', path: ['泰勒', '沟通'], page_type: 'concept' },
  ],
  examples: [{ question: questionOne, answer: answerOne }, { question: questionTwo, answer: answerTwo }],
}
const product = {
  id: 'preview-product', title: '泰勒知识库', description: `这是商品的简短介绍。\n\n## ${descriptionHeading}\n\n介绍不是实际目录。`, category: '成长',
  agent_id: 'delivery-agent', agent_name: '泰勒', knowledge_base_ids: ['delivery-kb'], knowledge_base_names: ['泰勒'],
  sample_questions: ['营销介绍中的问题'], default_model_id: 'builtin-deepseek-v4-flash', currency: 'USD', monthly_amount: 1900,
  yearly_amount: 19000, status: 'published', featured: true, fixture: false, checkout_available: true,
  created_at: '2026-09-22T00:00:00Z', updated_at: '2026-09-22T00:00:00Z', access: { can_chat: false },
}

async function setup(page: Page, customPreview?: (route: Route, id: string) => Promise<void>) {
  const traffic = { previewReads: [] as string[], mutations: [] as string[], payments: [] as string[], generations: [] as string[] }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() !== 'GET') traffic.mutations.push(path)
    if (/\/checkout|\/portal|\/transactions/.test(path)) traffic.payments.push(path)
    if (/agent-chat|knowledge-chat|suggested-questions|chat\/completions/.test(path)) traffic.generations.push(path)
    const match = path.match(/\/creator-marketplace\/products\/([^/]+)\/preview$/)
    if (match) {
      traffic.previewReads.push(match[1])
      if (customPreview) return customPreview(route, match[1])
      return route.fulfill({ json: { data: preview } })
    }
    if (path.endsWith('/creator-marketplace/products')) return route.fulfill({ json: { data: [product] } })
    if (path.endsWith('/creator-marketplace/products/preview-next')) return route.fulfill({ json: { data: { ...product, id: 'preview-next', title: '下一项知识库' } } })
    if (path.endsWith('/creator-marketplace/products/preview-product')) return route.fulfill({ json: { data: product } })
    return route.fulfill({ json: { success: true, data: [] } })
  })
  await page.goto(`/e2e/marketplace-harness.html?path=${encodeURIComponent('/platform/marketplace/preview-product')}`)
  await expect(page.locator('.market-detail-copy h1')).toHaveText(product.title)
  return traffic
}

function expectNoSideEffects(traffic: Awaited<ReturnType<typeof setup>>) {
  expect(traffic.mutations).toEqual([])
  expect(traffic.payments).toEqual([])
  expect(traffic.generations).toEqual([])
}

async function openTab(page: Page, name: '内容目录' | '示例问答') {
  await page.getByRole('button', { name, exact: true }).click()
  return page.getByRole('region', { name, exact: true })
}

// The HTTP fixture and visible title are independent of Markdown section parsing.
// This fails on the old implementation, which substitutes description headings for library contents.
test('directory loads actual library titles on demand instead of marketing description headings', async ({ page }) => {
  const traffic = await setup(page)
  expect(traffic.previewReads).toEqual([])
  const directory = await openTab(page, '内容目录')
  const search = directory.getByPlaceholder('搜索目录标题…')
  await expect(search).toBeVisible()
  await search.fill('倾诉与给建议')
  await expect(directory.getByText('倾诉与给建议的区别', { exact: true })).toBeVisible()
  await expect(directory).not.toContainText(descriptionHeading)
  expect(traffic.previewReads).toEqual(['preview-product'])
  expectNoSideEffects(traffic)
})

for (const viewport of [{ width: 1440, height: 1000 }, { width: 430, height: 932 }]) {
  test(`${viewport.width}px directory preserves hierarchy, paginates titles and filters without side effects`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const traffic = await setup(page)
    const directory = await openTab(page, '内容目录')
    await expect(directory.getByPlaceholder('搜索目录标题…')).toBeVisible()
    await expect(directory.getByText('个人成长', { exact: true }).first()).toBeVisible()
    const entries = directory.locator('.market-directory-titles li')
    await expect(entries).toHaveCount(30)
    await expect(directory.getByText('真实知识条目01', { exact: true })).toBeVisible()
    await expect(directory.getByText('真实知识条目34', { exact: true })).toHaveCount(0)
    await directory.locator('.t-pagination__btn-next').click()
    await expect(entries).toHaveCount(5)
    await expect(directory.getByText('真实知识条目34', { exact: true })).toBeVisible()
    await directory.getByPlaceholder('搜索目录标题…').fill('倾诉与给建议')
    await expect(entries).toHaveCount(1)
    await expect(directory.getByText('倾诉与给建议的区别', { exact: true })).toBeVisible()
    await directory.getByPlaceholder('搜索目录标题…').fill('没有任何条目匹配的检索词')
    await expect(entries).toHaveCount(0)
    await expect(directory).toContainText(/没有|未找到|暂无/)
    await directory.getByPlaceholder('搜索目录标题…').fill('')
    await directory.locator('.market-directory-folders').getByRole('button', { name: /沟通/ }).click()
    await expect(entries).toHaveCount(1)
    await expect(directory.locator('.market-directory-heading h2')).toHaveText('沟通')
    await expect(directory.getByText('倾诉与给建议的区别', { exact: true })).toBeVisible()
    await entries.first().click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(traffic.previewReads).toEqual(['preview-product'])
    expectNoSideEffects(traffic)
  })
}

test('example playback types final answers and switching questions cancels the previous answer', async ({ page }) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const traffic = await setup(page)
  const examples = await openTab(page, '示例问答')
  const answer = examples.locator('.market-example-answer')
  await expect(answer).toBeVisible()
  await page.clock.runFor(300)
  const initial = await answer.innerText()
  expect(initial.length).toBeGreaterThan(0)
  expect(initial.length).toBeLessThan(answerOne.length)
  expect(answerOne.startsWith(initial)).toBe(true)
  await expect(answer).toHaveAttribute('aria-busy', 'true')
  await examples.getByRole('button', { name: questionTwo, exact: true }).click()
  await page.clock.runFor(3000)
  await expect(answer).toHaveText(answerTwo)
  await expect(answer).toHaveAttribute('aria-busy', 'false')
  await expect(answer).not.toContainText('第一条回答')
  await expect(examples.locator('.market-example-query')).toHaveText(questionTwo)
  await expect(examples).not.toContainText(/思考过程|工具调用|推理轮次|第\s*\d+\s*轮/)
  await examples.getByRole('button', { name: questionOne, exact: true }).click()
  await page.clock.runFor(7000)
  await expect(answer).toHaveText(answerOne)
  await page.getByRole('button', { name: '概览', exact: true }).click()
  await expect(page.locator('.market-example-answer')).toHaveCount(0)
  await page.clock.runFor(1000)
  expectNoSideEffects(traffic)
})

test('reduced motion shows complete recorded answers immediately and mobile wraps long questions', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const traffic = await setup(page)
  const examples = await openTab(page, '示例问答')
  await expect(examples.locator('.market-example-answer')).toHaveText(answerOne)
  await expect(examples.locator('.market-example-answer')).toHaveAttribute('aria-busy', 'false')
  await examples.getByRole('button', { name: questionTwo, exact: true }).click()
  await expect(examples.locator('.market-example-answer')).toHaveText(answerTwo)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expectNoSideEffects(traffic)
})

test('preview errors remain visible and retry loads the actual content', async ({ page }) => {
  let attempts = 0
  const traffic = await setup(page, async route => {
    attempts += 1
    await route.fulfill(attempts === 1 ? { status: 503, json: { error: 'preview temporarily unavailable' } } : { json: { data: preview } })
  })
  const directory = await openTab(page, '内容目录')
  await expect(directory).toContainText(/加载失败|暂时无法|未能加载/)
  await directory.getByRole('button', { name: /重试/ }).click()
  await expect(directory.getByPlaceholder('搜索目录标题…')).toBeVisible()
  await expect(directory.getByText('真实知识条目01', { exact: true })).toBeVisible()
  expect(attempts).toBe(2)
  expectNoSideEffects(traffic)
})

test('a delayed preview from the previous product never replaces the new product content', async ({ page }) => {
  let releasePrevious!: () => void
  const previousReady = new Promise<void>(resolve => { releasePrevious = resolve })
  let previousFulfilled!: () => void
  const fulfilled = new Promise<void>(resolve => { previousFulfilled = resolve })
  const traffic = await setup(page, async (route, id) => {
    if (id === 'preview-product') {
      await previousReady
      try { await route.fulfill({ json: { data: preview } }) } finally { previousFulfilled() }
    } else {
      await route.fulfill({ json: { data: { directory: [{ id: 'next-entry', title: '下一商品的独立目录', path: ['下一项知识库'], page_type: 'concept' }], examples: [{ question: '下一商品的问题', answer: '下一商品的答案。' }] } } })
    }
  })
  await openTab(page, '内容目录')
  await expect.poll(() => traffic.previewReads.length).toBe(1)
  await page.evaluate(() => (window as any).__marketplaceHarness.router.push('/platform/marketplace/preview-next'))
  await expect(page.locator('.market-detail-copy h1')).toHaveText('下一项知识库')
  const directory = await openTab(page, '内容目录')
  await expect(directory.getByText('下一商品的独立目录', { exact: true })).toBeVisible()
  releasePrevious()
  await fulfilled
  await expect(directory.getByText('下一商品的独立目录', { exact: true })).toBeVisible()
  await expect(directory).not.toContainText('真实知识条目')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const examples = await openTab(page, '示例问答')
  await expect(examples.locator('.market-example-answer')).toHaveText('下一商品的答案。')
  expectNoSideEffects(traffic)
})

test('the market listing never eagerly fetches every product preview', async ({ page }) => {
  const traffic = await setup(page)
  await page.getByRole('button', { name: 'Visit market', exact: true }).click()
  await expect(page.locator('.market-card').first()).toBeVisible()
  expect(traffic.previewReads).toEqual([])
  expectNoSideEffects(traffic)
})
