import assert from 'node:assert/strict'
import test from 'node:test'
import { useFolderDocuments } from './useFolderDocuments.ts'

const doc = (id: string) => ({ id, title: `${id}.pdf`, parse_status: 'completed' })
const deferred = () => {
  let resolve!: (value: any) => void
  let reject!: (error: Error) => void
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('expanded folders use direct-folder pagination and can load past fifty documents', async () => {
  const calls: any[] = []
  const documents = Array.from({ length: 53 }, (_, index) => doc(String(index)))
  const tree = useFolderDocuments(() => 'kb-a', async (kbId, params) => {
    calls.push({ kbId, ...params })
    return { success: true, data: documents.slice((params.page - 1) * 50, params.page * 50), total: 53 }
  })
  await tree.load('folder/a')
  assert.equal(tree.pages.get('folder/a')?.items.length, 50)
  assert.equal(tree.pages.get('folder/a')?.hasMore, true)
  await tree.load('folder/a')
  assert.equal(tree.pages.get('folder/a')?.items.length, 53)
  assert.equal(tree.pages.get('folder/a')?.hasMore, false)
  assert.deepEqual(calls.map(({ page, ...rest }) => rest), Array(2).fill({ kbId: 'kb-a', folder_path: 'folder/a', folder_recursive: false, page_size: 50 }))
  assert.deepEqual(calls.map((call) => call.page), [1, 2])
})

test('a tree refresh keeps existing document rows until replacement arrives, even when counts match', async () => {
  const replacement = deferred()
  let calls = 0
  const tree = useFolderDocuments(() => 'kb', async () => ++calls === 1
    ? { data: [doc('old')], total: 1 } : replacement.promise)
  await tree.load('')
  tree.invalidate()
  const refresh = tree.load('', true)
  assert.equal(tree.pages.get('')?.items[0].id, 'old')
  assert.equal(tree.pages.get('')?.loading, true)
  replacement.resolve({ data: [doc('replacement')], total: 1 })
  await refresh
  assert.equal(tree.pages.get('')?.items[0].id, 'replacement')
  assert.equal(tree.pages.get('')?.loading, false)
})

test('failed loads remain retryable without discarding already displayed documents', async () => {
  let calls = 0
  const tree = useFolderDocuments(() => 'kb', async () => {
    calls += 1
    if (calls === 2) throw new Error('network unavailable')
    return { data: [doc(calls === 1 ? 'old' : 'new')], total: 1 }
  })
  await tree.load('a')
  await tree.load('a', true)
  assert.equal(tree.pages.get('a')?.failed, true)
  assert.equal(tree.pages.get('a')?.items[0].id, 'old')
  await tree.load('a', tree.pages.get('a')?.stale)
  assert.equal(tree.pages.get('a')?.failed, false)
  assert.deepEqual(tree.pages.get('a')?.items.map((item) => item.id), ['new'])
})

test('a stale response cannot replace newer folder contents', async () => {
  const old = deferred()
  let calls = 0
  const tree = useFolderDocuments(() => 'kb', async () => ++calls === 1
    ? old.promise : { data: [doc('new')], total: 1 })
  const initial = tree.load('a')
  await tree.load('a', true)
  old.resolve({ data: [doc('old')], total: 1 })
  await initial
  assert.equal(tree.pages.get('a')?.items[0].id, 'new')
})

test('knowledge base changes discard in-flight results even when the folder path is identical', async () => {
  let kbId = 'old-kb'
  const old = deferred()
  const tree = useFolderDocuments(() => kbId, async (id) => id === 'old-kb'
    ? old.promise : { data: [doc('new')], total: 1 })
  const initial = tree.load('a')
  kbId = 'new-kb'
  tree.pages.clear()
  await tree.load('a')
  old.resolve({ data: [doc('old')], total: 1 })
  await initial
  assert.equal(tree.pages.get('a')?.items[0].id, 'new')
})

test('a missing knowledge base never sends an unscoped root request', async () => {
  let calls = 0
  const tree = useFolderDocuments(() => '', async () => { calls += 1 })
  await tree.load('')
  assert.equal(calls, 0)
  assert.equal(tree.pages.size, 0)
})
