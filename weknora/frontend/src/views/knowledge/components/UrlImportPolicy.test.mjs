import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const component = readFileSync(new URL('./KbUploadSourceDropdown.vue', import.meta.url), 'utf8')
test('URL import keeps policy prose out of the compact action dialog', () => {
  assert.doesNotMatch(component, /knowledgeBase\.(?:urlTip|urlInputHint|urlUsageNotice)/)
})

test('the public acceptable-use policy states the same narrow URL-import purpose', async () => {
  const { getPublicDocument } = await import('../../../../../../storefront/src/legalContent.js')
  const english = JSON.stringify(getPublicDocument('en', '/acceptable-use'))
  const chinese = JSON.stringify(getPublicDocument('zh-CN', '/acceptable-use'))

  assert.match(english, /URL imports.*private knowledge indexing.*not.*streaming.*content redistribution/i)
  assert.match(chinese, /网页导入.*私人知识索引.*不是.*流媒体下载.*内容再分发/)
})
