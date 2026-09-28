import assert from 'node:assert/strict'
import test from 'node:test'

import { ObsidianWikiGraphRenderer } from './obsidianWikiGraphRenderer.ts'

function createRenderer(): any {
  return new ObsidianWikiGraphRenderer({} as HTMLElement) as any
}

function visualNode(id: string, neighbors: string[] = []): any {
  const point = { set: () => undefined }
  return {
    id,
    title: id,
    weight: 0,
    totalLinks: neighbors.length,
    hiddenNeighbors: 0,
    isEgoCenter: false,
    bloomEligible: false,
    color: 0x2ba471,
    x: 0,
    y: 0,
    neighbors: new Set(neighbors),
    rendered: true,
    fadeAlpha: 0,
    labelLift: 0,
    circle: {
      tint: 0x2ba471,
      visible: false,
      position: point,
      scale: point,
      alpha: 0,
    },
    label: {
      visible: false,
      position: point,
      scale: point,
      alpha: 0,
    },
    outline: null,
    expansionRing: null,
    bloomButton: null,
  }
}

function rendererRequest(data: any, extras: Record<string, unknown> = {}): any {
  return {
    data,
    styleId: 'obsidian-exact',
    selectedSlug: null,
    showArrows: false,
    callbacks: {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onNodeHover: () => undefined,
      onStageClick: () => undefined,
    },
    ...extras,
  }
}

test('seeds newly expanded nodes beside the requested layout anchor', () => {
  const renderer = createRenderer()
  const anchor = { x: 10_000, y: 20_000 }
  const positions = new Map([['entity/anchor', anchor]])
  const request = rendererRequest({
    nodes: [
      { slug: 'entity/anchor', title: 'Anchor', page_type: 'entity', link_count: 1 },
      { slug: 'concept/new', title: 'New', page_type: 'concept', link_count: 1 },
    ],
    edges: [{ source: 'entity/anchor', target: 'concept/new' }],
  }, {
    preserveLayout: true,
    anchorSlug: 'entity/anchor',
  })

  renderer.buildData(request, positions)

  const retainedAnchor = renderer.nodeLookup.get('entity/anchor')
  const expandedNode = renderer.nodeLookup.get('concept/new')
  assert.deepEqual(
    { x: retainedAnchor.x, y: retainedAnchor.y },
    anchor,
    'existing layout coordinates must stay unchanged',
  )
  assert.ok(
    Math.hypot(expandedNode.x - anchor.x, expandedNode.y - anchor.y) <= 40.000_001,
    'a new neighbor must visibly grow from the expanded node instead of a random graph position',
  )
})

test('keeps both selected and hovered neighborhoods visible', () => {
  const renderer = createRenderer()
  renderer.selectedSlug = 'entity/selected'
  renderer.hoveredSlug = 'concept/hovered'
  renderer.width = 100
  renderer.height = 100
  renderer.panX = 50
  renderer.panY = 50

  const selectedNeighbor = visualNode('entity/selected-neighbor', ['entity/selected'])
  renderer.renderNode(selectedNeighbor)

  assert.ok(
    Math.abs(selectedNeighbor.fadeAlpha - 0.1) < Number.EPSILON,
    'hovering another node must not dim the selected node neighborhood',
  )
})

test('keeps edges from both selected and hovered neighborhoods visible', () => {
  const renderer = createRenderer()
  renderer.selectedSlug = 'entity/selected'
  renderer.hoveredSlug = 'concept/hovered'
  renderer.width = 100
  renderer.height = 100
  renderer.panX = 50
  renderer.panY = 50

  const source = visualNode('entity/selected', ['entity/selected-neighbor'])
  const target = visualNode('entity/selected-neighbor', ['entity/selected'])
  source.x = -10
  target.x = 10
  const point = { set: () => undefined }
  const line: any = { alpha: 0, tint: 0, position: point, width: 0, height: 0 }
  const arrow: any = {
    alpha: 0,
    visible: false,
    position: point,
    scale: point,
    rotation: 0,
    tint: 0,
  }
  const reverseArrow = { ...arrow, position: point, scale: point }
  const edge = {
    source,
    target,
    bidirectional: false,
    rendered: true,
    container: { visible: false, position: point, rotation: 0 },
    line,
    arrow,
    reverseArrow,
  }

  renderer.renderEdge(edge)

  assert.ok(
    Math.abs(line.alpha - 0.1) < Number.EPSILON,
    'hovering another node must not dim edges belonging to the selected neighborhood',
  )
})

test('keeps enabled arrows visible at the original minimum zoom', () => {
  const renderer = createRenderer()
  renderer.scale = 0.2
  renderer.showArrows = true
  renderer.width = 100
  renderer.height = 100
  renderer.panX = 50
  renderer.panY = 50

  const source = visualNode('entity/source', ['concept/target'])
  const target = visualNode('concept/target', ['entity/source'])
  source.x = -10
  target.x = 10
  const point = { set: () => undefined }
  const arrow: any = {
    alpha: 0,
    visible: false,
    position: point,
    scale: point,
    rotation: 0,
    tint: 0,
  }
  const edge = {
    source,
    target,
    bidirectional: true,
    rendered: true,
    container: { visible: false, position: point, rotation: 0 },
    line: { alpha: 0, tint: 0, position: point, width: 0, height: 0 },
    arrow,
    reverseArrow: { ...arrow, position: point, scale: point },
  }

  renderer.renderEdge(edge)

  assert.equal(edge.arrow.visible, true)
  assert.equal(edge.reverseArrow.visible, true)
})

test('delays hover clearing long enough to cross from a node to its bloom control', async () => {
  const renderer = createRenderer()
  const hovered = visualNode('entity/hovered')
  const hoverEvents: Array<string | null> = []
  renderer.hoveredSlug = hovered.id
  renderer.changed = () => undefined
  renderer.request = rendererRequest({ nodes: [], edges: [] }, {
    callbacks: {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onNodeHover: (slug: string | null) => hoverEvents.push(slug),
      onStageClick: () => undefined,
    },
  })

  renderer.unhoverNode(hovered)
  assert.equal(renderer.hoveredSlug, hovered.id, 'pointerout must not clear hover immediately')
  assert.deepEqual(hoverEvents, [])

  renderer.hoverNode(hovered, { pointerType: 'mouse' })
  await new Promise(resolve => setTimeout(resolve, 80))

  assert.equal(renderer.hoveredSlug, hovered.id, 're-entering before the grace period must cancel clearing')
  assert.deepEqual(hoverEvents, [hovered.id])
})

test('reserves the source drawer width in both fit scale and camera center', async () => {
  const renderer = createRenderer()
  const scaleChanges: number[] = []
  const cameraTargets: Array<{ x: number; y: number }> = []
  renderer.width = 1_000
  renderer.height = 600
  renderer.nodes = [
    { x: 0, y: 0 },
    { x: 500, y: 100 },
  ]
  renderer.request = rendererRequest({ nodes: [], edges: [] }, {
    callbacks: {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onNodeHover: () => undefined,
      onStageClick: () => undefined,
      onCameraScaleChange: (scale: number) => scaleChanges.push(scale),
    },
  })
  renderer.animatePan = async (x: number, y: number) => {
    cameraTargets.push({ x, y })
  }

  await renderer.fit({ rightInset: 480 })

  const expectedScale = 400 / 500
  assert.ok(Math.abs(renderer.targetScale - expectedScale) < 1e-10)
  assert.ok(Math.abs(cameraTargets[0].x - (260 - 250 * expectedScale)) < 1e-10)
  assert.ok(Math.abs(cameraTargets[0].y - (300 - 50 * expectedScale)) < 1e-10)
  assert.deepEqual(scaleChanges, [expectedScale])
})

test('fits an explicit local neighborhood without letting distant nodes control the camera', async () => {
  const renderer = createRenderer()
  renderer.width = 800
  renderer.height = 500
  const focus = { id: 'focus', x: 0, y: 0 }
  const neighbor = { id: 'neighbor', x: 200, y: 100 }
  const distant = { id: 'distant', x: 50_000, y: 50_000 }
  renderer.nodes = [focus, neighbor, distant]
  renderer.nodeLookup = new Map(renderer.nodes.map((node: { id: string }) => [node.id, node]))
  renderer.request = rendererRequest({ nodes: [], edges: [] })
  renderer.animatePan = async () => undefined

  await renderer.fit({ nodeSlugs: ['focus', 'neighbor'], maxScale: 0.7 })

  assert.equal(renderer.targetScale, 0.7)
})

test('reports a node position in the rendered viewport coordinate system', () => {
  const renderer = createRenderer()
  renderer.scale = 0.5
  renderer.panX = 140
  renderer.panY = 90
  renderer.nodeLookup = new Map([['focus', { id: 'focus', x: 120, y: -40 }]])

  assert.deepEqual(renderer.getNodeViewportPoint('focus'), { x: 200, y: 70, scale: 0.5 })
  assert.equal(renderer.getNodeViewportPoint('missing'), null)
})

test('fits only the unlocked prefix during a native progression', async () => {
  const renderer = createRenderer()
  renderer.width = 800
  renderer.height = 500
  renderer.nodes = [
    { x: -100, y: -50 },
    { x: 100, y: 50 },
    { x: 50_000, y: 50_000 },
  ]
  renderer.progressionState = 'playing'
  renderer.progressionVisibleNodes = 2
  renderer.request = rendererRequest({ nodes: [], edges: [] })
  renderer.animatePan = async () => undefined

  await renderer.fit({ visibleOnly: true, maxScale: 0.55 })

  assert.equal(renderer.targetScale, 0.55)
})

test('drops a stale selection before rendering a replacement graph', () => {
  const renderer = createRenderer()
  renderer.selectedSlug = 'entity/from-previous-graph'

  renderer.buildData(rendererRequest({
    nodes: [{ slug: 'concept/current', title: 'Current', page_type: 'concept', link_count: 0 }],
    edges: [],
  }), new Map())

  assert.equal(renderer.selectedSlug, null)
})

test('accepts the backend empty-edge representation for isolated nodes', () => {
  const renderer = createRenderer()

  renderer.buildData(rendererRequest({
    nodes: [{ slug: 'index', title: 'Index', page_type: 'index', link_count: 0 }],
    edges: null,
  }), new Map())

  assert.equal(renderer.nodes.length, 1)
  assert.deepEqual(renderer.edges, [])
})

test('applies a restored camera scale as the native eased zoom target', () => {
  const renderer = createRenderer()
  renderer.scale = 0.75
  renderer.targetScale = 0.75
  renderer.changed = () => undefined

  renderer.setObsidianSettings({ ...renderer.settings, scale: 1.5 })

  assert.equal(renderer.scale, 0.75, 'the current camera scale must keep its native easing')
  assert.equal(renderer.targetScale, 1.5, 'the restored scale must become effective without a rerender')
})

test('cancels an old camera animation before it can write into a replacement graph', async () => {
  const renderer = createRenderer()
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const scheduled: { frame: FrameRequestCallback | null } = { frame: null }
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    scheduled.frame = callback
    return 1
  }) as typeof requestAnimationFrame
  renderer.app = {}
  renderer.panX = 0
  renderer.panY = 0
  renderer.changed = () => undefined

  try {
    const animation = renderer.animatePan(100, 100, 1_000)
    const panAfterFirstFrame = { x: renderer.panX, y: renderer.panY }
    await new Promise(resolve => setTimeout(resolve, 10))
    renderer.cameraAnimationGeneration += 1
    assert.ok(scheduled.frame, 'the animation must schedule a continuation frame')
    scheduled.frame(performance.now())
    await animation

    assert.deepEqual(
      { x: renderer.panX, y: renderer.panY },
      panAfterFirstFrame,
      'a cancelled animation must not mutate the next graph camera',
    )
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
  }
})

test('ignores non-primary pointer presses for node drag and canvas pan', () => {
  const renderer = createRenderer()
  renderer.changed = () => undefined
  renderer.panX = 0
  renderer.panY = 0
  renderer.app = { stage: {} }
  renderer.canvas = { style: { cursor: 'grab' } }
  const event = {
    button: 2,
    pointerId: 7,
    nativeEvent: { shiftKey: false },
    stopPropagation: () => assert.fail('an ignored press must not stop propagation'),
    getLocalPosition: () => assert.fail('an ignored press must not read coordinates'),
  }

  renderer.beginNodeDrag(visualNode('entity/current'), event)
  renderer.beginPan(event)

  assert.equal(renderer.dragState, null)
  assert.equal(renderer.panState, null)
})

test('clears selection only when a canvas press also ends on the canvas', () => {
  const renderer = createRenderer()
  const stageClicks: number[] = []
  const background = {}
  const nodeTarget = {}
  renderer.background = background
  renderer.canvas = { style: { cursor: 'grabbing' } }
  renderer.changed = () => undefined
  renderer.request = rendererRequest({ nodes: [], edges: [] }, {
    callbacks: {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onNodeHover: () => undefined,
      onStageClick: () => stageClicks.push(1),
    },
  })
  const panState = () => ({
    pointerId: 7,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
    startedAt: performance.now(),
    lastAt: performance.now(),
    lastX: 0,
    lastY: 0,
  })

  renderer.panState = panState()
  renderer.endPointer({ pointerId: 7, target: nodeTarget })
  renderer.panState = panState()
  renderer.endPointer({ pointerId: 7, target: background })

  assert.equal(stageClicks.length, 1)
})

test('releases renderer-owned text textures through the public destroy lifecycle', () => {
  const destroyCalls: unknown[][] = []
  const container = {
    dataset: { graphVisual: 'obsidian-exact', graphStyle: 'obsidian-exact' },
    style: { removeProperty: () => undefined },
    replaceChildren: () => undefined,
  } as unknown as HTMLElement
  const renderer = new ObsidianWikiGraphRenderer(container) as any
  renderer.app = {
    destroy: (...args: unknown[]) => destroyCalls.push(args),
  }

  renderer.destroy()

  assert.deepEqual(destroyCalls, [[false, { children: true }]])
})

test('plays, pauses and resumes the audited node progression without refetching graph data', () => {
  const renderer = createRenderer()
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const originalDateNow = Date.now
  let now = 0
  let nextFrame: FrameRequestCallback | null = null
  const cancelled: number[] = []
  const snapshots: Array<{ state: string; visible: number; total: number }> = []
  let resets = 0

  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    nextFrame = callback
    return 41
  }) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) => cancelled.push(id)) as typeof cancelAnimationFrame
  Date.now = () => now

  renderer.app = {}
  renderer.exactWorker = true
  renderer.nodes = [
    { id: 'first', x: 0, y: 0, neighbors: new Set() },
    { id: 'second', x: 0, y: 0, neighbors: new Set() },
    { id: 'third', x: 0, y: 0, neighbors: new Set() },
  ]
  renderer.edges = []
  renderer.progressionItemTotal = 3
  renderer.progressionNodeStartItems = [1, 2, 3]
  renderer.request = rendererRequest({ nodes: [], edges: [] }, {
    callbacks: {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onNodeHover: () => undefined,
      onStageClick: () => undefined,
      onPlaybackChange: (snapshot: { state: string; visible: number; total: number }) => {
        snapshots.push({ ...snapshot })
      },
    },
  })
  renderer.resetRenderedGraph = () => { resets += 1 }
  renderer.changed = () => undefined
  renderer.prefersReducedMotion = () => false

  try {
    renderer.startProgression()
    assert.equal(resets, 1)
    assert.deepEqual(snapshots.at(-1), { state: 'playing', visible: 1, total: 3 })

    now = 100
    renderer.pauseProgression()
    assert.deepEqual(snapshots.at(-1), { state: 'paused', visible: 1, total: 3 })
    assert.deepEqual(cancelled, [41])

    now = 1_000
    renderer.resumeProgression()
    assert.deepEqual(snapshots.at(-1), { state: 'playing', visible: 1, total: 3 })

    now = 1_100
    assert.ok(nextFrame)
    ;(nextFrame as FrameRequestCallback)(now)
    assert.deepEqual(snapshots.at(-1), { state: 'playing', visible: 2, total: 3 })

    now = 1_300
    assert.ok(nextFrame)
    ;(nextFrame as FrameRequestCallback)(now)
    assert.deepEqual(snapshots.at(-1), { state: 'complete', visible: 3, total: 3 })
    assert.equal(resets, 1, 'resume must continue the same in-memory graph instead of rebuilding it')

    now = 2_000
    renderer.startProgression()
    assert.equal(resets, 2, 'play after completion must replay from the first node')
    assert.deepEqual(snapshots.at(-1), { state: 'playing', visible: 1, total: 3 })
    renderer.cancelProgression()
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    Date.now = originalDateNow
  }
})

test('restores the complete graph and pre-playback viewport from playing, paused and completed playback', () => {
  const originalWorker = globalThis.Worker
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const originalDateNow = Date.now
  const workers: Array<{ messages: any[]; terminated: boolean; onmessage?: (event: any) => void }> = []
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 0
  let now = 0
  globalThis.Worker = class {
    messages: any[] = []
    terminated = false
    onmessage?: (event: any) => void
    constructor() { workers.push(this) }
    postMessage(message: unknown) { this.messages.push(message) }
    terminate() { this.terminated = true }
  } as unknown as typeof Worker
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++nextFrameId, callback)
    return nextFrameId
  }
  globalThis.cancelAnimationFrame = id => { frames.delete(id) }
  Date.now = () => now

  try {
    for (const state of ['playing', 'paused', 'complete'] as const) {
      const renderer = createRenderer()
      const snapshots: unknown[] = []
      const cameraScales: number[] = []
      const request = rendererRequest({
        nodes: [
          { slug: 'first', title: 'First', page_type: 'entity', link_count: 1 },
          { slug: 'second', title: 'Second', page_type: 'entity', link_count: 1 },
        ],
        edges: [{ source: 'first', target: 'second' }],
      })
      request.callbacks.onPlaybackChange = (snapshot: unknown) => snapshots.push(snapshot)
      request.callbacks.onCameraScaleChange = (scale: number) => cameraScales.push(scale)
      renderer.request = request
      renderer.buildData(request, new Map([
        ['first', { x: 10, y: 20 }],
        ['second', { x: 30, y: 40 }],
      ]))
      renderer.app = {}
      renderer.exactWorker = true
      renderer.scale = renderer.targetScale = 1.5
      renderer.panX = 80
      renderer.panY = 90
      renderer.changed = () => undefined
      renderer.prefersReducedMotion = () => false
      renderer.startWorker()

      renderer.startProgression()
      const staleFrame = frames.get(nextFrameId)!
      if (state === 'paused') renderer.pauseProgression()
      if (state === 'complete') {
        now += 10_000
        staleFrame(now)
        assert.deepEqual(snapshots.at(-1), { state: 'complete', visible: 2, total: 2 })
        // Replaying must retain the original view, rather than snapshotting
        // positions produced by the preceding growth animation.
        renderer.startProgression()
        now += 10_000
        frames.get(nextFrameId)!(now)
      }
      renderer.nodes[0].x = -500
      renderer.nodes[1].y = 900
      renderer.scale = renderer.targetScale = 3
      renderer.panX = -100
      renderer.panY = 200
      renderer.panVelocityX = 4
      renderer.panVelocityY = -3
      renderer.latestPositions = new Float32Array([900, 900, 900, 900])
      const previousWorker = renderer.worker

      renderer.restoreProgression()

      assert.deepEqual(snapshots.at(-1), { state: 'idle', visible: 2, total: 2 })
      assert.equal(previousWorker.terminated, true)
      assert.deepEqual(renderer.worker.messages.at(-1).nodes, { first: [10, 20], second: [30, 40] })
      assert.deepEqual(renderer.worker.messages.at(-1).links, [['first', 'second']])
      assert.equal(renderer.worker.messages.at(-1).run, undefined, 'restoration must not start another layout animation')
      previousWorker.onmessage({ data: {
        id: ['first', 'second'], buffer: new Float32Array([900, 900, 900, 900]).buffer,
      } })
      renderer.applyWorkerPositions()
      renderer.updateCamera()
      assert.deepEqual(renderer.getNodeViewportPoint('first'), { x: 95, y: 120, scale: 1.5 })
      assert.deepEqual(renderer.getNodeViewportPoint('second'), { x: 125, y: 150, scale: 1.5 })
      assert.equal(cameraScales.at(-1), 1.5)
      const snapshotCount = snapshots.length
      staleFrame(now + 50_000)
      renderer.restoreProgression()
      assert.equal(snapshots.length, snapshotCount, 'stale frames and repeated restore must be harmless')

      // A subsequent playback must snapshot the newly chosen view.
      renderer.nodes[0].x = 40
      renderer.panX = 120
      renderer.startProgression()
      renderer.restoreProgression()
      assert.deepEqual(renderer.getNodeViewportPoint('first'), { x: 180, y: 120, scale: 1.5 })
    }
  } finally {
    globalThis.Worker = originalWorker
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    Date.now = originalDateNow
  }
})

test('builds the native file-plus-outgoing-link progression budget', () => {
  const renderer = createRenderer()
  renderer.buildData(rendererRequest({
    nodes: [
      { slug: 'summary', title: 'Summary', page_type: 'summary', link_count: 2 },
      { slug: 'chapter', title: 'Chapter', page_type: 'entity', link_count: 2 },
      { slug: 'theme', title: 'Theme', page_type: 'concept', link_count: 2 },
    ],
    edges: [
      { source: 'summary', target: 'chapter' },
      { source: 'summary', target: 'theme' },
      { source: 'chapter', target: 'theme' },
    ],
  }), new Map())

  assert.equal(renderer.progressionItemTotal, 6)
  assert.deepEqual(renderer.progressionNodeStartItems, [1, 4, 6])
})

test('replacement graph data cannot restore a snapshot from the preceding graph', () => {
  const renderer = new ObsidianWikiGraphRenderer({ replaceChildren() {} } as unknown as HTMLElement) as any
  const snapshots: unknown[] = []
  const request = rendererRequest({
    nodes: [{ slug: 'same-id', title: 'Old graph', page_type: 'entity', link_count: 0 }],
    edges: [],
  })
  request.callbacks.onPlaybackChange = (snapshot: unknown) => snapshots.push(snapshot)
  renderer.request = request
  renderer.buildData(request, new Map([['same-id', { x: 10, y: 20 }]]))
  renderer.app = { destroy() {} }
  renderer.changed = () => undefined
  renderer.prefersReducedMotion = () => false
  renderer.startProgression()

  // render() tears down the preceding runtime before building incoming data.
  renderer.teardownRuntime()
  renderer.buildData(request, new Map([['same-id', { x: 300, y: 400 }]]))
  renderer.app = {}
  const beforeRestore = snapshots.length
  renderer.restoreProgression()

  assert.deepEqual(renderer.getNodeViewportPoint('same-id'), { x: 300, y: 400, scale: 1 })
  assert.equal(snapshots.length, beforeRestore)
})

test('seeds each newly unlocked connected node around its visible neighbors', () => {
  const renderer = createRenderer()
  const originalRandom = Math.random
  Math.random = () => 0.75
  try {
    renderer.buildData(rendererRequest({
      nodes: [
        { slug: 'summary', title: 'Summary', page_type: 'summary', link_count: 1 },
        { slug: 'chapter', title: 'Chapter', page_type: 'entity', link_count: 1 },
      ],
      edges: [{ source: 'summary', target: 'chapter' }],
    }), new Map())
    renderer.prepareProgressionPositions()
    renderer.seedProgressionNodes(1, 2)

    assert.deepEqual(
      { x: renderer.nodes[0].x, y: renderer.nodes[0].y },
      { x: 0, y: 0 },
      'the first file is the stable center of the early Obsidian view',
    )
    assert.ok(
      Math.hypot(renderer.nodes[1].x, renderer.nodes[1].y) <= Math.sqrt(60 * 60 / 2) + 1e-9,
      'a connected node must start in the native neighbor-jitter envelope',
    )
  } finally {
    Math.random = originalRandom
  }
})

test('reduced motion completes progression immediately and reports every node visible', () => {
  const renderer = createRenderer()
  const snapshots: Array<{ state: string; visible: number; total: number }> = []
  renderer.app = {}
  renderer.nodes = [{}, {}, {}, {}]
  renderer.edges = []
  renderer.request = rendererRequest({ nodes: [], edges: [] }, {
    callbacks: {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onNodeHover: () => undefined,
      onStageClick: () => undefined,
      onPlaybackChange: (snapshot: { state: string; visible: number; total: number }) => {
        snapshots.push({ ...snapshot })
      },
    },
  })
  renderer.resetRenderedGraph = () => undefined
  renderer.changed = () => undefined
  renderer.prefersReducedMotion = () => true

  renderer.startProgression()

  assert.deepEqual(snapshots, [
    { state: 'playing', visible: 1, total: 4 },
    { state: 'complete', visible: 4, total: 4 },
  ])
})

test('a single-node graph completes without leaving a progression frame running forever', () => {
  const renderer = createRenderer()
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  let scheduled = 0
  const snapshots: Array<{ state: string; visible: number; total: number }> = []
  globalThis.requestAnimationFrame = (() => {
    scheduled += 1
    return 91
  }) as typeof requestAnimationFrame
  renderer.app = {}
  renderer.nodes = [{ id: 'only', x: 0, y: 0 }]
  renderer.edges = []
  renderer.request = rendererRequest({ nodes: [], edges: [] }, {
    callbacks: {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onNodeHover: () => undefined,
      onStageClick: () => undefined,
      onPlaybackChange: (snapshot: { state: string; visible: number; total: number }) => {
        snapshots.push({ ...snapshot })
      },
    },
  })
  renderer.resetRenderedGraph = () => undefined
  renderer.changed = () => undefined
  renderer.prefersReducedMotion = () => false

  try {
    renderer.startProgression()
    assert.deepEqual(snapshots.at(-1), { state: 'complete', visible: 1, total: 1 })
    assert.equal(scheduled, 0)
    assert.equal(renderer.progressionFrameId, null)
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
  }
})

test('feeds only the unlocked node prefix and its internal edges to the exact Worker', () => {
  const renderer = createRenderer()
  const messages: any[] = []
  const first = { id: 'first', x: 1, y: 2 }
  const second = { id: 'second', x: 3, y: 4 }
  const third = { id: 'third', x: 5, y: 6 }
  renderer.exactWorker = true
  renderer.worker = { postMessage: (message: unknown) => messages.push(message) }
  renderer.nodes = [first, second, third]
  renderer.edges = [
    { source: first, target: second },
    { source: second, target: third },
  ]
  renderer.progressionVisibleNodes = 2
  renderer.latestPositions = new Float32Array([90, 91, 92, 93, 94, 95])
  renderer.sharedPositions = new Float32Array([80, 81, 82, 83, 84, 85])
  renderer.sharedVersion = new Uint32Array([7])
  renderer.workerIndexById = new Map([['third', 2]])

  renderer.syncProgressionWorker()

  assert.deepEqual(Object.keys(messages[0].nodes), ['first', 'second'])
  assert.deepEqual(messages[0].links, [['first', 'second']])
  assert.equal(renderer.latestPositions, null)
  assert.equal(renderer.sharedPositions, null)
  assert.equal(renderer.sharedVersion, null)
  assert.equal(renderer.workerIndexById.size, 0)
  assert.equal(renderer.matchesExpectedWorkerNodes(['first', 'second']), true)
  assert.equal(
    renderer.matchesExpectedWorkerNodes(['first', 'second', 'third']),
    false,
    'a queued full-graph result from before replay must not overwrite prefix coordinates',
  )
})

test('keeps hidden-node coordinates intact while the exact Worker returns a shorter prefix', () => {
  const renderer = createRenderer()
  renderer.exactWorker = true
  renderer.latestPositions = new Float32Array([11, 12])
  renderer.workerIndexById = new Map([['first', 0]])
  renderer.nodes = [
    { id: 'first', x: 1, y: 2 },
    { id: 'hidden', x: 30, y: 40 },
  ]

  renderer.applyWorkerPositions()

  assert.deepEqual(
    renderer.nodes.map((node: { x: number; y: number }) => ({ x: node.x, y: node.y })),
    [{ x: 11, y: 12 }, { x: 30, y: 40 }],
  )
})

test('unlocks only the stable API-order node prefix during progression', () => {
  const renderer = createRenderer()
  const initialized: string[] = []
  renderer.width = 100
  renderer.height = 100
  renderer.scale = 1
  renderer.panX = 50
  renderer.panY = 50
  renderer.progressionState = 'playing'
  renderer.progressionVisibleNodes = 2
  renderer.nodes = [
    { id: 'first', playbackIndex: 0, rendered: false, x: 0, y: 0 },
    { id: 'second', playbackIndex: 1, rendered: false, x: 1, y: 0 },
    { id: 'third', playbackIndex: 2, rendered: false, x: 2, y: 0 },
  ]
  renderer.initializeNode = (node: { id: string; rendered: boolean }) => {
    node.rendered = true
    initialized.push(node.id)
  }

  renderer.initializeNearestNodes()
  assert.deepEqual(initialized, ['first', 'second'])

  renderer.progressionVisibleNodes = 3
  renderer.initializeNearestNodes()
  assert.deepEqual(initialized, ['first', 'second', 'third'])
})

test('destroy cancels progression and stale scheduled callbacks cannot report again', () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  let scheduled: FrameRequestCallback | null = null
  const cancelled: number[] = []
  const snapshots: unknown[] = []
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    scheduled = callback
    return 73
  }) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame = ((id: number) => cancelled.push(id)) as typeof cancelAnimationFrame

  const container = {
    dataset: { graphVisual: 'obsidian-exact', graphStyle: 'obsidian-exact' },
    style: { removeProperty: () => undefined },
    replaceChildren: () => undefined,
  } as unknown as HTMLElement
  const renderer = new ObsidianWikiGraphRenderer(container) as any
  renderer.app = { destroy: () => undefined }
  renderer.nodes = [{}, {}]
  renderer.edges = []
  renderer.request = rendererRequest({ nodes: [], edges: [] }, {
    callbacks: {
      onNodeClick: () => undefined,
      onNodeDoubleClick: () => undefined,
      onNodeHover: () => undefined,
      onStageClick: () => undefined,
      onPlaybackChange: (snapshot: unknown) => snapshots.push(snapshot),
    },
  })
  renderer.resetRenderedGraph = () => undefined
  renderer.changed = () => undefined
  renderer.prefersReducedMotion = () => false

  try {
    renderer.startProgression()
    const callback = scheduled as FrameRequestCallback | null
    assert.ok(callback)
    assert.equal(snapshots.length, 1)

    renderer.destroy()
    assert.deepEqual(cancelled, [73])
    callback(performance.now())
    renderer.restoreProgression()
    assert.equal(snapshots.length, 1)
    assert.equal(renderer.progressionSnapshot, null)
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame
  }
})
