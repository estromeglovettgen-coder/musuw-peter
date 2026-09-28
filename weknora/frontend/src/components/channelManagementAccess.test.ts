import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const panels = [
  new URL('./IMChannelPanel.vue', import.meta.url),
  new URL('./AgentEmbedChannelPanel.vue', import.meta.url),
]

test('channel write affordances use the shared member capability instead of admin gates', () => {
  for (const panel of panels) {
    const source = readFileSync(panel, 'utf8')
    assert.match(source, /authStore\.canManageChannels/)
    assert.doesNotMatch(source, /authStore\.hasRole\(['"]admin['"]\)/)
    assert.doesNotMatch(source, /\bisAdmin\b/)
  }
})
