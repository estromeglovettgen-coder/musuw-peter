import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyObsidianGraphSettings,
  createDefaultObsidianGraphSettings,
  loadObsidianGraphSettings,
  normalizeObsidianGraphSettings,
  obsidianGraphForceValues,
  obsidianGraphStorageKey,
  saveObsidianGraphSettings,
  type ObsidianGraphSettings,
  type ObsidianGraphStorage,
} from './obsidianGraphSettings.ts'

class MemoryStorage implements ObsidianGraphStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

test('native defaults include every Obsidian global graph setting and map to physical values', () => {
  const settings = createDefaultObsidianGraphSettings()

  assert.deepEqual(Object.keys(settings).sort(), [
    'centerStrength',
    'close',
    'collapse-color-groups',
    'collapse-display',
    'collapse-filter',
    'collapse-forces',
    'colorGroups',
    'hideUnresolved',
    'lineSizeMultiplier',
    'linkDistance',
    'linkStrength',
    'nodeSizeMultiplier',
    'repelStrength',
    'scale',
    'search',
    'showArrow',
    'showAttachments',
    'showOrphans',
    'showTags',
    'textFadeMultiplier',
  ])
  assert.equal(settings.centerStrength, 0.518713248970312)
  assert.deepEqual(obsidianGraphForceValues(settings), {
    centerStrength: 0.1,
    repelStrength: 1000,
    linkStrength: 1,
    linkDistance: 250,
  })
})

test('normalization preserves valid partial values and replaces malformed or out-of-range data', () => {
  const settings = normalizeObsidianGraphSettings({
    showArrow: true,
    showTags: 'invalid',
    textFadeMultiplier: 99,
    nodeSizeMultiplier: 0,
    lineSizeMultiplier: 8,
    centerStrength: -2,
    repelStrength: 40,
    linkStrength: 2,
    linkDistance: 999,
    scale: 0,
    colorGroups: [
      { query: 'type:entity', color: { a: 0.25, rgb: 0x123456 } },
      { query: 42, color: { rgb: -1 } },
    ],
  })

  assert.equal(settings.showArrow, true)
  assert.equal(settings.showTags, false)
  assert.equal(settings.textFadeMultiplier, 3)
  assert.equal(settings.nodeSizeMultiplier, 0.1)
  assert.equal(settings.lineSizeMultiplier, 5)
  assert.equal(settings.centerStrength, 0)
  assert.equal(settings.repelStrength, 20)
  assert.equal(settings.linkStrength, 1)
  assert.equal(settings.linkDistance, 500)
  assert.equal(settings.scale, 1 / 128)
  assert.deepEqual(settings.colorGroups, [
    { query: 'type:entity', color: { a: 0.25, rgb: 0x123456 } },
  ])
})

test('storage round-trips every field, isolates knowledge bases, and survives corrupt JSON', () => {
  const storage = new MemoryStorage()
  const expected: ObsidianGraphSettings = {
    ...createDefaultObsidianGraphSettings(),
    'collapse-filter': true,
    search: 'type:entity -title:draft',
    showTags: true,
    showAttachments: true,
    hideUnresolved: true,
    showOrphans: false,
    'collapse-color-groups': true,
    colorGroups: [
      { query: 'type:entity', color: { a: 1, rgb: 0x234567 } },
      { query: 'path:concept/', color: { a: 0.8, rgb: 0xabcdef } },
    ],
    'collapse-display': true,
    showArrow: true,
    textFadeMultiplier: 0.7,
    nodeSizeMultiplier: 1.2,
    lineSizeMultiplier: 0.8,
    'collapse-forces': true,
    centerStrength: 0.4,
    repelStrength: 7.5,
    linkStrength: 0.6,
    linkDistance: 320,
    scale: 1.5,
    close: true,
  }

  saveObsidianGraphSettings('kb-a', expected, storage)
  assert.deepEqual(loadObsidianGraphSettings('kb-a', storage), expected)
  assert.deepEqual(loadObsidianGraphSettings('kb-b', storage), createDefaultObsidianGraphSettings())

  storage.setItem(obsidianGraphStorageKey('kb-corrupt'), '{not-json')
  assert.deepEqual(loadObsidianGraphSettings('kb-corrupt', storage), createDefaultObsidianGraphSettings())
})

test('filtering prunes edges and ordered color groups use first match', () => {
  const settings: ObsidianGraphSettings = {
    ...createDefaultObsidianGraphSettings(),
    search: 'type:entity -title:draft',
    showOrphans: false,
    colorGroups: [
      { query: 'path:entity/', color: { a: 1, rgb: 0xff0000 } },
      { query: 'title:Alpha', color: { a: 1, rgb: 0x00ff00 } },
    ],
  }
  const result = applyObsidianGraphSettings({
    nodes: [
      { slug: 'entity/alpha', title: 'Alpha', page_type: 'entity', link_count: 2 },
      { slug: 'entity/draft', title: 'Draft entity', page_type: 'entity', link_count: 1 },
      { slug: 'concept/beta', title: 'Beta', page_type: 'concept', link_count: 1 },
      { slug: 'entity/orphan', title: 'Orphan', page_type: 'entity', link_count: 0 },
    ],
    edges: [
      { source: 'entity/alpha', target: 'concept/beta' },
      { source: 'entity/alpha', target: 'entity/draft' },
    ],
  }, settings)

  assert.deepEqual(result.nodes.map(node => node.slug), ['entity/alpha'])
  assert.equal(result.nodes[0].color, 0xff0000)
  assert.deepEqual(result.edges, [])
})

test('visibility toggles cover tags, attachments, unresolved files, and orphan nodes', () => {
  const data = {
    nodes: [
      { slug: 'tag/one', title: '#one', page_type: 'tag', link_count: 1 },
      { slug: 'attachment/image.png', title: 'image.png', page_type: 'attachment', link_count: 1 },
      { slug: 'unresolved/missing', title: 'missing', page_type: 'unresolved', link_count: 1 },
      { slug: 'entity/orphan', title: 'orphan', page_type: 'entity', link_count: 0 },
      { slug: 'entity/live', title: 'live', page_type: 'entity', link_count: 3 },
    ],
    edges: [
      { source: 'entity/live', target: 'tag/one' },
      { source: 'entity/live', target: 'attachment/image.png' },
      { source: 'entity/live', target: 'unresolved/missing' },
    ],
  }

  const hidden = applyObsidianGraphSettings(data, {
    ...createDefaultObsidianGraphSettings(),
    hideUnresolved: true,
    showOrphans: false,
  })
  assert.deepEqual(hidden.nodes.map(node => node.slug), ['entity/live'])

  const shown = applyObsidianGraphSettings(data, {
    ...createDefaultObsidianGraphSettings(),
    showTags: true,
    showAttachments: true,
    hideUnresolved: false,
    showOrphans: true,
  })
  assert.deepEqual(shown.nodes.map(node => node.slug), [
    'tag/one',
    'attachment/image.png',
    'unresolved/missing',
    'entity/orphan',
    'entity/live',
  ])
})
