import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./DocumentBatchBar.vue', import.meta.url), 'utf8')
const parent = readFileSync(new URL('../KnowledgeBase.vue', import.meta.url), 'utf8')

const cssBlock = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))?.[1] ?? ''
}

test('batch actions remain one compact nowrap row at desktop and tablet widths', () => {
  const bar = cssBlock('.visual-document-batch')
  const summary = cssBlock('.visual-document-batch__summary')
  const clear = cssBlock('.visual-document-batch__clear')
  const actions = cssBlock('.visual-document-batch__actions')
  const button = cssBlock('.visual-document-batch__button')

  assert.match(bar, /flex-wrap:\s*nowrap/)
  assert.match(bar, /align-items:\s*center/)
  assert.match(bar, /padding:\s*6px 8px/)
  assert.match(summary, /flex:\s*0 0 auto/)
  assert.match(clear, /white-space:\s*nowrap/)
  assert.match(actions, /flex:\s*0 0 auto/)
  assert.match(actions, /flex-wrap:\s*nowrap/)
  assert.match(button, /white-space:\s*nowrap/)
  assert.match(button, /min-height:\s*30px/)
  assert.doesNotMatch(source, /@media\s*\(max-width:\s*700px\)[\s\S]*?flex-direction:\s*column/)
})

test('batch row remains page-safe on narrow screens through contained horizontal scrolling', () => {
  const bar = cssBlock('.visual-document-batch')
  assert.match(bar, /max-width:\s*100%/)
  assert.match(bar, /overflow-x:\s*auto/)
  assert.match(bar, /overscroll-behavior-inline:\s*contain/)
  assert.match(
    parent,
    /\.visual-knowledge-batch-anchor\s*\{[^}]*width:\s*min\(760px,calc\(100% - 24px\)\);[^}]*max-width:\s*calc\(100vw - 24px\);/s,
  )
})
