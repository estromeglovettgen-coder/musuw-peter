import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'

const source = readFileSync(new URL('./SpotlightGuide.vue', import.meta.url), 'utf8')

/**
 * Evaluate the real <script setup> so this test exercises the same target
 * lookup/goTo/close path used by the rendered guide without requiring a DOM
 * implementation or a browser test runner.
 */
const loadGuide = () => {
  const { descriptor } = parse(source, { filename: 'SpotlightGuide.vue' })
  const script = compileScript(descriptor, { id: 'spotlight-guide-interact-test' })
  const body = script.content.replace(/^import[^\n]*\n/gm, '')
  const javascript = ts.transpileModule(body, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
    fileName: 'SpotlightGuide.ts',
  }).outputText

  const module = { exports: {} }
  const factory = new Function(
    'exports',
    'module',
    '_defineComponent',
    'computed',
    'nextTick',
    'onBeforeUnmount',
    'ref',
    'watch',
    'useI18n',
    'window',
    'document',
    'getComputedStyle',
    javascript + '\nreturn module.exports.default',
  )

  return (runtime) => factory(
    module.exports,
    module,
    (options) => options,
    vue.computed,
    vue.nextTick,
    runtime.onBeforeUnmount,
    vue.ref,
    vue.watch,
    () => ({ t: (key) => key }),
    runtime.window,
    runtime.document,
    () => ({ marginBottom: '0' }),
  )
}

class FakeWindow {
  innerWidth = 1024
  innerHeight = 768
  listeners = new Map()

  addEventListener(type, listener) {
    const current = this.listeners.get(type) || []
    current.push(listener)
    this.listeners.set(type, current)
  }

  removeEventListener(type, listener) {
    const current = this.listeners.get(type) || []
    this.listeners.set(type, current.filter((entry) => entry !== listener))
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length
  }
}

class FakeTarget {
  previousElementSibling = null
  nextElementSibling = null
  listeners = new Map()
  scrolls = 0

  addEventListener(type, listener) {
    const current = this.listeners.get(type) || []
    current.push(listener)
    this.listeners.set(type, current)
  }

  removeEventListener(type, listener) {
    const current = this.listeners.get(type) || []
    this.listeners.set(type, current.filter((entry) => entry !== listener))
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length
  }

  dispatchClick() {
    const event = {
      type: 'click',
      target: this,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
    }
    for (const listener of [...(this.listeners.get('click') || [])]) {
      listener.call(this, event)
    }
    return event
  }

  getBoundingClientRect() {
    return { left: 20, top: 20, width: 140, height: 32, right: 160, bottom: 52 }
  }

  scrollIntoView() {
    this.scrolls += 1
  }
}

const createHarness = (steps) => {
  const window = new FakeWindow()
  const target = new FakeTarget()
  const document = {
    querySelector(selector) {
      return selector === '#target' ? target : null
    },
  }
  const component = loadGuide()({ window, document, onBeforeUnmount: (fn) => { harness.unmount = fn } })
  const props = {
    active: true,
    steps,
    stepI18nPrefix: 'test.steps',
    labelsPrefix: 'test',
    beforeDelayMs: 0,
  }
  const emitted = []
  const harness = {
    component,
    document,
    emitted,
    props,
    target,
    unmount: () => {},
    window,
  }
  let exposed
  const setup = component.setup(props, {
    expose: (value) => { exposed = value },
    emit: (event, ...args) => {
      emitted.push([event, ...args])
      if (event === 'update:active') props.active = args[0]
    },
  })
  harness.exposed = exposed
  harness.setup = setup
  return harness
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

test('an interact target keeps its native click, advances once, and finishes exactly once', async () => {
  const harness = createHarness([
    { key: 'first', target: '#target', interact: true },
    { key: 'last', target: '#target', interact: true },
  ])
  let originalClicks = 0
  harness.target.addEventListener('click', () => { originalClicks += 1 })

  await harness.setup.goTo(0)
  assert.equal(harness.target.listenerCount('click'), 2, 'guide should add one listener beside the native action')

  const firstClick = harness.target.dispatchClick()
  // A second click before the async locate settles must not enqueue another step.
  harness.target.dispatchClick()
  await settle()

  assert.equal(firstClick.defaultPrevented, false, 'guide must not cancel the target action')
  assert.equal(originalClicks, 2, 'the target action must run for both native clicks')
  assert.equal(harness.setup.index.value, 1, 'the first interact step should advance exactly once')
  assert.equal(harness.target.listenerCount('click'), 2, 'the next interact step should own one fresh listener')

  harness.target.dispatchClick()
  // The listener is removed synchronously by finish; this click is native only.
  harness.target.dispatchClick()
  await settle()

  assert.equal(originalClicks, 4, 'the final target action must remain unblocked')
  assert.equal(harness.emitted.filter(([event]) => event === 'finish').length, 1)
  assert.equal(harness.emitted.filter(([event]) => event === 'update:active').length, 1)
  assert.equal(harness.target.listenerCount('click'), 1, 'finish must detach the guide listener')
})

test('target and viewport listeners detach on close and unmount', async () => {
  const harness = createHarness([{ key: 'interact', target: '#target', interact: true }])
  harness.target.addEventListener('click', () => {})
  await harness.setup.goTo(0)
  assert.equal(harness.target.listenerCount('click'), 2)
  assert.equal(harness.window.listenerCount('resize'), 1)
  assert.equal(harness.window.listenerCount('scroll'), 1)

  harness.exposed.close()
  assert.equal(harness.target.listenerCount('click'), 1, 'close must remove the current target listener')

  harness.unmount()
  assert.equal(harness.target.listenerCount('click'), 1)
  assert.equal(harness.window.listenerCount('resize'), 0)
  assert.equal(harness.window.listenerCount('scroll'), 0)
})

test('the native create action may close its parent without suppressing guide completion', async () => {
  const harness = createHarness([{ key: 'create', target: '#target', interact: true }])
  let originalClicks = 0
  harness.target.addEventListener('click', () => {
    originalClicks += 1
    // This mirrors the list/create call path: the native action marks its
    // parent guide done and causes the editor guide to take over.
    harness.props.active = false
  })

  await harness.setup.goTo(0)
  const click = harness.target.dispatchClick()
  await settle()

  assert.equal(click.defaultPrevented, false)
  assert.equal(originalClicks, 1)
  assert.equal(harness.emitted.filter(([event]) => event === 'finish').length, 1)
  assert.equal(harness.emitted.filter(([event]) => event === 'update:active').length, 1)
  assert.equal(harness.target.listenerCount('click'), 1)
})

test('skipping an unavailable optional step clears the previous spotlight first', () => {
  assert.match(
    source,
    /if \(cur\.optional\) \{\s*targetEl\.value = null\s*targetRect\.value = null\s*goTo\(index\.value \+ 1\)/,
  )
})
