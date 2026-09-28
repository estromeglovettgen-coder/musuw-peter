import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const themeClosure = readFileSync(
  new URL('./musuw-final-theme-closure.css', import.meta.url),
  'utf8',
)

test('a closed MCP drawer root cannot paint over the settings page', () => {
  assert.match(
    themeClosure,
    /body \.t-drawer\.t-drawer--right\.mcp-drawer\s*\{[^}]*background:\s*transparent\s*!important;[^}]*border:\s*0\s*!important;[^}]*box-shadow:\s*none\s*!important;/s,
  )
  assert.match(
    themeClosure,
    /body \.t-drawer\.t-drawer--right\.mcp-drawer\s*>\s*\.t-drawer__content-wrapper\s*\{[^}]*background:\s*#fff\s*!important;[^}]*box-shadow:/s,
  )
  assert.match(
    themeClosure,
    /:root\[theme-mode="dark"\] body \.t-drawer\.t-drawer--right\.mcp-drawer\s*\{[^}]*background:\s*transparent\s*!important;/s,
  )
  assert.match(
    themeClosure,
    /:root\[theme-mode="dark"\] body \.t-drawer\.t-drawer--right\.mcp-drawer\s*>\s*\.t-drawer__content-wrapper\s*\{[^}]*background:\s*var\(--mvc-surface[^;]*\)\s*!important;/s,
  )
})

test('a closed wiki drawer cannot cover a rendered dark chat', () => {
  assert.doesNotMatch(
    themeClosure,
    /body \.wiki-graph-drawer\s*\{[^}]*background:/s,
  )
  assert.match(
    themeClosure,
    /body \.wiki-graph-drawer \.t-drawer__content-wrapper,[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/,
  )
})
