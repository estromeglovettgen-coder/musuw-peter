import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

test('pre-paint theme resolves the active user namespace before the legacy fallback', () => {
  assert.match(index, /localStorage\.getItem\('weknora_user'\)/)
  const script = index.match(/<script>([\s\S]*?)<\/script>/)[1]
  function boot(values, unavailable = false) {
    let mode
    runInNewContext(script, {
      localStorage: { getItem: key => { if (unavailable) throw new Error('blocked'); return values[key] ?? null } },
      window: { matchMedia: () => ({ matches: true }) },
      document: { documentElement: { setAttribute: (_, value) => { mode = value }, style: {} }, body: { style: {} } },
    })
    return mode
  }
  const user = { weknora_user: JSON.stringify({ id: 17 }) }
  assert.equal(boot({ ...user, Musuw_17_theme: 'dark', WeKnora_17_theme: 'light' }), 'dark')
  assert.equal(boot({ ...user, WeKnora_17_theme: 'dark', Musuw_anon_theme: 'light' }), 'dark')
  assert.equal(boot({ ...user, Musuw_23_theme: 'dark', WeKnora_23_theme: 'dark' }), 'light')
  assert.equal(boot({ ...user, Musuw_17_theme: 'broken', WeKnora_17_theme: 'dark' }), 'light')
  assert.equal(boot({}, true), 'light')
})

test('startup feedback uses the root theme without repainting the app canvas', () => {
  const appStart = index.indexOf('<div id="app">')
  assert.ok(appStart > 0)
  assert.doesNotMatch(index.slice(appStart), /style\.background|WeKnora_theme/)
  assert.doesNotMatch(index, /#app\s*\{[^}]*background/)
  assert.match(index, /html\[theme-mode="dark"\] #musuw-startup \{ background: #151619;/)
})

test('pre-paint browser and Wails canvases match the final theme authority', () => {
  assert.match(index, /var bg=t==='dark'\?'#151619':'#fff'/)
  assert.match(index, /WindowSetBackgroundColour\(21,22,25,255\)/)
  assert.match(index, /WindowSetBackgroundColour\(251,252,254,255\)/)
})
