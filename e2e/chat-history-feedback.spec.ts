import { expect, test, type Page } from '@playwright/test'

// Reuse the existing app harness with the real ChatView and a flex route outlet.
// Vue, the controller, API client and rendered messages run without stubs.
async function useChatHarness(page: Page) {
  await page.route('**/e2e/knowledge-upload-harness.ts', async route => {
    const response = await route.fetch()
    const source = (await response.text())
      .replace('/src/views/knowledge/KnowledgeBase.vue', '/src/views/chat/index.vue')
      .replaceAll('/platform/knowledge-bases/:kbId', '/platform/chat/:chatid')
      .replaceAll('/platform/knowledge-bases/upload-kb', '/platform/chat/history-session')
      .replace('render: () => [h(RouterView), h(ManualKnowledgeEditor)]', "render: () => h('div', { style: 'display:flex;flex-direction:column;height:100%;min-height:0' }, [h(RouterView), h(ManualKnowledgeEditor)])")
    await route.fulfill({ response, body: source + '\nwindow.feedbackRouter = router' })
  })
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (/^\/api\/v1\/sessions\/[^/]+$/.test(path)) {
      return route.fulfill({ json: { success: true, data: {
        id: path.split('/').at(-1), title: '历史反馈验收',
        created_at: '2026-09-11T10:00:00Z', updated_at: '2026-09-11T10:00:00Z',
      } } })
    }
    return route.fulfill({ json: { success: true, data: [], total: 0 } })
  })
}

function gate() {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  return { pending, release }
}

const savedMessage = (id: string, content: string, minute = 0) => ({
  id, role: 'user', content, is_completed: true,
  created_at: `2026-09-11T10:${String(minute).padStart(2, '0')}:00Z`,
})
const messageArea = (page: Page) => page.locator('.visual-chat-messages')
const rows = (page: Page) => page.locator('.visual-chat-message-row')

for (const failureStatus of [500, 200]) {
  test(`history failure with HTTP ${failureStatus} remains visible and retry restores messages`, async ({ page }) => {
    let failHistory = false
    let historyRequests = 0
    const retry = gate()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await useChatHarness(page)
    await page.route('**/api/v1/messages/history-session/load?*', async route => {
      historyRequests++
      if (failHistory) return route.fulfill({ status: failureStatus, json: { success: false, message: '历史服务暂时不可用' } })
      if (historyRequests > 1) await retry.pending
      return route.fulfill({ json: { success: true, data: [savedMessage('history-user', '已经保存的历史问题')] } })
    })
    try {
      await page.goto('/e2e/knowledge-upload-harness.html')
      await expect(page.getByText('已经保存的历史问题', { exact: true })).toBeVisible()
      failHistory = true
      await page.reload()
      await expect(messageArea(page).getByRole('alert')).toContainText('加载对话失败')
      await expect(page.locator('.visual-chat-skeletons')).toHaveCount(0)
      await expect(page.locator('.visual-chat-suggestions')).toHaveCount(0)
      failHistory = false
      await messageArea(page).getByRole('button', { name: '重试', exact: true }).click()
      await expect.poll(() => historyRequests).toBe(3)
      await expect(page.locator('.visual-chat-skeletons')).toBeVisible()
      await expect(page.locator('.visual-chat-suggestions')).toHaveCount(0)
      retry.release()
      await expect(page.getByText('已经保存的历史问题', { exact: true })).toBeVisible()
      await expect(messageArea(page).getByRole('alert')).toHaveCount(0)
      expect(historyRequests).toBe(3)
      expect(errors).toEqual([])
    } finally {
      retry.release()
    }
  })
}

test('older history failure preserves visible messages and retries the same cursor', async ({ page }) => {
  await useChatHarness(page)
  const recent = Array.from({ length: 20 }, (_, index) => savedMessage(`recent-${index + 1}`, `现有消息 ${index + 1}`, index + 1))
  const older = savedMessage('older-message', '更早的历史消息')
  const retry = gate()
  const cursors: string[] = []
  await page.route('**/api/v1/messages/history-session/load?*', async route => {
    const cursor = new URL(route.request().url()).searchParams.get('before_time')
    if (!cursor) return route.fulfill({ json: { success: true, data: recent } })
    cursors.push(cursor)
    if (cursors.length === 1) return route.fulfill({ status: 503, json: { success: false } })
    await retry.pending
    return route.fulfill({ json: { success: true, data: [older] } })
  })
  try {
    await page.goto('/e2e/knowledge-upload-harness.html')
    await expect(rows(page)).toHaveCount(20)
    const scroll = page.locator('.visual-chat-scroll')
    await expect.poll(() => scroll.evaluate(element => element.scrollHeight > element.clientHeight && element.scrollTop > 0)).toBe(true)
    await scroll.evaluate(element => { element.scrollTop = 0 })
    await expect(messageArea(page).getByRole('alert')).toContainText('加载对话失败')
    await expect(rows(page)).toHaveCount(20)
    await expect(page.getByText('现有消息 1', { exact: true })).toBeVisible()
    expect(cursors).toEqual([recent[0].created_at])
    await messageArea(page).getByRole('button', { name: '重试', exact: true }).click()
    await expect(messageArea(page).getByRole('status')).toContainText('加载中')
    await expect(rows(page)).toHaveCount(20)
    await expect.poll(() => cursors.length).toBe(2)
    retry.release()
    await expect(rows(page)).toHaveCount(21)
    await expect(rows(page).first()).toContainText('更早的历史消息')
    await expect(messageArea(page).getByRole('alert')).toHaveCount(0)
    await expect(messageArea(page).getByRole('status')).toHaveCount(0)
    expect(cursors).toEqual([recent[0].created_at, recent[0].created_at])
  } finally {
    retry.release()
  }
})

test('late responses from previous conversations cannot restart or replace current history', async ({ page }) => {
  await useChatHarness(page)
  const previous = gate()
  const previousDetails = gate()
  let previousStarted = false
  let previousDetailsStarted = false
  let nextHistoryRequests = 0
  await page.route('**/api/v1/messages/history-session/load?*', async route => {
    previousStarted = true
    await previous.pending
    return route.fulfill({ status: 503, json: { success: false } })
  })
  await page.route('**/api/v1/sessions/middle-session', async route => {
    previousDetailsStarted = true
    await previousDetails.pending
    return route.fallback()
  })
  await page.route('**/api/v1/messages/next-session/load?*', route => {
    nextHistoryRequests++
    return route.fulfill({ json: { success: true, data: [savedMessage('next-message', '新会话历史消息')] } })
  })
  try {
    await page.goto('/e2e/knowledge-upload-harness.html')
    await expect.poll(() => previousStarted).toBe(true)
    await expect(page.locator('.visual-chat-skeletons')).toBeVisible()
    await page.evaluate(() => (window as any).feedbackRouter.push('/platform/chat/middle-session'))
    await expect.poll(() => previousDetailsStarted).toBe(true)
    await page.evaluate(() => (window as any).feedbackRouter.push('/platform/chat/next-session'))
    await expect(page.getByText('新会话历史消息', { exact: true })).toBeVisible()
    const completed = Promise.all([
      page.waitForResponse(response => response.url().includes('/api/v1/messages/history-session/load')),
      page.waitForResponse(response => response.url().endsWith('/api/v1/sessions/middle-session')),
    ])
    previous.release()
    previousDetails.release()
    await completed
    // Give the real response handler and Vue render cycle time to consume the error.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(messageArea(page).getByRole('alert')).toHaveCount(0)
    await expect(rows(page)).toHaveCount(1)
    await expect(page.getByText('新会话历史消息', { exact: true })).toBeVisible()
    expect(nextHistoryRequests).toBe(1)
  } finally {
    previous.release()
    previousDetails.release()
  }
})

test('a successful empty history remains an empty conversation', async ({ page }) => {
  await useChatHarness(page)
  // The Go API may serialize an empty message slice as null.
  await page.route('**/api/v1/messages/history-session/load?*', route => route.fulfill({ json: { success: true, data: null } }))
  await page.goto('/e2e/knowledge-upload-harness.html')
  await expect(page.locator('.visual-chat-skeletons')).toHaveCount(0)
  await expect(page.locator('.visual-chat-suggestions')).toHaveCount(1)
  await expect(messageArea(page).getByRole('alert')).toHaveCount(0)
  await expect(rows(page)).toHaveCount(0)
})
