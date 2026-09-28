import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./menu.vue', import.meta.url), 'utf8')

test('Knowledge Base and Agent use one neutral main-navigation state contract', () => {
  assert.match(source, /\.visual-sidebar__primary\.is-kb,\s*\.visual-sidebar__primary\.is-native\s*\{[\s\S]*?color:\s*var\(--resource-nav-idle\)/)
  assert.match(source, /\.visual-sidebar__primary\.is-kb\.is-active,\s*\.visual-sidebar__primary\.is-native\.is-active\s*\{[\s\S]*?background:\s*var\(--resource-nav-active\)/)
  assert.match(source, /box-shadow:\s*none/)
  assert.match(source, /:global\(:root\[theme-mode="dark"\] \.visual-sidebar\)\s*\{[\s\S]*?--resource-nav-idle:\s*#d0d1d3/)
  assert.match(source, /--resource-nav-active:\s*#3b3c40/)
})
