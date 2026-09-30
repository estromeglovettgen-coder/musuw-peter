import { expect, test, type Page } from '@playwright/test'

type FixtureOptions = { archive?: boolean; failArchive?: 'http' | 'body'; failTemporary?: boolean; unbound?: boolean }

async function openChat(page: Page, options: FixtureOptions = {}) {
  const requests = { archive: [] as Array<{ path: string; body: string }>, temporary: 0, chat: [] as any[], created: 0 }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    if (path === '/api/v1/sessions/customer-session' && method === 'GET') {
      return route.fulfill({ json: { success: true, data: {
        id: 'customer-session', title: '客户会话',
        customer_knowledge_base_id: options.unbound ? '' : 'customer-A',
      } } })
    }
    if (path === '/api/v1/knowledge-bases/customer-A' || path === '/api/v1/knowledge-bases/customer-B') {
      const id = path.split('/').at(-1)
      return route.fulfill({ json: { success: true, data: {
        id, name: id === 'customer-A' ? '现有客户' : '新客户',
        customer_profile: { status: '待跟进', shared_knowledge_base_ids: [] },
      } } })
    }
    if (path === '/api/v1/agents/agent-peter') {
      return route.fulfill({ json: { success: true, data: {
        id: 'agent-peter', config: { archive_customer_sources: options.archive !== false },
      } } })
    }
    if (path === '/api/v1/sessions' && method === 'POST') {
      requests.created++
      expect(request.postDataJSON()).toMatchObject({ customer_knowledge_base_id: 'customer-B' })
      return route.fulfill({ json: { success: true, data: { id: 'new-bound-session' } } })
    }
    if (path === '/api/v1/knowledge-bases/customer-A/knowledge/file' && method === 'POST') {
      requests.archive.push({ path, body: request.postData() || '' })
      if (options.failArchive) return route.fulfill({
        status: options.failArchive === 'http' ? 500 : 200,
        json: { success: false, message: '测试归档故障' },
      })
      return route.fulfill({ json: { success: true, data: { id: 'archived-source' } } })
    }
    if (path === '/api/v1/sessions/customer-session/attachments' && method === 'POST') {
      requests.temporary++
      if (options.failTemporary) return route.fulfill({ status: 500, json: { success: false, message: '测试附件上传故障' } })
      return route.fulfill({ json: { success: true, data: { id: `temp-${requests.temporary}`, status: 'uploaded' } } })
    }
    if (path === '/api/v1/agent-chat/customer-session' && method === 'POST') {
      requests.chat.push(request.postDataJSON())
      return route.fulfill({
        contentType: 'text/event-stream',
        body: 'data: {"response_type":"complete","data":{"is_completed":true}}\n\n',
      })
    }
    return route.fulfill({ json: { success: true, data: [], total: 0 } })
  })
  await page.goto('/e2e/customer-chat-archive-harness.html')
  await expect(page.locator('.visual-chat-view')).toBeVisible()
  await page.waitForFunction(() => typeof (window as any).sendSyntheticCustomerChat === 'function')
  return requests
}

async function send(page: Page, mentionId?: string) {
  await page.evaluate(id => (window as any).sendSyntheticCustomerChat(id), mentionId)
}

test('enabled agent archives original File to the bound customer once, then sends it as a temporary chat attachment', async ({ page }) => {
  const requests = await openChat(page)
  await send(page)
  await expect.poll(() => requests.chat.length).toBe(1)
  expect(requests.archive).toHaveLength(1)
  expect(requests.archive[0].path).toBe('/api/v1/knowledge-bases/customer-A/knowledge/file')
  expect(requests.archive[0].body).toContain('聊天记录.txt')
  expect(requests.archive[0].body).toContain('客户原始聊天：本周末复盘。')
  expect(requests.temporary).toBe(1)
  expect(requests.chat[0]).toMatchObject({
    knowledge_base_ids: ['customer-A'],
    attachment_ids: ['temp-1'],
    agent_id: 'agent-peter',
  })

  // Retry with the exact same File object: the archive layer must skip a
  // duplicate customer source while the new chat turn still gets its attachment.
  await send(page)
  await expect.poll(() => requests.chat.length).toBe(2)
  expect(requests.archive).toHaveLength(1)
  expect(requests.temporary).toBe(2)
  expect(requests.chat[1].attachment_ids).toEqual(['temp-2'])
})

test('disabled agent does not archive, but the chat attachment still sends', async ({ page }) => {
  const requests = await openChat(page, { archive: false })
  await send(page)
  await expect.poll(() => requests.chat.length).toBe(1)
  expect(requests.archive).toHaveLength(0)
  expect(requests.temporary).toBe(1)
  expect(requests.chat[0]).toMatchObject({
    knowledge_base_ids: ['customer-A'],
    attachment_ids: ['temp-1'],
  })
})

for (const failure of ['http', 'body'] as const) {
  test(`archive ${failure} failure remains visible after the reply and does not block the chat attachment`, async ({ page }) => {
    const requests = await openChat(page, { failArchive: failure })
    await send(page)
    await expect.poll(() => requests.chat.length).toBe(1)
    await expect.poll(() => page.evaluate(() => (window as any).customerChatReplying())).toBe(false)
    expect(requests.archive).toHaveLength(1)
    expect(requests.temporary).toBe(1)
    expect(requests.chat[0].attachment_ids).toEqual(['temp-1'])
    await expect(page.locator('.visual-chat-input').getByRole('alert')).toContainText('未归档：聊天记录.txt')
    await expect(page.locator('.visual-chat-input').getByRole('alert')).toContainText('客户资料页重新上传')
  })
}

test('archive and temporary upload failures never claim the file was saved in the chat', async ({ page }) => {
  const requests = await openChat(page, { failArchive: 'http', failTemporary: true })
  await send(page)
  await expect.poll(() => requests.temporary).toBe(1)
  await expect.poll(() => page.evaluate(() => (window as any).customerChatReplying())).toBe(false)
  expect(requests.chat).toHaveLength(0)
  const alert = page.locator('.visual-chat-input').getByRole('alert')
  await expect(alert).toContainText('未归档：聊天记录.txt')
  await expect(alert).not.toContainText('附件仍随本次对话保存')
})

test('@ a different customer creates a bound session and navigates to it', async ({ page }) => {
  const requests = await openChat(page, { unbound: true })
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await send(page, 'customer-B')
  await expect.poll(() => requests.created).toBe(1)
  await expect.poll(() => page.evaluate(() => (window as any).customerChatRoute())).toBe('/platform/chat/new-bound-session')
  expect(requests.archive).toHaveLength(0)
  expect(pageErrors).toEqual([])
})
