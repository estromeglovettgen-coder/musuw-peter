import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const blobSha = (text) => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex')

test('frozen sidebar controller remains the audited pre-reference implementation', () => {
  assert.equal(blobSha(read('./business-baselines/menu.pre-view.vue')), 'e185baf5fb56a34b9d8582b7d4339904dc3b5d20')
})

test('reference sidebar reuses frozen business setup and keeps every native session action surface', () => {
  const source = read('../components/menu.vue')
  for (const token of [
    "import LegacySidebarBusiness from '@/assets/business-baselines/menu.pre-view.vue'",
    'const legacySetup = legacy.setup',
    'return { ...state, orgStore, bucketHasMore }',
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
