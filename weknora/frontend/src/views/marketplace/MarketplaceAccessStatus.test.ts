import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'

const source = readFileSync(new URL('./MarketplaceAccessStatus.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source, { filename: 'MarketplaceAccessStatus.vue' })
const compiled = compileScript(descriptor, { id: 'marketplace-access-status-test', inlineTemplate: true })
const javascript = ts.transpileModule(compiled.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function renderStatus(props: { canUse: boolean; status: string; paidThrough?: string; cancelAtPeriodEnd?: boolean }) {
  const module = { exports: {} as any }
  const modules: Record<string, unknown> = {
    vue: { ...vue, resolveComponent: (name: string) => name },
    'vue-i18n': { useI18n: () => ({
      locale: vue.ref('en-US'),
      t: (key: string, values?: { date: string }) => values?.date ? `${key}: ${values.date}` : key,
    }) },
  }
  new Function('require', 'module', 'exports', javascript)((name: string) => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency: ${name}`)
    return modules[name]
  }, module, module.exports)
  const render = module.exports.default.setup(vue.reactive(props), { expose() {} })
  const text: string[] = []
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.children === 'string') text.push(node.children)
    if (Array.isArray(node.children)) node.children.forEach(visit)
  }
  visit(render({}, []))
  return text.join(' ')
}

test('accessible subscription with renewal canceled keeps its scheduled end date', () => {
  const text = renderStatus({ canUse: true, status: 'canceled', paidThrough: '2099-07-15T12:00:00Z', cancelAtPeriodEnd: true })
  assert.match(text, /^creatorMarketplace\.cancelScheduled:/)
  assert.match(text, /2099/)
  assert.doesNotMatch(text, /status\.expired|status\.canceled/)
})

test('refunded access stays refunded even when its original paid-through date is in the future', () => {
  const text = renderStatus({ canUse: false, status: 'refunded', paidThrough: '2099-07-15T12:00:00Z' })
  assert.match(text, /^creatorMarketplace\.status\.refunded/)
  assert.match(text, /2099/)
  assert.doesNotMatch(text, /status\.active|availableUntil|cancelScheduled/)
})

test('denied active subscription with a past paid-through date is presented as expired', () => {
  const text = renderStatus({ canUse: false, status: 'active', paidThrough: '2000-07-15T12:00:00Z' })
  assert.match(text, /^creatorMarketplace\.status\.expired/)
  assert.match(text, /2000/)
  assert.doesNotMatch(text, /status\.active|availableUntil|cancelScheduled/)
})

test('invalid paid-through dates do not produce Invalid Date or an availability promise', () => {
  const text = renderStatus({ canUse: true, status: 'active', paidThrough: 'not-a-date' })
  assert.equal(text, 'creatorMarketplace.status.active')
  assert.doesNotMatch(text, /Invalid Date|availableUntil/)
})

test('accessible active subscription presents its future availability date', () => {
  const text = renderStatus({ canUse: true, status: 'active', paidThrough: '2099-07-15T12:00:00Z' })
  assert.match(text, /^creatorMarketplace\.availableUntil:/)
  assert.match(text, /2099/)
  assert.doesNotMatch(text, /status\.expired|cancelScheduled/)
})
