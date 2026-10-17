import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import { ref } from 'vue'

// Exercise the component's actual open-chat path, including saved selection and
// existing conversations; the native API and router are the only boundaries.
const { descriptor } = parse(readFileSync(new URL('./CustomerProject.vue', import.meta.url), 'utf8'))
const source = ts.createSourceFile('CustomerProject.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true)
const declaration = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'chat')!
const javascript = ts.transpileModule(declaration.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText

function setup(agents: any[], selection = 'builtin-smart-reasoning', existing: any[] = [], disabled: string[] = []) {
  const selected: string[] = [], routed: string[] = [], created: string[] = []
  const settings = { selectedAgentId: selection, selectAgent(id: string) { selected.push(id); this.selectedAgentId = id } }
  const dependencies = {
    openingChat: ref(false), sessions: ref(existing), id: ref('current-target'), name: ref('小林'),
    useSettingsStore: () => settings,
    isBuiltinAgent: (id: string) => id.startsWith('builtin-'),
    listAgents: async () => ({ data: agents, disabled_own_agent_ids: disabled }),
    newCustomerSession: async (id: string) => { created.push(id); return { id: 'new-chat' } },
    router: { push: async (path: string) => { routed.push(path) } },
    MessagePlugin: { error(message: string) { throw new Error(message) } },
  }
  const chat = new Function(...Object.keys(dependencies), `${javascript}\nreturn chat`)(...Object.values(dependencies))
  return { chat, selected, routed, created }
}

test('a new target conversation prefers Taylor over the former sales preset', async () => {
  const app = setup([
    { id: 'sales', name: 'Peter 销售助手', is_builtin: false },
    { id: 'relationship', name: '关系分析', is_builtin: false },
    { id: 'taylor', name: '泰勒', is_builtin: false },
  ])
  await app.chat(true)
  assert.deepEqual(app.selected, ['taylor'])
  assert.deepEqual(app.created, ['current-target'])
  assert.deepEqual(app.routed, ['/platform/chat/new-chat'])
})

test('the relationship preset is available when Taylor is absent, with no sales fallback', async () => {
  const app = setup([{ id: 'relationship', name: '关系分析', is_builtin: false }])
  await app.chat(true)
  assert.deepEqual(app.selected, ['relationship'])
  const legacyOnly = setup([{ id: 'sales', name: 'Peter 销售助手', is_builtin: false }])
  await legacyOnly.chat(true)
  assert.deepEqual(legacyOnly.selected, [])
})

test('opening a target preserves an explicitly chosen custom agent', async () => {
  const app = setup([{ id: 'taylor', name: '泰勒', is_builtin: false }], 'my-agent')
  await app.chat(true)
  assert.deepEqual(app.selected, [])
  assert.deepEqual(app.created, ['current-target'])
})

test('new target conversations respect agents disabled by the workspace', async () => {
  const app = setup([
    { id: 'taylor', name: '泰勒', is_builtin: false },
    { id: 'relationship', name: '关系分析', is_builtin: false },
  ], 'builtin-smart-reasoning', [], ['taylor'])
  await app.chat(true)
  assert.deepEqual(app.selected, ['relationship'])
})

test('resuming a saved target conversation preserves its agent and session', async () => {
  const app = setup([{ id: 'taylor', name: '泰勒', is_builtin: false }], 'builtin-smart-reasoning', [{ id: 'saved-chat' }])
  await app.chat()
  assert.deepEqual(app.selected, [])
  assert.deepEqual(app.created, [])
  assert.deepEqual(app.routed, ['/platform/chat/saved-chat'])
})
