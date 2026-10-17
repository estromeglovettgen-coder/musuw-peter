import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'

const { descriptor } = parse(readFileSync(new URL('./WikiBrowser.vue', import.meta.url), 'utf8'))
const source = ts.createSourceFile('WikiBrowser.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true)
const names = new Set(['wikiReadRevision', 'wikiUnmounted', 'currentWikiRead', 'readerRequestSeq', 'loadPages', 'loadIndex', 'stripLegacyIndexDirectory', 'openIndexView', 'navigateToSlug', 'selectPage', 'loadPageIssues'])
const blocks = source.statements.filter(statement => {
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some(d => names.has(d.name.getText(source)))
  if (ts.isFunctionDeclaration(statement)) return names.has(statement.name?.text || '')
  const text = statement.getText(source)
  return ts.isExpressionStatement(statement) && (text.startsWith('onMounted(')
    || text.startsWith('watch(') && text.includes('route.query.slug'))
})
const javascript = ts.transpileModule(blocks.map(b => b.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText
const deferred = <T = any>() => {
  let resolve!: (value: T) => void, reject!: (reason: any) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = async () => { for (let i = 0; i < 5; i++) { await nextTick(); await Promise.resolve() } }

function setup(slug: string | null = 'concept/curiosity', view = 'browser') {
  const props = reactive({ knowledgeBaseId: 'kb-a', marketplaceProductId: undefined as string | undefined, view })
  const route = reactive({ query: { slug: slug ?? undefined } })
  const selectedPage = ref<any>(null), activeSystemView = ref(''), loading = ref(false), indexAvailable = ref(false), indexMarkdown = ref('')
  const sidebar = deferred(), index = deferred(), requests: Array<{ scope: any; slug: string; result: ReturnType<typeof deferred> }> = []
  const calls: string[] = [], mounts: (() => void)[] = [], errors: unknown[] = []
  const context = {
    ref, computed, watch, props, route, selectedPage, activeSystemView, loading, indexAvailable, indexMarkdown,
    wikiReadScope: computed(() => props.marketplaceProductId ? { knowledgeBaseId: props.knowledgeBaseId, marketplaceProductId: props.marketplaceProductId } : props.knowledgeBaseId),
    subscriptionReadOnly: ref(false), navHistory: ref<any[]>([]), navFromSystemView: ref(''), pageIssues: ref([]), showIssuesBox: ref(false),
    searchResults: ref(null), CONTENT_TABS: ['knowledge', 'summary'], ensureBucket: () => {},
    loadPagesForType: (tab: string) => { calls.push('pages:' + tab); return sidebar.promise },
    loadCategoriesForType: (tab: string) => { calls.push('folders:' + tab); return sidebar.promise },
    activeTab: ref(''), visibleTabs: ref([{ type: 'knowledge' }, { type: 'summary' }]), initialSidebarLoad: true,
    preferredDefaultTab: () => 'knowledge', sidebarViewMode: ref('tree'), loadFlatPagesForType: async () => {},
    indexSections: ref({}), indexSectionIdx: ref(0), indexLoading: ref(false),
    readWiki: (request: Promise<any>) => request,
    getWikiIndex: () => { calls.push('index'); return index.promise },
    getWikiPage: (scope: any, slug: string) => { const result = deferred(); requests.push({ scope, slug, result }); calls.push('body:' + slug); return result.promise },
    listWikiIssues: async () => ({ data: [] }),
    onMounted: (fn: () => void) => mounts.push(fn), loadStats: () => { calls.push('stats') },
    closeObsidianGraphSettings: () => {}, loadGraph: () => { calls.push('graph') }, handleGraphSearchSelect: () => {},
    console: { error: (...args: any[]) => errors.push(args) },
  }
  const scope = effectScope()
  const state = scope.run(() => new Function(...Object.keys(context), `${javascript}; return { navigateToSlug, openIndexView, loadPages }`)(...Object.values(context)))
  return { props, route, selectedPage, activeSystemView, loading, index, sidebar, requests, calls, errors, state,
    mount() { mounts.forEach(fn => fn()) }, stop() { scope.stop() } }
}

test('a direct Wiki slug reads its body before blocked index and sidebar initialization', async () => {
  const app = setup()
  app.mount()
  await settle()
  assert.equal(app.requests.length, 1, 'The current article must not wait for the directory APIs')
  app.requests[0].result.resolve({ data: { slug: 'concept/curiosity', title: '好奇心', content: '真实正文' } })
  await settle()
  assert.equal(app.selectedPage.value?.content, '真实正文')
  assert.equal(app.loading.value, true, 'The sidebar is still loading independently')
  assert.equal(app.calls.filter(x => x === 'stats').length, 1)
  app.stop()
})

test('index and both sidebar buckets start together; a default index is readable while directories are blocked', async () => {
  const app = setup(null)
  app.mount()
  await settle()
  assert.ok(app.calls.includes('pages:knowledge'))
  assert.ok(app.calls.includes('pages:summary'))
  app.index.resolve({ intro: '索引简介', groups: [] })
  await settle()
  assert.equal(app.activeSystemView.value, 'index')
  assert.equal(app.loading.value, true)
  assert.equal(app.calls.filter(x => x === 'index').length, 1)
  assert.equal(app.requests.length, 0)
  app.stop()
})

test('a late index or directory response cannot replace the article chosen during startup', async () => {
  const app = setup()
  app.mount()
  await settle()
  app.route.query.slug = 'concept/vitality'
  await settle()
  app.requests.find(r => r.slug === 'concept/vitality')!.result.resolve({ data: { slug: 'concept/vitality', content: '生命力正文' } })
  await settle()
  app.index.resolve({ intro: '索引简介', groups: [] })
  app.sidebar.resolve(undefined)
  app.requests.find(r => r.slug === 'concept/curiosity')!.result.resolve({ data: { slug: 'concept/curiosity', content: '过时正文' } })
  await settle()
  assert.equal(app.selectedPage.value?.slug, 'concept/vitality')
  assert.equal(app.activeSystemView.value, '')
  assert.equal(app.requests.filter(r => r.slug === 'concept/vitality').length, 1)
  app.stop()
})

test('a response from the previous KB cannot populate the new reader', async () => {
  const app = setup()
  app.mount()
  await settle()
  const old = app.requests[0]
  app.props.knowledgeBaseId = 'kb-b'
  app.route.query.slug = 'concept/other'
  await settle()
  old.result.resolve({ data: { slug: 'concept/curiosity', content: '旧知识库内容' } })
  await settle()
  assert.notEqual(app.selectedPage.value?.content, '旧知识库内容')
  app.stop()
})

test('opening the index while a body is pending keeps the index selected after that body returns', async () => {
  const app = setup()
  app.mount()
  await settle()
  const pending = app.requests[0]
  app.index.resolve({ intro: '索引简介', groups: [] })
  await settle()
  await app.state.openIndexView()
  pending.result.resolve({ data: { slug: 'concept/curiosity', content: '已取消的正文' } })
  await settle()
  assert.equal(app.selectedPage.value, null)
  assert.equal(app.activeSystemView.value, 'index')
  app.stop()
})

test('an empty index response is not fetched twice during initialization', async () => {
  const app = setup(null)
  app.mount()
  app.index.resolve({ intro: '', groups: [] })
  await settle()
  assert.equal(app.activeSystemView.value, 'index')
  assert.equal(app.calls.filter(x => x === 'index').length, 1)
  app.stop()
})

test('a failed index does not block an article, and a failed article can be requested again', async () => {
  const app = setup()
  app.mount()
  await settle()
  app.index.reject(new Error('index unavailable'))
  app.requests[0].result.reject(new Error('temporary body failure'))
  await settle()
  const retry = app.state.navigateToSlug('concept/curiosity')
  app.requests[1].result.resolve({ data: { slug: 'concept/curiosity', content: '重试成功' } })
  await retry
  assert.equal(app.selectedPage.value?.content, '重试成功')
  app.stop()
})

test('the initial graph keeps its native initialization; switching to the browser reads its linked article', async () => {
  const app = setup('concept/curiosity', 'graph')
  app.mount()
  await settle()
  assert.equal(app.requests.length, 0)
  assert.equal(app.calls.filter(x => x === 'graph').length, 1)
  app.props.view = 'browser'
  await settle()
  assert.equal(app.requests.length, 1)
  assert.equal(app.requests[0].slug, 'concept/curiosity')
  app.stop()
})

test('the Wiki fix-chat drawer keeps its native component and closes only itself after a deferred module failure', () => {
  const declaration = source.statements.find(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(d => d.name.getText(source) === 'ChatView'))!
  assert.ok(declaration.getText(source).includes('import("@/views/chat/index.vue")'))
  const js = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  const drawer = { value: true }
  const cancel = new Function('defineRecoverableAsyncComponent', 'showFixDrawer', `${js}; return ChatView`)(
    (_loader: any, close: () => void) => close, drawer,
  )
  cancel()
  assert.equal(drawer.value, false)
})
