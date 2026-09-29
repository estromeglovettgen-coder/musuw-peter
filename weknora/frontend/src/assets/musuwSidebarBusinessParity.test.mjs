// Peter customer-workspace + server delivery: approved native model catalog,
// customer binding/archival and separated navigation; renewed immutable baseline.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')

test('frozen sidebar controller remains the audited pre-reference implementation', () => {
  assert.equal(blobSha(read('./business-baselines/menu.pre-view.vue')), '6b223e3da153f5ed135ca2b2b7398e32f117cf91')
})

test('reference sidebar reuses frozen business setup and keeps every native session action surface', () => {
  const source = read('../components/menu.vue')
  for (const token of [
    "import LegacySidebarBusiness from '@/assets/business-baselines/menu.pre-view.vue'",
    'const legacySetup = legacy.setup',
    'return { ...state, orgStore, bucketHasMore, isPeterWorkspace }',
    'toggleSidebar',
    "handleMenuClick('creatChat')",
    "handleMenuClick('knowledge-bases')",
    "commandPaletteStore.openPalette('')",
    'SessionSourceFilter',
    'switchSessionBucket',
    'filteredGroupedSessions',
    'SessionSidebarRow',
    'buildSessionMenuOptions(subitem)',
    'renameSessionTitle(subitem, $event.title)',
    'SessionBatchManageModal',
    'batchSelectedIds',
    'toggleBatchSelect',
    'toggleBatchSelectAll',
    'handleInlineBatchDelete',
    'exitBatchMode',
    'UserMenu',
  ]) assert.ok(source.includes(token), `sidebar lost preserved behavior binding: ${token}`)
  assert.equal(source.includes('visual-sidebar__batch-footer'), false, 'inline secondary batch UI must not return')
})
