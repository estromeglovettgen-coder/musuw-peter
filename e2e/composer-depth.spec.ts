import { expect, test, type Page } from '@playwright/test'

const peter = process.env.VITE_WORKSPACE_PROFILE === 'peter'
const fixtureModel = { id: 'fixture-flash', name: 'deepseek-flash', display_name: 'DeepSeek Flash1017', type: 'KnowledgeQA',
  source: 'remote', status: 'active', is_builtin: true, parameters: { provider: 'openrouter', reasoning: { supported: true, mandatory: false, supported_efforts: ['low', 'high', 'max'] } } }
const fixtureAgent = { id: 'fixture-taylor', name: '泰勒', is_builtin: false, config: { agent_mode: 'smart-reasoning', model_id: fixtureModel.id, kb_selection_mode: 'none', allowed_tools: [], mcp_selection_mode: 'none', skills_selection_mode: 'none' } }

async function installApi(page: Page, mandatory = false) {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/models') return route.fulfill({ json: { success: true, data: [{ ...fixtureModel, parameters: { ...fixtureModel.parameters, reasoning: { ...fixtureModel.parameters.reasoning, mandatory } } }] } })
    if (path === '/api/v1/agents') return route.fulfill({ json: { success: true, data: [fixtureAgent], disabled_own_agent_ids: [] } })
    return route.fulfill({ json: { success: true, data: [], total: 0 } })
  })
}
const snapshot = (page: Page) => page.evaluate(() => {
  const settings = (window as any).__depthFixture.settings
  return { agent: settings.selectedAgentId, model: settings.conversationModels.selectedChatModelId,
    depth: settings.conversationModels.reasoningEffort, thinking: settings.conversationModels.thinkingEnabled }
})
async function expectNoModelLeaks(page: Page) {
  await expect(page.locator('.visual-chat-composer')).not.toContainText(/DeepSeek|deepseek-flash|Flash1017|泰勒/)
  const attributes = await page.locator('[title], [aria-label]').evaluateAll(nodes => nodes.map(node => `${node.getAttribute('title') || ''} ${node.getAttribute('aria-label') || ''}`).join('\n'))
  expect(attributes).not.toMatch(/DeepSeek|deepseek-flash|Flash1017|fixture-flash|泰勒/)
  await expect(page.locator('.visual-model-selector__chat-row.is-agent, .visual-model-selector__chat-back, .visual-model-selector__chat-flyout')).toHaveCount(0)
}

for (const width of [1440, 390]) test(`Peter ${width}px exposes native depth only and changes real store without changing model or agent`, async ({ page }, info) => {
  test.skip(!peter)
  await page.setViewportSize({ width, height: 900 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await installApi(page)
  await page.goto('/e2e/composer-depth-harness.html')
  const capsule = page.locator('.visual-chat-composer__combined-picker')
  await expect(capsule).toContainText('推理强度')
  await expect(capsule).toContainText('高')
  await expectNoModelLeaks(page)
  const before = await snapshot(page)
  await capsule.click()
  const list = page.getByRole('listbox', { name: '推理强度', exact: true })
  await expect(list).toBeVisible()
  await expect(list.getByRole('option')).toHaveText(['低', '高', '最高', '关闭'])
  await expectNoModelLeaks(page)
  await page.screenshot({ path: info.outputPath('depth-only-open.png') })
  await list.getByRole('option', { name: '最高', exact: true }).click()
  await expect(capsule).toContainText('最高')
  expect(await snapshot(page)).toEqual({ ...before, depth: 'max', thinking: true })
  await capsule.click()
  await page.getByRole('option', { name: '关闭', exact: true }).click()
  await expect(capsule).toContainText('关闭')
  expect(await snapshot(page)).toEqual({ ...before, depth: 'none', thinking: false })
  await capsule.click()
  await list.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  expect(await snapshot(page)).toEqual({ ...before, depth: 'low', thinking: true })
  await capsule.click()
  await page.keyboard.press('Escape')
  await expect(list).toHaveCount(0)
  await expect(capsule).toBeFocused()
  await expectNoModelLeaks(page)
  expect(errors).toEqual([])
})

test('Peter does not invent an off option for a model with mandatory reasoning', async ({ page }) => {
  test.skip(!peter)
  await installApi(page, true)
  await page.goto('/e2e/composer-depth-harness.html')
  await page.locator('.visual-chat-composer__combined-picker').click()
  await expect(page.getByRole('listbox', { name: '推理强度', exact: true }).getByRole('option')).toHaveText(['低', '高', '最高'])
})

test('other profiles retain their native agent and model picker', async ({ page }) => {
  test.skip(peter)
  await installApi(page)
  await page.goto('/e2e/composer-depth-harness.html')
  const capsule = page.locator('.visual-chat-composer__combined-picker')
  await expect(capsule).toContainText('泰勒')
  await expect(capsule).toContainText('DeepSeek Flash1017')
  await capsule.click()
  await expect(page.locator('.visual-model-selector__chat-row')).toHaveCount(3)
})
