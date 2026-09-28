import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('./sessionMutations.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function harness() {
  const clearCalls: string[] = []
  const removeCalls: string[] = []
  let clearResponse: () => Promise<any> = async () => ({ success: true })
  let removeResponse: () => Promise<any> = async () => ({ success: true })
  const modules = {
    '@/api/chat': {
      clearSessionMessages: async (id: string) => {
        clearCalls.push(id)
        return clearResponse()
      },
      delSession: async (id: string) => {
        removeCalls.push(id)
        return removeResponse()
      },
      pinSession: async () => ({ success: true }),
      unpinSession: async () => ({ success: true }),
      updateSession: async () => ({ success: true, data: {} }),
    },
  }
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', javascript)(
    (name: string) => modules[name as keyof typeof modules] || {},
    module,
    module.exports,
  )
  return {
    api: module.exports,
    clearCalls,
    removeCalls,
    clearWith(fn: () => Promise<any>) { clearResponse = fn },
    removeWith(fn: () => Promise<any>) { removeResponse = fn },
  }
}

test('same-session clear requests are serialized and a failed request unlocks retry', async () => {
  const h = harness()
  const first = deferred<{ success: boolean }>()
  h.clearWith(() => first.promise)

  const pending = h.api.clearSession('session-one')
  const duplicate = await h.api.clearSession('session-one')
  assert.equal(duplicate, false)
  assert.deepEqual(h.clearCalls, ['session-one'])

  first.reject(new Error('offline'))
  await assert.rejects(pending)

  h.clearWith(async () => ({ success: true }))
  assert.equal(await h.api.clearSession('session-one'), true)
  assert.deepEqual(h.clearCalls, ['session-one', 'session-one'])
})

test('same-session delete requests are serialized and a failed request unlocks retry', async () => {
  const h = harness()
  const first = deferred<{ success: boolean }>()
  h.removeWith(() => first.promise)

  const pending = h.api.removeSession('session-one')
  const duplicate = await h.api.removeSession('session-one')
  assert.equal(duplicate, false)
  assert.deepEqual(h.removeCalls, ['session-one'])

  first.reject(new Error('offline'))
  await assert.rejects(pending)

  h.removeWith(async () => ({ success: true }))
  assert.equal(await h.api.removeSession('session-one'), true)
  assert.deepEqual(h.removeCalls, ['session-one', 'session-one'])
})

test('a pending mutation for one session does not block another session', async () => {
  const h = harness()
  const first = deferred<{ success: boolean }>()
  h.removeWith((() => first.promise))

  const pending = h.api.removeSession('session-one')
  h.removeWith(async () => ({ success: true }))
  assert.equal(await h.api.removeSession('session-two'), true)
  assert.deepEqual(h.removeCalls, ['session-one', 'session-two'])

  first.resolve({ success: true })
  assert.equal(await pending, true)
})
