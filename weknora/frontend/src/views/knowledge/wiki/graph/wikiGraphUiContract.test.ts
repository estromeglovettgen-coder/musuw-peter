import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const wikiBrowser = readFileSync(new URL('../WikiBrowser.vue', import.meta.url), 'utf8')
const obsidianRenderer = readFileSync(new URL('./obsidianWikiGraphRenderer.ts', import.meta.url), 'utf8')

test('keeps the original WeKnora graph controls in their original order', () => {
  const template = wikiBrowser.slice(0, wikiBrowser.indexOf('<script setup'))
  const orderedMarkers = [
    "toggleGraphFilterType('summary')",
    "toggleGraphFilterType('entity')",
    "toggleGraphFilterType('concept')",
    "toggleGraphFilterType('synthesis')",
    "toggleGraphFilterType('comparison')",
    '@click="fitGraphToView"',
    '@click="toggleArrows"',
    '@click="growFrontier"',
    '@click="loadGraph"',
  ]

  let previous = -1
  for (const marker of orderedMarkers) {
    const index = template.indexOf(marker)
    assert.ok(index > previous, `${marker} must keep its original graph-control position`)
    previous = index
  }

  assert.match(template, /<div class="wiki-graph"(?:\s|>)/)
  assert.match(template, /<div\s+v-if="graphReady"\s+class="wiki-graph-legend"/)
  assert.doesNotMatch(template, /wiki-graph-style-panel/)
  assert.match(template, /<ObsidianGraphSettingsPanel[\s\S]*v-if="graphReady"/)
})

test('keeps the original graph data and node interaction contracts', () => {
  assert.match(wikiBrowser, /limit:\s*GRAPH_OVERVIEW_LIMIT,/)
  assert.doesNotMatch(wikiBrowser, /GRAPH_OBSIDIAN_OVERVIEW_LIMIT/)
  assert.doesNotMatch(wikiBrowser, /applyObsidianGraphSettings\(data/)

  const clickHandler = wikiBrowser.slice(
    wikiBrowser.indexOf('function handleRendererNodeClick'),
    wikiBrowser.indexOf('function handleRendererNodeDoubleClick'),
  )
  assert.match(clickHandler, /loadBloomNeighbors\(slug\)/)
  assert.match(clickHandler, /graphSelectedSlug\.value = slug/)
  assert.match(clickHandler, /focusNode\(slug, \{ offsetX: -240 \}\)/)
  assert.match(clickHandler, /openGraphDrawer\(slug\)/)

  const doubleClickHandler = wikiBrowser.slice(
    wikiBrowser.indexOf('function handleRendererNodeDoubleClick'),
    wikiBrowser.indexOf('function handleRendererNodeHover'),
  )
  assert.match(doubleClickHandler, /loadEgoGraph\(slug\)/)
})

test('keeps the current graph when an isolated node has no ego result', () => {
  const egoLoader = wikiBrowser.slice(
    wikiBrowser.indexOf('async function loadEgoGraph'),
    wikiBrowser.indexOf('// ─── Bloom:'),
  )

  assert.match(egoLoader, /const nextGraphData =/)
  const emptyGuard = /if \(!nextGraphData(?:\?\.|\.)nodes(?:\?\.|\.)length\) \{/.exec(egoLoader)
  assert.ok(emptyGuard, 'the ego loader must reject an empty normalized graph')
  assert.match(
    egoLoader,
    /if \(!nextGraphData(?:\?\.|\.)nodes(?:\?\.|\.)length\) \{[\s\S]*graphReady\.value = Boolean\(graphRendererController/,
  )
  assert.ok(
    emptyGuard.index < egoLoader.indexOf('graphData.value = nextGraphData'),
    'an empty ego response must be rejected before replacing the visible overview graph',
  )
})

test('keeps the original canvas affordances inside the visual adapter', () => {
  assert.match(obsidianRenderer, /hiddenNeighbors/)
  assert.match(obsidianRenderer, /expansionRing/)
  assert.match(obsidianRenderer, /bloomButton/)
  assert.match(obsidianRenderer, /onNodeClick\(node\.id, \{ shiftKey: true \}\)/)
  assert.match(obsidianRenderer, /bidirectional/)
  assert.match(obsidianRenderer, /reverseArrow/)
})
