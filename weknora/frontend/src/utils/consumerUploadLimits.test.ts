import assert from 'node:assert/strict'
import test from 'node:test'
import {
  exceedsConsumerDocumentLimit,
  exceedsConsumerStorageQuota,
} from './consumerUploadLimits.ts'

const entitlement = {
  storage_bytes: 100,
  storage_used: 60,
  max_documents_per_kb: 10,
}

test('storage projection blocks only batches that exceed the remaining bytes', () => {
  assert.equal(exceedsConsumerStorageQuota(entitlement, [{ size: 40 }]), false)
  assert.equal(exceedsConsumerStorageQuota(entitlement, [{ size: 41 }]), true)
  assert.equal(exceedsConsumerStorageQuota(entitlement, []), false)
  assert.equal(exceedsConsumerStorageQuota({ ...entitlement, storage_used: 100 }), true)
})

test('document projection blocks a whole batch before a partial upload', () => {
  assert.equal(exceedsConsumerDocumentLimit(entitlement, 8, 2), false)
  assert.equal(exceedsConsumerDocumentLimit(entitlement, 9, 2), true)
  assert.equal(exceedsConsumerDocumentLimit({ ...entitlement, max_documents_per_kb: 0 }, 100, 1), false)
  assert.equal(exceedsConsumerDocumentLimit(entitlement, null, 2), false)
})
