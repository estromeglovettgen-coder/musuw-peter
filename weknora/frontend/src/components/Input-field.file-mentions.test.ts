import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue'

const { descriptor } = parse(readFileSync(new URL('../assets/business-baselines/Input-field.pre-view.vue', import.meta.url), 'utf8'))
const source = ts.createSourceFile('composer.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true)
const declarations = new Set(['selectedFiles', 'loadFiles', 'onMentionSelect'])
const blocks = source.statements.filter(statement => {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.some(declaration => declarations.has(declaration.name.getText(source)))
  }
  return ts.isExpressionStatement(statement) && statement.getText(source).startsWith('watch(')
    && statement.getText(source).includes('loadFiles();')
})
assert.equal(blocks.length, 4, 'execute the real selection, cache, loader and watcher declarations')
const javascript = ts.transpileModule(blocks.map(block => block.getText(source)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

function setup(batch: (...args: any[]) => Promise<any>, selected: string[] = [], kbMap: Record<string, string> = {}) {
  const settingsStore = {
    settings: reactive({ selectedFiles: selected, selectedFileKbMap: kbMap }),
    selectedAgentId: 'peter', selectedAgentSourceTenantId: null,
    addFile(id: string) { if (!this.settings.selectedFiles.includes(id)) this.settings.selectedFiles.push(id) },
    setFileKbMap(updates: Record<string, string>) { Object.assign(this.settings.selectedFileKbMap, updates) },
  }
  const fileList = ref<Array<{ id: string; name: string }>>([])
  const fileLoadStates = ref<Record<string, string>>({})
  const scope = effectScope()
  const dependencies = {
    computed, watch, nextTick, fileList, fileLoadStates,
    selectedFileIds: computed(() => settingsStore.settings.selectedFiles),
    settingsStore, fileIdToKbId: ref({}), batchQueryKnowledge: batch,
    t: (key: string) => key,
    getTextareaEl: () => null, showMention: ref(true),
    console: { error() {} }, URLSearchParams,
  }
  const run = new Function(...Object.keys(dependencies), `${javascript}\nreturn { selectedFiles, loadFiles, onMentionSelect };`)
  const state = scope.run(() => run(...Object.values(dependencies)))
  return { state, settingsStore, fileList, fileLoadStates, stop: () => scope.stop() }
}

const settle = async () => { await nextTick(); await Promise.resolve(); await nextTick() }

test('restored file selection loads its title using persisted KB scope before mount', async () => {
  const calls: any[][] = []
  const app = setup(async (...args) => { calls.push(args); return { success: true, data: [{ id: 'old-file', title: '客户成交聊天记录' }] } }, ['old-file'], { 'old-file': 'customer-kb' })
  await settle()
  assert.equal(app.state.selectedFiles.value[0].name, '客户成交聊天记录')
  assert.deepEqual(calls[0], ['ids=old-file', 'customer-kb', undefined, undefined])
  app.stop()
})

test('file selection keeps the menu title immediately without requesting it again', async () => {
  let calls = 0
  const app = setup(async () => { calls++; return { success: true, data: [] } })
  app.state.onMentionSelect({ id: 'new-file', type: 'file', name: 'Peter 的销售记录', kbId: 'sales-kb' })
  assert.equal(app.state.selectedFiles.value[0].name, 'Peter 的销售记录')
  await settle()
  assert.equal(calls, 0)
  assert.equal(app.settingsStore.settings.selectedFileKbMap['new-file'], 'sales-kb')
  app.stop()
})

test('native empty batches and deleted or inaccessible files end loading without removing the selection', async () => {
  for (const result of [null, [], { status: 404 }, { status: 403 }]) {
    const app = setup(async () => {
      if (result && !Array.isArray(result)) throw result
      return { success: true, data: result }
    }, ['missing'])
    await settle()
    assert.equal(app.state.selectedFiles.value[0].name, 'agent.artifactDrawer.inlineMissing')
    assert.deepEqual(app.settingsStore.settings.selectedFiles, ['missing'])
    app.stop()
  }
})

test('selection-array pushes trigger loading and one failed scope does not hide another title', async () => {
  const app = setup(async (_query, kbId) => {
    if (kbId === 'gone-kb') throw { status: 404 }
    return { success: true, data: [{ id: 'valid-file', file_name: '销售跟进.md' }] }
  }, [], { missing: 'gone-kb', 'valid-file': 'valid-kb' })
  app.settingsStore.settings.selectedFiles.push('missing', 'valid-file')
  await settle()
  assert.deepEqual(app.state.selectedFiles.value.map((file: any) => file.name), ['agent.artifactDrawer.inlineMissing', '销售跟进.md'])
  app.stop()
})

test('network failure shows a finished error and reselecting the menu item recovers its title', async () => {
  const app = setup(async () => { throw { status: 502 } }, ['failed-file'])
  await settle()
  assert.equal(app.state.selectedFiles.value[0].name, 'chat.citation.loadFailed')
  app.state.onMentionSelect({ id: 'failed-file', type: 'file', name: '恢复的记录', kbId: 'sales-kb' })
  assert.equal(app.state.selectedFiles.value[0].name, '恢复的记录')
  assert.equal(app.fileLoadStates.value['failed-file'], undefined)
  app.stop()
})
