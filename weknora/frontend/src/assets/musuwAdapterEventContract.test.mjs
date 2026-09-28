import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('session batch adapter preserves the native boolean select-all payload and collection scope', () => {
  const child = read('../components/SessionBatchManageModal.vue')
  const parent = read('../components/menu.vue')
  const baseline = read('./business-baselines/menu.pre-view.vue')

  assert.ok(child.includes("'toggle-all': [checked: boolean]"), 'batch modal must declare the native boolean payload')
  assert.ok(child.includes("emit('toggle-all', !allSelected)"), 'batch modal must emit the target checked state')
  assert.ok(parent.includes('@toggle-all="toggleBatchSelectAll"'), 'sidebar must keep the frozen business handler')
  assert.ok(baseline.includes('const toggleBatchSelectAll = (checked: boolean)'), 'frozen handler signature changed unexpectedly')
  assert.ok(parent.includes(':items="batchSessionItems"'), 'batch modal must show the active source collection used by native allSelected/delete semantics')
})

test('session batch modal locks mutations while busy and exposes pagination controls', () => {
  const child = read('../components/SessionBatchManageModal.vue')

  assert.ok(child.includes('loading?: boolean'), 'batch modal must accept page-loading state')
  assert.ok(child.includes('hasMore?: boolean'), 'batch modal must accept a page continuation state')
  assert.ok(child.includes("'load-more': []"), 'batch modal must expose a load-more event')
  assert.ok(child.includes('@click.self="requestClose"'), 'busy close guard must cover backdrop clicks')
  assert.ok(child.includes('if (!props.deleting) emit(\'close\')'), 'busy close guard must cover close requests')
  assert.ok(child.includes(':disabled="deleting"'), 'selection and close controls must lock during delete confirmation')
  assert.ok(child.includes('v-if="hasMore"'), 'batch modal must render continuation control only when more sessions exist')
  assert.ok(child.includes(':disabled="loading || deleting"'), 'load-more must lock during page fetch or deletion')
})

test('adapter event wiring never substitutes reference-demo business actions', () => {
  const batch = read('../components/SessionBatchManageModal.vue')
  assert.equal(batch.includes("emit('pin')"), false, 'reference-only batch pin action must not be invented')
  assert.equal(batch.includes("emit('unpin')"), false, 'reference-only batch unpin action must not be invented')
})
