import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'chat-citations.less'), 'utf8')

test('citation pills use compact baseline-aligned source styling', () => {
  assert.match(css, /vertical-align:\s*baseline/)
  assert.match(css, /border-radius:\s*6px/)
  assert.match(css, /font-size:\s*10px/)
  assert.match(css, /border:\s*1px solid #e5e7eb/)
})
