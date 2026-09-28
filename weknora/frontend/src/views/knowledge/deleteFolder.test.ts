import assert from 'node:assert/strict'
import test from 'node:test'

import { deleteKnowledgeFolder } from './deleteFolder.ts'

const document = (id: string, folderPath = 'docs', kbId = 'kb-1') => ({
  id,
  knowledge_base_id: kbId,
  folder_path: folderPath,
})

test('folder deletion enumerates every descendant before submitting batches of at most 200', async () => {
  const documents = Array.from({ length: 203 }, (_, i) => document(`doc-${i}`, i % 2 ? 'docs/nested' : 'docs'))
  const events: string[] = []
  const batches: string[][] = []
  const result = await deleteKnowledgeFolder('kb-1', 'docs', {
    async listKnowledgeFiles(kbId, params) {
      assert.equal(kbId, 'kb-1')
      assert.deepEqual(params, { page: params.page, page_size: 200, folder_path: 'docs', folder_recursive: true })
      events.push(`list-${params.page}`)
      return { success: true, data: documents.slice((params.page - 1) * 200, params.page * 200), total: documents.length }
    },
    async batchDeleteKnowledge(kbId, ids) {
      assert.equal(kbId, 'kb-1')
      events.push(`delete-${ids.length}`)
      batches.push(ids)
      return { success: true }
    },
  })
  assert.deepEqual(events, ['list-1', 'list-2', 'delete-200', 'delete-3'])
  assert.deepEqual(batches.flat(), documents.map(item => item.id))
  assert.deepEqual(result, { submittedIds: documents.map(item => item.id), unconfirmedIds: [] })
})

test('root and paths that the server would normalize cannot trigger folder deletion', async () => {
  for (const path of ['', '/', ' ', 'docs/', 'docs//child', '../docs', 'docs/..', 'docs\\child', 'docs./child']) {
    let requests = 0
    await assert.rejects(deleteKnowledgeFolder('kb-1', path, {
      async listKnowledgeFiles() { requests += 1 },
      async batchDeleteKnowledge() { requests += 1 },
    }), /non-root canonical folder/)
    assert.equal(requests, 0, path)
  }
})

test('a folder deletion rejects another knowledge base, root documents, and prefix-colliding siblings', async () => {
  for (const item of [document('other', 'docs', 'kb-other'), document('root', ''), document('sibling', 'docs2'), document('sibling-child', 'docs2/child')]) {
    let deletes = 0
    await assert.rejects(deleteKnowledgeFolder('kb-1', 'docs', {
      async listKnowledgeFiles() { return { success: true, data: [item], total: 1 } },
      async batchDeleteKnowledge() { deletes += 1 },
    }), /inconsistent/)
    assert.equal(deletes, 0, item.id)
  }
})

test('failed or changing pagination never submits a partial folder deletion', async () => {
  const firstPage = Array.from({ length: 200 }, (_, i) => document(`doc-${i}`))
  for (const secondPage of [
    () => { throw new Error('network unavailable') },
    () => ({ success: false }),
    () => ({ success: true, data: [], total: 201 }),
    () => ({ success: true, data: [document('new')], total: 202 }),
    () => ({ success: true, data: [document('doc-0')], total: 201 }),
  ]) {
    let deletes = 0
    await assert.rejects(deleteKnowledgeFolder('kb-1', 'docs', {
      async listKnowledgeFiles(_kbId, { page }) {
        return page === 1 ? { success: true, data: firstPage, total: 201 } : secondPage()
      },
      async batchDeleteKnowledge() { deletes += 1 },
    }))
    assert.equal(deletes, 0)
  }
})

test('an accepted batch followed by failure reports only acknowledged IDs and stops', async () => {
  const documents = Array.from({ length: 401 }, (_, i) => document(`doc-${i}`))
  for (const failure of [
    () => ({ success: false, message: 'permission changed' }),
    () => { throw new Error('connection lost after submission') },
  ]) {
    let batches = 0
    const result = await deleteKnowledgeFolder('kb-1', 'docs', {
      async listKnowledgeFiles(_kbId, { page }) {
        return { success: true, data: documents.slice((page - 1) * 200, page * 200), total: documents.length }
      },
      async batchDeleteKnowledge() {
        batches += 1
        return batches === 1 ? { success: true } : failure()
      },
    })
    assert.equal(batches, 2)
    assert.deepEqual(result.submittedIds, documents.slice(0, 200).map(item => item.id))
    assert.deepEqual(result.unconfirmedIds, documents.slice(200).map(item => item.id))
    assert.ok(result.error instanceof Error)
  }
})

test('empty folders need no separate deletion request', async () => {
  const result = await deleteKnowledgeFolder('kb-1', 'docs', {
    async listKnowledgeFiles() { return { success: true, data: [], total: 0 } },
    async batchDeleteKnowledge() { assert.fail('derived empty folders have no stored row') },
  })
  assert.deepEqual(result, { submittedIds: [], unconfirmedIds: [] })
})

test('pending, processing and finalizing documents use the existing deletion pipeline too', async () => {
  const documents = ['pending', 'processing', 'finalizing'].map((parse_status, index) => ({ ...document(`active-${index}`), parse_status }))
  const result = await deleteKnowledgeFolder('kb-1', 'docs', {
    async listKnowledgeFiles() { return { success: true, data: documents, total: documents.length } },
    async batchDeleteKnowledge(_kbId, ids) {
      assert.deepEqual(ids, ['active-0', 'active-1', 'active-2'])
      return { success: true }
    },
  })
  assert.deepEqual(result.submittedIds, ['active-0', 'active-1', 'active-2'])
})
