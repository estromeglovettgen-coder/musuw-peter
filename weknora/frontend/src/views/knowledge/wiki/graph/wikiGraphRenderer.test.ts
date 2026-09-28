import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_WIKI_GRAPH_STYLE,
  GRAPH_RENDERER_MODES,
  GRAPH_STYLE_PRESETS,
  wikiGraphNodeColor,
  WikiGraphRendererController,
  type WikiGraphRenderInput,
  type WikiGraphRenderer,
  type WikiGraphRendererFactories,
} from './wikiGraphRenderer.ts'
import { parseGraphThemeColor } from './weknoraGraphTheme.ts'
import { createDefaultObsidianGraphSettings } from './obsidianGraphSettings.ts'

const request: WikiGraphRenderInput = {
  data: {
    nodes: [
      { slug: 'summary/alpha', title: 'Alpha', page_type: 'summary', link_count: 1 },
      { slug: 'entity/beta', title: 'Beta', page_type: 'entity', link_count: 1 },
    ],
    edges: [{ source: 'summary/alpha', target: 'entity/beta' }],
  },
  selectedSlug: 'summary/alpha',
  showArrows: true,
  callbacks: {
    onNodeClick: () => undefined,
    onNodeDoubleClick: () => undefined,
    onNodeHover: () => undefined,
    onStageClick: () => undefined,
  },
}

function fakeRenderer(name: string, calls: string[]): WikiGraphRenderer {
  return {
    async render(nextRequest) {
      calls.push(`${name}:render:${nextRequest.selectedSlug ?? ''}`)
    },
    hasNode(slug) {
      calls.push(`${name}:has:${slug}`)
      return slug === 'summary/alpha'
    },
    async focusNode(slug) {
      calls.push(`${name}:focus:${slug}`)
    },
    async fit() {
      calls.push(`${name}:fit`)
    },
    setArrowsVisible(visible) {
      calls.push(`${name}:arrows:${visible}`)
    },
    setSelection(selectedSlug, hoveredSlug) {
      calls.push(`${name}:selection:${selectedSlug ?? ''}:${hoveredSlug ?? ''}`)
    },
    setObsidianSettings(settings) {
      calls.push(`${name}:settings:${settings.linkDistance}`)
    },
    restartSimulation() {
      calls.push(`${name}:restart`)
    },
    startProgression() {
      calls.push(`${name}:play`)
    },
    pauseProgression() {
      calls.push(`${name}:pause`)
    },
    resumeProgression() {
      calls.push(`${name}:resume`)
    },
    restoreProgression() {
      calls.push(`${name}:restore`)
    },
    destroy() {
      calls.push(`${name}:destroy`)
    },
  }
}

test('exposes WeKnora native beside the four imported graph engines', () => {
  assert.deepEqual(
    GRAPH_RENDERER_MODES.map(({ id, label }) => ({ id, label })),
    [
      { id: 'obsidian', label: 'Obsidian 原生' },
      { id: 'weknora', label: 'WeKnora 原生' },
      { id: 'three', label: 'Obsidian 3D' },
      { id: 'sigma', label: 'Sigma.js' },
      { id: 'g6', label: 'AntV G6' },
    ],
  )
  assert.equal(GRAPH_STYLE_PRESETS.length, 17)
  assert.equal(DEFAULT_WIKI_GRAPH_STYLE, 'obsidian-exact')
  const styleIds = GRAPH_STYLE_PRESETS.map(style => style.id as string)
  assert.equal(styleIds.includes('weknora-native'), true)
  assert.equal(styleIds.includes('obsidian-native'), false)
  assert.equal(
    GRAPH_STYLE_PRESETS.find(style => (style.id as string) === 'weknora-native')?.engine,
    'weknora',
  )
  assert.equal(GRAPH_STYLE_PRESETS.filter(style => style.engine === 'obsidian').length, 1)
  assert.equal(GRAPH_STYLE_PRESETS.filter(style => style.engine === 'weknora').length, 1)
  assert.equal(GRAPH_STYLE_PRESETS.filter(style => style.engine === 'three').length, 1)
  assert.equal(GRAPH_STYLE_PRESETS.filter(style => style.engine === 'sigma').length, 5)
  assert.equal(GRAPH_STYLE_PRESETS.filter(style => style.engine === 'g6').length, 9)
})

test('preserves the original WeKnora colors for every page type', () => {
  assert.deepEqual(
    ['summary', 'entity', 'concept', 'synthesis', 'comparison', 'index'].map(wikiGraphNodeColor),
    [0x0052d9, 0x2ba471, 0xe37318, 0x0594fa, 0xd54941, 0x8c8c8c],
  )
  assert.equal(wikiGraphNodeColor('unknown'), 0x8c8c8c)
})

test('converts resolved WeKnora theme colors into Pixi RGB values', () => {
  assert.equal(parseGraphThemeColor('#242424', 0), 0x242424)
  assert.equal(parseGraphThemeColor('#fff', 0), 0xffffff)
  assert.equal(parseGraphThemeColor('rgb(36, 36, 36)', 0), 0x242424)
  assert.equal(parseGraphThemeColor('rgba(255, 255, 255, 0.55)', 0), 0xffffff)
  assert.equal(parseGraphThemeColor('not-a-color', 0x123456), 0x123456)
})

test('forwards live native settings and progression controls through the active renderer', async () => {
  const calls: string[] = []
  const factories: WikiGraphRendererFactories = {
    obsidian: async () => fakeRenderer('obsidian', calls),
    weknora: async () => fakeRenderer('weknora', calls),
    three: async () => fakeRenderer('three', calls),
    sigma: async () => fakeRenderer('sigma', calls),
    g6: async () => fakeRenderer('g6', calls),
  }
  const controller = new WikiGraphRendererController({} as HTMLElement, factories)
  await controller.render('obsidian-exact', request)
  controller.setObsidianSettings({
    ...createDefaultObsidianGraphSettings(),
    linkDistance: 300,
  })
  controller.restartSimulation()
  controller.startProgression()
  controller.pauseProgression()
  controller.resumeProgression()
  controller.restoreProgression()

  assert.deepEqual(calls, [
    'obsidian:render:summary/alpha',
    'obsidian:settings:300',
    'obsidian:restart',
    'obsidian:play',
    'obsidian:pause',
    'obsidian:resume',
    'obsidian:restore',
  ])
})

test('reuses the active renderer and destroys it before changing styles', async () => {
  const calls: string[] = []
  const factories: WikiGraphRendererFactories = {
    obsidian: async () => fakeRenderer('obsidian', calls),
    weknora: async () => fakeRenderer('weknora', calls),
    three: async () => fakeRenderer('three', calls),
    sigma: async () => {
      calls.push('sigma:create')
      return fakeRenderer('sigma', calls)
    },
    g6: async () => {
      calls.push('g6:create')
      return fakeRenderer('g6', calls)
    },
  }
  const controller = new WikiGraphRendererController({} as HTMLElement, factories)

  await controller.render('sigma-nebula', request)
  await controller.render('sigma-force', { ...request, selectedSlug: 'entity/beta' })
  assert.equal(controller.hasNode('summary/alpha'), true)
  await controller.focusNode('summary/alpha')
  await controller.render('g6-force', request)

  assert.deepEqual(calls, [
    'sigma:create',
    'sigma:render:summary/alpha',
    'sigma:render:entity/beta',
    'sigma:has:summary/alpha',
    'sigma:focus:summary/alpha',
    'sigma:destroy',
    'g6:create',
    'g6:render:summary/alpha',
  ])
})

test('discards a renderer whose lazy import loses a rapid-switch race', async () => {
  const calls: string[] = []
  let releaseSigma!: (renderer: WikiGraphRenderer) => void
  const factories: WikiGraphRendererFactories = {
    obsidian: async () => fakeRenderer('obsidian', calls),
    weknora: async () => fakeRenderer('weknora', calls),
    three: async () => fakeRenderer('three', calls),
    sigma: () => new Promise(resolve => { releaseSigma = resolve }),
    g6: async () => fakeRenderer('g6', calls),
  }
  const controller = new WikiGraphRendererController({} as HTMLElement, factories)

  const sigmaRender = controller.render('sigma-nebula', request)
  const g6Render = controller.render('g6-force', request)
  releaseSigma(fakeRenderer('sigma-stale', calls))
  await Promise.all([sigmaRender, g6Render])

  assert.deepEqual(calls, [
    'g6:render:summary/alpha',
    'sigma-stale:destroy',
  ])
})
