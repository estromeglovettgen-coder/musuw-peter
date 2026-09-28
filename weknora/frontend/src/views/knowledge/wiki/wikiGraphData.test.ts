import assert from 'node:assert/strict'
import test from 'node:test'

import type { WikiGraphData } from '../../../api/wiki'
import { normalizeWikiGraphData } from './wikiGraphData.ts'

test('normalizes nullable graph collections before the view renders them', () => {
  const graph = normalizeWikiGraphData({
    nodes: [{ slug: 'index', title: 'Index', page_type: 'index', link_count: 0 }],
    edges: null,
    meta: { mode: 'overview', total: 1, returned: 1, truncated: false },
  } as unknown as WikiGraphData)

  assert.deepEqual(graph.nodes, [
    { slug: 'index', title: 'Index', page_type: 'index', link_count: 0 },
  ])
  assert.deepEqual(graph.edges, [])
})
