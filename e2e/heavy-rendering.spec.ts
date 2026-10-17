import { expect, test, type Page } from '@playwright/test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('../weknora/frontend/node_modules/xlsx')
const kb = { id: 'upload-kb', tenant_id: 42, creator_id: 'upload-user', name: '按需加载验收',
  type: 'document', capabilities: { ready: true, storage_ready: true } }
const document = { id: 'document-1', knowledge_base_id: kb.id, title: '渲染验收.md', file_name: '渲染验收.md',
  type: 'file', file_type: 'md', folder_path: '', parse_status: 'completed', summary_status: 'completed',
  created_at: '2026-09-11T10:00:00Z', updated_at: '2026-09-11T10:00:00Z' }

async function installApi(page: Page, markdown = '# 预览正文', chunk = markdown) {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const ok = (body: object) => route.fulfill({ json: { success: true, ...body } })
    if (path === '/api/v1/entitlements/current') return ok({ data: { plan: 'max', plan_status: 'complimentary' } })
    if (path === '/api/v1/knowledge-bases') return ok({ data: [kb], total: 1 })
    if (path === '/api/v1/knowledge-bases/upload-kb') return ok({ data: kb })
    if (path.endsWith('/folders')) return ok({ data: { total_document_count: 1, root_document_count: 1, folders: [] } })
    if (path.endsWith('/knowledge')) return ok({ data: [document], total: 1 })
    if (path === '/api/v1/knowledge/document-1') return ok({ data: document })
    if (path === '/api/v1/knowledge/document-1/preview') return route.fulfill({ contentType: 'text/markdown', body: markdown })
    if (path === '/api/v1/chunks/document-1') return ok({ data: [{ id: 'chunk-1', content: chunk, is_enabled: true }], total: 1 })
    return ok({ data: [], total: 0 })
  })
}

test('native document chunks still render code and Mermaid after deferred engine loading', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await installApi(page, '# 文件预览', '## 正文\n\n```js\nconst result = 42;\n```\n\n```mermaid\ngraph TD\n A[资料] --> B[答案]\n```')
  await page.goto('/e2e/knowledge-upload-harness.html')
  await page.getByRole('heading', { name: '渲染验收', exact: true }).click()
  const drawer = page.locator('.doc-drawer-body')
  await expect(drawer.locator('.preview-markdown')).toContainText('文件预览')
  await drawer.getByRole('button', { name: '查看分块', exact: true }).click()
  await expect(drawer.locator('.code-block-pre .hljs-keyword')).toHaveText('const')
  await expect(drawer.locator('.mermaid svg')).toBeVisible()
  await expect(drawer.locator('.mermaid')).toContainText('资料')
  await drawer.locator('.mermaid').click()
  await expect(page.getByRole('button', { name: '关闭', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('native Markdown file preview preserves formatting and code highlighting', async ({ page }) => {
  await installApi(page, '# 文档标题\n\n**加粗正文**\n\n```js\nconst value = 7;\n```')
  await page.goto('/e2e/knowledge-upload-harness.html')
  await page.getByRole('heading', { name: '渲染验收', exact: true }).click()
  const preview = page.locator('.preview-markdown')
  await expect(preview.getByRole('heading')).toHaveText('文档标题')
  await expect(preview.locator('strong')).toHaveText('加粗正文')
  await expect(preview.locator('.hljs-keyword')).toHaveText('const')
})

test('native Mermaid file retains its existing SVG preview and fullscreen', async ({ page }) => {
  await installApi(page, 'graph TD\n A[来源] --> B[知识]')
  await page.route('**/api/v1/knowledge/document-1', route => route.fulfill({ json: {
    success: true, data: { ...document, file_type: 'mmd', title: '渲染验收.mmd' },
  } }))
  await page.goto('/e2e/knowledge-upload-harness.html')
  await page.getByRole('heading', { name: '渲染验收', exact: true }).click()
  await expect(page.locator('.preview-mermaid svg')).toBeVisible()
  await page.locator('.preview-mermaid').click()
  await expect(page.getByRole('button', { name: '关闭', exact: true })).toBeVisible()
})

test('a deferred preview engine failure remains visible to the user', async ({ page }) => {
  await installApi(page, '```js\nconst value = 7;\n```')
  await page.route(/\/node_modules\/\.vite\/deps\/highlight_+js\.js/, route => route.abort('failed'))
  await page.goto('/e2e/knowledge-upload-harness.html')
  await page.getByRole('heading', { name: '渲染验收', exact: true }).click()
  await expect(page.locator('.preview-error')).toBeVisible()
  await expect(page.locator('.preview-loading')).toHaveCount(0)
})

for (const format of ['csv', 'xlsx']) test(`FAQ ${format} import loads its parser only when a file is selected`, async ({ page }) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', request => requests.push(request.url()))
  page.on('pageerror', error => errors.push(error.message))
  await installApi(page)
  await page.goto('/e2e/faq-import-harness.html')
  await expect(page.locator('.faq-import-button')).toBeVisible()
  expect(requests.filter(url => /\/deps\/(?:xlsx|papaparse)/.test(url))).toEqual([])
  await page.locator('.faq-import-button').click()
  const record = { '标签(必填)': '验收', '问题(必填)': '如何查看资料？', '机器人回答(必填)': '点击知识库##选择文档', '相似问题': '如何打开资料？' }
  let buffer: Buffer
  if (format === 'xlsx') {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([record]), 'FAQ')
    buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  } else {
    buffer = Buffer.from(Object.keys(record).join(',') + '\n' + Object.values(record).join(','))
  }
  await page.locator('.faq-import-modal input[type=file]').setInputFiles({ name: `验收.${format}`, mimeType: 'application/octet-stream', buffer })
  await expect(page.locator('.preview-question')).toHaveText('如何查看资料？')
  expect(requests.some(url => new RegExp(`/deps/${format === 'xlsx' ? 'xlsx' : 'papaparse'}`).test(url))).toBe(true)
  const submitted = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/faq/entries'))
  await page.locator('.faq-import-footer').getByRole('button', { name: '导入 FAQ', exact: true }).click()
  expect((await submitted).postDataJSON()).toMatchObject({ mode: 'append', entries: [{
    standard_question: '如何查看资料？', answers: ['点击知识库', '选择文档'],
    similar_questions: ['如何打开资料？'], tag_name: '验收',
  }] })
  await expect(page.locator('.faq-import-modal')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('FAQ Excel sample remains a usable downloaded workbook', async ({ page }) => {
  await installApi(page)
  await page.goto('/e2e/faq-import-harness.html')
  await page.locator('.faq-import-button').click()
  await page.locator('.download-example-btn').click()
  const download = page.waitForEvent('download')
  await page.getByText('下载 Excel 示例', { exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('faq_example.xlsx')
  const workbook = XLSX.readFile(await file.path())
  expect(XLSX.utils.sheet_to_json(workbook.Sheets.FAQ)).toHaveLength(2)
})
