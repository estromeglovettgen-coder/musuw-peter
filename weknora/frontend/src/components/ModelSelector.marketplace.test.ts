import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'

const { descriptor } = parse(readFileSync(new URL('./ModelSelector.vue', import.meta.url), 'utf8'), { filename: 'ModelSelector.vue' })
const javascript = ts.transpileModule(compileScript(descriptor, { id: 'marketplace-model-selector-test' }).content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function setup() {
  const module = { exports: {} as any }
  const modules: Record<string, unknown> = {
    vue: { ...vue, onMounted() {}, onUnmounted() {} },
    '@/api/model': { listModels() { throw new Error('Chat selector must not fetch models') } },
    'tdesign-vue-next': { MessagePlugin: {} },
    'vue-i18n': { useI18n: () => ({ t: (key: string) => key }) },
    './modelSelectorFilter': { filterModelsByType: (models: unknown[]) => models },
    '@/stores/auth': { useAuthStore: () => ({ isLiteMode: true }) },
    '@/hooks/useConsumerUpgradePrompt': { useConsumerUpgradePrompt: () => ({ showConsumerUpgradePrompt() {} }) },
    '@/api/agent': { BUILTIN_QUICK_ANSWER_ID: 'quick', BUILTIN_SMART_REASONING_ID: 'smart' },
  }
  new Function('require', 'module', 'exports', javascript)((name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`)
    return modules[name]
  }, module, module.exports)
  const component = module.exports.default
  const defaults = Object.fromEntries(Object.entries(component.props).map(([key, value]: [string, any]) => [key, typeof value.default === 'function' ? value.default() : value.default]))
  const props = vue.reactive({ ...defaults, mode: 'chat', agents: [{ id: 'same-agent', name: 'Owned', config: {} }],
    selectedAgentId: 'same-agent', selectedMarketplaceProductId: 'taylor',
    subscribedAgents: [
      { product_id: 'taylor', agent_id: 'same-agent', agent_name: 'Taylor', product_title: 'Taylor service', can_chat: true },
      { product_id: 'taylor', agent_id: 'same-agent', agent_name: 'Taylor', product_title: 'Taylor service', can_chat: true },
      { product_id: 'expired', agent_id: 'expired-agent', product_title: 'Expired', can_chat: false },
    ],
  })
  const events: unknown[][] = []
  const scope = vue.effectScope()
  const state = scope.run(() => component.setup(props, { expose() {}, emit: (...event: unknown[]) => events.push(event) }))
  return { props, state, events, stop: () => scope.stop() }
}

test('chat picker includes each usable subscription once and hides inactive subscriptions', () => {
  const app = setup()
  try {
    assert.deepEqual(app.state.chatAgentOptions.value.map((option: any) => option.agent.name), ['Owned', 'Taylor'])
    const subscribed = app.state.chatAgentOptions.value[1]
    app.state.selectChatAgent(subscribed)
    assert.deepEqual(app.events, [['select-marketplace-agent', 'taylor']])
  } finally { app.stop() }
})

test('product scope distinguishes a subscribed agent from an owned agent with the same id', () => {
  const app = setup()
  try {
    const own = app.state.chatAgentOptions.value[0]
    assert.equal(app.state.isAgentOptionSelected(own), false)
    const subscribed = app.state.chatAgentOptions.value[1]
    assert.equal(app.state.isAgentOptionSelected(subscribed), true)
    app.props.selectedMarketplaceProductId = ''
    assert.equal(app.state.isAgentOptionSelected(own), true)
    assert.equal(app.state.isAgentOptionSelected(subscribed), false)
    app.state.selectChatAgent(own)
    assert.deepEqual(app.events, [['select-agent', own.agent, undefined]])
  } finally { app.stop() }
})
