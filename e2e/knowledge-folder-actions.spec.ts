import { expect, test, type Page } from '@playwright/test'

async function installApi(page: Page, draft = false) {
  const kb = { id: 'upload-kb', tenant_id: 42, creator_id: 'upload-user', name: '目录操作验收', type: 'document', capabilities: { ready: true, storage_ready: true } }
  let documents = [
    { id: 'root', folder_path: '' },
    { id: 'direct', folder_path: '待删除' },
    { id: 'nested', folder_path: '待删除/子目录' },
    { id: 'neighbor', folder_path: '待删除2' },
  ].map(item => ({ ...item, knowledge_base_id: kb.id, title: `${item.id}.pdf`, file_name: `${item.id}.pdf`, file_type: 'pdf', type: 'file', parse_status: 'completed', summary_status: 'completed', created_at: '2026-09-12T10:00:00Z',
    ...(draft && item.id === 'direct' ? { title: '目录中的草稿', type: 'manual', parse_status: 'draft', metadata: { content: '草稿原始内容', status: 'draft' } } : {}),
  }))
  const batches: string[][] = []
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const ok = (body: object) => route.fulfill({ json: { success: true, ...body } })
    if (path.endsWith('/entitlements/current')) return ok({ data: { plan: 'max', plan_status: 'complimentary', max_documents_per_kb: 0, storage_bytes: 107374182400, storage_used: 0 } })
    if (path === '/api/v1/knowledge-bases') return ok({ data: [kb], total: 1 })
    if (path === '/api/v1/knowledge-bases/upload-kb') return ok({ data: kb })
    if (path.endsWith('/folders')) return ok({ data: {
      total_document_count: documents.length, root_document_count: 1,
      folders: [
        ...(documents.some(item => item.id === 'direct') ? [{ path: '待删除', name: '待删除', document_count: 1, total_count: 2, children: [{ path: '待删除/子目录', name: '子目录', document_count: 1, total_count: 1, children: [] }] }] : []),
        { path: '待删除2', name: '待删除2', document_count: 1, total_count: 1, children: [] },
      ],
    } })
    if (path === '/api/v1/knowledge/batch-delete') {
      const ids = route.request().postDataJSON().ids as string[]
      batches.push(ids)
      documents = documents.filter(item => !ids.includes(item.id))
      return ok({})
    }
    if (path === '/api/v1/knowledge-bases/upload-kb/knowledge') {
      const folder = url.searchParams.get('folder_path')
      const recursive = url.searchParams.get('folder_recursive') === 'true'
      const data = documents.filter(item => folder === null || item.folder_path === folder || (recursive && item.folder_path.startsWith(`${folder}/`)))
      return ok({ data, total: data.length })
    }
    if (path === '/api/v1/knowledge/direct') return ok({ data: documents.find(item => item.id === 'direct') })
    return ok({ data: [], total: 0 })
  })
  await page.goto('/e2e/knowledge-upload-harness.html')
  await expect(page.getByRole('heading', { name: 'root', exact: true })).toBeVisible()
  return batches
}

for (const view of ['sidebar', 'grid', 'list'] as const) {
  test(`${view} confirms recursive folder deletion and preserves root and adjacent folder`, async ({ page }) => {
    const batches = await installApi(page)
    if (view === 'list') await page.locator('.visual-knowledge-view-toggle button').nth(1).click()
    const target = view === 'sidebar'
      ? page.locator('.visual-folder-row').filter({ has: page.locator('.visual-folder-row__label', { hasText: /^待删除$/ }) })
      : page.locator(view === 'grid' ? '.visual-folder-card[title="待删除"]' : '.visual-document-list__row.is-folder[title="待删除"]')
    const openDelete = async () => {
      await target.getByRole('button', { name: '更多操作' }).click()
      await page.getByRole('button', { name: '删除文件夹', exact: true }).click()
    }
    await openDelete()
    const dialog = page.locator('.t-dialog')
    await expect(dialog).toContainText('子文件夹')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    expect(batches).toEqual([])
    await expect(target).toBeVisible()
    await openDelete()
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
    await expect.poll(() => batches.flat()).toEqual(['direct', 'nested'])
    await expect(dialog).not.toBeVisible()
    await expect(page.locator('.visual-folder-row').filter({ has: page.locator('.visual-folder-row__label', { hasText: /^待删除$/ }) })).toHaveCount(0)
    await expect(page.locator('.visual-folder-row').filter({ hasText: '待删除2' })).toBeVisible()
    await expect(page.locator('.visual-knowledge-scroll')).toContainText('root')
  })
}

test('sidebar expands document-only folders and keeps child folders and documents beneath their parent', async ({ page }) => {
  await installApi(page)
  const sidebar = page.locator('.visual-folder-tree')
  const parent = sidebar.locator('.visual-folder-row[data-folder-path="待删除"]')
  const nested = sidebar.locator('.visual-folder-row[data-folder-path="待删除/子目录"]')
  const leaf = sidebar.locator('.visual-folder-row[data-folder-path="待删除2"]')
  const directDocument = sidebar.locator('.visual-folder-document[data-document-id="direct"]')
  const nestedDocument = sidebar.locator('.visual-folder-document[data-document-id="nested"]')
  const neighborDocument = sidebar.locator('.visual-folder-document[data-document-id="neighbor"]')

  await expect(directDocument).toHaveText('direct.pdf')
  await expect(nested).toBeVisible()
  await expect(leaf.locator('.visual-folder-row__toggle')).toHaveAttribute('aria-expanded', 'false')
  await leaf.locator('.visual-folder-row__toggle').click()
  await expect(neighborDocument).toHaveText('neighbor.pdf')
  await leaf.locator('.visual-folder-row__toggle').click()
  await expect(neighborDocument).toHaveCount(0)

  await nested.locator('.visual-folder-row__toggle').click()
  await expect(nestedDocument).toHaveText('nested.pdf')
  await parent.locator('.visual-folder-row__toggle').click()
  await expect(nested).toHaveCount(0)
  await expect(directDocument).toHaveCount(0)
  await expect(nestedDocument).toHaveCount(0)
  await parent.locator('.visual-folder-row__toggle').click()
  await expect(directDocument).toBeVisible()
  await expect(nestedDocument).toBeVisible()
  await expect(sidebar.locator('.visual-folder-document[data-document-id="root"]')).toBeVisible()
})

test('a sidebar document opens the real document drawer', async ({ page }) => {
  await installApi(page)
  const detailsRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/v1/knowledge/direct')
  await page.locator('.visual-folder-document[data-document-id="direct"]').click()
  await detailsRequest
  await expect(page.locator('.doc-drawer-body')).toBeVisible()
  await expect(page.locator('.doc-drawer-header-title:visible')).toContainText('direct')
})

test('a sidebar draft outside the selected folder opens its existing manual editor', async ({ page }) => {
  await installApi(page, true)
  await expect(page.locator('.visual-knowledge-scroll')).not.toContainText('目录中的草稿')
  await page.locator('.visual-folder-document[data-document-id="direct"]').click()
  const editor = page.locator('.manual-editor-drawer')
  await expect(editor).toBeVisible()
  await expect(editor.locator('input').first()).toHaveValue('目录中的草稿')
  await expect(editor.locator('textarea')).toHaveValue('草稿原始内容')
  await expect(page.locator('.doc-drawer-body')).not.toBeVisible()
})

test('sidebar document loading errors show a retry that recovers the expanded folder', async ({ page }) => {
  await installApi(page)
  let attempts = 0
  await page.route('**/api/v1/knowledge-bases/upload-kb/knowledge?**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('folder_path') !== '待删除2') return route.fallback()
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503, json: { success: false, message: 'Temporary test failure' } })
    return route.fulfill({ json: { success: true, data: [{ id: 'neighbor', title: 'neighbor.pdf', file_name: 'neighbor.pdf', parse_status: 'completed' }], total: 1 } })
  })
  const sidebar = page.locator('.visual-folder-tree')
  await sidebar.locator('.visual-folder-row[data-folder-path="待删除2"] .visual-folder-row__toggle').click()
  const retry = sidebar.getByRole('button', { name: '文档加载失败 · 重试', exact: true })
  await expect(retry).toBeVisible()
  await retry.click()
  await expect(sidebar.locator('.visual-folder-document[data-document-id="neighbor"]')).toHaveText('neighbor.pdf')
  await expect(retry).toHaveCount(0)
  expect(attempts).toBe(2)
})
