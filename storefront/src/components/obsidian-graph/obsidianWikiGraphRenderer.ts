import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js'

import {
  OBSIDIAN_NATIVE_RENDER,
  clamp,
  obsidianGraphProgressionItemCursor,
  obsidianGraphProgressionVisibleNodes,
  obsidianEase,
  obsidianNodeRadius,
  obsidianNodeScale,
  obsidianTextAlpha,
  obsidianWheelTargetScale,
} from './obsidianNativeGraphContract.ts'
import {
  createDefaultObsidianGraphSettings,
  normalizeObsidianGraphSettings,
  obsidianGraphForceValues,
  type ObsidianGraphSettings,
} from './obsidianGraphSettings.ts'
import {
  OBSIDIAN_GRAPH_WORKER_PATH,
  buildObsidianWorkerDragMessage,
  buildObsidianWorkerForceMessage,
  buildObsidianWorkerInitMessage,
  readObsidianWorkerResult,
} from './obsidianGraphWorkerProtocol.ts'
import type {
  WikiGraphFitOptions,
  WikiGraphFocusOptions,
  WikiGraphPlaybackSnapshot,
  WikiGraphPlaybackState,
  WikiGraphRenderRequest,
  WikiGraphRenderer,
  WikiGraphViewportPoint,
} from './wikiGraphRenderer.ts'
import { wikiGraphNodeColor } from './wikiGraphRenderer.ts'
import {
  FALLBACK_WEKNORA_GRAPH_THEME,
  readWeknoraGraphTheme,
  type WeknoraGraphTheme,
} from './weknoraGraphTheme.ts'

interface NativeNode {
  id: string
  playbackIndex: number
  title: string
  weight: number
  totalLinks: number
  hiddenNeighbors: number
  isEgoCenter: boolean
  bloomEligible: boolean
  color: number | null
  x: number
  y: number
  neighbors: Set<string>
  rendered: boolean
  fadeAlpha: number
  labelLift: number
  circle: Graphics | null
  label: Text | null
  outline: Graphics | null
  expansionRing: Graphics | null
  bloomButton: Container | null
}

interface NativeEdge {
  source: NativeNode
  target: NativeNode
  bidirectional: boolean
  rendered: boolean
  container: Container | null
  line: Sprite | null
  arrow: Graphics | null
  reverseArrow: Graphics | null
}

interface CameraSnapshot {
  scale: number
  targetScale: number
  panX: number
  panY: number
}

interface NodeDragState {
  node: NativeNode
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  shiftKey: boolean
}

interface PanState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  moved: boolean
  startedAt: number
  lastAt: number
  lastX: number
  lastY: number
}

const FONT_FAMILY = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, "Inter", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Microsoft YaHei Light", sans-serif'

function colorMix(current: number, target: number): number {
  const mix = (from: number, to: number) => Math.round(obsidianEase(from, to))
  return (
    (mix((current >> 16) & 0xff, (target >> 16) & 0xff) << 16)
    + (mix((current >> 8) & 0xff, (target >> 8) & 0xff) << 8)
    + mix(current & 0xff, target & 0xff)
  )
}

function intersects(
  viewport: { left: number; right: number; top: number; bottom: number },
  bounds: { left: number; right: number; top: number; bottom: number },
): boolean {
  return !(
    bounds.right < viewport.left
    || bounds.left > viewport.right
    || bounds.bottom < viewport.top
    || bounds.top > viewport.bottom
  )
}

export class ObsidianWikiGraphRenderer implements WikiGraphRenderer {
  private app: Application | null = null
  private canvas: HTMLCanvasElement | null = null
  private background: Graphics | null = null
  private world: Container | null = null
  private worker: Worker | null = null
  private resizeObserver: ResizeObserver | null = null
  private themeObserver: MutationObserver | null = null
  private frameId: number | null = null
  private progressionFrameId: number | null = null
  private progressionGeneration = 0
  private progressionState: WikiGraphPlaybackState = 'idle'
  private progressionVisibleNodes = 0
  private progressionItemTotal = 0
  private progressionNodeStartItems: number[] = []
  private progressionTimeScale = 1
  private progressionStartedAt = 0
  private progressionElapsedMs = 0
  private progressionSnapshot: {
    positions: Map<string, { x: number; y: number }>
    camera: CameraSnapshot | null
  } | null = null
  private cameraAnimationGeneration = 0
  private request: WikiGraphRenderRequest | null = null
  private nodes: NativeNode[] = []
  private nodeLookup = new Map<string, NativeNode>()
  private edges: NativeEdge[] = []
  private latestPositions: Float32Array | null = null
  private sharedPositions: Float32Array | null = null
  private sharedVersion: Int32Array | Uint32Array | null = null
  private workerNodeIds: string[] = []
  private workerIndexById = new Map<string, number>()
  private expectedWorkerNodeIds: Set<string> | null = null
  private lastSharedVersion = -1
  private selectedSlug: string | null = null
  private hoveredSlug: string | null = null
  private showArrows = false
  private dragState: NodeDragState | null = null
  private panState: PanState | null = null
  private lastClick: { slug: string; at: number } | null = null
  private hoverLeaveTimer: ReturnType<typeof setTimeout> | null = null
  private scale = 1
  private targetScale = 1
  private panX = 0
  private panY = 0
  private panVelocityX = 0
  private panVelocityY = 0
  private zoomCenterX = 0
  private zoomCenterY = 0
  private width = 0
  private height = 0
  private idleFrames = 0
  private destroyed = false
  private exactWorker = false
  private settings: ObsidianGraphSettings = createDefaultObsidianGraphSettings()
  private theme: WeknoraGraphTheme = { ...FALLBACK_WEKNORA_GRAPH_THEME }

  constructor(private readonly container: HTMLElement) {}

  async render(request: WikiGraphRenderRequest): Promise<void> {
    if (this.destroyed) return

    const positions = request.preserveLayout ? this.snapshotPositions() : new Map<string, { x: number; y: number }>()
    const camera = request.preserveLayout ? this.snapshotCamera() : null
    this.teardownRuntime()

    this.request = request
    this.exactWorker = request.styleId === 'obsidian-exact'
    this.settings = this.exactWorker
      ? normalizeObsidianGraphSettings(request.obsidianSettings)
      : createDefaultObsidianGraphSettings()
    this.progressionTimeScale = typeof request.progressionTimeScale === 'number'
      && Number.isFinite(request.progressionTimeScale)
      ? clamp(request.progressionTimeScale, 0.1, 16)
      : 1
    this.selectedSlug = request.selectedSlug
    this.hoveredSlug = null
    this.showArrows = request.showArrows
    this.theme = readWeknoraGraphTheme(this.container)
    this.container.dataset.graphVisual = this.exactWorker ? 'obsidian-exact' : 'obsidian-native'
    this.container.dataset.graphStyle = request.styleId
    this.container.style.background = 'var(--td-bg-color-container)'
    this.container.style.overflow = 'hidden'
    this.container.style.position = 'relative'

    this.width = Math.max(1, this.container.clientWidth || 800)
    this.height = Math.max(1, this.container.clientHeight || 600)
    const canvas = document.createElement('canvas')
    canvas.className = 'wiki-obsidian-native-canvas'
    canvas.style.position = 'absolute'
    canvas.style.inset = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'grab'
    this.container.replaceChildren(canvas)
    this.canvas = canvas

    const app = new Application({
      view: canvas,
      width: this.width,
      height: this.height,
      resolution: Math.max(1, window.devicePixelRatio || 1),
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
      autoStart: false,
    })
    this.app = app
    app.stage.eventMode = 'static'
    app.stage.hitArea = new Rectangle(0, 0, this.width, this.height)
    app.stage.sortableChildren = true

    const background = new Graphics()
      .beginFill(this.theme.background, 0.001)
      .drawRect(0, 0, this.width, this.height)
      .endFill()
    background.eventMode = 'static'
    background.cursor = 'grab'
    background.zIndex = -1
    app.stage.addChild(background)
    this.background = background

    const world = new Container()
    world.eventMode = 'static'
    world.sortableChildren = true
    app.stage.addChild(world)
    this.world = world

    this.buildData(request, positions)
    this.emitProgression('idle', this.nodes.length)
    this.bindInteractions()
    this.startWorker()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this.container)
    this.bindThemeObserver()

    if (camera) this.restoreCamera(camera)
    else if (this.exactWorker) {
      this.scale = this.settings.scale
      this.targetScale = this.settings.scale
      this.panX = this.width / 2
      this.panY = this.height / 2
    } else this.fitImmediately()
    this.changed()
  }

  hasNode(slug: string): boolean {
    return this.nodeLookup.has(slug)
  }

  async focusNode(slug: string, options: WikiGraphFocusOptions = {}): Promise<void> {
    const node = this.nodeLookup.get(slug)
    if (!node) return
    const targetPanX = this.width / 2 + (options.offsetX ?? 0) - node.x * this.scale
    const targetPanY = this.height / 2 - node.y * this.scale
    await this.animatePan(targetPanX, targetPanY, 380)
  }

  getNodeViewportPoint(slug: string): WikiGraphViewportPoint | null {
    const node = this.nodeLookup.get(slug)
    if (!node) return null
    return {
      x: node.x * this.scale + this.panX,
      y: node.y * this.scale + this.panY,
      scale: this.scale,
    }
  }

  async fit(options: WikiGraphFitOptions = {}): Promise<void> {
    const requestedNodes = options.nodeSlugs?.map(slug => this.nodeLookup.get(slug))
      .filter((node): node is NativeNode => Boolean(node))
    const fitNodes = requestedNodes?.length
      ? requestedNodes
      : options.visibleOnly
        ? this.nodes.slice(0, this.progressionVisibleNodes)
        : this.nodes
    const target = this.calculateFit(
      options.rightInset ?? 0,
      options.bottomInset ?? 0,
      fitNodes,
      options.maxScale ?? 2,
    )
    if (!target) return
    this.targetScale = target.scale
    this.request?.callbacks.onCameraScaleChange?.(target.scale)
    this.zoomCenterX = this.width / 2
    this.zoomCenterY = this.height / 2
    await this.animatePan(target.panX, target.panY, 420)
  }

  setArrowsVisible(visible: boolean): void {
    this.showArrows = visible
    this.changed()
  }

  setSelection(selectedSlug: string | null, hoveredSlug: string | null = null): void {
    this.selectedSlug = selectedSlug
    this.hoveredSlug = hoveredSlug
    this.changed()
  }

  setProgressionTimeScale(timeScale: number): void {
    if (!Number.isFinite(timeScale) || timeScale <= 0) return
    this.accumulateProgressionElapsed()
    this.progressionTimeScale = clamp(timeScale, 0.1, 16)
  }

  setObsidianSettings(settings: ObsidianGraphSettings): void {
    const next = normalizeObsidianGraphSettings(settings)
    const previousForces = obsidianGraphForceValues(this.settings)
    const nextForces = obsidianGraphForceValues(next)
    this.settings = next
    this.targetScale = next.scale
    if (
      this.worker
      && (
        previousForces.centerStrength !== nextForces.centerStrength
        || previousForces.repelStrength !== nextForces.repelStrength
        || previousForces.linkStrength !== nextForces.linkStrength
        || previousForces.linkDistance !== nextForces.linkDistance
      )
    ) {
      if (this.exactWorker) this.worker.postMessage(buildObsidianWorkerForceMessage(next))
    }
    this.changed()
  }

  restartSimulation(): void {
    if (this.exactWorker) {
      this.worker?.postMessage({ alpha: 1, alphaTarget: 0, run: true })
    }
    this.changed()
  }

  startProgression(): void {
    if (!this.app || this.destroyed) return
    this.cancelProgression()

    const total = this.nodes.length
    if (total === 0) {
      this.emitProgression('complete', 0)
      return
    }

    // A replay keeps the same original view until it is explicitly restored.
    this.progressionSnapshot ??= {
      positions: this.snapshotPositions(),
      camera: this.snapshotCamera(),
    }
    this.resetRenderedGraph()
    this.prepareProgressionPositions()
    this.progressionVisibleNodes = 1
    this.progressionElapsedMs = 0
    this.progressionStartedAt = Date.now()
    this.progressionState = 'playing'
    this.emitProgression('playing', 1)
    this.syncProgressionWorker()

    if (this.prefersReducedMotion()) {
      this.progressionVisibleNodes = total
      this.syncProgressionWorker()
      this.progressionState = 'complete'
      this.revealProgressionImmediately()
      this.emitProgression('complete', total)
      this.changed()
      return
    }

    if (total === 1) {
      this.emitProgression('complete', 1)
      this.changed()
      return
    }

    this.changed()
    this.queueProgressionFrame()
  }

  pauseProgression(): void {
    if (this.progressionState !== 'playing') return
    this.accumulateProgressionElapsed()
    this.cancelProgressionFrame()
    this.progressionState = 'paused'
    this.emitProgression('paused', this.progressionVisibleNodes)
  }

  resumeProgression(): void {
    if (this.progressionState !== 'paused' || !this.app || this.destroyed) return
    this.progressionStartedAt = Date.now()
    this.progressionState = 'playing'
    this.restartSimulation()
    this.emitProgression('playing', this.progressionVisibleNodes)
    this.queueProgressionFrame()
  }

  restoreProgression(): void {
    const snapshot = this.progressionSnapshot
    if (!snapshot || !this.app || this.destroyed) return

    this.cancelProgression()
    this.cameraAnimationGeneration += 1
    this.dragState = null
    this.panState = null
    this.panVelocityX = 0
    this.panVelocityY = 0
    this.zoomCenterX = 0
    this.zoomCenterY = 0
    this.worker?.terminate()
    this.worker = null
    this.clearWorkerPositionCache()
    for (const node of this.nodes) {
      const position = snapshot.positions.get(node.id)
      if (position) Object.assign(node, position)
    }
    if (snapshot.camera) {
      // Restore the view actually visible when playback started, without
      // carrying over an unfinished wheel zoom or inertial pan.
      this.restoreCamera({ ...snapshot.camera, targetScale: snapshot.camera.scale })
    }
    // A fresh, idle worker drops playback velocities and stale result buffers.
    // It resumes normally on the next drag, force change or playback action.
    this.startWorker(false)
    this.revealProgressionImmediately()
    this.progressionSnapshot = null
    this.emitProgression('idle', this.nodes.length)
    this.request?.callbacks.onCameraScaleChange?.(this.scale)
    this.changed()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.request = null
    this.teardownRuntime()
    delete this.container.dataset.graphVisual
    delete this.container.dataset.graphStyle
    this.container.style.removeProperty('background')
    this.container.style.removeProperty('overflow')
    this.container.style.removeProperty('position')
    this.container.replaceChildren()
  }

  private buildData(
    request: WikiGraphRenderRequest,
    positions: Map<string, { x: number; y: number }>,
  ): void {
    const count = request.data.nodes.length
    const diskRadius = Math.sqrt((60 * count * 60) / Math.PI)
    const anchorPosition = request.preserveLayout && request.anchorSlug
      ? positions.get(request.anchorSlug)
      : undefined
    this.nodes = request.data.nodes.map((source, playbackIndex) => {
      const previous = positions.get(source.slug)
      const angle = Math.random() * Math.PI * 2
      const radius = anchorPosition ? 40 : Math.sqrt(Math.random()) * diskRadius
      const x = previous?.x ?? (anchorPosition?.x ?? 0) + Math.cos(angle) * radius
      const y = previous?.y ?? (anchorPosition?.y ?? 0) + Math.sin(angle) * radius
      return {
        id: source.slug,
        playbackIndex,
        title: source.title,
        weight: source.link_count,
        totalLinks: source.link_count,
        hiddenNeighbors: 0,
        isEgoCenter: false,
        bloomEligible: false,
        color: typeof source.color === 'number'
          ? source.color
          : wikiGraphNodeColor(source.page_type),
        x,
        y,
        neighbors: new Set<string>(),
        rendered: false,
        fadeAlpha: 0,
        labelLift: 0,
        circle: null,
        label: null,
        outline: null,
        expansionRing: null,
        bloomButton: null,
      }
    })
    this.nodeLookup = new Map(this.nodes.map(node => [node.id, node]))
    if (this.selectedSlug && !this.nodeLookup.has(this.selectedSlug)) {
      this.selectedSlug = null
    }

    // The graph API serializes an empty edge slice as `null`. Keep the
    // adapter as tolerant as the original WeKnora renderer for isolated
    // overview/ego nodes instead of failing the entire canvas.
    const sourceEdges = Array.isArray(request.data.edges) ? request.data.edges : []
    const outgoingLinks = new Map<string, number>()
    for (const edge of sourceEdges) {
      outgoingLinks.set(edge.source, (outgoingLinks.get(edge.source) ?? 0) + 1)
    }
    let nextNodeStartItem = 1
    this.progressionNodeStartItems = this.nodes.map(node => {
      const startItem = nextNodeStartItem
      nextNodeStartItem += 1 + (outgoingLinks.get(node.id) ?? 0)
      return startItem
    })
    this.progressionItemTotal = Math.max(0, nextNodeStartItem - 1)
    const directedEdges = new Set(
      sourceEdges.map(edge => `${edge.source}\u0000${edge.target}`),
    )
    const seen = new Set<string>()
    this.edges = sourceEdges.flatMap((source) => {
      const from = this.nodeLookup.get(source.source)
      const to = this.nodeLookup.get(source.target)
      if (!from || !to || from === to) return []
      from.neighbors.add(to.id)
      to.neighbors.add(from.id)
      const key = from.id < to.id ? `${from.id}\u0000${to.id}` : `${to.id}\u0000${from.id}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{
        source: from,
        target: to,
        bidirectional: directedEdges.has(`${to.id}\u0000${from.id}`),
        rendered: false,
        container: null,
        line: null,
        arrow: null,
        reverseArrow: null,
      } satisfies NativeEdge]
    })
    // Obsidian's global graph sizes nodes by their actual rendered degree.
    const graphMode = request.data.meta?.mode
    const graphCenter = request.data.meta?.center
    for (const node of this.nodes) {
      node.weight = node.neighbors.size
      node.hiddenNeighbors = Math.max(0, node.totalLinks - node.neighbors.size)
      node.isEgoCenter = graphMode === 'ego' && graphCenter === node.id
      node.bloomEligible = graphMode === 'ego' && !node.isEgoCenter && node.hiddenNeighbors > 0
    }
  }

  private bindInteractions(): void {
    const app = this.app
    const background = this.background
    const canvas = this.canvas
    if (!app || !background || !canvas) return

    background.on('pointerdown', event => this.beginPan(event))
    app.stage
      .on('pointermove', event => this.handlePointerMove(event))
      .on('pointerup', event => this.endPointer(event))
      .on('pointerupoutside', event => this.endPointer(event))
    canvas.addEventListener('wheel', this.handleWheel, { passive: false })
  }

  private startWorker(run = true): void {
    const worker = this.exactWorker
      ? new Worker(
          `${import.meta.env?.BASE_URL ?? '/'}${OBSIDIAN_GRAPH_WORKER_PATH}`,
          { name: 'Graph Worker' },
        )
      : new Worker(new URL('./obsidianForce.worker.ts', import.meta.url), {
          type: 'module',
          name: 'Obsidian Compatibility Graph Worker',
        })
    worker.onmessage = (event: MessageEvent) => {
      if (this.worker !== worker) return
      if (event.data?.ignore) return
      if (this.exactWorker && Array.isArray(event.data?.id) && event.data?.buffer) {
        const result = readObsidianWorkerResult(event.data)
        if (!this.matchesExpectedWorkerNodes(result.ids)) return
        this.workerNodeIds = result.ids
        this.workerIndexById = new Map(result.ids.map((id, index) => [id, index]))
        if (result.version) {
          this.sharedPositions = result.positions
          this.sharedVersion = result.version
          this.lastSharedVersion = result.previousVersion ?? -1
          this.latestPositions = null
        } else {
          this.latestPositions = result.positions
        }
      } else if (event.data?.type === 'shared-positions') {
        const buffer = event.data.positions as SharedArrayBuffer
        this.sharedPositions = new Float32Array(buffer, 0, this.nodes.length * 2)
        this.sharedVersion = new Int32Array(
          buffer,
          this.nodes.length * 2 * Float32Array.BYTES_PER_ELEMENT,
          1,
        )
        this.lastSharedVersion = -1
      } else if (event.data?.type === 'positions') {
        this.latestPositions = new Float32Array(event.data.positions as ArrayBuffer)
      }
      this.changed()
    }
    worker.onerror = (error) => console.error('Obsidian graph worker failed:', error)
    this.worker = worker
    if (this.exactWorker) {
      this.expectedWorkerNodeIds = new Set(this.nodes.map(node => node.id))
      worker.postMessage(buildObsidianWorkerInitMessage(
        this.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })),
        this.edges.map(edge => ({ source: edge.source.id, target: edge.target.id })),
        this.settings,
        run,
      ))
    } else {
      worker.postMessage({
        type: 'init',
        nodes: this.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })),
        links: this.edges.map(edge => ({ source: edge.source.id, target: edge.target.id })),
        run,
      })
    }
  }

  private syncProgressionWorker(): void {
    if (!this.exactWorker || !this.worker) return

    // Obsidian's data engine re-sends only the currently unlocked prefix to
    // its graph worker on every progression step. Hidden nodes therefore do
    // not pull on the layout before they are revealed.
    const visibleNodes = this.nodes.slice(0, this.progressionVisibleNodes)
    const visibleIds = new Set(visibleNodes.map(node => node.id))
    const visibleEdges = this.edges.filter(edge => (
      visibleIds.has(edge.source.id) && visibleIds.has(edge.target.id)
    ))
    this.clearWorkerPositionCache()
    this.expectedWorkerNodeIds = visibleIds
    this.worker.postMessage(buildObsidianWorkerInitMessage(
      visibleNodes.map(node => ({ id: node.id, x: node.x, y: node.y })),
      visibleEdges.map(edge => ({ source: edge.source.id, target: edge.target.id })),
      this.settings,
    ))
  }

  /**
   * Obsidian starts a timelapse from one centered file, then seeds each new
   * batch beside already-visible neighbors (or in the next outer annulus).
   * The same Worker still owns every subsequent force-simulation tick.
   */
  private prepareProgressionPositions(): void {
    const first = this.nodes[0]
    if (!first) return
    first.x = 0
    first.y = 0
  }

  private seedProgressionNodes(previousVisible: number, nextVisible: number): void {
    const from = clamp(Math.floor(previousVisible), 0, this.nodes.length)
    const to = clamp(Math.floor(nextVisible), from, this.nodes.length)
    const incoming = this.nodes.slice(from, to)
    if (incoming.length === 0) return

    const existing = this.nodes.slice(0, from)
    const existingIds = new Set(existing.map(node => node.id))
    const maxRadius = existing.reduce(
      (radius, node) => Math.max(radius, Math.hypot(node.x, node.y)),
      0,
    )
    const occupiedArea = 60 * incoming.length * 60
    const annulusWidth = Math.sqrt(occupiedArea / Math.PI + maxRadius ** 2) - maxRadius
    const neighborJitter = Math.sqrt(occupiedArea)

    for (const node of incoming) {
      const neighbors = existing.filter(candidate => (
        existingIds.has(candidate.id) && node.neighbors.has(candidate.id)
      ))
      if (neighbors.length > 0) {
        const center = neighbors.reduce(
          (sum, neighbor) => ({ x: sum.x + neighbor.x, y: sum.y + neighbor.y }),
          { x: 0, y: 0 },
        )
        node.x = center.x / neighbors.length + (Math.random() - 0.5) * neighborJitter
        node.y = center.y / neighbors.length + (Math.random() - 0.5) * neighborJitter
      } else {
        const angle = Math.random() * Math.PI * 2
        const radius = maxRadius + Math.random() * annulusWidth
        node.x = Math.cos(angle) * radius
        node.y = Math.sin(angle) * radius
      }
    }
  }

  private matchesExpectedWorkerNodes(ids: string[]): boolean {
    const expected = this.expectedWorkerNodeIds
    return expected === null
      || (ids.length === expected.size && ids.every(id => expected.has(id)))
  }

  private clearWorkerPositionCache(): void {
    this.latestPositions = null
    this.sharedPositions = null
    this.sharedVersion = null
    this.workerNodeIds = []
    this.workerIndexById.clear()
    this.lastSharedVersion = -1
  }

  private initializeNode(node: NativeNode): void {
    const world = this.world
    if (!world || node.rendered) return
    node.rendered = true

    const circle = new Graphics()
      .beginFill(0xffffff)
      .drawCircle(100, 100, 100)
      .endFill()
    circle.pivot.set(100, 100)
    circle.tint = this.getNodeColor(node)
    circle.eventMode = 'static'
    circle.cursor = 'pointer'
    circle.zIndex = 1
    circle
      .on('pointerdown', event => this.beginNodeDrag(node, event))
      .on('pointerover', event => this.hoverNode(node, event))
      .on('pointerout', () => this.unhoverNode(node))
    world.addChild(circle)
    node.circle = circle

    const radius = obsidianNodeRadius(node.weight, this.settings.nodeSizeMultiplier)
    const label = new Text(node.title, new TextStyle({
      fontSize: 14 + radius / 4,
      fill: this.theme.text,
      fontFamily: FONT_FAMILY,
      wordWrap: true,
      wordWrapWidth: 300,
      align: 'center',
    }))
    label.eventMode = 'none'
    label.resolution = 2
    label.anchor.set(0.5, 0)
    label.zIndex = 2
    world.addChild(label)
    node.label = label

    if (node.hiddenNeighbors > 0 && !node.isEgoCenter) {
      const expansionRing = new Graphics()
      expansionRing.eventMode = 'none'
      expansionRing.zIndex = 1
      expansionRing.lineStyle(8, this.getNodeColor(node), 0.55)
      const segments = 24
      for (let index = 0; index < segments; index += 2) {
        expansionRing.arc(
          0,
          0,
          100,
          (index / segments) * Math.PI * 2,
          ((index + 1) / segments) * Math.PI * 2,
        )
      }
      world.addChild(expansionRing)
      node.expansionRing = expansionRing
    }

    if (node.bloomEligible) {
      const bloomButton = new Container()
      bloomButton.eventMode = 'static'
      bloomButton.cursor = 'pointer'
      bloomButton.zIndex = 4
      bloomButton.visible = false

      const badge = new Graphics()
        .lineStyle(1.5, this.theme.focused, 1)
        .beginFill(this.theme.background, 1)
        .drawCircle(0, 0, 8)
        .endFill()
      badge.eventMode = 'none'
      const plus = new Graphics()
        .lineStyle(1.8, this.theme.focused, 1)
        .moveTo(-4, 0)
        .lineTo(4, 0)
        .moveTo(0, -4)
        .lineTo(0, 4)
      plus.eventMode = 'none'
      bloomButton.addChild(badge, plus)
      bloomButton
        .on('pointerdown', event => event.stopPropagation())
        .on('pointerover', event => this.hoverNode(node, event))
        .on('pointerout', () => this.unhoverNode(node))
        .on('pointertap', event => {
          event.stopPropagation()
          this.request?.callbacks.onNodeClick(node.id, { shiftKey: true })
        })
      world.addChild(bloomButton)
      node.bloomButton = bloomButton
    }
  }

  private initializeEdge(edge: NativeEdge): void {
    const world = this.world
    if (!world || edge.rendered || !edge.source.rendered || !edge.target.rendered) return
    edge.rendered = true
    const container = new Container()
    container.eventMode = 'none'
    container.zIndex = 0
    const line = new Sprite(Texture.WHITE)
    line.eventMode = 'none'
    line.tint = this.theme.line
    line.alpha = OBSIDIAN_NATIVE_RENDER.dimAlpha
    container.addChild(line)

    const makeArrow = () => new Graphics()
      .beginFill(0xffffff)
      .moveTo(0, 0)
      .lineTo(-4, -2)
      .lineTo(-3, 0)
      .lineTo(-4, 2)
      .lineTo(0, 0)
      .endFill()
    const arrow = makeArrow()
    arrow.eventMode = 'none'
    arrow.tint = this.theme.text
    arrow.alpha = OBSIDIAN_NATIVE_RENDER.dimAlpha
    arrow.zIndex = 1
    const reverseArrow = makeArrow()
    reverseArrow.eventMode = 'none'
    reverseArrow.tint = this.theme.text
    reverseArrow.alpha = OBSIDIAN_NATIVE_RENDER.dimAlpha
    reverseArrow.zIndex = 1
    world.addChild(container)
    world.addChild(arrow)
    world.addChild(reverseArrow)
    edge.container = container
    edge.line = line
    edge.arrow = arrow
    edge.reverseArrow = reverseArrow
  }

  private beginNodeDrag(node: NativeNode, event: FederatedPointerEvent): void {
    if (event.button !== 0) return
    event.stopPropagation()
    if (this.panState) return
    const point = event.getLocalPosition(this.app!.stage)
    this.dragState = {
      node,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      moved: false,
      shiftKey: Boolean((event.nativeEvent as PointerEvent).shiftKey),
    }
    this.canvas!.style.cursor = 'grabbing'
    this.changed()
  }

  private beginPan(event: FederatedPointerEvent): void {
    if (event.button !== 0) return
    if (this.dragState) return
    const point = event.getLocalPosition(this.app!.stage)
    const now = performance.now()
    this.panState = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originX: this.panX,
      originY: this.panY,
      moved: false,
      startedAt: now,
      lastAt: now,
      lastX: point.x,
      lastY: point.y,
    }
    this.panVelocityX = 0
    this.panVelocityY = 0
    this.canvas!.style.cursor = 'grabbing'
    this.changed()
  }

  private handlePointerMove(event: FederatedPointerEvent): void {
    const point = event.getLocalPosition(this.app!.stage)
    const drag = this.dragState
    if (drag && drag.pointerId === event.pointerId) {
      const dx = point.x - drag.startX
      const dy = point.y - drag.startY
      if (dx * dx + dy * dy > OBSIDIAN_NATIVE_RENDER.dragThresholdSquared) drag.moved = true
      const worldPoint = event.getLocalPosition(this.world!)
      drag.node.x = worldPoint.x
      drag.node.y = worldPoint.y
      this.worker?.postMessage(this.exactWorker
        ? buildObsidianWorkerDragMessage(drag.node.id, worldPoint.x, worldPoint.y, true)
        : {
            type: 'drag',
            id: drag.node.id,
            x: worldPoint.x,
            y: worldPoint.y,
            active: true,
          })
      this.changed()
      return
    }

    const pan = this.panState
    if (!pan || pan.pointerId !== event.pointerId) return
    const dx = point.x - pan.startX
    const dy = point.y - pan.startY
    if (dx * dx + dy * dy > OBSIDIAN_NATIVE_RENDER.dragThresholdSquared) pan.moved = true
    this.panX = pan.originX + dx
    this.panY = pan.originY + dy
    const now = performance.now()
    const elapsed = Math.max(1, now - pan.lastAt)
    this.panVelocityX = obsidianEase(this.panVelocityX, (point.x - pan.lastX) / elapsed, 0.8)
    this.panVelocityY = obsidianEase(this.panVelocityY, (point.y - pan.lastY) / elapsed, 0.8)
    pan.lastAt = now
    pan.lastX = point.x
    pan.lastY = point.y
    this.changed()
  }

  private endPointer(event: FederatedPointerEvent): void {
    const drag = this.dragState
    if (drag && drag.pointerId === event.pointerId) {
      this.worker?.postMessage(this.exactWorker
        ? buildObsidianWorkerDragMessage(drag.node.id, null, null, false)
        : { type: 'drag', id: drag.node.id, x: null, y: null, active: false })
      if (!drag.moved) this.activateNode(drag.node, drag.shiftKey)
      this.dragState = null
      if (this.canvas) this.canvas.style.cursor = 'grab'
      this.changed()
      return
    }

    const pan = this.panState
    if (!pan || pan.pointerId !== event.pointerId) return
    if (!pan.moved && event.target === this.background) {
      this.request?.callbacks.onStageClick()
    }
    if (performance.now() - pan.startedAt > 100) {
      this.panVelocityX = 0
      this.panVelocityY = 0
    }
    this.panState = null
    if (this.canvas) this.canvas.style.cursor = 'grab'
    this.changed()
  }

  private activateNode(node: NativeNode, shiftKey: boolean): void {
    const now = performance.now()
    this.request?.callbacks.onNodeClick(node.id, { shiftKey })
    if (this.lastClick?.slug === node.id && now - this.lastClick.at < 300) {
      this.request?.callbacks.onNodeDoubleClick(node.id)
      this.lastClick = null
    } else {
      this.lastClick = { slug: node.id, at: now }
    }
  }

  private hoverNode(node: NativeNode, event: FederatedPointerEvent): void {
    if ((event.pointerType || '').toLowerCase() === 'touch') return
    if (this.hoverLeaveTimer) {
      clearTimeout(this.hoverLeaveTimer)
      this.hoverLeaveTimer = null
    }
    this.hoveredSlug = node.id
    this.request?.callbacks.onNodeHover(node.id)
    this.changed()
  }

  private unhoverNode(node: NativeNode): void {
    if (this.dragState?.node === node) return
    if (this.hoverLeaveTimer) clearTimeout(this.hoverLeaveTimer)
    this.hoverLeaveTimer = setTimeout(() => {
      this.hoverLeaveTimer = null
      if (this.hoveredSlug !== node.id || this.dragState?.node === node) return
      this.hoveredSlug = null
      this.request?.callbacks.onNodeHover(null)
      this.changed()
    }, 60)
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const previousTarget = this.targetScale
    this.targetScale = obsidianWheelTargetScale(previousTarget, event.deltaY, event.deltaMode)
    if (this.targetScale < this.scale) {
      this.zoomCenterX = 0
      this.zoomCenterY = 0
    } else {
      this.zoomCenterX = event.offsetX
      this.zoomCenterY = event.offsetY
    }
    this.request?.callbacks.onCameraScaleChange?.(clamp(
      this.targetScale,
      OBSIDIAN_NATIVE_RENDER.minScale,
      OBSIDIAN_NATIVE_RENDER.maxScale,
    ))
    this.changed()
  }

  private renderFrame = (): void => {
    this.frameId = null
    const app = this.app
    const world = this.world
    if (!app || !world || this.destroyed || this.idleFrames > OBSIDIAN_NATIVE_RENDER.idleFrameLimit) return

    this.applyWorkerPositions()
    this.updateCamera()
    this.initializeNearestNodes()
    for (const edge of this.edges) this.initializeEdge(edge)
    for (const node of this.nodes) this.renderNode(node)
    for (const edge of this.edges) this.renderEdge(edge)
    world.position.set(this.panX, this.panY)
    world.scale.set(this.scale)
    world.sortChildren()
    app.renderer.render(app.stage)
    this.idleFrames += 1
    this.queueFrame()
  }

  private applyWorkerPositions(): void {
    let positions = this.latestPositions
    if (this.sharedPositions && this.sharedVersion) {
      const version = Atomics.load(this.sharedVersion, 0)
      if (version !== this.lastSharedVersion) {
        positions = this.sharedPositions
        this.lastSharedVersion = version
      } else {
        positions = null
      }
    }
    if (!positions) return
    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index]
      const mappedIndex = this.workerIndexById.get(node.id)
      const workerIndex = this.exactWorker ? mappedIndex : (mappedIndex ?? index)
      if (workerIndex === undefined || workerIndex * 2 + 1 >= positions.length) continue
      const x = positions[workerIndex * 2]
      const y = positions[workerIndex * 2 + 1]
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      node.x = x
      node.y = y
    }
    // SharedArrayBuffer mode publishes one buffer and only increments its
    // atomic version afterwards. Keep rendering while that version changes;
    // there is no per-tick message to call changed() for us in this mode.
    this.idleFrames = 0
    this.latestPositions = null
  }

  private updateCamera(): void {
    this.targetScale = clamp(
      this.targetScale,
      OBSIDIAN_NATIVE_RENDER.minScale,
      OBSIDIAN_NATIVE_RENDER.maxScale,
    )
    const ratio = this.scale > this.targetScale
      ? this.scale / this.targetScale
      : this.targetScale / this.scale
    if (ratio - 1 >= 0.01) {
      const centerX = this.zoomCenterX || this.width / 2
      const centerY = this.zoomCenterY || this.height / 2
      const worldX = (centerX - this.panX) / this.scale
      const worldY = (centerY - this.panY) / this.scale
      this.scale = obsidianEase(this.scale, this.targetScale, 0.85)
      this.panX = centerX - worldX * this.scale
      this.panY = centerY - worldY * this.scale
      this.idleFrames = 0
    }

    if (!this.panState) {
      this.panX += (1_000 * this.panVelocityX) / 60
      this.panY += (1_000 * this.panVelocityY) / 60
      this.panVelocityX = obsidianEase(this.panVelocityX, 0, 0.9)
      this.panVelocityY = obsidianEase(this.panVelocityY, 0, 0.9)
      if (Math.abs(this.panVelocityX) + Math.abs(this.panVelocityY) > 0.001) this.idleFrames = 0
    }
  }

  private initializeNearestNodes(): void {
    const progressionActive = this.progressionState === 'playing' || this.progressionState === 'paused'
    const unrendered = this.nodes.filter(node => (
      !node.rendered
      && (!progressionActive || node.playbackIndex < this.progressionVisibleNodes)
    ))
    if (unrendered.length === 0) return
    const centerX = (this.width / 2 - this.panX) / this.scale
    const centerY = (this.height / 2 - this.panY) / this.scale
    unrendered
      .sort((a, b) => (
        (a.x - centerX) ** 2 + (a.y - centerY) ** 2
        - (b.x - centerX) ** 2 - (b.y - centerY) ** 2
      ))
      .slice(0, OBSIDIAN_NATIVE_RENDER.progressiveNodeBatch)
      .forEach(node => this.initializeNode(node))
    this.idleFrames = 0
  }

  private renderNode(node: NativeNode): void {
    const circle = node.circle
    const label = node.label
    if (!node.rendered || !circle || !label) return

    const dragSlug = this.dragState?.node.id ?? null
    const selectedFocusSlug = dragSlug ? null : this.selectedSlug
    const hoveredFocusSlug = dragSlug ? null : this.hoveredSlug
    const hasFocus = Boolean(dragSlug || selectedFocusSlug || hoveredFocusSlug)
    const isHighlight = dragSlug === node.id
      || selectedFocusSlug === node.id
      || hoveredFocusSlug === node.id
    const isSelected = this.selectedSlug === node.id
    const isRelated = !hasFocus
      || isHighlight
      || Boolean(dragSlug && node.neighbors.has(dragSlug))
      || Boolean(selectedFocusSlug && node.neighbors.has(selectedFocusSlug))
      || Boolean(hoveredFocusSlug && node.neighbors.has(hoveredFocusSlug))
    const targetFade = isRelated ? 1 : OBSIDIAN_NATIVE_RENDER.dimAlpha
    node.fadeAlpha = obsidianEase(node.fadeAlpha, targetFade)

    const radius = obsidianNodeRadius(node.weight, this.settings.nodeSizeMultiplier)
    const nodeScale = obsidianNodeScale(this.scale)
    const screenRadiusInWorld = radius * nodeScale
    const viewport = this.viewport()
    const visible = isHighlight || isSelected || intersects(viewport, {
      left: node.x - screenRadiusInWorld - 1,
      right: node.x + screenRadiusInWorld + 1,
      top: node.y - screenRadiusInWorld - 1,
      bottom: node.y + screenRadiusInWorld + 1,
    })

    const fill = this.getNodeColor(node)
    circle.tint = colorMix(circle.tint, fill)
    circle.visible = visible
    if (visible) {
      circle.position.set(node.x, node.y)
      circle.scale.set((radius / 100) * nodeScale)
      circle.alpha = node.fadeAlpha
    }

    if (node.expansionRing) {
      node.expansionRing.visible = visible
      node.expansionRing.position.set(node.x, node.y)
      node.expansionRing.scale.set(((radius + 3) / 100) * nodeScale)
      node.expansionRing.alpha = node.fadeAlpha
    }

    if (node.bloomButton) {
      const bloomVisible = visible && this.hoveredSlug === node.id && !this.dragState
      const buttonOffset = (radius + 8) * nodeScale * Math.SQRT1_2
      node.bloomButton.position.set(node.x + buttonOffset, node.y - buttonOffset)
      node.bloomButton.scale.set(nodeScale)
      node.bloomButton.visible = bloomVisible
      node.bloomButton.alpha = bloomVisible ? 1 : 0
    }

    let textAlpha = obsidianTextAlpha(this.scale, this.settings.textFadeMultiplier) * node.fadeAlpha
    if (isHighlight || isSelected) textAlpha = 1
    const wasVisible = label.visible
    node.labelLift = wasVisible
      ? obsidianEase(node.labelLift, isHighlight || isSelected ? 15 : 0)
      : isHighlight || isSelected ? 15 : 0
    const labelVisible = textAlpha > 0.001 && (
      isHighlight || isSelected
      || intersects(viewport, {
        left: node.x - 300,
        right: node.x + 300,
        top: node.y,
        bottom: node.y + 200,
      })
    )
    label.visible = labelVisible
    if (labelVisible) {
      label.position.set(node.x, node.y + (radius + 5) * nodeScale + node.labelLift / this.scale)
      const labelScale = (isHighlight || isSelected) && this.scale < 1 ? 1 / this.scale : nodeScale
      label.scale.set(labelScale)
      label.alpha = textAlpha
    }

    if (isHighlight || isSelected) {
      if (!node.outline) {
        node.outline = new Graphics()
        node.outline.eventMode = 'none'
        node.outline.zIndex = 1
        this.world?.addChild(node.outline)
      }
      const outline = node.outline
      const lineWidth = Math.max(1, 1 / this.scale / nodeScale)
      outline.clear()
      outline.lineStyle(lineWidth, isSelected ? this.theme.focused : this.theme.highlight, 1)
      outline.drawCircle(0, 0, radius + lineWidth / 2)
      outline.position.set(node.x, node.y)
      outline.scale.set(nodeScale)
      outline.visible = true
    } else if (node.outline) {
      node.outline.removeFromParent()
      node.outline.destroy()
      node.outline = null
    }
  }

  private renderEdge(edge: NativeEdge): void {
    const container = edge.container
    const line = edge.line
    const arrow = edge.arrow
    const reverseArrow = edge.reverseArrow
    if (!edge.rendered || !container || !line || !arrow || !reverseArrow) return

    const source = edge.source
    const target = edge.target
    const dragSlug = this.dragState?.node.id ?? null
    const selectedFocusSlug = dragSlug ? null : this.selectedSlug
    const hoveredFocusSlug = dragSlug ? null : this.hoveredSlug
    const hasFocus = Boolean(dragSlug || selectedFocusSlug || hoveredFocusSlug)
    const active = dragSlug === source.id
      || dragSlug === target.id
      || selectedFocusSlug === source.id
      || selectedFocusSlug === target.id
      || hoveredFocusSlug === source.id
      || hoveredFocusSlug === target.id
    const fade = !hasFocus || active ? 1 : OBSIDIAN_NATIVE_RENDER.dimAlpha
    const lineColor = active ? this.theme.highlight : this.theme.line
    line.alpha = obsidianEase(line.alpha, fade)
    line.tint = colorMix(line.tint, lineColor)
    arrow.alpha = obsidianEase(arrow.alpha, fade * 0.5)
    reverseArrow.alpha = arrow.alpha

    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const width = this.settings.lineSizeMultiplier / this.scale
    const viewport = this.viewport()
    const visible = distance > 0 && intersects(viewport, {
      left: Math.min(source.x, target.x) - width,
      right: Math.max(source.x, target.x) + width,
      top: Math.min(source.y, target.y) - width,
      bottom: Math.max(source.y, target.y) + width,
    })
    container.visible = visible
    arrow.visible = visible && this.showArrows && arrow.alpha > 0.001
    reverseArrow.visible = visible
      && edge.bidirectional
      && this.showArrows
      && reverseArrow.alpha > 0.001
    if (!visible) return

    const nodeScale = obsidianNodeScale(this.scale)
    const sourceRadius = obsidianNodeRadius(source.weight, this.settings.nodeSizeMultiplier) * nodeScale
    const targetRadius = obsidianNodeRadius(target.weight, this.settings.nodeSizeMultiplier) * nodeScale
    const angle = Math.atan2(dy, dx)
    container.position.set(
      source.x + (dx * sourceRadius) / distance,
      source.y + (dy * sourceRadius) / distance,
    )
    container.rotation = angle
    line.position.set(0, -width / 2)
    line.width = Math.max(0, distance - sourceRadius - targetRadius)
    line.height = width

    if (arrow.visible && distance > width) {
      const inset = targetRadius + 1
      arrow.position.set(target.x - (dx * inset) / distance, target.y - (dy * inset) / distance)
      arrow.rotation = angle
      arrow.scale.set((2 * Math.sqrt(this.settings.lineSizeMultiplier)) / this.scale)
      arrow.tint = this.theme.text
    }
    if (reverseArrow.visible && distance > width) {
      const inset = sourceRadius + 1
      reverseArrow.position.set(
        source.x + (dx * inset) / distance,
        source.y + (dy * inset) / distance,
      )
      reverseArrow.rotation = angle + Math.PI
      reverseArrow.scale.set((2 * Math.sqrt(this.settings.lineSizeMultiplier)) / this.scale)
      reverseArrow.tint = this.theme.text
    }
  }

  private getNodeColor(node: NativeNode): number {
    return node.color ?? wikiGraphNodeColor('index')
  }

  private viewport(): { left: number; right: number; top: number; bottom: number } {
    return {
      left: -this.panX / this.scale,
      right: (this.width - this.panX) / this.scale,
      top: -this.panY / this.scale,
      bottom: (this.height - this.panY) / this.scale,
    }
  }

  private resize(): void {
    const app = this.app
    const background = this.background
    if (!app || !background) return
    const width = Math.max(1, this.container.clientWidth || 800)
    const height = Math.max(1, this.container.clientHeight || 600)
    const dx = (width - this.width) / 2
    const dy = (height - this.height) / 2
    this.width = width
    this.height = height
    app.renderer.resize(width, height)
    app.stage.hitArea = new Rectangle(0, 0, width, height)
    background.clear().beginFill(this.theme.background, 0.001).drawRect(0, 0, width, height).endFill()
    this.panX += dx
    this.panY += dy
    this.changed()
  }

  private snapshotPositions(): Map<string, { x: number; y: number }> {
    return new Map(this.nodes.map(node => [node.id, { x: node.x, y: node.y }]))
  }

  private snapshotCamera(): CameraSnapshot | null {
    if (!this.app) return null
    return {
      scale: this.scale,
      targetScale: this.targetScale,
      panX: this.panX,
      panY: this.panY,
    }
  }

  private restoreCamera(camera: CameraSnapshot): void {
    this.scale = camera.scale
    this.targetScale = camera.targetScale
    this.panX = camera.panX
    this.panY = camera.panY
  }

  private fitImmediately(): void {
    const target = this.calculateFit(0, 0)
    if (!target) {
      this.panX = this.width / 2
      this.panY = this.height / 2
      return
    }
    this.scale = target.scale
    this.targetScale = target.scale
    this.panX = target.panX
    this.panY = target.panY
  }

  private calculateFit(
    rightInset: number,
    bottomInset: number,
    nodes: readonly NativeNode[] = this.nodes,
    maxScale = 2,
  ): { scale: number; panX: number; panY: number } | null {
    if (nodes.length === 0) return null
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const node of nodes) {
      minX = Math.min(minX, node.x)
      maxX = Math.max(maxX, node.x)
      minY = Math.min(minY, node.y)
      maxY = Math.max(maxY, node.y)
    }
    const safeRightInset = clamp(rightInset, 0, Math.max(0, this.width - 1))
    const safeBottomInset = clamp(bottomInset, 0, Math.max(0, this.height - 1))
    const usableWidth = Math.max(1, this.width - safeRightInset)
    const usableHeight = Math.max(1, this.height - safeBottomInset)
    // Preserve Obsidian's 60px fit margin on a normal canvas, but let it
    // contract with the actually usable viewport. A compact marketing shell
    // can be only ~120px wide after its legend/drawer inset; two fixed 60px
    // margins would leave one pixel for the graph and force min-scale.
    const horizontalPadding = Math.min(60, Math.max(16, usableWidth * 0.12))
    // A bottom sheet already removes a large vertical slice. Keep the same
    // responsive rule with a 32px ceiling there; ordinary views retain the
    // native 60px ceiling.
    const verticalPadding = Math.min(
      safeBottomInset > 0 ? 32 : 60,
      Math.max(16, usableHeight * 0.12),
    )
    const graphWidth = Math.max(100, maxX - minX)
    const graphHeight = Math.max(100, maxY - minY)
    const scale = clamp(
      Math.min(
        Math.max(1, usableWidth - horizontalPadding * 2) / graphWidth,
        Math.max(1, usableHeight - verticalPadding * 2) / graphHeight,
      ),
      OBSIDIAN_NATIVE_RENDER.minScale,
      clamp(maxScale, OBSIDIAN_NATIVE_RENDER.minScale, OBSIDIAN_NATIVE_RENDER.maxScale),
    )
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    return {
      scale,
      panX: usableWidth / 2 - centerX * scale,
      panY: usableHeight / 2 - centerY * scale,
    }
  }

  private async animatePan(targetX: number, targetY: number, duration: number): Promise<void> {
    const generation = ++this.cameraAnimationGeneration
    const startX = this.panX
    const startY = this.panY
    const startedAt = performance.now()
    await new Promise<void>((resolve) => {
      const step = () => {
        if (
          this.destroyed
          || !this.app
          || generation !== this.cameraAnimationGeneration
        ) return resolve()
        const progress = clamp((performance.now() - startedAt) / duration, 0, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        this.panX = startX + (targetX - startX) * eased
        this.panY = startY + (targetY - startY) * eased
        this.changed()
        if (progress < 1) requestAnimationFrame(step)
        else resolve()
      }
      step()
    })
  }

  private changed(): void {
    this.idleFrames = 0
    this.queueFrame()
  }

  private queueProgressionFrame(): void {
    if (
      this.progressionFrameId !== null
      || this.progressionState !== 'playing'
      || this.destroyed
    ) return
    const generation = this.progressionGeneration
    this.progressionFrameId = requestAnimationFrame(() => this.advanceProgression(generation))
  }

  private accumulateProgressionElapsed(): void {
    if (this.progressionState !== 'playing') return
    const now = Date.now()
    this.progressionElapsedMs += Math.max(0, now - this.progressionStartedAt)
      * this.progressionTimeScale
    this.progressionStartedAt = now
  }

  private advanceProgression(generation: number): void {
    if (
      generation !== this.progressionGeneration
      || this.progressionState !== 'playing'
      || this.destroyed
    ) return
    this.progressionFrameId = null
    this.accumulateProgressionElapsed()
    const itemCursor = obsidianGraphProgressionItemCursor(
      this.progressionElapsedMs,
      this.progressionItemTotal,
    )
    const next = obsidianGraphProgressionVisibleNodes(
      itemCursor,
      this.progressionNodeStartItems,
    )
    const advanced = next !== this.progressionVisibleNodes
    if (advanced) {
      const previousVisible = this.progressionVisibleNodes
      this.progressionVisibleNodes = next
      this.seedProgressionNodes(previousVisible, next)
      this.syncProgressionWorker()
      this.changed()
    }
    if (itemCursor >= this.progressionItemTotal) {
      this.emitProgression('complete', this.nodes.length)
      return
    }
    if (advanced) {
      this.emitProgression('playing', next)
    }
    this.queueProgressionFrame()
  }

  private emitProgression(state: WikiGraphPlaybackState, visible: number): void {
    this.progressionState = state
    this.progressionVisibleNodes = visible
    const snapshot: WikiGraphPlaybackSnapshot = {
      state,
      visible,
      total: this.nodes.length,
    }
    this.request?.callbacks.onPlaybackChange?.(snapshot)
  }

  private prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  private resetRenderedGraph(): void {
    const dispose = (
      object: { removeFromParent(): unknown; destroy(options?: { children?: boolean }): void } | null,
      children = false,
    ) => {
      if (!object) return
      object.removeFromParent()
      object.destroy(children ? { children: true } : undefined)
    }

    this.dragState = null
    this.hoveredSlug = null
    for (const edge of this.edges) {
      dispose(edge.container, true)
      dispose(edge.arrow)
      dispose(edge.reverseArrow)
      edge.rendered = false
      edge.container = null
      edge.line = null
      edge.arrow = null
      edge.reverseArrow = null
    }
    for (const node of this.nodes) {
      dispose(node.circle)
      dispose(node.label)
      dispose(node.outline)
      dispose(node.expansionRing)
      dispose(node.bloomButton, true)
      node.rendered = false
      node.fadeAlpha = 0
      node.labelLift = 0
      node.circle = null
      node.label = null
      node.outline = null
      node.expansionRing = null
      node.bloomButton = null
    }
  }

  private revealProgressionImmediately(): void {
    for (const node of this.nodes) {
      this.initializeNode(node)
      node.fadeAlpha = 1
    }
    for (const edge of this.edges) {
      this.initializeEdge(edge)
      if (edge.line) edge.line.alpha = 1
      if (edge.arrow) edge.arrow.alpha = 0.5
      if (edge.reverseArrow) edge.reverseArrow.alpha = 0.5
    }
  }

  private cancelProgressionFrame(): void {
    this.progressionGeneration += 1
    if (this.progressionFrameId !== null) cancelAnimationFrame(this.progressionFrameId)
    this.progressionFrameId = null
  }

  private cancelProgression(): void {
    this.cancelProgressionFrame()
    this.progressionState = 'idle'
    this.progressionVisibleNodes = this.nodes.length
    this.progressionStartedAt = 0
    this.progressionElapsedMs = 0
  }

  private bindThemeObserver(): void {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
    this.themeObserver = new MutationObserver(() => this.refreshTheme())
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      // The storefront's theme bootstrap persists the active palette on
      // `html[data-theme]`; keep the native canvas in sync with runtime
      // toggles as well as the upstream class/theme-mode contract.
      attributeFilter: ['theme-mode', 'class', 'data-theme'],
    })
  }

  private refreshTheme(): void {
    this.theme = readWeknoraGraphTheme(this.container)
    this.container.style.background = 'var(--td-bg-color-container)'
    this.background
      ?.clear()
      .beginFill(this.theme.background, 0.001)
      .drawRect(0, 0, this.width, this.height)
      .endFill()
    for (const node of this.nodes) {
      if (node.label) node.label.style.fill = this.theme.text
      if (node.bloomButton) {
        const badge = node.bloomButton.children[0] as Graphics | undefined
        const plus = node.bloomButton.children[1] as Graphics | undefined
        badge
          ?.clear()
          .lineStyle(1.5, this.theme.focused, 1)
          .beginFill(this.theme.background, 1)
          .drawCircle(0, 0, 8)
          .endFill()
        plus
          ?.clear()
          .lineStyle(1.8, this.theme.focused, 1)
          .moveTo(-4, 0)
          .lineTo(4, 0)
          .moveTo(0, -4)
          .lineTo(0, 4)
      }
    }
    this.changed()
  }

  private queueFrame(): void {
    if (this.frameId === null && this.app && !this.destroyed) {
      this.frameId = requestAnimationFrame(this.renderFrame)
    }
  }

  private teardownRuntime(): void {
    this.cameraAnimationGeneration += 1
    this.cancelProgression()
    this.progressionSnapshot = null
    if (this.frameId !== null) cancelAnimationFrame(this.frameId)
    this.frameId = null
    if (this.hoverLeaveTimer) clearTimeout(this.hoverLeaveTimer)
    this.hoverLeaveTimer = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.themeObserver?.disconnect()
    this.themeObserver = null
    if (this.canvas) this.canvas.removeEventListener('wheel', this.handleWheel)
    if (!this.exactWorker) this.worker?.postMessage({ type: 'stop' })
    this.worker?.terminate()
    this.worker = null
    // Let Pixi Text keep its default texture/baseTexture cleanup while shared
    // sprites such as Texture.WHITE retain Sprite's non-destructive defaults.
    this.app?.destroy(false, { children: true })
    this.app = null
    this.canvas = null
    this.background = null
    this.world = null
    this.clearWorkerPositionCache()
    this.expectedWorkerNodeIds = null
    this.dragState = null
    this.panState = null
    this.nodes = []
    this.nodeLookup.clear()
    this.edges = []
    this.progressionItemTotal = 0
    this.progressionNodeStartItems = []
    this.progressionTimeScale = 1
    this.idleFrames = 0
    this.exactWorker = false
    this.container.replaceChildren()
  }
}
