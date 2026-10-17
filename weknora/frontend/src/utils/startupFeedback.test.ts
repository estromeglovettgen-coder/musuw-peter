import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes("var startup = document.getElementById('musuw-startup')"))!
function boot(online = true, locale = 'zh-CN') {
  const listeners: Record<string, (event?: any) => void> = {}, timers: Array<() => void> = []
  let reloads = 0
  const startup = { isConnected: true, lang: '', dataset: {} as Record<string, string>, setAttribute() {} }
  const status = { textContent: '' }
  const retry = { hidden: true, textContent: '', addEventListener: (name: string, fn: () => void) => { listeners['retry.' + name] = fn } }
  const navigator = { onLine: online, languages: [locale] }
  runInNewContext(script, {
    document: { getElementById: (id: string) => ({ 'musuw-startup': startup, 'musuw-startup-status': status, 'musuw-startup-retry': retry }[id]), cookie: '' },
    localStorage: { getItem: () => locale }, navigator,
    location: { reload: () => reloads++ },
    window: { addEventListener: (name: string, fn: (event?: any) => void) => { listeners[name] = fn } },
    setTimeout: (fn: () => void) => timers.push(fn), clearTimeout() {},
  })
  return { startup, status, retry, listeners, timers, navigator, reloads: () => reloads }
}

test('an offline startup explains the connection state and offers explicit recovery', () => {
  const state = boot(false)
  assert.match(state.status.textContent, /网络已断开/)
  assert.equal(state.retry.hidden, false)
  assert.equal(state.reloads(), 0)
  state.navigator.onLine = true
  state.listeners.online()
  assert.match(state.status.textContent, /正在打开/)
  assert.equal(state.retry.hidden, true)
})

test('a slow download remains loading and never retries automatically', () => {
  const state = boot()
  state.timers[0]()
  assert.match(state.status.textContent, /仍在加载/)
  assert.doesNotMatch(state.status.textContent, /失败|错误/)
  assert.equal(state.reloads(), 0)
})

test('a real module failure stays recoverable after the network comes back', () => {
  const state = boot(false)
  state.listeners.error({ type: 'error', target: { tagName: 'SCRIPT' } })
  state.navigator.onLine = true
  state.listeners.online()
  assert.match(state.status.textContent, /未能加载/)
  assert.equal(state.retry.hidden, false)
  state.listeners['retry.click']()
  assert.equal(state.reloads(), 1)
})

test('a failed image does not turn startup into an application error', () => {
  const state = boot(true, 'en-US')
  state.listeners.error({ type: 'error', target: { tagName: 'IMG' } })
  assert.equal(state.status.textContent, 'Opening Musuw…')
  assert.equal(state.retry.hidden, true)
  state.startup.isConnected = false
  state.timers[0]()
  assert.equal(state.status.textContent, 'Opening Musuw…')
})
