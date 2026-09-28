import assert from 'node:assert/strict'
import test from 'node:test'

import {
  resolveKnowledgeDetailTitle,
  resolveKnowledgeDisplayName,
} from './knowledgeDisplayName.ts'

test('uses a generated URL title instead of the durable artifact filename', () => {
  const knowledge = {
    type: 'url',
    title: 'Postiz Docker 安装指南',
    file_name: 'youtube-Es0JCkbUGSI.md',
    source: 'https://youtu.be/Es0JCkbUGSI?si=share-token',
  }

  assert.equal(resolveKnowledgeDisplayName(knowledge, '未命名文档'), 'Postiz Docker 安装指南')
  assert.equal(resolveKnowledgeDetailTitle(knowledge, '未命名文档'), 'Postiz Docker 安装指南')
})

test('does not mistake the initial source URL for a generated title', () => {
  const source = 'https://youtu.be/Es0JCkbUGSI?si=share-token'

  assert.equal(resolveKnowledgeDisplayName({
    type: 'url',
    title: source,
    file_name: 'youtube-Es0JCkbUGSI.md',
    source,
  }, '未命名文档'), 'youtube-Es0JCkbUGSI')

  assert.equal(resolveKnowledgeDisplayName({
    type: 'url',
    title: source,
    source,
  }, '未命名文档'), '未命名文档')

  assert.equal(resolveKnowledgeDisplayName({
    type: 'url',
    source,
  }, '未命名文档'), '未命名文档')
})

test('keeps the existing extensionless display name for uploaded files', () => {
  assert.equal(resolveKnowledgeDisplayName({
    type: 'file',
    title: 'quarterly-report.pdf',
    file_name: 'quarterly-report.pdf',
  }, '未命名文档'), 'quarterly-report')
})

test('keeps punctuation in generated titles', () => {
  assert.equal(resolveKnowledgeDisplayName({
    type: 'url',
    title: 'Postiz 2.0: Docker 安装',
    file_name: 'youtube-video.md',
    source: 'https://www.youtube.com/watch?v=video',
  }, '未命名文档'), 'Postiz 2.0: Docker 安装')
})
