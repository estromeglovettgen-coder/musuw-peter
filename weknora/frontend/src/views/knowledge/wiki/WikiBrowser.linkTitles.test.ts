import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'

const { descriptor } = parse(readFileSync(new URL('./WikiBrowser.vue', import.meta.url), 'utf8'))
const source = ts.createSourceFile('WikiBrowser.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true)
const names = new Set(['sourceRefTitleCache', 'sourceRefTitleRequestSeq', 'sourceRefTitleScope', 'parseSourceRefEntry', 'parsedSourceRefs', 'hydrateSourceRefTitles', 'hydrateLinkedWikiTitles', 'summarySourceId', 'slugDisplayName'])
const blocks = source.statements.filter(statement => {
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.some(d => names.has(d.name.getText(source)))
  if (ts.isFunctionDeclaration(statement)) return names.has(statement.name?.text || '')
  return ts.isExpressionStatement(statement) && statement.getText(source).startsWith('watch(')
    && statement.getText(source).includes('hydrateSourceRefTitles')
})
const javascript = ts.transpileModule(blocks.map(block => block.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

const kb = '961f9976-ae42-4bc4-bafe-1dfa4506f0c9'
const ids = ['57a52190-9409-4cac-b3e3-f54960dcf63c', '93c1599a-17f9-4045-b7a5-ed4a65f7cbd7']
const titles = ['真男人不要输在表达上 · 第一章 第二节 生命力与所谓“生理性吸引”', '第11课 · 头像评价与私信：降低距离、真实反馈与个人判断']
const docs = ids.map((id, index) => ({ id, knowledge_base_id: kb, title: titles[index] }))
const selected = (links = ids.map(id => `summary/${id}`), source_refs: string[] = []) => ({ slug: 'concept/curiosity', title: '好奇心', knowledge_base_id: kb, in_links: links, source_refs })
const settle = async () => { await nextTick(); await Promise.resolve(); await nextTick(); await Promise.resolve() }

function setup(options: { pages?: any[]; page?: any; subscribed?: boolean; load?: (...args: any[]) => Promise<any>; graph?: any; loadLinked?: (...args: any[]) => Promise<any> } = {}) {
  const calls: any[][] = [], linkedCalls: any[][] = [], props = reactive({ knowledgeBaseId: kb, marketplaceProductId: options.subscribed ? 'market-product' : undefined })
  const selectedPage = ref(options.page ?? selected()), pages = ref(options.pages || [{ slug: 'concept/curiosity', title: '好奇心' }])
  const scope = effectScope()
  const dependencies = {
    reactive, ref, computed, watch, props, selectedPage, pages, graphData: ref(options.graph || null),
    subscriptionReadOnly: computed(() => !!props.marketplaceProductId),
    wikiReadScope: computed(() => props.marketplaceProductId ? { knowledgeBaseId: props.knowledgeBaseId, marketplaceProductId: props.marketplaceProductId } : props.knowledgeBaseId),
    readWiki: (request: Promise<any>) => request,
    getWikiGraph: async (...args: any[]) => { linkedCalls.push(args); return options.loadLinked ? options.loadLinked(...args) : { nodes: [
      { slug: 'concept/conquest-desire', title: '征服欲' }, { slug: 'concept/vitality', title: '生命力' },
      { slug: `summary/${ids[0]}`, title: '经过编辑的摘要标题' },
    ] } },
    batchQueryKnowledge: async (...args: any[]) => { calls.push(args); return options.load ? options.load(...args) : { success: true, data: docs } },
    getKnowledgeDetails: async (id: string) => ({ data: docs.find(doc => doc.id === id) }),
  }
  const run = new Function(...Object.keys(dependencies), `${javascript}\nreturn { slugDisplayName, parsedSourceRefs }`)
  const state = scope.run(() => run(...Object.values(dependencies)))
  return { state, props, selectedPage, pages, calls, linkedCalls, stop: () => scope.stop() }
}

test('unloaded summary backlinks show Chinese source titles with one scoped batch and unchanged slugs', async () => {
  const app = setup()
  await settle()
  assert.deepEqual(ids.map(id => app.state.slugDisplayName(`summary/${id}`)), titles)
  assert.equal(app.calls.length, 1)
  assert.deepEqual(new URLSearchParams(app.calls[0][0]).getAll('ids'), ids)
  assert.equal(app.calls[0][1], kb)
  assert.deepEqual(app.selectedPage.value.in_links, ids.map(id => `summary/${id}`))
  app.stop()
})

test('known Wiki titles win and only missing source titles are fetched once', async () => {
  const app = setup({
    pages: [{ slug: `summary/${ids[0]}`, title: '用户改过的摘要标题' }],
    page: selected([`summary/${ids[0]}`, `summary/${ids[1]}`, `summary/${ids[1]}`], [ids[1], ids[1]]),
  })
  await settle()
  assert.equal(app.state.slugDisplayName(`summary/${ids[0]}`), '用户改过的摘要标题')
  assert.equal(app.state.slugDisplayName(`summary/${ids[1]}`), titles[1])
  assert.equal(app.calls.length, 1)
  assert.deepEqual(new URLSearchParams(app.calls[0][0]).getAll('ids'), [ids[1]])
  assert.deepEqual(app.state.parsedSourceRefs.value.map((item: any) => item.title), [titles[1], titles[1]])
  app.stop()
})

test('subscription Wiki pages never acquire native source-file read access', async () => {
  const app = setup({ subscribed: true })
  await settle()
  assert.deepEqual(app.calls, [])
  assert.deepEqual(app.state.parsedSourceRefs.value, [])
  app.stop()
})

test('a stale response after switching KBs cannot populate the new scope title cache', async () => {
  let finish!: (response: any) => void
  const app = setup({ load: () => new Promise(resolve => { finish = resolve }) })
  await settle()
  app.props.knowledgeBaseId = 'other-kb'
  app.selectedPage.value = { ...selected([]), knowledge_base_id: 'other-kb' }
  await settle()
  finish({ data: docs })
  await settle()
  assert.equal(app.state.slugDisplayName(`summary/${ids[0]}`), ids[0])
  app.stop()
})

test('clearing the reader invalidates pending title reads even within the same KB', async () => {
  let finish!: (response: any) => void
  const app = setup({ load: () => new Promise(resolve => { finish = resolve }) })
  await settle()
  app.selectedPage.value = null
  await settle()
  finish({ data: docs })
  await settle()
  assert.equal(app.state.slugDisplayName(`summary/${ids[0]}`), ids[0])
  app.stop()
})

test('cached source titles are reused when another page links to the same summaries', async () => {
  const app = setup()
  await settle()
  app.selectedPage.value = { ...selected(), slug: 'concept/vitality' }
  await settle()
  assert.equal(app.calls.length, 1)
  assert.equal(app.state.slugDisplayName(`summary/${ids[1]}`), titles[1])
  app.stop()
})

test('legacy source refs carrying their own title need no extra metadata read', async () => {
  const app = setup({ page: selected([`summary/${ids[0]}`], [`${ids[0]}|旧资料里的中文标题`]) })
  await settle()
  assert.equal(app.state.slugDisplayName(`summary/${ids[0]}`), '旧资料里的中文标题')
  assert.deepEqual(app.calls, [])
  app.stop()
})

test('missing or inaccessible sources keep the existing link fallback without failing the reader', async () => {
  for (const load of [async () => ({ data: [] }), async () => { throw new Error('forbidden') }]) {
    const app = setup({ load })
    await settle()
    assert.equal(app.state.slugDisplayName(`summary/${ids[0]}`), ids[0])
    assert.equal(app.calls.length, 1)
    app.stop()
  }
})

test('a response completing after unmount cannot populate the title cache', async () => {
  let finish!: (response: any) => void
  const app = setup({ load: () => new Promise(resolve => { finish = resolve }) })
  await settle()
  app.stop()
  finish({ data: docs })
  await settle()
  assert.equal(app.state.slugDisplayName(`summary/${ids[0]}`), ids[0])
})

test('unloaded concept backlinks resolve through one bounded ego title request and keep edited Wiki titles', async () => {
  const app = setup({ page: { ...selected(['concept/conquest-desire', 'concept/vitality', `summary/${ids[0]}`]), out_links: ['concept/vitality'] } })
  await settle()
  assert.equal(app.state.slugDisplayName('concept/conquest-desire'), '征服欲')
  assert.equal(app.state.slugDisplayName('concept/vitality'), '生命力')
  assert.equal(app.state.slugDisplayName(`summary/${ids[0]}`), '经过编辑的摘要标题')
  assert.deepEqual(app.linkedCalls, [[kb, { mode: 'ego', center: 'concept/curiosity', depth: 1, limit: 4 }]])
  app.stop()
})

test('already loaded graph node titles avoid any additional linked-title request', async () => {
  const app = setup({ page: selected(['concept/vitality']), graph: { nodes: [{ slug: 'concept/vitality', title: '生命力' }] } })
  await settle()
  assert.equal(app.state.slugDisplayName('concept/vitality'), '生命力')
  assert.deepEqual(app.linkedCalls, [])
  app.stop()
})

test('linked title requests preserve subscription scope and ignore responses after navigation', async () => {
  let finish!: (response: any) => void
  const app = setup({ subscribed: true, page: selected(['concept/vitality']), loadLinked: () => new Promise(resolve => { finish = resolve }) })
  await settle()
  assert.deepEqual(app.linkedCalls[0][0], { knowledgeBaseId: kb, marketplaceProductId: 'market-product' })
  assert.deepEqual(app.calls, [])
  app.selectedPage.value = selected([])
  await settle()
  finish({ nodes: [{ slug: 'concept/vitality', title: '不应显示的旧结果' }] })
  await settle()
  assert.equal(app.state.slugDisplayName('concept/vitality'), 'vitality')
  app.stop()
})
