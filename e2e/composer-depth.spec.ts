import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const peter = process.env.VITE_WORKSPACE_PROFILE === 'peter'
const fixtureModel = { id: 'fixture-flash', name: 'deepseek-flash', display_name: 'DeepSeek Flash1017', type: 'KnowledgeQA',
  source: 'remote', status: 'active', is_builtin: true, parameters: { provider: 'openrouter', reasoning: { supported: true, mandatory: false, supported_efforts: ['low', 'high', 'max'] } } }
const fixtureAgent = { id: 'fixture-taylor', name: '泰勒', is_builtin: false, config: { agent_mode: 'smart-reasoning', model_id: fixtureModel.id, kb_selection_mode: 'none', allowed_tools: [], mcp_selection_mode: 'none', skills_selection_mode: 'none' } }
const otherAgent = { ...fixtureAgent, id: 'fixture-writer', name: '写作助手' }

async function installApi(page: Page, mandatory = false) {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/v1/models') return route.fulfill({ json: { success: true, data: [{ ...fixtureModel, parameters: { ...fixtureModel.parameters, reasoning: { ...fixtureModel.parameters.reasoning, mandatory } } }] } })
    if (path === '/api/v1/agents') return route.fulfill({ json: { success: true, data: [fixtureAgent, otherAgent], disabled_own_agent_ids: [] } })
    return route.fulfill({ json: { success: true, data: [], total: 0 } })
  })
}
const snapshot = (page: Page) => page.evaluate(() => {
  const settings = (window as any).__depthFixture.settings
  return { agent: settings.selectedAgentId, model: settings.conversationModels.selectedChatModelId,
    depth: settings.conversationModels.reasoningEffort, thinking: settings.conversationModels.thinkingEnabled }
})
async function expectNoModelLeaks(page: Page) {
  await expect(page.locator('.visual-chat-composer')).not.toContainText(/DeepSeek|deepseek-flash|Flash1017/)
  const attributes = await page.locator('[title], [aria-label]').evaluateAll(nodes => nodes.map(node => `${node.getAttribute('title') || ''} ${node.getAttribute('aria-label') || ''}`).join('\n'))
  expect(attributes).not.toMatch(/DeepSeek|deepseek-flash|Flash1017|fixture-flash/)
  await expect(page.locator('.visual-model-selector__chat-row-value.is-model, .visual-model-selector__chat-flyout.is-models')).toHaveCount(0)
}

for (const width of [1440, 390]) test(`Peter ${width}px exposes native agent and depth entries only and changes real store without changing model or agent`, async ({ page }, info) => {
  test.skip(!peter)
  await page.setViewportSize({ width, height: 900 })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await installApi(page)
  await page.goto('/e2e/composer-depth-harness.html')
  const capsule = page.locator('.visual-chat-composer__combined-picker')
  await expect(capsule).toContainText('泰勒')
  await expect(capsule).toContainText('高')
  await expectNoModelLeaks(page)
  const before = await snapshot(page)
  await capsule.click()
  await expect(page.locator('.visual-model-selector__chat-row')).toHaveCount(2)
  await page.getByRole('button', { name: '推理强度 高', exact: true }).click()
  const list = page.getByRole('listbox', { name: '推理强度', exact: true })
  await expect(list).toBeVisible()
  await expect(list.getByRole('option')).toHaveText(['低', '高', '最高', '关闭'])
  await expectNoModelLeaks(page)
  await page.screenshot({ path: info.outputPath('agent-depth-open.png') })
  await list.getByRole('option', { name: '最高', exact: true }).click()
  await expect(capsule).toContainText('最高')
  expect(await snapshot(page)).toEqual({ ...before, depth: 'max', thinking: true })
  await capsule.click()
  await page.getByRole('button', { name: '推理强度 最高', exact: true }).click()
  await page.getByRole('option', { name: '关闭', exact: true }).click()
  await expect(capsule).toContainText('关闭')
  expect(await snapshot(page)).toEqual({ ...before, depth: 'none', thinking: false })
  await capsule.click()
  await page.getByRole('button', { name: '推理强度 关闭', exact: true }).click()
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
  await page.getByRole('button', { name: '推理强度 高', exact: true }).click()
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

for (const width of [1440, 390]) test(`Peter ${width}px switches agents through the real native handler without exposing models`, async ({ page }) => {
  test.skip(!peter)
  await page.setViewportSize({ width, height: 900 })
  await installApi(page)
  await page.goto('/e2e/composer-depth-harness.html')
  const capsule = page.locator('.visual-chat-composer__combined-picker')
  await expect(capsule).toContainText('泰勒')
  await capsule.click()
  await page.locator('.visual-model-selector__chat-row.is-agent').click()
  const agents = page.getByRole('listbox', { name: '智能体', exact: true })
  await expect(agents.getByRole('option')).toHaveText(['泰勒', '写作助手'])
  await expectNoModelLeaks(page)
  await agents.getByRole('option', { name: '写作助手', exact: true }).click()
  await expect(capsule).toContainText('写作助手')
  await expect.poll(() => snapshot(page)).toMatchObject({ agent: 'fixture-writer', model: fixtureModel.id })
  await capsule.click()
  await page.locator('.visual-model-selector__chat-row.is-agent').click()
  await page.getByRole('option', { name: '泰勒', exact: true }).click()
  await expect.poll(() => snapshot(page)).toMatchObject({ agent: fixtureAgent.id, model: fixtureModel.id })
  await expectNoModelLeaks(page)
})

test('hidden model selection cannot be restored by an externally supplied models view', async ({ page }) => {
  await installApi(page)
  await page.goto('/e2e/composer-depth-harness.html?selector=models')
  await expect(page.locator('.visual-model-selector__chat-row')).toHaveCount(2)
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('DeepSeek secret')
  const labels = await page.locator('[title], [aria-label]').evaluateAll(nodes => nodes.map(node => `${node.getAttribute('title')} ${node.getAttribute('aria-label')}`).join(' '))
  expect(labels).not.toMatch(/DeepSeek|模型/)
})

test('upload entry keeps local files, folders and manual content while Peter hides URL import', async ({ page }, info) => {
  await installApi(page)
  await page.goto('/e2e/composer-depth-harness.html?upload')
  const urlButton = page.locator('[data-guide="kb-detail-import-url"]')
  await expect(urlButton).toHaveCount(peter ? 0 : 1)
  if (peter) {
    await page.evaluate(() => (window as any).__depthFixture.uploadRef.value.openUrlDialog('https://example.com'))
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } else {
    await urlButton.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: '取消', exact: true }).first().click()
  }
  await page.locator('.visual-upload-source__trigger').first().click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem')).toHaveCount(3)
  const local = page.waitForEvent('filechooser')
  await menu.getByRole('menuitem').nth(0).click()
  await (await local).setFiles({ name: 'offline-course.txt', mimeType: 'text/plain', buffer: Buffer.from('本地课程测试') })
  await expect.poll(() => page.evaluate(() => (window as any).__depthFixture.files)).toEqual(['offline-course.txt'])
  await expect(menu).toBeHidden()
  await page.locator('.visual-upload-source__trigger').first().click()
  const folder = page.waitForEvent('filechooser')
  await menu.getByRole('menuitem').nth(1).click()
  const folderChooser = await folder
  expect(folderChooser.isMultiple()).toBe(true)
  const courseFolder = info.outputPath('course-folder')
  await mkdir(courseFolder, { recursive: true })
  await writeFile(join(courseFolder, 'folder-course.txt'), '文件夹课程测试')
  await folderChooser.setFiles(courseFolder)
  await expect.poll(() => page.evaluate(() => (window as any).__depthFixture.files)).toEqual(['folder-course.txt'])
  await expect(menu).toBeHidden()
  await page.locator('.visual-upload-source__trigger').first().click()
  await menu.getByRole('menuitem').nth(2).click()
  await expect.poll(() => page.evaluate(() => (window as any).__depthFixture.manual)).toEqual(1)
})

test.describe('touch devices', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  test('Peter opens both native entries on the first tap', async ({ page }) => {
    test.skip(!peter)
    await installApi(page)
    await page.goto('/e2e/composer-depth-harness.html')
    const capsule = page.locator('.visual-chat-composer__combined-picker')
    await capsule.tap()
    await page.locator('.visual-model-selector__chat-row.is-agent').tap()
    await page.getByRole('option', { name: '写作助手', exact: true }).tap()
    await expect(capsule).toContainText('写作助手')
    await capsule.tap()
    await page.getByRole('button', { name: '推理强度 高', exact: true }).tap()
    await page.getByRole('option', { name: '低', exact: true }).tap()
    await expect.poll(() => snapshot(page)).toMatchObject({ agent: otherAgent.id, depth: 'low', model: fixtureModel.id })
    await expectNoModelLeaks(page)
  })
})
