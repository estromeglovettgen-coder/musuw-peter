import { expect, test } from '@playwright/test'

let browserErrors: string[] = []

test.beforeEach(async ({ page }) => {
  browserErrors = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/skills' || path.startsWith('/api/v1/skills/')) {
      if (!page.url().includes('admin=1')) return route.fulfill({ status: 403, json: { error: 'Skills 暂未开放' } })
      return route.fulfill({ json: { success: true, skills_available: true, data: [] } })
    }
    if (path === '/api/v1/organizations') return route.fulfill({ json: { success: true, data: { organizations: [], resource_counts: {} } } })
    if (request.method() === 'POST' && path === '/api/v1/agents') return route.fulfill({ json: { data: { ...request.postDataJSON(), id: 'new-agent' } } })
    return route.fulfill({ json: { success: true, data: [], channels: [] } })
  })
})

test.afterEach(() => { expect(browserErrors).toEqual([]) })

for (const admin of [false, true]) {
  test(`new agent has a plain name and configured backend models without any model selection (${admin ? 'admin' : 'user'})`, async ({ page }) => {
    await page.goto(`/e2e/fire-agent-surface-harness.html?${admin ? 'admin=1&' : ''}section=model`)
    const name = page.locator('[data-guide="agent-create-name"] input')
    await expect(name).toHaveValue('我的智能体')
    await expect(page.getByText('Wiki + RAG 混合', { exact: true })).toHaveCount(0)
    await expect(page.locator('.visual-model-selector')).toHaveCount(0)
    await expect(page.getByText(/DeepSeek|Gemini|Whisper/)).toHaveCount(0)
    const requestPromise = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/agents')
    await page.locator('[data-guide="agent-create-submit"]').click()
    const body = (await requestPromise).postDataJSON()
    expect(body.name).toBe('我的智能体')
    expect(body.config.model_id).toBe('chat-configured')
    expect(body.config.rerank_model_id).toBe('rerank-configured')
    expect(body.config.vlm_model_id).toBe('vision-configured')
    expect(body.config.asr_model_id).toBe('asr-configured')
    await expect(page.getByText('智能体创建成功', { exact: true })).toBeVisible()
  })
}

test('editing preserves a custom name, prompt, and hidden model configuration', async ({ page }) => {
  await page.goto('/e2e/fire-agent-surface-harness.html?edit=1&section=model')
  await expect(page.locator('[data-guide="agent-create-name"] input')).toHaveValue('用户自己的名字')
  await expect(page.locator('.visual-model-selector')).toHaveCount(0)
  const requestPromise = page.waitForRequest((request) => request.method() === 'PUT' && new URL(request.url()).pathname === '/api/v1/agents/existing-agent')
  await page.locator('[data-guide="agent-create-submit"]').click()
  const body = (await requestPromise).postDataJSON()
  expect(body.name).toBe('用户自己的名字')
  expect(body.config.model_id).toBe('chat-configured')
  expect(body.config.rerank_model_id).toBe('rerank-configured')
  expect(body.config.system_prompt).toBe('这是保留的原有提示词。')
  expect(body.config.question_suggestions.follow_ups.model_id).toBe('chat-configured')
})

for (const width of [1440, 390]) test(`shared selector hides models and keeps agent/depth usable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/e2e/fire-agent-surface-harness.html?surface=selectors')
  await expect(page.getByTestId('catalog').locator('.visual-model-selector')).toHaveCount(0)
  await expect(page.getByText(/DeepSeek|Gemini|Whisper/)).toHaveCount(0)
  await expect(page.getByTestId('chat').getByText('泰勒', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /推理强度/ }).click()
  await page.getByRole('option', { name: '高', exact: true }).click()
})


test('missing platform configuration fails clearly without a broken model picker or save request', async ({ page }) => {
  let saves = 0
  page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/agents') saves += 1 })
  await page.goto('/e2e/fire-agent-surface-harness.html?missingModels=1')
  await expect(page.locator('[data-guide="agent-create-name"] input')).toHaveValue('我的智能体')
  await page.locator('[data-guide="agent-create-submit"]').click()
  await expect(page.getByText('回答服务暂不可用，请联系管理员。', { exact: true })).toBeVisible()
  await expect(page.locator('.visual-model-selector')).toHaveCount(0)
  expect(saves).toBe(0)
})


for (const role of ['user', 'admin']) for (const skillState of ['selected', 'all', 'unbound']) {
  test(`hidden Skills preserve saved settings for ${role} with ${skillState} selection`, async ({ page }) => {
    const skillRequests: string[] = []
    page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/v1/skills')) skillRequests.push(request.url()) })
    await page.goto(`/e2e/fire-agent-surface-harness.html?edit=1&skillState=${skillState}${role === 'admin' ? '&admin=1' : ''}`)
    const name = page.locator('[data-guide="agent-create-name"] input')
    await expect(name).toHaveValue('用户自己的名字')
    await name.fill('只修改名称')
    const requestPromise = page.waitForRequest((request) => request.method() === 'PUT' && new URL(request.url()).pathname === '/api/v1/agents/existing-agent')
    await page.locator('[data-guide="agent-create-submit"]').click()
    const body = (await requestPromise).postDataJSON()
    expect(body.name).toBe('只修改名称')
    expect(body.config.skills_selection_mode).toBe(skillState === 'all' ? 'all' : 'selected')
    expect(body.config.selected_skills).toEqual(['persisted-private-skill', 'catalog-removed-skill'])
    expect(body.config.sandbox_config_id).toBe(skillState === 'unbound' ? '' : 'saved-sandbox')
    expect(skillRequests).toEqual([])
    await expect(page.locator('[data-guide="agent-editor-nav-skills"]')).toHaveCount(0)
  })
}
