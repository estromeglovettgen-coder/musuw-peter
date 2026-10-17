import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = ts.createSourceFile('router.ts', readFileSync(new URL('./index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const statement = source.statements.find(item => ts.isExpressionStatement(item) && item.getText(source).startsWith('router.beforeEach('))!
const javascript = ts.transpileModule(statement.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve() }

function setup({ loggedIn = true, capability = true, liteAllowed = true, hasTenant = true, restoreSuccess = true, selectedTenantId = null as number | null } = {}) {
  const events: string[] = [], decisions: any[] = []
  const edition = deferred(), capabilities = deferred(), identity = deferred()
  const auth = { isLoggedIn: loggedIn, hasValidTenant: hasTenant, isSystemAdmin: true, isLiteMode: false, selectedTenantId }
  let guard!: (...args: any[]) => Promise<any>
  const dependencies = {
    AUTHENTICATED_HOME_PATH: '/platform/creatChat',
    router: { beforeEach(callback: typeof guard) { guard = callback } },
    workspaceRouteRedirect: () => null, useAuthStore: () => auth,
    hasOIDCErrorCallback: () => false, hasPendingOIDCCallback: () => false,
    window: { location: { hash: '', replace() {} } },
    ensureProductEdition: async () => { events.push('edition:start'); await edition.promise; auth.isLiteMode = true; auth.selectedTenantId = null; events.push('edition:done') },
    useDeploymentCapabilitiesStore: () => ({
      ensureLoaded: async () => { events.push('capabilities:start'); await capabilities.promise; events.push('capabilities:done') },
      isSupported: () => { events.push('capability:check'); return capability },
    }),
    hydrateSessionFromToken: async () => { events.push('identity:start'); await identity.promise; auth.isLoggedIn = restoreSuccess; events.push('identity:done'); return restoreSuccess },
    isLiteEdition: () => auth.isLiteMode, isAllowedLitePath: () => liteAllowed,
    handoffToExternalAuth: () => events.push('auth:handoff'),
    MessagePlugin: { warning() { events.push('capability:warning') } },
    i18n: { global: { t: (value: string) => value } },
  }
  new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies))
  const run = (meta: any = {}) => guard({ path: '/platform/agents', fullPath: '/platform/agents', query: {}, meta: { requiresAuth: true, ...meta } }, {}, (decision: any) => { decisions.push(decision); events.push('route:next') })
  return { run, events, decisions, edition, capabilities, identity }
}

for (const first of ['edition', 'capabilities'] as const) {
  test(`authenticated routing starts deployment probes together and waits for both (${first} finishes first)`, async () => {
    const app = setup()
    const pending = app.run()
    await settle()
    assert.deepEqual(app.events, ['edition:start', 'capabilities:start'])
    app[first].resolve()
    await settle()
    assert.deepEqual(app.decisions, [])
    app[first === 'edition' ? 'capabilities' : 'edition'].resolve()
    await pending
    assert.deepEqual(app.decisions, [undefined])
  })
}

test('deployment probes do not start until native identity restoration finishes', async () => {
  const app = setup({ loggedIn: false })
  const pending = app.run()
  await settle()
  assert.deepEqual(app.events, ['identity:start'])
  app.identity.resolve()
  await settle()
  assert.deepEqual(app.events, ['identity:start', 'identity:done', 'edition:start', 'capabilities:start'])
  app.edition.resolve(); app.capabilities.resolve()
  await pending
  assert.deepEqual(app.decisions, ['/platform/agents'])
})

test('the existing capability denial still runs after both deployment probes complete', async () => {
  const app = setup({ capability: false })
  const pending = app.run({ requiredCapability: 'agents' })
  app.capabilities.resolve()
  await settle()
  assert.equal(app.events.includes('capability:check'), false)
  assert.deepEqual(app.decisions, [])
  app.edition.resolve()
  await pending
  assert.deepEqual(app.decisions, ['/platform/knowledge-bases'])
  assert.ok(app.events.indexOf('capability:check') > app.events.indexOf('edition:done'))
  assert.ok(app.events.indexOf('capability:check') > app.events.indexOf('capabilities:done'))
})

test('the existing Lite path denial remains authoritative after parallel startup', async () => {
  const app = setup({ liteAllowed: false })
  const pending = app.run()
  app.edition.resolve(); app.capabilities.resolve()
  await pending
  assert.deepEqual(app.decisions, ['/platform/creatChat'])
})

test('a tenantless user reaches onboarding without probing tenant-protected capabilities', async () => {
  const app = setup({ hasTenant: false })
  const pending = app.run()
  await settle()
  assert.deepEqual(app.events, ['edition:start'])
  app.edition.resolve()
  await pending
  assert.deepEqual(app.decisions, ['/onboarding/workspace'])
})

test('a rejected identity restoration never starts deployment probes or opens the route', async () => {
  const app = setup({ loggedIn: false, restoreSuccess: false })
  const pending = app.run()
  app.identity.resolve()
  await pending
  assert.deepEqual(app.events, ['identity:start', 'identity:done', 'auth:handoff', 'route:next'])
  assert.deepEqual(app.decisions, [false])
})

test('a remembered tenant override is reconciled by Edition before requesting Lite capabilities', async () => {
  const app = setup({ selectedTenantId: 42 })
  const pending = app.run()
  await settle()
  assert.deepEqual(app.events, ['edition:start'])
  app.edition.resolve()
  await settle()
  assert.equal(app.events.includes('capabilities:start'), true)
  assert.ok(app.events.indexOf('capabilities:start') > app.events.indexOf('edition:done'))
  assert.deepEqual(app.decisions, [])
  app.capabilities.resolve()
  await pending
  assert.deepEqual(app.decisions, [undefined])
})
