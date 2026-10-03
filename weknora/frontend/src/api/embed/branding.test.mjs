import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const apiSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const widgetSource = readFileSync(new URL('../../../public/musuw-widget.js', import.meta.url), 'utf8')

function loadEmbedApi(initialStorage = {}) {
  const values = new Map(Object.entries(initialStorage))
  const localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }
  const messages = []
  const listeners = new Map()
  const parent = { postMessage: (data, target) => messages.push({ data, target }) }
  const window = {
    parent,
    location: { origin: 'https://app.example', href: 'https://app.example/embed/ch-a', search: '', hash: '' },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  }
  const exports = {}
  const javascript = ts.transpileModule(apiSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(javascript, {
    exports,
    require: () => ({}),
    window,
    document: { referrer: 'https://host.example/page' },
    localStorage,
    URL,
    URLSearchParams,
    crypto: globalThis.crypto,
  })
  return { api: exports, values, messages, listeners, parent }
}

function loadWidget(scriptUrl, { autoInit = true } = {}) {
  const created = []
  const messages = []
  const listeners = new Map()
  const element = (tag) => {
    const attributes = new Map()
    const node = {
      tagName: tag,
      style: {},
      children: [],
      parentNode: null,
      setAttribute: (key, value) => attributes.set(key, value),
      getAttribute: (key) => attributes.get(key) ?? null,
      appendChild(child) { this.children.push(child); child.parentNode = this },
      removeChild(child) { this.children = this.children.filter((item) => item !== child) },
      addEventListener: () => {},
    }
    if (tag === 'iframe') {
      node.contentWindow = { postMessage: (data, target) => messages.push({ data, target }) }
    }
    created.push(node)
    return node
  }
  const script = { src: scriptUrl, getAttribute: (key) => autoInit ? ({ 'data-channel': 'ch-a', 'data-token': 'test-token' }[key] ?? null) : null }
  const document = { currentScript: script, createElement: element, head: element('head'), body: element('body') }
  const window = {
    location: { origin: 'https://host.example', href: 'https://host.example/page' },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  }
  runInNewContext(widgetSource, { window, document, URL, setTimeout, clearTimeout, console })
  return { window, document, script, created, messages, listeners }
}

test('per-channel visitor and signed session keys migrate once without mixing customers', () => {
  const { api, values } = loadEmbedApi({
    'weknora-embed-visitor:ch-a': 'visitor-a',
    'weknora-embed-visitor:ch-b': 'visitor-b',
    'weknora-embed-session:ch-a': '{"id":"session-a","sig":"signed"}',
    'weknora-embed-session:ch-b': '{"id":"session-b","sig":"signed"}',
  })
  assert.equal(api.getOrCreateEmbedVisitorId('ch-a'), 'visitor-a')
  assert.equal(values.get('musuw-embed-visitor:ch-a'), 'visitor-a')
  assert.equal(values.get('weknora-embed-visitor:ch-a'), undefined)
  assert.equal(values.get('weknora-embed-visitor:ch-b'), 'visitor-b')
  assert.equal(api.readEmbedStoredChatSession('ch-a'), '{"id":"session-a","sig":"signed"}')
  assert.equal(values.get('musuw-embed-session:ch-a'), '{"id":"session-a","sig":"signed"}')
  assert.equal(values.get('weknora-embed-session:ch-b'), '{"id":"session-b","sig":"signed"}')
  api.clearEmbedStoredChatSession('ch-a')
  assert.equal(values.has('musuw-embed-session:ch-a'), false)
  assert.equal(values.has('weknora-embed-session:ch-a'), false)
  assert.equal(values.has('weknora-embed-session:ch-b'), true)
})

test('embed accepts both host protocols only from its actual parent origin and replies once', () => {
  const { api, messages, listeners, parent } = loadEmbedApi()
  let accepted = 0
  api.onEmbedHostToken(() => { accepted += 1 })
  api.postEmbedBootstrapRequest('ch-a')
  assert.equal(messages.at(-1).data.source, 'musuw-embed')
  assert.equal(messages.at(-1).target, 'https://host.example')
  const receive = (source, origin, protocol) => listeners.get('message')({
    source,
    origin,
    data: { source: protocol, type: 'provide_token', token: 'test-token', channel_id: 'ch-a' },
  })
  receive({}, 'https://host.example', 'weknora-host')
  receive(parent, 'https://wrong.example', 'weknora-host')
  assert.equal(accepted, 0)
  receive(parent, 'https://host.example', 'weknora-host')
  assert.equal(accepted, 1)
  api.postEmbedReady('ch-a')
  assert.equal(messages.at(-1).data.source, 'weknora-embed')
  receive(parent, 'https://host.example', 'musuw-host')
  api.postEmbedReady('ch-a')
  assert.equal(messages.at(-1).data.source, 'musuw-embed')
  assert.equal(messages.length, 3)
})

test('generated Musuw script derives the correct iframe URL and negotiates one reply per protocol', async () => {
  const { api } = loadEmbedApi()
  const snippet = api.buildWidgetSnippet('ch-a', 'test-token')
  assert.match(snippet, /src="https:\/\/app\.example\/musuw-widget\.js"/)
  const widget = loadWidget('https://app.example/musuw-widget.js')
  const iframe = widget.created.find((item) => item.tagName === 'iframe')
  assert.equal(iframe.src, 'https://app.example/embed/ch-a')
  const receive = (source, origin, protocol) => widget.listeners.get('message')({
    source,
    origin,
    data: { source: protocol, type: 'bootstrap_request', channel_id: 'ch-a' },
  })
  receive({}, 'https://app.example', 'weknora-embed')
  receive(iframe.contentWindow, 'https://wrong.example', 'weknora-embed')
  assert.equal(widget.messages.length, 0)
  receive(iframe.contentWindow, 'https://app.example', 'weknora-embed')
  await Promise.resolve()
  assert.equal(widget.messages.length, 1)
  assert.equal(widget.messages[0].data.source, 'weknora-host')
  assert.equal(widget.messages[0].target, 'https://app.example')
  receive(iframe.contentWindow, 'https://app.example', 'musuw-embed')
  await Promise.resolve()
  assert.equal(widget.messages.length, 2)
  assert.equal(widget.messages[1].data.source, 'musuw-host')
})

test('programmatic legacy scriptEl still supplies the backend base URL', () => {
  const widget = loadWidget('https://app.example/weknora-widget.js?version=1', { autoInit: false })
  widget.document.currentScript = null
  widget.window.Musuw.init({ channel: 'ch-a', token: 'test-token', scriptEl: widget.script })
  assert.equal(widget.created.find((item) => item.tagName === 'iframe').src, 'https://app.example/embed/ch-a')
})
