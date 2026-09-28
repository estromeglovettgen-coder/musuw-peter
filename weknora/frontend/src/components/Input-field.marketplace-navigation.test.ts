import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'

const { descriptor } = parse(readFileSync(new URL('./Input-field.vue', import.meta.url), 'utf8'))
const javascript = ts.transpileModule(descriptor.script!.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function setup({ history = true, product = 'taylor', lite = true } = {}) {
  const calls: unknown[][] = []
  const route = vue.reactive({ name: history ? 'chat' : 'globalCreatChat', path: history ? '/platform/chat/old' : '/platform/creatChat', query: {} as any })
  const settingsStore = { settings: { marketplaceProductId: product }, selectedAgentId: 'taylor-agent', selectedAgentSourceTenantId: null }
  const menuStore = { newChatDraft: 'older home draft' }
  const query = vue.ref('unsent question')
  const router = {
    async push(target: any) {
      calls.push(['navigate', target]); route.name = 'globalCreatChat'; route.path = '/platform/creatChat'; route.query = target.query || {}
      // Native ChatIndex restores defaults as the historical route is left.
      settingsStore.settings.marketplaceProductId = ''
    },
    async replace(target: any) { calls.push(['replace', target]); route.query = target.query || {} },
  }
  const legacyState = {
    query, settingsStore, menuStore, selectedAgentId: vue.ref('taylor-agent'), modelsLoading: vue.ref(false),
    handleSelectAgent: async (agent: any) => { calls.push(['native', route.name, settingsStore.settings.marketplaceProductId, agent.id]) },
    closeModelSelector() {}, toggleModelSelector() {},
    handleModelChange: (id: string) => calls.push(['model', id]),
    selectReasoningEffort: (effort: string) => calls.push(['reasoning', effort]),
  }
  const module = { exports: {} as any }
  const modules: Record<string, unknown> = {
    vue,
    'vue-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    'vue-router': { useRoute: () => route, useRouter: () => router },
    '@/assets/business-baselines/Input-field.pre-view.vue': { setup: () => legacyState },
    './AttachmentUpload.vue': {}, './KnowledgeBaseSelector.vue': {}, './MentionSelector.vue': {}, './ModelSelector.vue': {},
    '@/stores/auth': { useAuthStore: () => ({ isLiteMode: lite }) },
    '@/stores/organization': { useOrganizationStore: () => ({ sharedAgents: [] }) },
    '@/api/agent': { BUILTIN_QUICK_ANSWER_ID: 'quick', BUILTIN_SMART_REASONING_ID: 'smart' },
    '@/composables/useMarketplaceLibrary': { useMarketplaceLibrary: () => ({ entries: vue.ref([{ product_id: 'taylor', can_chat: true }, { product_id: 'writing', can_chat: true }, { product_id: 'expired', can_chat: false }]), load: async () => {} }) },
  }
  new Function('require', 'module', 'exports', javascript)((name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`)
    return modules[name]
  }, module, module.exports)
  const state = module.exports.default.setup({}, { expose() {}, emit() {} })
  return { state, calls, query, menuStore, route }
}

test('changing a historical service uses the existing authorized new-chat entry and preserves draft', async () => {
  const app = setup()
  await app.state.selectMarketplaceAgentFromPicker('writing')
  assert.deepEqual(app.calls, [['navigate', { path: '/platform/creatChat', query: { marketplace_product: 'writing' } }]])
  assert.equal(app.menuStore.newChatDraft, 'unsent question')
  assert.equal(app.query.value, 'unsent question')
})

test('owned selection leaves the old session before applying its native agent context', async () => {
  const app = setup()
  await app.state.selectAgentFromPicker({ id: 'own-agent' })
  assert.deepEqual(app.calls, [['navigate', { path: '/platform/creatChat' }], ['native', 'globalCreatChat', '', 'own-agent']])
  assert.equal(app.menuStore.newChatDraft, 'unsent question')
})

test('the same subscription and model/reasoning changes remain inside the current conversation', async () => {
  const app = setup()
  await app.state.selectMarketplaceAgentFromPicker('taylor')
  app.state.selectModelFromPicker('allowed')
  app.state.selectReasoningFromPicker('high')
  assert.deepEqual(app.calls, [['model', 'allowed'], ['reasoning', 'high']])
  assert.equal(app.menuStore.newChatDraft, 'older home draft')
})

test('an unavailable subscription cannot be selected and native selection cancels a pending market entry', async () => {
  const app = setup({ history: false })
  await app.state.selectMarketplaceAgentFromPicker('expired')
  assert.deepEqual(app.calls, [])
  app.route.query = { marketplace_product: 'writing', keep: 'value' }
  await app.state.selectAgentFromPicker({ id: 'own-agent' })
  assert.deepEqual(app.calls, [['replace', { path: '/platform/creatChat', query: { keep: 'value' } }], ['native', 'globalCreatChat', 'taylor', 'own-agent']])
  assert.equal(app.query.value, 'unsent question')
})

test('Standard native agent switching retains its existing in-session navigation behavior', async () => {
  const app = setup({ lite: false, product: '' })
  await app.state.selectAgentFromPicker({ id: 'shared-agent' }, '77')
  assert.deepEqual(app.calls, [['native', 'chat', '', 'shared-agent']])
  assert.equal(app.menuStore.newChatDraft, 'older home draft')
})

test('Lite owned-to-owned switching preserves the native conversation and draft', async () => {
  const app = setup({ lite: true, product: '' })
  await app.state.selectAgentFromPicker({ id: 'other-owned-agent' })
  assert.deepEqual(app.calls, [['native', 'chat', '', 'other-owned-agent']])
  assert.equal(app.query.value, 'unsent question')
})
