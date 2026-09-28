import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('./musuw-settings-reference-inner.css', import.meta.url), 'utf8')

const newSurfaceCards = [
  '.sandbox-card',
  '.skill-card',
  '.backend-card',
  '.store-card',
  '.env-skill-card',
  '.env-sandbox-card',
]

test('all new Standard settings cards are governed by the Musuw visual bridge', () => {
  const light = css.slice(css.indexOf('/* Cards/panels created by the native settings pages. */'), css.indexOf('/* Agent editor prompt'))
  const dark = css.slice(css.indexOf('/* Dark-theme behavior contract'))

  for (const card of newSurfaceCards) {
    assert.ok(light.includes(card), `${card} must use the shared light card contract`)
    assert.ok(dark.includes(card), `${card} must use the shared dark card contract`)
  }

  assert.match(light, /border-radius: 12px !important;/)
  assert.match(light, /box-shadow: 0 1px 2px rgb\(0 0 0 \/ 4%\) !important;/)
})

test('new card internals reuse the compact Musuw icon, title and metadata scale', () => {
  assert.match(css, /\.visual-settings-content :is\([^)]*\.skill-card__badge[^)]*\.backend-card__badge[^)]*\.store-card__badge[^)]*\)[\s\S]*?width: 32px !important;[\s\S]*?height: 32px !important;/)
  assert.match(css, /\.visual-settings-content :is\([^)]*\.skill-card__title[^)]*\.backend-card__title[^)]*\.store-card__title[^)]*\)[\s\S]*?font-size: 12px !important;[\s\S]*?font-weight: 600 !important;/)
  assert.match(css, /\.visual-settings-content :is\([^)]*\.skill-card__desc[^)]*\.backend-card__subtitle[^)]*\.store-card__subtitle[^)]*\)[\s\S]*?font-size: 10px !important;/)
})
