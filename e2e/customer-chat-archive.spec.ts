import { expect, test, type Page } from '@playwright/test'

type FixtureOptions = { archive?: boolean; failArchive?: 'http' | 'body'; failTemporary?: boolean; unbound?: boolean; home?: boolean; slow?: boolean; savedCustom?: boolean }

async function openChat(page: Page, options: FixtureOptions = {}) {
  const requests = { archive: [] as Array<{ path: string; body: string }>, temporary: 0, chat: [] as any[], chatPaths: [] as string[], created: 0, failPrepare: false, failCreate: false, failChat: false, failSession: false }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const agent = { id: 'agent-peter', name: '泰勒', is_builtin: false, config: { agent_mode: 'smart-reasoning', knowledge_bases: ['course-KB'], archive_customer_sources: options.archive !== false } }
    if (path === '/api/v1/agents') return route.fulfill({ json: { success: true, data: [agent, { ...agent, id: 'agent-personal', name: '我的智能体' }] } })
    if ((path === '/api/v1/sessions/customer-session' || path === '/api/v1/sessions/new-bound-session') && method === 'GET') {
      if (requests.failSession) return route.fulfill({ status: 503, json: { success: false, message: '测试会话读取失败' } })
      if (options.slow) await new Promise(resolve => setTimeout(resolve, 100))
      return route.fulfill({ json: { success: true, data: {
        id: path.split('/').at(-1), title: '目标会话',
        customer_knowledge_base_id: path.endsWith('/new-bound-session') ? 'customer-B' : options.unbound ? '' : 'customer-A',
      } } })
    }
    if (path === '/api/v1/knowledge-bases') {
      return route.fulfill({ json: { success: true, data: [
        { id: 'course-KB', name: '课程知识库', capabilities: { ready: true } },
        { id: 'customer-A', name: '现有目标', customer_profile: { shared_knowledge_base_ids: [] } },
        { id: 'customer-B', name: '新目标', customer_profile: { shared_knowledge_base_ids: [] } },
      ] } })
    }
    if (path.startsWith('/api/v1/messages/') && path.endsWith('/load')) {
      const sid = path.split('/')[4]
      const saved = requests.chat.flatMap((body, index) => requests.chatPaths[index].endsWith('/'+sid) ? [
        { id: `user-${index}`, role: 'user', content: body.query, is_completed: true, mentioned_items: body.mentioned_items, created_at: '2026-10-18T10:00:00Z' },
        { id: `saved-${index}`, role: 'assistant', content: '已结合课程和目标资料完成分析。', is_completed: true, created_at: '2026-10-18T10:00:01Z' },
      ] : [])
      return route.fulfill({ json: { success: true, data: saved } })
    }
    if (path === '/api/v1/knowledge-bases/course-KB') {
      return route.fulfill({ json: { success: true, data: { id: 'course-KB', name: '课程知识库', capabilities: { ready: true } } } })
    }
    if (path === '/api/v1/knowledge-bases/customer-A' || path === '/api/v1/knowledge-bases/customer-B') {
      if (requests.failPrepare) return route.fulfill({ status: 503, json: { success: false, message: '测试目标读取失败' } })
      const id = path.split('/').at(-1)
      return route.fulfill({ json: { success: true, data: {
        id, name: id === 'customer-A' ? '现有客户' : '新客户',
        customer_profile: { status: '待跟进', shared_knowledge_base_ids: [] },
      } } })
    }
    if (path === '/api/v1/agents/agent-peter') {
      return route.fulfill({ json: { success: true, data: agent } })
    }
    if (path === '/api/v1/sessions' && method === 'POST') {
      requests.created++
      expect(request.postDataJSON()).toMatchObject({ customer_knowledge_base_id: 'customer-B' })
      if (options.slow) await new Promise(resolve => setTimeout(resolve, 100))
      if (requests.failCreate) return route.fulfill({ status: 503, json: { success: false, message: '测试建会话失败' } })
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
    if (/^\/api\/v1\/agent-chat\/[^/]+$/.test(path) && method === 'POST') {
      requests.chat.push(request.postDataJSON())
      requests.chatPaths.push(path)
      return route.fulfill({
        contentType: 'text/event-stream',
        body: requests.failChat ? `data: {"id":"request-${requests.chat.length}","response_type":"error","content":"测试模型暂不可用"}\n\n` : `data: {"id":"request-${requests.chat.length}","response_type":"answer","content":"已结合课程和目标资料完成分析。"}\n\ndata: {"id":"request-${requests.chat.length}","response_type":"complete","data":{"is_completed":true}}\n\n`,
      })
    }
    return route.fulfill({ json: { success: true, data: [], total: 0 } })
  })
  await page.goto('/e2e/customer-chat-archive-harness.html'+(options.home ? '?home=1'+(options.savedCustom ? '&saved-custom=1' : '') : ''))
  await expect(page.locator(options.home ? '.visual-new-chat-view' : '.visual-chat-view')).toBeVisible()
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
    knowledge_base_ids: expect.arrayContaining(['customer-A', 'course-KB']),
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

test('course and target selected together deliver the first message after switching to its bound session', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const requests = await openChat(page, { unbound: true })
  await page.evaluate(() => (window as any).sendCombinedCustomerChat())
  await expect.poll(() => requests.chat.length).toBe(1)
  await expect(page.locator('.visual-chat-message-row.is-user')).toContainText('结合课程分析一下这个目标')
  await expect(page.locator('.visual-chat-message-row.is-assistant')).toContainText('已结合课程和目标资料完成分析。')
  await expect(page.locator('.visual-chat-input')).toBeVisible()
  expect(requests.chat[0].knowledge_base_ids).toEqual(expect.arrayContaining(['course-KB', 'customer-B']))
  expect(errors).toEqual([])
})

test('disabled agent does not archive, but the chat attachment still sends', async ({ page }) => {
  const requests = await openChat(page, { archive: false })
  await send(page)
  await expect.poll(() => requests.chat.length).toBe(1)
  expect(requests.archive).toHaveLength(0)
  expect(requests.temporary).toBe(1)
  expect(requests.chat[0]).toMatchObject({
    knowledge_base_ids: expect.arrayContaining(['customer-A', 'course-KB']),
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
    await expect(page.locator('.visual-chat-input').getByRole('alert')).toContainText('目标资料页重新上传')
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

const combined = [{ type: 'kb', id: 'course-KB', name: '课程知识库' }, { type: 'kb', id: 'customer-B', name: '新目标' }]
const targetA = [{ type: 'kb', id: 'customer-A', name: '现有目标' }]
const sendText = (page: Page, items: any[] = [], text = '继续分析') => page.evaluate(({ items, text }) => (window as any).sendTargetText(items, text), { items, text })

for (const mobile of [false, true]) test(`homepage combined selection and continuation remain visible ${mobile ? 'on mobile' : 'on desktop'}`, async ({ page }) => {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 })
  const requests = await openChat(page, { home: true })
  await sendText(page, combined, '帮我结合课程分析这位目标')
  await expect.poll(() => requests.chat.length).toBe(1)
  await expect(page.locator('.visual-chat-message-row.is-assistant')).toContainText('已结合课程和目标资料完成分析。')
  await expect(page.locator('.visual-chat-input')).toBeInViewport()
  expect(requests.created).toBe(1)
  expect(requests.chat[0].knowledge_base_ids).toEqual(expect.arrayContaining(['course-KB', 'customer-B']))
  await sendText(page, [], '那下一步呢')
  await expect.poll(() => requests.chat.length).toBe(2)
  expect(requests.created).toBe(1)
  expect(requests.chat[1].knowledge_base_ids).toEqual(expect.arrayContaining(['course-KB', 'customer-B']))
  expect(requests.chatPaths).toEqual(['/api/v1/agent-chat/new-bound-session', '/api/v1/agent-chat/new-bound-session'])
})

test('switching targets preserves old history, delivers to the new target, and refresh restores its messages', async ({ page }) => {
  const requests = await openChat(page)
  await sendText(page, targetA, '现有目标的问题')
  await expect.poll(() => requests.chat.length).toBe(1)
  await sendText(page, combined, '新目标的问题')
  await expect.poll(() => requests.chat.length).toBe(2)
  expect(requests.chat[1].knowledge_base_ids).not.toContain('customer-A')
  await page.goto('/e2e/customer-chat-archive-harness.html?session=new-bound-session')
  await expect(page.locator('.visual-chat-message-row.is-user')).toContainText('新目标的问题')
  await expect(page.locator('.visual-chat-message-row.is-assistant')).toContainText('已结合课程和目标资料完成分析。')
  await page.evaluate(() => (window as any).targetChatNavigate('/platform/chat/customer-session'))
  await expect(page.locator('.visual-chat-message-row.is-user')).toContainText('现有目标的问题')
  expect(requests.chat).toHaveLength(2)
})

test('multiple targets reject without sending and preserve the message for correction', async ({ page }) => {
  const requests = await openChat(page)
  await sendText(page, [...combined, ...targetA], '不要丢掉这句话')
  await expect(page.getByText('一次会话只能选择一个目标，请分别开启目标会话')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '随心输入' })).toHaveValue('不要丢掉这句话')
  expect(requests.chat).toHaveLength(0)
  await sendText(page, targetA, '更正后再分析')
  await expect.poll(() => requests.chat.length).toBe(1)
})

for (const home of [false, true]) test(`preparation failure preserves the draft and retry succeeds ${home ? 'from home' : 'in a conversation'}`, async ({ page }) => {
  const requests = await openChat(page, { home, unbound: true })
  requests.failPrepare = true
  await sendText(page, combined, '暂存这条问题')
  await expect(page.getByRole('textbox', { name: '随心输入' })).toHaveValue('暂存这条问题')
  expect(requests.chat).toHaveLength(0)
  requests.failPrepare = false
  await sendText(page, combined, '暂存这条问题')
  await expect.poll(() => requests.chat.length).toBe(1)
  await expect(page.locator('.visual-chat-message-row.is-user')).toContainText('暂存这条问题')
})

test('failed session creation can be retried and repeated sends during a slow handoff create only one session', async ({ page }) => {
  const requests = await openChat(page, { home: true, slow: true })
  requests.failCreate = true
  await sendText(page, combined, '只发一次')
  await expect(page.getByRole('textbox', { name: '随心输入' })).toHaveValue('只发一次')
  requests.failCreate = false
  await page.evaluate(items => Promise.all([(window as any).sendTargetText(items, '只发一次'), (window as any).sendTargetText(items, '只发一次')]), combined)
  await expect.poll(() => requests.chat.length).toBe(1)
  expect(requests.created).toBe(2) // One failed attempt, one successful retry.
  await expect(page.locator('.visual-chat-message-row.is-user')).toHaveCount(1)
})

test('model errors release the composer and another question can be sent', async ({ page }) => {
  const requests = await openChat(page)
  requests.failChat = true
  await sendText(page, targetA)
  await expect.poll(() => page.evaluate(() => (window as any).customerChatReplying())).toBe(false)
  await expect(page.getByText('测试模型暂不可用').first()).toBeVisible()
  requests.failChat = false
  await sendText(page, targetA, '重新问一次')
  await expect.poll(() => requests.chat.length).toBe(2)
  await expect(page.locator('.visual-chat-message-row.is-assistant').last()).toContainText('已结合课程和目标资料完成分析。')
})

test('ordinary course-only conversation still sends without creating a target session', async ({ page }) => {
  const requests = await openChat(page, { unbound: true })
  await sendText(page, [{ type: 'kb', id: 'course-KB', name: '课程知识库' }], '课程问题')
  await expect.poll(() => requests.chat.length).toBe(1)
  expect(requests.created).toBe(0)
  expect(requests.chat[0].knowledge_base_ids).toEqual(['course-KB'])
  await expect(page.locator('.visual-chat-message-row.is-assistant')).toContainText('已结合课程和目标资料完成分析。')
})

test('session metadata failure preserves the handed-off draft and retries without creating another target session', async ({ page }) => {
  const requests = await openChat(page, { home: true })
  requests.failSession = true
  await sendText(page, combined, '会话恢复后再回答')
  await expect(page.getByText('会话加载失败，请重试')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '随心输入' })).toHaveValue('会话恢复后再回答')
  expect(requests.chat).toHaveLength(0)
  requests.failSession = false
  await sendText(page, combined, '会话恢复后再回答')
  await expect.poll(() => requests.chat.length).toBe(1)
  expect(requests.created).toBe(1)
})

test('a fresh conversation defaults to Taylor despite a previous custom pick, and explicit picks remain usable', async ({ page }) => {
  await openChat(page, { home: true, savedCustom: true })
  await expect.poll(() => page.evaluate(() => (window as any).targetAgentSelection())).toBe('agent-peter')
  await page.evaluate(() => (window as any).pickPersonalAgent())
  await expect.poll(() => page.evaluate(() => (window as any).targetAgentSelection())).toBe('agent-personal')
})
