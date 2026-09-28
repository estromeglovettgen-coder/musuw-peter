import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import * as buckets from './sessionSidebarBuckets.ts'
import * as grouping from './sessionGrouping.ts'
import * as sourceFilter from './sessionSidebarSourceFilter.ts'

// Exercise the production controller with real Vue reactivity and bucket logic.
// HTTP, router and UI service boundaries are replaced with observable fixtures.
const source = readFileSync(new URL('../assets/business-baselines/menu.pre-view.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source, { filename: 'menu.vue' })
const compiled = compileScript(descriptor, { id: 'session-batch-delete-test' })
const javascript = ts.transpileModule(compiled.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function harness() {
  const requests: Array<{ ids?: string[]; delete_all?: boolean }> = []
  const confirmations: any[] = []
  const notices: Array<[string, string]> = []
  const navigations: string[] = []
  const children = vue.ref<any[]>([])
  const menuArr = vue.computed(() => [{ path: 'creatChat', children: children.value }])
  const store = {
    menuArr, visibleMenuArr: menuArr,
    clearMenuArr() { children.value = [] },
    updatemenuArr(row: any) { children.value.push(row) },
  }
  const route = { name: 'chat', params: { chatid: 'one' } }
  let respond = async () => ({ success: true })
  const pages: number[] = []
  let listPage = async (_page: number) => ({ success: true, data: [] as any[], total: 0 })
  const modules: Record<string, any> = {
    vue: { ...vue, onMounted() {}, onUnmounted() {}, watch() {} },
    pinia: { storeToRefs: () => ({ menuArr, visibleMenuArr: menuArr }) },
    'vue-router': { useRoute: () => route, useRouter: () => ({ push: (path: string) => navigations.push(path) }) },
    'vue-i18n': { useI18n: () => ({ t: (key: string, args?: any) => `${key}${args ? ':' + args.count : ''}` }) },
    '@/stores/menu': { useMenuStore: () => store },
    '@/stores/auth': { useAuthStore: () => ({ isLiteMode: true, hasRole: () => false }) },
    '@/stores/ui': { useUIStore: () => ({ sidebarCollapsed: false }) },
    '@/stores/chatResources': { useChatResourcesStore: () => ({}) },
    '@/stores/commandPalette': { useCommandPaletteStore: () => ({}) },
    './sessionSidebarBuckets': buckets,
    './sessionGrouping': grouping,
    './sessionSidebarSourceFilter': sourceFilter,
    'tdesign-vue-next': {
      MessagePlugin: { success: (m: string) => notices.push(['success', m]), error: (m: string) => notices.push(['error', m]) },
      DialogPlugin: { confirm: (options: any) => {
        const dialog = { options, destroyed: false, destroy() { this.destroyed = true }, update() {}, setConfirmLoading() {} }
        confirmations.push(dialog)
        return dialog
      } },
    },
    '@/api/chat/index': {
      async batchDelSessions(ids: string[]) { requests.push({ ids }); return respond() },
      async deleteAllSessions() { requests.push({ delete_all: true }); return respond() },
      async getSessionsList(page: number) { pages.push(page); return listPage(page) },
    },
  }
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', javascript)((name: string) => modules[name] || {}, module, module.exports)
  const state = module.exports.default.setup({}, { expose() {} })
  const rows = ['one', 'two'].map(id => ({ id, title: id, path: `chat/${id}` }))
  state.sessionBuckets.value = {
    web: { ...buckets.createEmptyBucket({ key: 'web', apiSource: 'web', label: 'Web', kind: 'web' }), items: rows, total: 40, loaded: true, page: 1 },
  }
  state.bucketOrder.value = ['web']
  state.syncMenuStoreFromBuckets()
  state.enterBatchMode()
  return { state, requests, confirmations, notices, navigations, children, pages, respondWith(fn: typeof respond) { respond = fn }, listWith(fn: typeof listPage) { listPage = fn } }
}

test('selecting all displayed conversations deletes exactly those IDs, preserving unloaded conversations', async () => {
  const h = harness()
  h.state.toggleBatchSelectAll(true)
  h.listWith(async () => ({ success: true, data: [{ id: 'survivor', title: 'Unloaded survivor' }], total: 38 }))
  h.state.handleInlineBatchDelete()
  await h.confirmations[0].options.onConfirm()
  assert.deepEqual(h.requests, [{ ids: ['one', 'two'] }])
  assert.equal(h.state.sessionBuckets.value.web.total, 38)
  assert.equal(h.state.batchMode.value, false)
  assert.deepEqual(h.navigations, ['/platform/creatChat'])
})

test('confirmation locks selection and submits the confirmed IDs only once', async () => {
  const h = harness()
  h.state.toggleBatchSelect('one')
  h.state.handleInlineBatchDelete()
  h.state.handleInlineBatchDelete()
  assert.equal(h.confirmations.length, 1)
  h.state.toggleBatchSelect('two')
  h.state.toggleBatchSelectAll(false)
  h.state.exitBatchMode()
  assert.deepEqual(h.state.batchSelectedIds.value, ['one'])
  assert.equal(h.state.batchMode.value, true)
  let complete!: (value: { success: boolean }) => void
  h.respondWith(() => new Promise(resolve => { complete = resolve }))
  const pending = h.confirmations[0].options.onConfirm()
  await h.confirmations[0].options.onConfirm()
  h.confirmations[0].options.onClose()
  assert.equal(h.confirmations[0].destroyed, false)
  complete({ success: true })
  await pending
  assert.deepEqual(h.requests, [{ ids: ['one'] }])
  assert.deepEqual(h.children.value.map(row => row.id), ['two'])
})

test('cancel preserves data and allows selection; failed deletion preserves rows and allows retry', async () => {
  const h = harness()
  h.state.toggleBatchSelect('two')
  h.state.handleInlineBatchDelete()
  h.confirmations[0].options.onClose()
  assert.deepEqual(h.requests, [])
  assert.equal(h.state.batchConfirming.value, false)
  assert.deepEqual(h.state.batchSelectedIds.value, ['two'])
  h.respondWith(async () => { throw new Error('network failure') })
  h.state.handleInlineBatchDelete()
  await h.confirmations[1].options.onConfirm()
  assert.equal(h.state.batchMode.value, true)
  assert.equal(h.state.batchDeleting.value, false)
  assert.deepEqual(h.state.batchSelectedIds.value, ['two'])
  assert.deepEqual(h.children.value.map(row => row.id), ['one', 'two'])
  assert.deepEqual(h.notices.map(([kind]) => kind), ['error'])
  h.respondWith(async () => ({ success: true }))
  h.state.handleInlineBatchDelete()
  await h.confirmations[2].options.onConfirm()
  assert.deepEqual(h.children.value.map(row => row.id), ['one'])
  assert.deepEqual(h.navigations, [])
  assert.deepEqual(h.notices.map(([kind]) => kind), ['error', 'success'])
})

test('batch selection uses the current conversation source, excluding other loaded sources', () => {
  const h = harness()
  h.state.sessionBuckets.value.api = {
    ...buckets.createEmptyBucket({ key: 'api', apiSource: 'api', label: 'API', kind: 'api' }),
    items: [{ id: 'api-one', title: 'API conversation' }], total: 1, loaded: true,
  }
  h.state.bucketOrder.value.push('api')
  h.state.syncMenuStoreFromBuckets()
  h.state.toggleBatchSelectAll(true)
  assert.deepEqual(h.state.batchSelectedIds.value, ['one', 'two'])
  h.state.toggleBatchSelect('api-one')
  assert.deepEqual(h.state.batchSelectedIds.value, ['one', 'two'])
})


test('loading more preserves the explicit selection and deleted page offsets cannot skip survivors', async () => {
  const h = harness()
  h.state.toggleBatchSelectAll(true)
  h.listWith(async () => ({ success: true, data: [{ id: 'three', title: 'three' }], total: 40 }))
  await h.state.loadMoreBatchSessions()
  assert.deepEqual(h.pages, [2])
  assert.deepEqual(h.state.batchSelectedIds.value, ['one', 'two'])
  assert.equal(h.state.isAllBatchSelected.value, false)
  h.state.handleInlineBatchDelete()
  await h.confirmations[0].options.onConfirm()
  // Deleting rows shifts offset-based pagination. The next read must restart
  // from page one and deduplicate retained rows instead of skipping survivors.
  h.state.enterBatchMode()
  h.listWith(async () => ({ success: true, data: [{ id: 'three', title: 'three' }, { id: 'four', title: 'four' }], total: 38 }))
  await h.state.loadMoreBatchSessions()
  assert.deepEqual(h.pages, [2, 1])
  assert.deepEqual(h.children.value.map(row => row.id), ['three', 'four'])
})

test('a failed load-more reports the failure, keeps selection, and retries the same page', async () => {
  const h = harness()
  h.state.toggleBatchSelect('one')
  h.listWith(async () => { throw new Error('offline') })
  await h.state.loadMoreBatchSessions()
  assert.deepEqual(h.notices, [['error', 'batchManage.loadFailed']])
  assert.deepEqual(h.children.value.map(row => row.id), ['one', 'two'])
  assert.deepEqual(h.state.batchSelectedIds.value, ['one'])
  assert.equal(h.state.activeBucket.value.loading, false)
  h.listWith(async () => ({ success: true, data: [{ id: 'three', title: 'three' }], total: 40 }))
  await h.state.loadMoreBatchSessions()
  assert.deepEqual(h.pages, [2, 2])
  assert.deepEqual(h.children.value.map(row => row.id), ['one', 'two', 'three'])
})

test('a page response started before deletion cannot restore deleted rows', async () => {
  const h = harness()
  let release!: (value: any) => void
  h.listWith(() => new Promise(resolve => { release = resolve }))
  const pendingPage = h.state.loadMoreBatchSessions()
  h.state.toggleBatchSelect('one')
  h.state.handleInlineBatchDelete()
  await h.confirmations[0].options.onConfirm()
  release({ success: true, data: [{ id: 'one', title: 'stale' }], total: 40 })
  await pendingPage
  assert.deepEqual(h.children.value.map(row => row.id), ['two'])
  assert.equal(h.state.activeBucket.value.loading, false)
})

test('deleting every visible row immediately refills the sidebar with remaining conversations', async () => {
  const h = harness()
  h.state.toggleBatchSelectAll(true)
  h.listWith(async () => ({ success: true, data: [{ id: 'survivor', title: 'Unloaded survivor' }], total: 38 }))
  h.state.handleInlineBatchDelete()
  await h.confirmations[0].options.onConfirm()
  assert.deepEqual(h.pages, [1])
  assert.deepEqual(h.children.value.map(row => row.id), ['survivor'])
  assert.equal(h.state.batchMode.value, false)
})

test('a refresh failure after deletion leaves a reachable retry for hidden survivors', async () => {
  const h = harness()
  h.state.toggleBatchSelectAll(true)
  h.listWith(async () => { throw new Error('refresh offline') })
  h.state.handleInlineBatchDelete()
  await h.confirmations[0].options.onConfirm()
  assert.equal(h.state.batchMode.value, true)
  assert.equal(h.state.batchDeleting.value, false)
  assert.deepEqual(h.state.batchSelectedIds.value, [])
  assert.equal(h.state.activeBucket.value.total, 38)
  h.listWith(async () => ({ success: true, data: [{ id: 'survivor', title: 'Unloaded survivor' }], total: 38 }))
  await h.state.loadMoreBatchSessions()
  assert.deepEqual(h.pages, [1, 1])
  assert.deepEqual(h.children.value.map(row => row.id), ['survivor'])
  assert.deepEqual(h.requests, [{ ids: ['one', 'two'] }])
})

test('another session action removing a selected row clears the stale batch selection', () => {
  const h = harness()
  h.state.toggleBatchSelect('one')
  h.state.handleSessionMutation({ detail: { sessionId: 'one', removed: true } })
  assert.deepEqual(h.state.batchSelectedIds.value, [])
  assert.equal(h.state.isAllBatchSelected.value, false)
  h.state.handleInlineBatchDelete()
  assert.equal(h.confirmations.length, 0)
})
