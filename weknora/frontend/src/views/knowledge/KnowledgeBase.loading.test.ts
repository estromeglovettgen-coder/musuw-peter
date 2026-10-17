import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { ref, computed, reactive, watch, effectScope, nextTick } from 'vue'

// Exercise the native controller and its real Vue watchers; only HTTP is replaced.
const text = parse(readFileSync(new URL('../../assets/business-baselines/KnowledgeBase.pre-view.vue', import.meta.url), 'utf8')).descriptor.scriptSetup!.content
const ast = ts.createSourceFile('KnowledgeBase.ts', text, ts.ScriptTarget.Latest, true)
const names = new Set(['firstPageRefresh', 'loadKnowledgeFiles', 'loadKnowledgeBaseInfo', 'loadDocumentViewData'])
const selected = ast.statements.filter(s => ts.isVariableStatement(s)
  ? s.declarationList.declarations.some(d => names.has(d.name.getText(ast)))
  : ts.isExpressionStatement(s) && /^watch\((selectedTagIds|activeKbTab|selectedFolderPath),/.test(s.getText(ast)))
const js = ts.transpileModule(selected.map(s => s.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const settle = async () => { await nextTick(); await Promise.resolve(); await nextTick() }
function setup(tab = 'documents', wiki = true) {
  const calls: string[] = [], scope = effectScope(), kbId = ref('course-kb'), activeKbTab = ref(tab), kbInfo = ref<any>(null)
  const selectedTagIds = ref<string[]>([]), selectedFolderPath = ref(''), kbLoading = ref(false), docListLoading = ref(true)
  const deps = {
    ref, computed, watch, kbId, activeKbTab, kbInfo, kbLoading, selectedTagIds, selectedFolderPath, docListLoading,
    chatResources: { fetchKnowledgeBaseById: async (id: string) => ({ id, type: 'document', indexing_strategy: { wiki_enabled: wiki } }) },
    isFAQ: computed(() => kbInfo.value?.type === 'faq'), isWiki: computed(() => !!kbInfo.value?.indexing_strategy?.wiki_enabled),
    cardList: ref([]), total: ref(0), folderTree: ref(null), tagFilterCleared: ref(false),
    filterParams: computed(() => ({ folder_path: selectedFolderPath.value })), pageSize: 35,
    getKnowled: async (_filters: any, id: string) => { calls.push('documents:' + id) },
    loadFolderTree: async (id: string) => { calls.push('folders:' + id) },
    loadTags: async (id: string) => { calls.push('tags:' + id) },
    isCurrentKb: (id: string) => id === kbId.value,
    uiStore: { clearSelectedTagIds() {} }, knowledgeListError: ref(''), displayedListScope: ref({}),
    pendingKnowledgeId: ref(null), tryAutoOpenDocument() {}, clearSelection() {}, resetPage() {},
  }
  const run = new Function(...Object.keys(deps), js + '\nreturn {loadKnowledgeBaseInfo,loadKnowledgeFiles}')
  const state = scope.run(() => run(...Object.values(deps))) as { loadKnowledgeBaseInfo: (id: string) => Promise<void>; loadKnowledgeFiles: (id: string) => Promise<void> }
  return { ...state, calls, selectedTagIds, activeKbTab, kbLoading, kbId, stop: () => scope.stop() }
}
test('opening documents loads one list, and resetting an empty tag filter never duplicates it', async () => {
  const app = setup()
  try { await app.loadKnowledgeBaseInfo('course-kb'); await settle(); assert.equal(app.calls.filter(x => x.startsWith('documents:')).length, 1) }
  finally { app.stop() }
})
test('direct Wiki and graph links do not fetch hidden documents, folders or tags', async () => {
  for (const tab of ['wiki', 'graph']) {
    const app = setup(tab)
    try { await app.loadKnowledgeBaseInfo('course-kb'); await settle(); assert.deepEqual(app.calls, []) }
    finally { app.stop() }
  }
})
test('returning from Wiki to documents loads its original content once and preserves later filter refresh', async () => {
  const app = setup('wiki')
  try {
    await app.loadKnowledgeBaseInfo('course-kb'); await settle(); app.activeKbTab.value = 'documents'; await settle()
    assert.deepEqual(app.calls, ['documents:course-kb', 'folders:course-kb', 'tags:course-kb'])
    app.selectedTagIds.value = ['tag-1']; await settle()
    assert.equal(app.calls.filter(x => x.startsWith('documents:')).length, 2)
  } finally { app.stop() }
})
test('changing libraries with a selected tag does not request the new list before its metadata or twice', async () => {
  const app = setup()
  try {
    await app.loadKnowledgeBaseInfo('course-kb'); await settle(); app.selectedTagIds.value = ['tag-1']; await settle(); app.calls.length = 0
    app.kbId.value = 'second-kb'; await app.loadKnowledgeBaseInfo('second-kb'); await settle()
    assert.deepEqual(app.calls.filter(x => x.startsWith('documents:')), ['documents:second-kb'])
  } finally { app.stop() }
})
test('a non-Wiki library retains its document fallback for a stale Wiki URL', async () => {
  const app = setup('wiki', false)
  try { await app.loadKnowledgeBaseInfo('course-kb'); await settle(); assert.equal(app.calls.filter(x => x.startsWith('documents:')).length, 1) }
  finally { app.stop() }
})
