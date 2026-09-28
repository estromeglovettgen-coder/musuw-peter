import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// Exercise the actual knowledge page, hook, drawer and preview. Only the
// remote API is replaced; gates make each otherwise brief loading gap observable.
function gate() {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  return { pending, release }
}

const kb = { id: 'upload-kb', tenant_id: 42, creator_id: 'upload-user', name: '文档反馈验收',
  type: 'document', capabilities: { ready: true, storage_ready: true } }
const documents = Array.from({ length: 20 }, (_, index) => ({
  id: `document-${index + 1}`, knowledge_base_id: kb.id, title: `已完成文件-${index + 1}.pdf`,
  file_name: `已完成文件-${index + 1}.pdf`, type: 'file', file_type: 'pdf', folder_path: '',
  parse_status: 'completed', summary_status: 'completed',
  created_at: '2026-09-11T10:00:00Z', updated_at: '2026-09-11T10:00:00Z',
}))

async function installApi(page: Page) {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const ok = (body: unknown) => route.fulfill({ json: { success: true, ...body as object } })
    if (path === '/api/v1/entitlements/current') return ok({ data: {
      plan: 'max', plan_status: 'complimentary', max_documents_per_kb: 0, storage_bytes: 107374182400, storage_used: 0,
    } })
    if (path === '/api/v1/knowledge-bases') return ok({ data: [kb], total: 1 })
    if (path === '/api/v1/knowledge-bases/upload-kb') return ok({ data: kb })
    if (path.endsWith('/parser-engines')) return ok({ data: [{ Name: 'builtin', Available: true, FileTypes: ['pdf'] }] })
    if (path.endsWith('/folders')) return ok({ data: { total_document_count: 20, root_document_count: 20, folders: [] } })
    if (path === '/api/v1/knowledge-bases/upload-kb/knowledge') {
      const keyword = url.searchParams.get('keyword') || ''
      const fileType = url.searchParams.get('file_type')
      const status = url.searchParams.get('parse_status')
      const data = documents.filter(doc => doc.title.includes(keyword) && (!fileType || doc.file_type === fileType) && (!status || doc.parse_status === status))
      return ok({ data, total: data.length })
    }
    if (path.endsWith('/preview')) return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' })
    const doc = documents.find(doc => path === `/api/v1/knowledge/${doc.id}`)
    if (doc) return ok({ data: doc })
    return ok({ data: [], total: 0 })
  })
}

const drawer = (page: Page) => page.locator('.doc-drawer-body')
async function openDocument(page: Page, number = 1) {
  await page.getByRole('heading', { name: `已完成文件-${number}`, exact: true }).click()
  await expect(drawer(page)).toBeVisible()
}

async function closeDocument(page: Page) {
  await page.locator('.t-drawer:visible .t-drawer__close-btn').click()
  await expect(drawer(page)).not.toBeVisible()
}

test.beforeEach(async ({ page }) => { await installApi(page) })

test('document summary renders safe Markdown while retaining collapse and raw-text editing', async ({ page }, info) => {
  const description = '**一、Agent Skills 的基本概念与热度**\n\n' +
    '这是摘要正文。\n'.repeat(12) + '\n**最后一段**\n\n' +
    '<img src="x" onerror="window.summaryXss = true"><script>window.summaryXss = true</script>'
  await page.route('**/api/v1/knowledge/document-1', route => route.fulfill({ json: {
    success: true, data: { ...documents[0], type: 'url', source: 'https://example.com/article', description },
  } }))
  await page.goto('/e2e/knowledge-upload-harness.html')
  await openDocument(page)
  const summary = drawer(page).locator('.summary_content')
  await expect(summary.locator('strong').first()).toHaveText('一、Agent Skills 的基本概念与热度')
  await expect(summary.locator('strong').first()).toHaveCSS('font-weight', /[6-9]00/)
  await expect(summary).not.toContainText('**')
  await expect(summary.locator('script, [onerror]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).summaryXss)).toBeUndefined()
  await expect(summary).toHaveClass(/summary_collapsed/)
  await summary.click()
  await expect(summary).not.toHaveClass(/summary_collapsed/)
  await summary.locator('strong').last().scrollIntoViewIfNeeded()
  await expect(summary.locator('strong').last()).toBeInViewport()
  await page.screenshot({ path: info.outputPath('summary-markdown.png') })
  await summary.click()
  await expect(summary).toHaveClass(/summary_collapsed/)
  await drawer(page).locator('.summary-section .icon-action-btn').first().click()
  await expect(drawer(page).locator('.summary_editor textarea')).toHaveValue(description)
  await drawer(page).getByRole('button', { name: '取消', exact: true }).click()
  await expect(summary.locator('strong').first()).toBeVisible()
})

test('opening an already completed PDF shows loading before details and throughout the preview download', async ({ page }, info) => {
  const details = gate()
  const preview = gate()
  await page.route('**/api/v1/knowledge/document-1', async route => { await details.pending; await route.fallback() })
  await page.route('**/api/v1/knowledge/document-1/preview', async route => { await preview.pending; await route.fallback() })
  try {
    await page.goto('/e2e/knowledge-upload-harness.html')
    await openDocument(page)
    await expect(drawer(page).getByRole('status')).toContainText('加载中')
    await expect(drawer(page)).not.toContainText('暂无数据')
    await expect(drawer(page).getByRole('status')).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: info.outputPath('immediate-document-feedback.png') })
    details.release()
    await expect(drawer(page).locator('.preview-loading')).toBeVisible()
  } finally {
    details.release()
    preview.release()
  }
  await expect(drawer(page).locator('.pdf-iframe')).toHaveAttribute('src', /^blob:/)
  await expect(drawer(page).locator('.preview-loading')).toHaveCount(0)
})

test('failed document details show an error and retry in the open drawer', async ({ page }) => {
  let fail = true
  await page.route('**/api/v1/knowledge/document-1', async route => {
    if (fail) return route.fulfill({ status: 503, json: { success: false } })
    return route.fallback()
  })
  await page.goto('/e2e/knowledge-upload-harness.html')
  await openDocument(page)
  await expect(drawer(page).getByRole('alert')).toContainText('文档加载失败')
  await expect(drawer(page)).not.toContainText('暂无数据')
  fail = false
  await drawer(page).getByRole('button', { name: '重试', exact: true }).click()
  await expect(drawer(page).locator('.pdf-iframe')).toHaveAttribute('src', /^blob:/)
  await expect(drawer(page).getByRole('alert')).toHaveCount(0)
})

test('a late document response cannot replace a newer document', async ({ page }) => {
  const older = gate()
  await page.route('**/api/v1/knowledge/document-1', async route => { await older.pending; await route.fallback() })
  try {
    await page.goto('/e2e/knowledge-upload-harness.html')
    await openDocument(page)
    await closeDocument(page)
    await openDocument(page, 2)
    await expect(drawer(page).locator('.pdf-iframe')).toHaveAttribute('src', /^blob:/)
    const response = page.waitForResponse('**/api/v1/knowledge/document-1')
    older.release()
    await (await response).finished()
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(page.locator('.doc-drawer-header-title:visible')).toHaveText('已完成文件-2')
  } finally { older.release() }
})

test('search keeps the current documents visible with loading feedback, then applies results and clear', async ({ page }) => {
  await page.goto('/e2e/knowledge-upload-harness.html')
  const cards = page.getByRole('heading', { name: /^已完成文件-/ })
  await expect(cards).toHaveCount(20)
  const search = gate()
  await page.route('**/api/v1/knowledge-bases/upload-kb/knowledge?**', async route => { await search.pending; await route.fallback() })
  try {
    await page.getByRole('textbox', { name: '搜索文档名称...' }).fill('已完成文件-20')
    await expect(page.locator('.visual-knowledge-scroll')).toHaveAttribute('aria-busy', 'true')
    await expect(cards).toHaveCount(20)
  } finally { search.release() }
  await expect(cards).toHaveCount(1)
  await expect(cards).toHaveText('已完成文件-20')
  await expect(page.locator('.visual-knowledge-scroll')).toHaveAttribute('aria-busy', 'false')
  await page.getByRole('textbox', { name: '搜索文档名称...' }).fill('')
  await expect(cards).toHaveCount(20)
})

for (const status of [503, 200]) test(`failed filtering (${status}) is visible and can be retried without clearing the selected filter`, async ({ page }) => {
  await page.goto('/e2e/knowledge-upload-harness.html')
  await expect(page.getByRole('heading', { name: /^已完成文件-/ })).toHaveCount(20)
  let fail = true
  await page.route('**/api/v1/knowledge-bases/upload-kb/knowledge?**', async route => {
    if (fail) return route.fulfill({ status, json: { success: false, data: [], total: 0 } })
    return route.fallback()
  })
  await page.getByRole('button', { name: '全部类型', exact: true }).click()
  await page.getByRole('option', { name: 'DOCX', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('文档列表加载失败')
  fail = false
  await page.getByRole('alert').getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: /^已完成文件-/ })).toHaveCount(0)
  await expect(page.locator('.visual-knowledge-empty')).toContainText('没有匹配的文档')
})

test('the first chunk load reports pending and failure before offering retry', async ({ page }) => {
  const chunks = gate()
  let fail = true
  await page.route('**/api/v1/chunks/document-1?**', async route => {
    await chunks.pending
    if (fail) return route.fulfill({ status: 503, json: { success: false } })
    return route.fulfill({ json: { success: true, data: [{ id: 'chunk-1', content: '读取成功的正文', is_enabled: true }], total: 1 } })
  })
  try {
    await page.goto('/e2e/knowledge-upload-harness.html')
    await openDocument(page)
    await drawer(page).getByRole('button', { name: '查看分块', exact: true }).click()
    await expect(drawer(page).locator('.chunk-page-loading')).toContainText('加载中')
    await expect(drawer(page)).not.toContainText('暂无数据')
  } finally { chunks.release() }
  await expect(drawer(page).getByRole('alert')).toContainText('分块加载失败')
  fail = false
  await drawer(page).getByRole('alert').getByRole('button', { name: '重试', exact: true }).click()
  await expect(drawer(page).locator('.md-content')).toContainText('读取成功的正文')
})

test('preview feedback stays visible while the downloaded document is being rendered', async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = Blob.prototype.text
    Blob.prototype.text = async function () {
      ;(window as any).previewTextReadStarted = true
      await new Promise<void>(resolve => { (window as any).finishPreviewTextRead = resolve })
      return originalText.call(this)
    }
  })
  await page.route('**/api/v1/knowledge/document-1', route => route.fulfill({ json: {
    success: true, data: { ...documents[0], file_type: 'md', title: '已完成文件-1.md' },
  } }))
  await page.route('**/api/v1/knowledge/document-1/preview', route => route.fulfill({
    contentType: 'text/markdown', body: '# 渲染完成的文档',
  }))
  await page.goto('/e2e/knowledge-upload-harness.html')
  await openDocument(page)
  await expect.poll(() => page.evaluate(() => (window as any).previewTextReadStarted)).toBe(true)
  try {
    await expect(drawer(page).locator('.preview-loading')).toBeVisible()
  } finally { await page.evaluate(() => (window as any).finishPreviewTextRead()) }
  await expect(drawer(page).locator('.preview-markdown')).toContainText('渲染完成的文档')
  await expect(drawer(page).locator('.preview-loading')).toHaveCount(0)
})

test('DOCX can render into its mounted container while loading feedback covers it', async ({ page }) => {
  await page.route('**/api/v1/knowledge/document-1', route => route.fulfill({ json: {
    success: true, data: { ...documents[0], file_type: 'docx', title: '已完成文件-1.docx' },
  } }))
  await page.route('**/api/v1/knowledge/document-1/preview', route => route.fulfill({
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    path: fileURLToPath(new URL('../weknora/docreader/tests/fixtures/issue_2634_vertical_merge.docx', import.meta.url)),
  }))
  await page.goto('/e2e/knowledge-upload-harness.html')
  await openDocument(page)
  await expect(drawer(page).locator('.docx-container')).toContainText('遗传病检测项目表')
  await expect(drawer(page).locator('.docx-container')).toBeVisible()
  await expect(drawer(page).locator('.preview-loading')).toHaveCount(0)
})

test('a successful empty list accepts a null slice without showing an error', async ({ page }) => {
  await page.route('**/api/v1/knowledge-bases/upload-kb/knowledge?**', route => route.fulfill({
    json: { success: true, data: null, total: 0 },
  }))
  await page.goto('/e2e/knowledge-upload-harness.html')
  await expect(page.locator('.visual-knowledge-empty')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})


// Reuse the real artifact drawer and its supported previewIndex switching.
const oldArtifact = {
  index: 0,
  file_name: '旧图表.md',
  file_type: 'md',
  file_size: 12,
  source_path: 'fixture/old.md',
  mod_time: '2026-09-11T10:00:00Z',
  created_at: '2026-09-11T10:00:00Z',
}
const newArtifact = { ...oldArtifact, index: 1, file_name: '新图表.md', source_path: 'fixture/new.md', created_at: '2026-09-11T10:01:00Z' }

async function installArtifactHarness(page: Page) {
  await page.route('**/e2e/knowledge-upload-harness.ts*', async route => {
    const response = await route.fetch()
    const compiled = await response.text()
    const importBlock = compiled
      .slice(0, compiled.indexOf('installTDesignIconOfflineGuard();'))
      .replace('import { createApp, h }', 'import { createApp, h, ref }')
      .replace('import KnowledgeBase from "/src/views/knowledge/KnowledgeBase.vue"', 'import ChatArtifactsDrawer from "/src/views/chat/components/ChatArtifactsDrawer.vue"')
    const source = `${importBlock}
installTDesignIconOfflineGuard()
const visible = ref(false)
const previewIndex = ref(0)
const artifacts = ${JSON.stringify([oldArtifact, newArtifact])}
const app = createApp({
  setup() {
    return () => h('div', [
      h('button', { id: 'open', style: { position: 'fixed', top: '8px', left: '8px', zIndex: 5000 }, onClick: () => { visible.value = true } }, '打开'),
      h('button', { id: 'swap', style: { position: 'fixed', top: '8px', left: '80px', zIndex: 5000 }, onClick: () => { previewIndex.value = 1 } }, '切换'),
      h(ChatArtifactsDrawer, {
        visible: visible.value,
        'onUpdate:visible': (value) => { visible.value = value },
        sessionId: 'race-session',
        messageId: 'race-message',
        artifacts,
        previewIndex: previewIndex.value,
      }),
    ])
  },
})
i18n.global.locale.value = 'zh-CN'
app.use(i18n).use(TDesign).mount('#app')
`
    await route.fulfill({ response, body: source })
  })
}


for (const oldStatus of [200, 503]) test(`a late artifact response (${oldStatus}) cannot replace the current preview`, async ({ page }) => {
  const older = gate()
  await installArtifactHarness(page)
  await page.route('**/artifacts/0/download', async route => {
    await older.pending
    return route.fulfill({ status: oldStatus, contentType: 'text/markdown', body: '# 旧图表内容' })
  })
  await page.route('**/artifacts/1/download', route => route.fulfill({ contentType: 'text/markdown', body: '# 新图表内容' }))
  try {
    await page.goto('/e2e/knowledge-upload-harness.html')
    await page.locator('#open').click()
    await expect(page.locator('.artifact-preview-body .preview-loading')).toBeVisible()
    await page.locator('#swap').click()
    await expect(page.locator('.artifact-preview-body .preview-markdown')).toContainText('新图表内容')
    const response = page.waitForResponse('**/artifacts/0/download')
    older.release()
    await (await response).finished()
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect(page.locator('.artifact-preview-body .preview-markdown')).toContainText('新图表内容')
    await expect(page.locator('.artifact-preview-body .preview-error')).toHaveCount(0)
  } finally { older.release() }
})

test('an old artifact renderer cannot overwrite the newly selected preview', async ({ page }) => {
  await page.addInitScript(() => {
    const originalText = Blob.prototype.text
    let firstRead = true
    Blob.prototype.text = async function () {
      if (firstRead) {
        firstRead = false
        await new Promise<void>(resolve => { (window as any).finishOldArtifactRender = resolve })
      }
      return originalText.call(this)
    }
  })
  await installArtifactHarness(page)
  await page.route('**/artifacts/0/download', route => route.fulfill({ contentType: 'text/markdown', body: '# 旧图表内容' }))
  await page.route('**/artifacts/1/download', route => route.fulfill({ contentType: 'text/markdown', body: '# 新图表内容' }))
  await page.goto('/e2e/knowledge-upload-harness.html')
  await page.locator('#open').click()
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishOldArtifactRender)).toBe('function')
  try {
    await page.locator('#swap').click()
    await expect(page.locator('.artifact-preview-body .preview-markdown')).toContainText('新图表内容')
  } finally { await page.evaluate(() => (window as any).finishOldArtifactRender()) }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.locator('.artifact-preview-body .preview-markdown')).toContainText('新图表内容')
})
