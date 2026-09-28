import assert from 'node:assert/strict'
import test from 'node:test'

import { shouldRejectKnowledgeFileType } from './fileTypeVerification.ts'

test('shouldRejectKnowledgeFileType accepts HTML in the fallback whitelist', () => {
  assert.equal(shouldRejectKnowledgeFileType('page.html'), false)
  assert.equal(shouldRejectKnowledgeFileType('legacy.HTM'), false)
  assert.equal(shouldRejectKnowledgeFileType('payload.exe'), true)
})

test('shouldRejectKnowledgeFileType accepts only OpenRouter video containers', () => {
  for (const extension of ['mp4', 'mpeg', 'mov', 'webm']) {
    assert.equal(shouldRejectKnowledgeFileType(`clip.${extension}`), false)
  }
  for (const extension of ['avi', 'mkv', 'wmv', 'flv']) {
    assert.equal(shouldRejectKnowledgeFileType(`clip.${extension}`), true)
  }
})

test('shouldRejectKnowledgeFileType preserves dynamic whitelist behavior', () => {
  assert.equal(shouldRejectKnowledgeFileType('custom.xyz', ['xyz']), false)
  assert.equal(shouldRejectKnowledgeFileType('page.html', ['pdf']), true)
  assert.equal(shouldRejectKnowledgeFileType('page.html', []), false)
})
