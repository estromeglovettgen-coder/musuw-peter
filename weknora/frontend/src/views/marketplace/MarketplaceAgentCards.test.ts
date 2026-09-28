import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import type { MarketplaceLibraryEntry } from '@/api/creator-marketplace'

const source = readFileSync(new URL('./MarketplaceAgentCards.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source, { filename: 'MarketplaceAgentCards.vue' })
const compiled = compileScript(descriptor, { id: 'marketplace-agent-cards-test', inlineTemplate: true })
const javascript = ts.transpileModule(compiled.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function entry(overrides: Partial<MarketplaceLibraryEntry> = {}): MarketplaceLibraryEntry {
  return {
    product_id: 'taylor-service', product_title: 'Taylor service', agent_id: 'public-agent',
    agent_name: 'Taylor companion', knowledge_base_id: 'first-kb', name: 'First reference',
    description: 'Public library description', wiki_enabled: true, can_read: true, can_chat: true,
    status: 'active', paid_through: '2027-01-01T00:00:00Z', cancel_at_period_end: false,
    ...overrides,
  }
}

function harness(entries: MarketplaceLibraryEntry[]) {
  const routes: unknown[] = []
  const events: string[] = []
  const module = { exports: {} as any }
  const modules: Record<string, unknown> = {
    vue: { ...vue, resolveComponent: (name: string) => name },
    'vue-router': { useRouter: () => ({ push: (target: unknown) => routes.push(target) }) },
    '@/components/AgentAvatar.vue': 'AgentAvatar',
    './MarketplaceAccessStatus.vue': 'MarketplaceAccessStatus',
  }
  new Function('require', 'module', 'exports', javascript)((name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`)
    return modules[name]
  }, module, module.exports)
  const props = vue.reactive({ entries, searchQuery: '', loading: false, failed: false })
  const render = module.exports.default.setup(props, { expose() {}, emit: (event: string) => events.push(event) })
  const nodes = () => {
    const result: vue.VNode[] = []
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return
      result.push(node)
      if (Array.isArray(node.children)) node.children.forEach(visit)
    }
    visit(render({ $t: (key: string) => key }, []))
    return result
  }
  const cards = () => nodes().filter(node => node.props?.role === 'button')
  return { props, routes, events, nodes, cards }
}

test('subscribed agents are deduplicated by service and search public agent/service names', () => {
  const app = harness([
    entry(), entry({ knowledge_base_id: 'second-kb', name: 'Second reference' }),
    entry({ product_id: 'other-service', product_title: 'Writing service', agent_name: '' }),
  ])
  assert.deepEqual(app.cards().map(card => card.props!['aria-label']), ['Taylor companion', 'Writing service'])
  assert.deepEqual(app.nodes().filter(node => node.props?.class === 'card-description').map(node => node.children), ['Taylor service', 'Public library description'])
  app.props.searchQuery = '  COMPANION '
  assert.deepEqual(app.cards().map(card => card.props!['aria-label']), ['Taylor companion'])
  app.props.searchQuery = 'writing'
  assert.deepEqual(app.cards().map(card => card.props!['aria-label']), ['Writing service'])
  app.props.searchQuery = 'Taylor service'
  assert.equal(app.cards().length, 1)
  app.props.searchQuery = 'private prompt'
  assert.equal(app.cards().length, 0)
  assert.equal(app.nodes().find(node => node.props?.role === 'status')!.children, 'chat.noSearchResults')
  assert.deepEqual(app.routes, [])
})

test('can_chat controls scoped navigation independently of Wiki access and later expiry is honored', () => {
  const app = harness([entry({ can_read: false })])
  assert.deepEqual(app.routes, [])
  app.cards()[0].props!.onClick()
  assert.deepEqual(app.routes, [{ path: '/platform/creatChat', query: { marketplace_product: 'taylor-service' } }])
  app.props.entries[0].can_chat = false
  app.props.entries[0].can_read = true
  app.props.entries[0].status = 'refunded'
  app.cards()[0].props!.onClick()
  assert.deepEqual(app.routes[1], { name: 'marketplaceProduct', params: { productId: 'taylor-service' } })
  const status = app.nodes().find(node => node.type === 'MarketplaceAccessStatus')!
  assert.equal(status.props!['can-use'], false)
  assert.equal(status.props!.status, 'refunded')
  assert.equal(status.props!['paid-through'], '2027-01-01T00:00:00Z')
})

test('subscription cards have no native editor controls or private agent fetch dependency', () => {
  const app = harness([entry()])
  assert.equal(app.nodes().filter(node => node.type === 'AgentAvatar').length, 0)
  assert.equal(app.nodes().filter(node => node.type === 'button' || node.type === 't-button').length, 0)
  assert.equal(app.cards().length, 1)
  assert.equal(app.cards()[0].props!.tabindex, '0')
  assert.equal(app.nodes().some(node => /more-wrap|favorite|edit|share/.test(String(node.props?.class))), false)
})

test('loading and failure do not expose stale cards; retry emits the shared loader action', () => {
  const app = harness([entry()])
  app.props.loading = true
  assert.equal(app.cards().length, 0)
  app.props.loading = false
  app.props.failed = true
  assert.equal(app.cards().length, 0)
  assert.ok(app.nodes().some(node => node.props?.role === 'alert'))
  assert.ok(app.nodes().some(node => node.children === 'creatorMarketplace.agentLibraryLoadFailed'))
  app.nodes().find(node => node.type === 't-button')!.props!.onClick()
  assert.deepEqual(app.events, ['retry'])
  app.props.failed = false
  app.props.entries = []
  assert.ok(app.nodes().some(node => node.props?.role === 'status'))
  assert.deepEqual(app.routes, [])
})
