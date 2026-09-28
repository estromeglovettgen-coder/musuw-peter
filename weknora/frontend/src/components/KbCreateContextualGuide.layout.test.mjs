import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./KbCreateContextualGuide.vue', import.meta.url), 'utf8')
const spotlightSource = readFileSync(new URL('./SpotlightGuide.vue', import.meta.url), 'utf8')

test('Lite knowledge-base submit guide stays beside the footer action on compact viewports', () => {
  const liteSubmit = source.match(/key:\s*'submitLite'[\s\S]*?\n\s*\},/)

  assert.ok(liteSubmit, 'Lite create guide must include a final submit step')
  assert.match(
    liteSubmit[0],
    /placement:\s*'left'/,
    'the footer action must keep the guide card to the left so the highlighted button remains visible and clickable',
  )
})

test('mobile bottom-dock does not override interactive guide placement', () => {
  const mobileRules = spotlightSource.match(/@media \(max-width: 720px\) \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(
    mobileRules,
    /\.guide__card:not\(\.guide__card--interact\)/,
    'mobile bottom-dock must be limited to non-interactive steps',
  )
  assert.doesNotMatch(
    mobileRules,
    /\.guide__card\s*\{/,
    'interactive steps must not inherit a blanket mobile bottom-dock rule',
  )
  assert.match(
    spotlightSource,
    /'guide__card--interact':\s*step\.interact/,
    'interactive steps must expose a class for the mobile placement guard',
  )
  assert.match(
    spotlightSource,
    /\.guide__card\s*\{[\s\S]*?box-sizing:\s*border-box/,
    'the placement width must include padding and border so overlap checks match rendered geometry',
  )
})
