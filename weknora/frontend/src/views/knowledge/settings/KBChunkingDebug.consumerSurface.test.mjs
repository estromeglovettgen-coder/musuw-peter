import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { getLocaleValueAtPath, LOCALE_BUNDLES } from '../../../i18n/localeKeyAudit.ts'

const samples = readFileSync(new URL('./chunkingSamples.ts', import.meta.url), 'utf8')
const consumer = readFileSync(new URL('./KBChunkingDebug.vue', import.meta.url), 'utf8')
const sampleKeys = [...samples.matchAll(/labelKey:\s*["']([^"']+)["']/g)].map((match) => match[1])

test('chunking sample labels are complete locale keys at the rendering boundary', () => {
  assert.match(consumer, /\$t\(p\.labelKey\)/)
  assert.equal(sampleKeys.length, 4)

  for (const key of sampleKeys) {
    assert.match(key, /^knowledgeEditor\.chunking\.debug\.samples\./)
    for (const [locale, bundle] of Object.entries(LOCALE_BUNDLES)) {
      assert.equal(typeof getLocaleValueAtPath(bundle, key), 'string', `${locale}: ${key}`)
    }
  }
})
