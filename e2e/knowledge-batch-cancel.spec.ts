import { expect, test, type Page } from '@playwright/test'

// Exercise the real page, selection bar, confirmation and API client. Only
// the remote API is replaced, including the worker's refreshed document state.
const kb = { id: 'upload-kb', tenant_id: 42, creator_id: 'upload-user', name: '停止解析验收',
  type: 'document', capabilities: { ready: true, storage_ready: true } }

function gate() {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  return { pending, release }
}

async function installApi(page: Page, statuses: string[], options: {
  pending?: Promise<void>
  failureStatus?: number
  failingId?: string
} = {}) {
  const documents = statuses.map((status, index) => ({
    id: `cancel-doc-${index + 1}`, knowledge_base_id: kb.id,
    title: `停止解析文件-${index + 1}.pdf`, file_name: `停止解析文件-${index + 1}.pdf`,
    type: 'file', file_type: 'pdf', folder_path: '', parse_status: status, summary_status: 'completed',
    created_at: '2026-09-11T10:00:00Z', updated_at: '2026-09-11T10:00:00Z',
  }))
  const calls: string[] = []
  let listRequests = 0
  let fail = options.failureStatus !== undefined
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const ok = (body: object) => route.fulfill({ json: { success: true, ...body } })
    if (path === '/api/v1/entitlements/current') return ok({ data: {
      plan: 'max', plan_status: 'complimentary', max_documents_per_kb: 0,
      storage_bytes: 107374182400, storage_used: 0,
    } })
    if (path === '/api/v1/knowledge-bases') return ok({ data: [kb], total: 1 })
    if (path === '/api/v1/knowledge-bases/upload-kb') return ok({ data: kb })
    if (path.endsWith('/parser-engines')) return ok({ data: [{ Name: 'builtin', Available: true, FileTypes: ['pdf'] }] })
    if (path.endsWith('/folders')) return ok({ data: {
      total_document_count: documents.length, root_document_count: documents.length, folders: [],
    } })
    if (path === '/api/v1/knowledge-bases/upload-kb/knowledge') {
      listRequests++
      return ok({ data: documents, total: documents.length })
    }
    if (path.endsWith('/knowledge/batch')) return ok({ data: documents })
    const cancel = path.match(/^\/api\/v1\/knowledge\/(cancel-doc-\d+)\/cancel-parse$/)
    if (cancel) {
      expect(route.request().method()).toBe('POST')
      const id = cancel[1]
      calls.push(id)
      await options.pending
      if (fail && id === options.failingId) return route.fulfill({
        status: options.failureStatus,
        json: { success: false, message: '验收：停止解析失败，请重试' },
      })
      const document = documents.find(doc => doc.id === id)!
      document.parse_status = 'cancelled'
      return ok({ data: document })
    }
    return ok({ data: [], total: 0 })
  })
  return { calls, get listRequests() { return listRequests }, allowRetry() { fail = false } }
}

const batch = (page: Page) => page.locator('.visual-document-batch')
const row = (page: Page, number: number) => page.locator(`.visual-document-list__row[data-select-id="cancel-doc-${number}"]`)

async function selectAll(page: Page, count: number) {
  await page.goto('/e2e/knowledge-upload-harness.html')
  await page.locator('.visual-knowledge-view-toggle button').nth(1).click()
  await expect(page.locator('.visual-document-list__row[data-select-id]')).toHaveCount(count)
  await page.locator('.visual-document-list__header .t-checkbox__input').click()
  await expect(batch(page)).toContainText(`已选 ${count} 项`)
}

async function confirmStop(page: Page, count: number) {
  const action = batch(page).getByRole('button', { name: '停止解析', exact: true })
  await expect(action).toBeVisible()
  await action.click()
  const confirmation = `停止选中的 ${count} 个解析任务？已完成的文档不受影响。`
  const popup = page.locator('.t-popconfirm').filter({ hasText: confirmation })
  await expect(popup).toBeVisible()
  await popup.getByRole('button', { name: '停止解析', exact: true }).click()
  await expect(page.locator('.t-popconfirm:visible')).toHaveCount(0)
}

test('mixed statuses cancel only pending, processing and finalizing, lock actions and refresh successful rows', async ({ page }) => {
  const request = gate()
  const api = await installApi(page, ['pending', 'processing', 'finalizing', 'completed', 'failed'], { pending: request.pending })
  await selectAll(page, 5)
  const initialLists = api.listRequests
  try {
    await confirmStop(page, 3)
    await expect.poll(() => api.calls.length).toBeGreaterThan(0)
    for (const name of ['停止解析', '批量删除', '重建知识', '移动到目录']) {
      await expect(batch(page).getByRole('button', { name, exact: true })).toBeDisabled()
    }
    await expect(row(page, 1).getByRole('checkbox')).toBeChecked()
  } finally { request.release() }
  await expect(page.getByText('已提交停止 3 个文档的解析', { exact: true })).toBeVisible()
  expect([...api.calls].sort()).toEqual(['cancel-doc-1', 'cancel-doc-2', 'cancel-doc-3'])
  await expect.poll(() => api.listRequests).toBeGreaterThan(initialLists)
  for (const number of [1, 2, 3]) {
    await expect(row(page, number).getByRole('checkbox')).not.toBeChecked()
  }
  for (const number of [4, 5]) {
    await expect(row(page, number).getByRole('checkbox')).toBeChecked()
  }
  await expect(batch(page).getByRole('button', { name: '停止解析', exact: true })).toBeDisabled()
})

for (const failureStatus of [200, 503]) test(`partial cancellation failure (${failureStatus}) keeps failed selections and retries only those tasks`, async ({ page }) => {
  const api = await installApi(page, ['pending', 'processing', 'completed'], {
    failureStatus, failingId: 'cancel-doc-2',
  })
  await selectAll(page, 3)
  await confirmStop(page, 2)
  await expect(page.getByText('已提交停止 1 个，1 个停止失败，可重试', { exact: true })).toBeVisible()
  expect([...api.calls].sort()).toEqual(['cancel-doc-1', 'cancel-doc-2'])
  await expect(row(page, 1).getByRole('checkbox')).not.toBeChecked()
  await expect(row(page, 2).getByRole('checkbox')).toBeChecked()
  await expect(row(page, 3).getByRole('checkbox')).toBeChecked()
  await expect(batch(page).getByRole('button', { name: '停止解析', exact: true })).toBeEnabled()
  api.allowRetry()
  const listsBeforeRetry = api.listRequests
  await confirmStop(page, 1)
  await expect(page.getByText('已提交停止 1 个文档的解析', { exact: true })).toBeVisible()
  expect(api.calls.filter(id => id === 'cancel-doc-1')).toHaveLength(1)
  expect(api.calls.filter(id => id === 'cancel-doc-2')).toHaveLength(2)
  expect(api.calls).not.toContain('cancel-doc-3')
  await expect(row(page, 2).getByRole('checkbox')).not.toBeChecked()
  await expect.poll(() => api.listRequests).toBeGreaterThan(listsBeforeRetry)
})

test('stop parsing is disabled when selected documents have no active parse tasks', async ({ page }) => {
  const api = await installApi(page, ['completed', 'failed'])
  await selectAll(page, 2)
  await expect(batch(page).getByRole('button', { name: '停止解析', exact: true })).toBeDisabled()
  expect(api.calls).toEqual([])
})
