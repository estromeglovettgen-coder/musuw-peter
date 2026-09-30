import { expect, test } from '@playwright/test'

test('customer graph keeps controls outside the canvas and fits a phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/knowledge-bases/customer-graph') return route.fulfill({ json: { success: true, data: {
      id: 'customer-graph', name: 'Mira', description: '', type: 'document',
      indexing_strategy: { wiki_enabled: true },
      customer_profile: { status: '沟通中', shared_knowledge_base_ids: [], tags: [] },
    } } })
    if (path === '/api/v1/knowledge-bases') return route.fulfill({ json: { success: true, data: [] } })
    if (path.endsWith('/wiki/graph')) return route.fulfill({ json: { success: true, data: {
      nodes: [
        { slug: 'profile', title: 'Mira 的客户资料', page_type: 'entity', link_count: 4 },
        { slug: 'needs', title: '需求与目标', page_type: 'concept', link_count: 2 },
        { slug: 'concerns', title: '顾虑与疑问', page_type: 'concept', link_count: 2 },
        { slug: 'progress', title: '沟通进展', page_type: 'concept', link_count: 2 },
        { slug: 'summary', title: '沟通摘要', page_type: 'summary', link_count: 2 },
      ],
      edges: [
        { source: 'profile', target: 'needs' }, { source: 'profile', target: 'concerns' },
        { source: 'profile', target: 'progress' }, { source: 'profile', target: 'summary' },
      ], meta: { mode: 'overview', total: 5, returned: 5, truncated: false },
    } } })
    if (path.endsWith('/wiki/stats')) return route.fulfill({ json: { success: true, data: { total_pages: 5, pending_tasks: 0, pending_issues: 0, is_active: false } } })
    if (path.endsWith('/wiki/pages')) return route.fulfill({ json: { success: true, data: { pages: [], total: 0 } } })
    if (path.endsWith('/wiki/index')) return route.fulfill({ json: { success: true, data: { intro: '', groups: [] } } })
    return route.fulfill({ json: { success: true, data: [] } })
  })
  await page.goto('/e2e/mobile-harness.html?page=/platform/customers/customer-graph?tab=graph')
  const graph = page.locator('.customer-content .wiki-graph')
  const canvas = graph.locator('.wiki-graph-canvas')
  const legend = graph.locator('.wiki-graph-legend')
  await expect(legend).toBeVisible()
  const guide = page.getByRole('dialog', { name: '欢迎使用 Musuw' })
  await expect(guide).toBeVisible()
  await guide.getByText('跳过引导').click()
  await page.waitForTimeout(1600) // include the first force-layout fit
  const canvasBox = await canvas.boundingBox()
  const legendBox = await legend.boundingBox()
  expect(canvasBox).not.toBeNull()
  expect(legendBox).not.toBeNull()
  expect(canvasBox!.width).toBeGreaterThan(280)
  expect(canvasBox!.height).toBeGreaterThan(100)
  expect(legendBox!.y).toBeGreaterThanOrEqual(canvasBox!.y + canvasBox!.height - 1)
  expect(legendBox!.x).toBeGreaterThanOrEqual(0)
  expect(legendBox!.x + legendBox!.width).toBeLessThanOrEqual(390)
  await legend.getByText('适应屏幕').first().click()
  await expect(page.locator('.customer-project-tabs a.active')).toHaveText('图谱')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/customer-graph-mobile.png' })
})
