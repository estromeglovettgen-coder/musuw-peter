import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInThisContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { createPinia } = require('pinia')
const { computed, nextTick, ref, watch } = require('vue')
const QUICK = 'builtin-quick-answer', SMART = 'builtin-smart-reasoning'
const cache = new Map()
function loadModule(name) {
  if (name === '@/api/agent') return { BUILTIN_QUICK_ANSWER_ID: QUICK, BUILTIN_SMART_REASONING_ID: SMART }
  if (name === '@/utils/api-base') return { getApiBaseUrl: () => '/api/v1' }
  if (!name.startsWith('@/')) return require(name)
  if (cache.has(name)) return cache.get(name)
  const source = readFileSync(new URL(`../${name.slice(2)}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  const exports = {}
  cache.set(name, exports)
  runInThisContext(`(function(exports, require) {${outputText}\n})`)(exports, loadModule)
  return exports
}
const { useSettingsStore } = loadModule('@/stores/settings')
const source = readFileSync(new URL('../assets/business-baselines/Input-field.pre-view.vue', import.meta.url), 'utf8')
const actualBlock = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a)
  assert.ok(a >= 0 && b > a, `actual controller block missing: ${start}`)
  return source.slice(a, b)
}
// Execute the real controller actions, real Vue KB watcher and real Pinia store.
// Only the API/catalog and DOM/message boundaries are supplied by this fixture.
const actions = actualBlock('const usesPeterNewChatDefault =', '// 对话下拉中展示')
const kbWatcher = actualBlock('// 当智能体改变时', '// 共享智能体时预取')
const send = actualBlock('let peterNewChatSubmitPending =', '// 选择智能体（新版）')
const { outputText } = ts.transpileModule(actions + '\n' + kbWatcher + '\n' + send, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const makeAgent = (id, name, builtin = false) => ({ id, name, is_builtin: builtin,
  config: { agent_mode: 'smart-reasoning', kb_selection_mode: 'selected', knowledge_bases: [`kb-${id}`], model_id: 'deepseek-flash' } })
const catalog = [makeAgent(SMART, '智能推理', true), makeAgent(QUICK, '快速问答', true), makeAgent('local-taylor', '泰勒'), makeAgent('my-writer', '写作助手')]
const gate = () => { let release; const pending = new Promise(resolve => { release = resolve }); return { pending, release } }

function setup({ peter = true, routeName = 'globalCreatChat', initial = SMART, list = catalog, disabled = [], delay, fail = false } = {}) {
  const storage = new Map()
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  const store = useSettingsStore(createPinia())
  store.selectAgent(initial)
  const agents = ref([]), disabledIds = ref(disabled), route = { name: routeName, query: {} }
  const messages = [], emitted = []
  let inflight
  const chatResources = { rawKnowledgeBases: [], isFresh: () => true, ensureAgents: () => inflight ||= (async () => {
    if (delay) await delay.pending
    if (fail) throw new Error('catalog unavailable')
    agents.value = list
  })() }
  const selectedAgentId = computed(() => store.selectedAgentId)
  const selectedAgent = computed(() => agents.value.find(agent => agent.id === store.selectedAgentId) || makeAgent(SMART, '智能推理', true))
  const scope = {
    isPeterWorkspace: peter, route, settingsStore: store, chatResources, agents, disabledOwnAgentIds: disabledIds,
    props: { embeddedMode: false, isReplying: false }, watch, nextTick,
    selectedAgentId, selectedAgent,
    agentKnowledgeBases: computed(() => selectedAgent.value.config.knowledge_bases),
    agentKBSelectionMode: computed(() => selectedAgent.value.config.kb_selection_mode),
    showMention: ref(false), uploadedImages: ref([]), uploadedAttachments: ref([]),
    isImageUploadEnabledByAgent: ref(true), marketplaceEntryPending: ref(false), marketplaceChat: {},
    selectedModelId: ref('deepseek-flash'), thinkingEnabled: ref(true), reasoningEffort: ref(''),
    allSelectedItems: computed(() => store.settings.selectedKnowledgeBases.map(id => ({ id, name: id, type: 'kb' }))),
    sceneManagedByConsumerResolver: ref(false), effectiveConsumerScene: ref('chat'),
    BUILTIN_QUICK_ANSWER_ID: QUICK, BUILTIN_SMART_REASONING_ID: SMART,
    MessagePlugin: Object.fromEntries(['info', 'warning', 'error'].map(key => [key, value => messages.push([key, value])])),
    t: value => value, getTextareaEl: () => null, clearvalue() {}, attachmentUploadRef: ref(null),
    loadChatModels: async () => {}, collectAgentNotReadyReasons: () => ({ keys: [], labels: [] }),
    showAgentNotReadyMessage() { throw new Error('unexpected readiness error') },
    emit: (...args) => emitted.push({ args, agent: store.getSelectedAgentId(), kbs: [...store.settings.selectedKnowledgeBases] }),
  }
  const controller = runInThisContext(`(function(${Object.keys(scope).join(',')}) {${outputText}\nreturn {loadAgents, createSession};})`)(...Object.values(scope))
  return { ...controller, store, storage, agents, route, scope, messages, emitted }
}

for (const initial of [SMART, QUICK]) test(`global new chat migrates saved ${initial} to the enabled custom Taylor and native KB scope`, async () => {
  const f = setup({ initial })
  await f.loadAgents()
  await nextTick()
  assert.equal(f.store.getSelectedAgentId(), 'local-taylor')
  assert.equal(f.store.isAgentEnabled, true)
  assert.deepEqual(f.store.settings.selectedKnowledgeBases, ['kb-local-taylor'])
  assert.equal(JSON.parse(f.storage.get('Musuw_settings')).selectedAgentId, 'local-taylor')
  const reloaded = useSettingsStore(createPinia())
  assert.equal(reloaded.getSelectedAgentId(), 'local-taylor')
})

test('explicit custom agent selections remain selected including choices made while the catalog is loading', async () => {
  const delay = gate(), f = setup({ delay })
  const loading = f.loadAgents()
  f.store.selectAgent('my-writer')
  delay.release()
  await loading
  assert.equal(f.store.getSelectedAgentId(), 'my-writer')
})

test('existing session restoration and another profile keep their original agent and KB selection', async () => {
  for (const options of [{ routeName: 'globalChat' }, { peter: false }]) {
    const f = setup(options)
    f.store.selectKnowledgeBases(['existing-kb'])
    await f.loadAgents()
    assert.equal(f.store.getSelectedAgentId(), SMART)
    assert.deepEqual(f.store.settings.selectedKnowledgeBases, ['existing-kb'])
  }
  const f = setup()
  f.store.snapshotAsDefaultsIfNeeded()
  f.store.applyLastRequestState({ agent_id: QUICK, knowledge_base_ids: ['historic-kb'] })
  await nextTick()
  await f.loadAgents()
  assert.equal(f.store.getSelectedAgentId(), QUICK)
})

test('a late catalog response cannot change an existing session after navigation', async () => {
  const delay = gate(), f = setup({ delay })
  const loading = f.loadAgents()
  f.route.name = 'globalChat'
  f.store.selectKnowledgeBases(['historic-kb'])
  delay.release()
  await loading
  assert.equal(f.store.getSelectedAgentId(), SMART)
  assert.deepEqual(f.store.settings.selectedKnowledgeBases, ['historic-kb'])
})

test('disabled or missing Taylor is never silently used as the global default', async () => {
  for (const options of [{ disabled: ['local-taylor'] }, { list: catalog.filter(agent => agent.name !== '泰勒') }]) {
    const f = setup(options)
    assert.equal(await f.loadAgents(), false)
    assert.notEqual(f.store.getSelectedAgentId(), 'local-taylor')
  }
})

test('a fast first send waits for the native catalog and emits using real Taylor selection and KBs', async () => {
  const delay = gate(), f = setup({ delay })
  const sending = f.createSession('我该怎么开始聊天？')
  await Promise.resolve()
  assert.deepEqual(f.emitted, [])
  delay.release()
  await sending
  assert.equal(f.emitted.length, 1)
  assert.equal(f.emitted[0].agent, 'local-taylor')
  assert.deepEqual(f.emitted[0].kbs, ['kb-local-taylor'])
})

test('a catalog failure is visible and cannot submit the builtin as Taylor', async () => {
  const f = setup({ fail: true })
  await f.createSession('帮我看看怎么回复')
  assert.deepEqual(f.emitted, [])
  assert.ok(f.messages.some(([kind]) => kind === 'error'))
})

test('two submissions awaiting the same catalog emit only one request', async () => {
  const delay = gate(), f = setup({ delay })
  const first = f.createSession('同一个问题')
  const second = f.createSession('同一个问题')
  delay.release()
  await Promise.all([first, second])
  assert.equal(f.emitted.length, 1)
})

test('the submission guard releases after failure so a corrected catalog can be retried', async () => {
  const f = setup({ fail: true })
  await f.createSession('第一次失败')
  f.scope.chatResources.ensureAgents = async () => { f.agents.value = catalog }
  await f.createSession('重试成功')
  assert.equal(f.emitted.length, 1)
  assert.equal(f.emitted[0].agent, 'local-taylor')
})

test('a disabled existing custom agent is not ready when there is no enabled fallback', async () => {
  const f = setup({ initial: 'my-writer', disabled: catalog.map(agent => agent.id) })
  await f.createSession('不能发给停用的智能体')
  assert.deepEqual(f.emitted, [])
  assert.ok(f.messages.some(([kind]) => kind === 'error'))
})

test('embedded and historical restoration loads do not demand a Taylor default', async () => {
  const f = setup({ list: catalog.filter(agent => agent.name !== '泰勒') })
  f.scope.props.embeddedMode = true
  assert.equal(await f.loadAgents(), true)
  assert.equal(f.store.getSelectedAgentId(), SMART)
  f.scope.props.embeddedMode = false
  f.store.snapshotAsDefaultsIfNeeded()
  f.store.applyLastRequestState({ agent_id: QUICK })
  await nextTick()
  assert.equal(await f.loadAgents(), true)
  assert.equal(f.store.getSelectedAgentId(), QUICK)
})

test('leaving new chat while its first send waits cannot submit into the next conversation', async () => {
  const delay = gate(), f = setup({ delay })
  const sending = f.createSession('这个问题只属于新对话')
  f.route.name = 'globalChat'
  delay.release()
  await sending
  assert.deepEqual(f.emitted, [])
})

test('identity reset resolves the current account Taylor without retaining another account id', async () => {
  const f = setup({ list: [makeAgent(SMART, '智能推理', true), makeAgent('account-two-taylor', '泰勒')] })
  f.store.selectAgent('account-one-taylor')
  f.store.resetForIdentityBoundary()
  await f.loadAgents()
  assert.equal(f.store.getSelectedAgentId(), 'account-two-taylor')
})
