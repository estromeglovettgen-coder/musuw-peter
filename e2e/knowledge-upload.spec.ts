import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// The actual page, picker, API client and controller run in the browser.
// Only the remote API is replaced; file requests can remain pending exactly
// as they did when the production batches stopped at the 32 MB document.
async function installUploadApi(page: Page, options: {
  failAt?: number
  holdAfter?: number
  rootFiles?: boolean
  holdInitialFolders?: boolean
  initialDocumentCount?: number
  holdUploadListRefreshes?: boolean
} = {}) {
  const kb = { id: 'upload-kb', tenant_id: 42, creator_id: 'upload-user', name: '上传验收',
    type: 'document', capabilities: { ready: true, storage_ready: true } }
  const uploaded: any[] = []
  const existing = Array.from({ length: options.initialDocumentCount || 0 }, (_, index) => ({
    id: `existing-${index + 1}`, knowledge_base_id: kb.id, file_name: `已有文档-${index + 1}.md`,
    folder_path: '', file_type: 'md', parse_status: 'pending', summary_status: 'completed',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }))
  const listRequests: number[] = []
  const heldListRefreshes: Array<() => void> = []
  let attempts = 0
  let release!: () => void
  const pendingUploads = new Promise<void>(resolve => { release = resolve })
  let folderRequests = 0
  let releaseInitialFolders!: () => void
  const pendingInitialFolders = new Promise<void>(resolve => { releaseInitialFolders = resolve })
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const ok = (body: any) => route.fulfill({ json: { success: true, ...body } })
    if (path === '/api/v1/entitlements/current') return ok({ data: {
      plan: 'max', plan_status: 'complimentary', max_documents_per_kb: 0, storage_bytes: 107374182400,
      storage_used: 0, video_upload: true,
    } })
    if (path === '/api/v1/knowledge-bases') return ok({ data: [kb], total: 1 })
    if (path === '/api/v1/knowledge-bases/upload-kb') return ok({ data: kb })
    if (path.endsWith('/parser-engines')) return ok({ data: [{ Name: 'builtin', Available: true, FileTypes: ['md', 'pdf'] }] })
    if (path.endsWith('/knowledge/file')) {
      const index = ++attempts
      if (options.holdAfter !== undefined && index > options.holdAfter) await pendingUploads
      if (index === options.failAt) return ok({ success: false, message: '验收：文件保存失败' })
      const doc = { id: `doc-${index}`, knowledge_base_id: kb.id, file_name: `文档-${index}.md`,
        folder_path: options.rootFiles ? '' : 'upload-folder', file_type: 'md', parse_status: 'pending',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      uploaded.push(doc)
      return ok({ data: doc })
    }
    if (path.endsWith('/folders')) {
      const data = { total_document_count: uploaded.length + existing.length,
        root_document_count: options.rootFiles ? uploaded.length + existing.length : existing.length, folders: uploaded.length && !options.rootFiles
          ? [{ path: 'upload-folder', name: 'upload-folder', document_count: uploaded.length,
            total_document_count: uploaded.length, children: [] }] : [] }
      if (++folderRequests === 1 && options.holdInitialFolders) await pendingInitialFolders
      return ok({ data })
    }
    if (path.endsWith('/knowledge')) {
      const docs = options.rootFiles ? [...uploaded, ...existing]
        : url.searchParams.get('folder_path') === 'upload-folder' ? [...uploaded] : [...existing]
      const pageNumber = Number(url.searchParams.get('page')) || 1
      const pageSize = Number(url.searchParams.get('page_size')) || 35
      listRequests.push(pageNumber)
      const data = docs.slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
      if (pageNumber === 1 && uploaded.length > 0 && options.holdUploadListRefreshes) {
        await new Promise<void>(resolve => heldListRefreshes.push(resolve))
      }
      return ok({ data, total: docs.length })
    }
    if (path.endsWith('/knowledge/batch')) return ok({ data: [
      ...uploaded,
      ...existing.map(doc => uploaded.length ? { ...doc, parse_status: 'completed' } : doc),
    ] })
    return ok({ data: [], total: 0 })
  })
  return { uploaded, release, releaseInitialFolders, listRequests, heldListRefreshes, get attempts() { return attempts } }
}

async function openPage(page: Page) {
  await page.goto('/e2e/knowledge-upload-harness.html')
  await expect(page.locator('input[webkitdirectory]')).toHaveCount(1)
  await expect(page.locator('input[type=file]').first()).toHaveAttribute('accept', /\.md/)
}

async function selectFolder(page: Page, info: TestInfo, count: number) {
  const dir = info.outputPath('upload-folder')
  await mkdir(dir, { recursive: true })
  await Promise.all(Array.from({ length: count }, (_, i) => writeFile(join(dir, `文档-${i + 1}.md`), `# Upload ${i + 1}\nUnique content ${i + 1}`)))
  await page.locator('input[webkitdirectory]').setInputFiles(dir)
}

test('22 folder files remain visible and already submitted documents appear before the batch finishes', async ({ page }, info) => {
  const api = await installUploadApi(page, { holdAfter: 2 })
  await openPage(page)
  await selectFolder(page, info, 22)
  await expect.poll(() => api.attempts).toBe(3)
  const progress = page.getByRole('region', { name: '上传进度' })
  try {
    await expect(progress).toBeVisible()
    await expect(progress).toContainText('共 22 个 · 已提交 2 个 · 失败 0 个 · 剩余 20 个')
    await expect(page.getByText('upload-folder', { exact: true }).first()).toBeVisible()
    await page.getByText('upload-folder', { exact: true }).last().dblclick()
    await expect(page.getByRole('heading', { name: '文档-1', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '文档-2', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath('upload-in-progress.png') })
  } finally {
    api.release()
  }
  await expect.poll(() => api.uploaded.length).toBe(22)
  await expect(progress).toContainText('共 22 个 · 已提交 22 个 · 失败 0 个 · 剩余 0 个')
  await expect(page.getByRole('heading', { name: '文档-22', exact: true })).toBeVisible()
})

test('a failed file remains visible with its reason and does not prevent later uploads', async ({ page }, info) => {
  const api = await installUploadApi(page, { failAt: 2 })
  await openPage(page)
  await selectFolder(page, info, 3)
  await expect.poll(() => api.attempts).toBe(3)
  const progress = page.getByRole('region', { name: '上传进度' })
  await expect(progress).toContainText('共 3 个 · 已提交 2 个 · 失败 1 个 · 剩余 0 个')
  await expect(progress.getByText('验收：文件保存失败', { exact: true })).toBeVisible()
  await expect(progress.locator('li')).toHaveCount(3)
})

test('a late folder response cannot erase an uploaded folder or move the user back to root', async ({ page }, info) => {
  const api = await installUploadApi(page, { holdInitialFolders: true })
  await openPage(page)
  await selectFolder(page, info, 1)
  await expect(page.getByRole('region', { name: '上传进度' })).toContainText('已提交 1 个')
  await page.getByText('upload-folder', { exact: true }).last().dblclick()
  await expect(page.getByRole('heading', { name: '文档-1', exact: true })).toBeVisible()
  const lateResponse = page.waitForResponse(response => response.url().endsWith('/folders'))
  api.releaseInitialFolders()
  await (await lateResponse).finished()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.getByText('upload-folder', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: '文档-1', exact: true })).toBeVisible()
})

test('upload refresh keeps existing documents visible and finishes the first page before loading the next', async ({ page }) => {
  const api = await installUploadApi(page, {
    rootFiles: true, initialDocumentCount: 70, holdUploadListRefreshes: true,
  })
  await openPage(page)
  const existingDocuments = page.getByRole('heading', { name: /^已有文档-/ })
  await expect(existingDocuments).toHaveCount(35)
  const scroll = page.locator('.visual-knowledge-scroll')
  const scrollToBottom = () => scroll.evaluate(element => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll'))
  })
  const expectPaginationToWait = async () => {
    await expect(page.locator('.visual-knowledge-toolbar').getByRole('status')).toContainText('加载中')
    const prematureRequest = page.waitForRequest(request => {
      const url = new URL(request.url())
      return url.pathname.endsWith('/knowledge') && Number(url.searchParams.get('page')) > 1
    }, { timeout: 200 }).then(() => true, () => false)
    await scrollToBottom()
    expect(await prematureRequest, 'load-more must wait for the current first-page refresh').toBe(false)
  }
  const finishRefresh = async (index: number) => {
    const response = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/knowledge') && url.searchParams.get('page') === '1'
    })
    api.heldListRefreshes[index]()
    await (await response).finished()
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  }

  try {
    await page.locator('input[type=file]').first().setInputFiles([1, 2].map(index => ({
      name: `文档-${index}.md`, mimeType: 'text/markdown', buffer: Buffer.from(`# Upload ${index}`),
    })))
    await expect.poll(() => api.heldListRefreshes.length).toBe(2)
    await expect(existingDocuments).toHaveCount(35)
    await expect(page.getByRole('heading', { name: '已有文档-1', exact: true })).toBeVisible()
    await expect(page.locator('.visual-knowledge-skeleton-grid')).toHaveCount(0)
    await expectPaginationToWait()

    // Finishing an older refresh must not unlock the newer one.
    await finishRefresh(0)
    await expectPaginationToWait()

    // A real parse-status update also changes cardList while the refresh is
    // pending; that visual update must not reopen pagination either.
    const statusResponse = await page.waitForResponse(response => response.url().includes('/knowledge/batch'))
    await statusResponse.finished()
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expectPaginationToWait()
    expect(api.listRequests.filter(pageNumber => pageNumber > 1)).toEqual([])

    await finishRefresh(1)
    await expect(page.getByRole('heading', { name: '文档-2', exact: true })).toBeVisible()
    await expect(existingDocuments).toHaveCount(33)
    await scrollToBottom()
    await expect(page.getByRole('heading', { name: '已有文档-34', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '已有文档-68', exact: true })).toBeVisible()
    await expect(existingDocuments).toHaveCount(68)
    expect(api.listRequests.filter(pageNumber => pageNumber > 1)).toEqual([2])
  } finally {
    api.heldListRefreshes.forEach(release => release())
  }
})

test('a single upload immediately shows status and protects the pending queue from page reload', async ({ page }) => {
  const api = await installUploadApi(page, { holdAfter: 0, rootFiles: true })
  await openPage(page)
  // A real user gesture enables Chromium's beforeunload protection.
  await page.getByRole('textbox', { name: '搜索文档名称...' }).click()
  await page.locator('input[type=file]').first().setInputFiles({
    name: '文档-1.md', mimeType: 'text/markdown', buffer: Buffer.from('# One file'),
  })
  const progress = page.getByRole('region', { name: '上传进度' })
  await expect(progress).toContainText('共 1 个 · 已提交 0 个 · 失败 0 个 · 剩余 1 个')
  const dialog = page.waitForEvent('dialog')
  await page.evaluate(() => { window.setTimeout(() => window.location.reload(), 0) })
  const warning = await dialog
  expect(warning.type()).toBe('beforeunload')
  await warning.dismiss()
  await expect(progress).toBeVisible()
  api.release()
  await expect(progress).toContainText('已提交 1 个')
  await expect(page.getByRole('heading', { name: '文档-1', exact: true })).toBeVisible()
  let warnedAfterCompletion = false
  page.on('dialog', async d => { warnedAfterCompletion = true; await d.accept() })
  await page.reload()
  expect(warnedAfterCompletion).toBe(false)
})
