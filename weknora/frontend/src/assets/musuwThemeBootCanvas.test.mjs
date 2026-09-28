import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const index = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')

test('pre-paint theme resolves the active user namespace before the legacy fallback', () => {
  assert.match(index, /localStorage\.getItem\('weknora_user'\)/)
  assert.match(index, /legacyThemeKey\.replace\('_theme',\s*'_'\s*\+\s*userId\s*\+\s*'_theme'\)/)
  assert.match(index, /localStorage\.getItem\(userThemeKey\)\s*\|\|\s*localStorage\.getItem\(anonThemeKey\)\s*\|\|\s*localStorage\.getItem\(legacyThemeKey\)/)
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
