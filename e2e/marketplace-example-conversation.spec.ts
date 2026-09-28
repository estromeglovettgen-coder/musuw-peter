import { expect, test } from '@playwright/test'

const first = { question: '如何理解自己的选择？', answer: '**第一份回答**\n\n' + '先分清自己的目标和当前的事实，再检查下一步行动。'.repeat(12) }
const second = { question: '如何回顾一次沟通？', answer: '**第二份回答**\n\n' + '从具体表达与对方回应入手，梳理哪些内容需要进一步确认。'.repeat(12) }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(examples => { (window as any).__exampleFixtures = examples }, [first, second])
})

test('example answers animate, switch cleanly and replay without model calls', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()) })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/e2e/marketplace-example-harness.html')
  const answer = page.locator('.market-example-answer')
  await expect(answer).toHaveAttribute('aria-busy', 'true')
  await expect(answer).toContainText('第一份回答')
  expect((await answer.innerText()).length).toBeLessThan(first.answer.length - 4)
  await page.getByRole('button', { name: second.question, exact: true }).click()
  await expect(page.locator('.market-example-query')).toHaveText(second.question)
  await expect(answer).not.toContainText('第一份回答')
  await expect(answer).toHaveAttribute('aria-busy', 'false')
  await expect(answer.locator('strong')).toHaveText('第二份回答')
  await expect(answer).toContainText(second.answer.slice(second.answer.indexOf('\n\n') + 2))
  await page.getByRole('button', { name: second.question, exact: true }).click()
  await expect(answer).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => (window as any).__unmountExample())
  await expect(answer).toHaveCount(0)
  expect(requests).toEqual([])
})

test('reduced motion shows complete examples immediately and mobile has no horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/e2e/marketplace-example-harness.html')
  const answer = page.locator('.market-example-answer')
  await expect(answer).toHaveAttribute('aria-busy', 'false')
  await expect(answer).toContainText(first.answer.slice(first.answer.indexOf('\n\n') + 2))
  const questions = page.locator('.market-example-questions')
  expect((await questions.boundingBox())!.height).toBeLessThan(100)
  expect(await questions.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  await page.getByRole('button', { name: second.question, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(answer).toHaveAttribute('aria-busy', 'false')
  await expect(answer.locator('strong')).toHaveText('第二份回答')
  await expect(page.locator('.market-example-query')).toHaveText(second.question)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('public excerpts keep Markdown text but never load media or expose private links and HTML styling', async ({ page }) => {
  const answer = '**正文加粗**\n\n[资料文字](/api/v1/knowledge/private-file)\n\n![图片](/api/v1/knowledge/private-image)\n\n<img src="/api/v1/knowledge/private-html-image"><iframe src="/api/v1/knowledge/private-frame"></iframe><svg><image href="/api/v1/knowledge/private-svg" /></svg>\n\n<a href="https://example.invalid/private">外链文字</a><p class="hidden" style="display:none" data-session-id="private-session">段落文字</p>\n\n| 列一 | 列二 |\n| --- | --- |\n| 数据 | 数值 |'
  const requests: string[] = []
  await page.route('**/api/**', route => {
    requests.push(route.request().url())
    return route.fulfill({ status: 404, body: '' })
  })
  await page.route('**/e2e/marketplace-example-harness.html', async route => {
    const response = await route.fetch()
    const html = (await response.text()).replace('<div id="app"></div>', `<div id="app"></div><script>window.__exampleFixtures=${JSON.stringify([{ question: '公开正文检查', answer }]).replaceAll('<', '\\u003c')}</script>`)
    await route.fulfill({ response, body: html })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 430, height: 932 })
  await page.goto('/e2e/marketplace-example-harness.html')
  const excerpt = page.locator('.market-example-answer')
  await expect(excerpt).toHaveAttribute('aria-busy', 'false')
  await expect(excerpt.locator('strong')).toHaveText('正文加粗')
  await expect(excerpt).toContainText('资料文字')
  await expect(excerpt).toContainText('外链文字')
  await expect(excerpt.getByText('段落文字', { exact: true })).toBeVisible()
  await expect(excerpt.locator('table')).toHaveCount(1)
  await expect(excerpt.locator('img, iframe, svg, a, [style], [class], [data-session-id]')).toHaveCount(0)
  expect(requests).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
