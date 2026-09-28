import Graph from 'graphology'
import circular from 'graphology-layout/circular'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import FA2LayoutSupervisor from 'graphology-layout-forceatlas2/worker'
import Sigma from 'sigma'

import {
  WIKI_GRAPH_NODE_COLORS,
  buildWikiGraphAdjacency,
  seedWikiGraphPosition,
  type WikiGraphFitOptions,
  type WikiGraphFocusOptions,
  type WikiGraphRenderNode,
  type WikiGraphRenderRequest,
  type WikiGraphRenderer,
  type WikiGraphStyleId,
} from './wikiGraphRenderer.ts'

type Position = { x: number; y: number }
type PresetPosition = Position & {
  depth: number
  shell: boolean
  spaceX: number
  spaceY: number
  spaceZ: number
}

interface NebulaMotionNode {
  baseSize: number
  phase: number
  shell: boolean
  spaceX: number
  spaceY: number
  spaceZ: number
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const PAGE_TYPE_ORDER = ['summary', 'entity', 'concept', 'synthesis', 'comparison', 'index']
const NEBULA_NODE_COLORS: Readonly<Record<string, string>> = {
  summary: '#d8ebff',
  entity: '#d8f8e5',
  concept: '#fff0c7',
  synthesis: '#d4f2ff',
  comparison: '#ffd9dc',
  index: '#e1eaf4',
}

function stableUnitHash(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function buildNebulaPositions(nodes: WikiGraphRenderNode[]): Map<string, PresetPosition> {
  const positions = new Map<string, PresetPosition>()
  const total = nodes.length
  const coreCount = Math.min(total, Math.max(6, Math.round(total * 0.27)))
  const coreNodes = nodes.slice(0, coreCount)
  const shellNodes = nodes.slice(coreCount)
  const clusterIndices = new Map<string, number>()

  for (const node of coreNodes) {
    const typeIndex = Math.max(0, PAGE_TYPE_ORDER.indexOf(node.page_type))
    const localIndex = clusterIndices.get(node.page_type) ?? 0
    clusterIndices.set(node.page_type, localIndex + 1)
    const centerAngle = (typeIndex / PAGE_TYPE_ORDER.length) * Math.PI * 2 - Math.PI / 2
    const centerRadius = node.page_type === 'summary' ? 8 : 52
    const localRadius = Math.min(38, Math.sqrt(localIndex + 1) * 5.3)
    const localAngle = localIndex * GOLDEN_ANGLE + stableUnitHash(node.slug) * 0.45
    positions.set(node.slug, {
      x: Math.cos(centerAngle) * centerRadius + Math.cos(localAngle) * localRadius,
      y: Math.sin(centerAngle) * centerRadius * 0.72 + Math.sin(localAngle) * localRadius,
      depth: 0.55 + stableUnitHash(`${node.slug}:depth`) * 0.35,
      shell: false,
      spaceX: Math.cos(centerAngle) * centerRadius + Math.cos(localAngle) * localRadius,
      spaceY: Math.sin(centerAngle) * centerRadius * 0.72 + Math.sin(localAngle) * localRadius,
      spaceZ: (stableUnitHash(`${node.slug}:z`) - 0.5) * 92,
    })
  }

  const shellTotal = shellNodes.length
  shellNodes.forEach((node, index) => {
    const latitude = 1 - 2 * ((index + 0.5) / Math.max(1, shellTotal))
    const radiusAtLatitude = Math.sqrt(Math.max(0, 1 - latitude * latitude))
    const theta = index * GOLDEN_ANGLE + stableUnitHash(node.slug) * 0.2
    const depth = Math.sin(theta) * radiusAtLatitude
    const perspective = 1 + depth * 0.14
    const spaceX = Math.cos(theta) * radiusAtLatitude * 176
    const spaceY = latitude * 164
    const spaceZ = depth * 176
    positions.set(node.slug, {
      x: spaceX * perspective,
      y: spaceY * perspective,
      depth,
      shell: true,
      spaceX,
      spaceY,
      spaceZ,
    })
  })

  return positions
}

function buildOrbitPositions(nodes: WikiGraphRenderNode[]): Map<string, PresetPosition> {
  const positions = new Map<string, PresetPosition>()
  nodes.forEach((node, index) => {
    const ring = Math.floor(Math.sqrt(index / 7))
    const ringStart = ring * ring * 7
    const ringCapacity = Math.max(1, (ring * 2 + 1) * 7)
    const angle = ((index - ringStart) / ringCapacity) * Math.PI * 2 + ring * 0.31
    const radius = 22 + ring * 19
    positions.set(node.slug, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.78,
      depth: Math.sin(angle) * 0.5,
      shell: false,
      spaceX: Math.cos(angle) * radius,
      spaceY: Math.sin(angle) * radius * 0.78,
      spaceZ: Math.sin(angle) * radius * 0.3,
    })
  })
  return positions
}

function buildClusterPositions(nodes: WikiGraphRenderNode[]): Map<string, PresetPosition> {
  const positions = new Map<string, PresetPosition>()
  const localIndices = new Map<string, number>()
  nodes.forEach((node) => {
    const typeIndex = Math.max(0, PAGE_TYPE_ORDER.indexOf(node.page_type))
    const localIndex = localIndices.get(node.page_type) ?? 0
    localIndices.set(node.page_type, localIndex + 1)
    const centerAngle = typeIndex / PAGE_TYPE_ORDER.length * Math.PI * 2 - Math.PI / 2
    const centerRadius = node.page_type === 'summary' ? 20 : 105
    const localRadius = Math.min(55, Math.sqrt(localIndex + 1) * 7.2)
    const localAngle = localIndex * GOLDEN_ANGLE + stableUnitHash(node.slug) * 0.5
    positions.set(node.slug, {
      x: Math.cos(centerAngle) * centerRadius + Math.cos(localAngle) * localRadius,
      y: Math.sin(centerAngle) * centerRadius * 0.78 + Math.sin(localAngle) * localRadius,
      depth: 0,
      shell: false,
      spaceX: Math.cos(centerAngle) * centerRadius + Math.cos(localAngle) * localRadius,
      spaceY: Math.sin(centerAngle) * centerRadius * 0.78 + Math.sin(localAngle) * localRadius,
      spaceZ: 0,
    })
  })
  return positions
}

function buildSigmaPresetPositions(nodes: WikiGraphRenderNode[], styleId: WikiGraphStyleId): Map<string, PresetPosition> {
  if (styleId === 'sigma-nebula') return buildNebulaPositions(nodes)
  if (styleId === 'sigma-orbit') return buildOrbitPositions(nodes)
  if (styleId === 'sigma-clusters') return buildClusterPositions(nodes)

  return new Map(nodes.map((node, index) => {
    const position = seedWikiGraphPosition(index, nodes.length)
    return [node.slug, {
      ...position,
      depth: 0,
      shell: false,
      spaceX: position.x,
      spaceY: position.y,
      spaceZ: 0,
    }]
  }))
}

function sigmaNodeSize(node: WikiGraphRenderNode, position: PresetPosition, styleId: WikiGraphStyleId): number {
  const degreeScale = Math.log2(node.link_count + 2)
  if (styleId === 'sigma-nebula') {
    if (position.shell) return Math.max(1.2, Math.min(3.2, 1.25 + degreeScale * 0.34 + Math.max(0, position.depth) * 0.35))
    return Math.max(3.2, Math.min(17, 2.8 + degreeScale * 2.15))
  }
  return Math.max(3, Math.min(12, 2.8 + degreeScale * 1.7))
}

export class SigmaWikiGraphRenderer implements WikiGraphRenderer {
  private graph: Graph | null = null
  private renderer: Sigma | null = null
  private request: WikiGraphRenderRequest | null = null
  private adjacency = new Map<string, Set<string>>()
  private selectedSlug: string | null = null
  private hoveredSlug: string | null = null
  private emphasizedNodes = new Set<string>()
  private nebulaMotionNodes = new Map<string, NebulaMotionNode>()
  private animationFrame: number | null = null
  private animationStartedAt = 0
  private animationLastFrame = 0
  private nebulaPointerYaw = 0
  private nebulaPointerTilt = 0
  private nebulaPointerYawTarget = 0
  private nebulaPointerTiltTarget = 0
  private draggingNode: string | null = null
  private forceLayout: FA2LayoutSupervisor | null = null
  private forceLayoutStopTimer: number | null = null
  private destroyed = false
  private edgeColor = '#a6a6a6'
  private dimNodeColor = '#c5cad3'
  private dimEdgeColor = '#d8dce3'
  private textColor = '#1f2329'

  constructor(private readonly container: HTMLElement) {}

  async render(request: WikiGraphRenderRequest): Promise<void> {
    if (this.destroyed) return

    const previousPositions = this.snapshotPositions(request.preserveLayout === true)
    const previousMotionNodes = request.preserveLayout
      ? new Map(this.nebulaMotionNodes)
      : new Map<string, NebulaMotionNode>()
    this.killRenderer()

    this.request = request
    this.selectedSlug = request.selectedSlug
    this.hoveredSlug = null
    this.adjacency = buildWikiGraphAdjacency(request.data)
    this.nebulaMotionNodes.clear()
    this.readThemeColors(request.styleId)
    this.container.dataset.graphVisual = 'cosmic'
    this.container.dataset.graphStyle = request.styleId

    const graph = new Graph({ multi: true, type: 'directed', allowSelfLoops: true })
    const anchorPosition = request.anchorSlug ? previousPositions.get(request.anchorSlug) : undefined
    const nodeSlugs = new Set(request.data.nodes.map(node => node.slug))
    const presetPositions = buildSigmaPresetPositions(request.data.nodes, request.styleId)

    request.data.nodes.forEach((node, index) => {
      const seeded = presetPositions.get(node.slug) ?? {
        ...seedWikiGraphPosition(index, request.data.nodes.length),
        depth: 0,
        shell: false,
        spaceX: 0,
        spaceY: 0,
        spaceZ: 0,
      }
      const previous = previousPositions.get(node.slug)
      const position = previous ?? (anchorPosition
        ? {
            x: anchorPosition.x + seeded.x * 0.08,
            y: anchorPosition.y + seeded.y * 0.08,
          }
        : seeded)
      const semanticColor = WIKI_GRAPH_NODE_COLORS[node.page_type] || WIKI_GRAPH_NODE_COLORS.index
      const color = request.styleId === 'sigma-nebula'
        ? seeded.shell
          ? (seeded.depth > 0 ? '#e6f2ff' : '#a9bfd8')
          : NEBULA_NODE_COLORS[node.page_type] || NEBULA_NODE_COLORS.index
        : semanticColor

      graph.addNode(node.slug, {
        x: position.x,
        y: position.y,
        label: node.title,
        size: sigmaNodeSize(node, seeded, request.styleId),
        color,
        semanticColor,
        pageType: node.page_type,
        linkCount: node.link_count,
        zIndex: node.link_count,
      })

      if (request.styleId === 'sigma-nebula') {
        this.nebulaMotionNodes.set(node.slug, previousMotionNodes.get(node.slug) ?? {
          baseSize: sigmaNodeSize(node, seeded, request.styleId),
          phase: stableUnitHash(`${node.slug}:pulse`) * Math.PI * 2,
          shell: seeded.shell,
          spaceX: anchorPosition && !previous ? position.x : seeded.spaceX,
          spaceY: anchorPosition && !previous ? position.y : seeded.spaceY,
          spaceZ: anchorPosition && !previous ? seeded.spaceZ * 0.08 : seeded.spaceZ,
        })
      }
    })

    request.data.edges.forEach((edge, index) => {
      if (!nodeSlugs.has(edge.source) || !nodeSlugs.has(edge.target)) return
      graph.addDirectedEdgeWithKey(`wiki-edge-${index}`, edge.source, edge.target, {
        color: this.edgeColor,
        size: request.styleId === 'sigma-nebula' ? 0.38 : 0.82,
        type: request.showArrows ? 'arrow' : 'line',
      })
    })

    if (request.styleId === 'sigma-circle' && !request.preserveLayout && graph.order > 1) {
      circular.assign(graph, {
        center: 0,
        scale: Math.max(90, Math.sqrt(graph.order) * 22),
      })
    }

    this.graph = graph
    this.rebuildEmphasis()

    const renderer = new Sigma(graph, this.container, {
      defaultEdgeType: request.showArrows ? 'arrow' : 'line',
      defaultEdgeColor: this.edgeColor,
      labelColor: { color: this.textColor },
      labelFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      labelSize: 11,
      labelDensity: request.styleId === 'sigma-nebula' ? 0.035 : 0.09,
      labelGridCellSize: request.styleId === 'sigma-nebula' ? 120 : 92,
      labelRenderedSizeThreshold: request.styleId === 'sigma-nebula' ? 5.5 : 6.5,
      minCameraRatio: 0.04,
      maxCameraRatio: 12,
      stagePadding: 36,
      hideEdgesOnMove: graph.order > 700,
      zIndex: true,
      nodeReducer: (slug, attributes) => this.reduceNode(slug, attributes),
      edgeReducer: (edge, attributes) => this.reduceEdge(edge, attributes),
    })
    this.renderer = renderer
    this.bindInteractions(renderer, graph)
    renderer.refresh()
    if (request.styleId === 'sigma-nebula') this.startNebulaMotion()
    if (request.styleId === 'sigma-force' && !request.preserveLayout && graph.order > 1 && graph.size > 0) {
      this.startForceAtlasLayout(graph)
    }
  }

  hasNode(slug: string): boolean {
    return this.graph?.hasNode(slug) ?? false
  }

  async focusNode(slug: string, options: WikiGraphFocusOptions = {}): Promise<void> {
    const renderer = this.renderer
    if (!renderer || !this.hasNode(slug)) return
    const node = renderer.getNodeDisplayData(slug)
    if (!node) return

    const pixelsPerGraphUnit = renderer.getGraphToViewportRatio() || 1
    const offsetX = options.offsetX ?? 0
    await renderer.getCamera().animate({
      x: node.x - offsetX / pixelsPerGraphUnit,
      y: node.y,
    }, { duration: 380, easing: 'quadraticOut' })
  }

  async fit(options: WikiGraphFitOptions = {}): Promise<void> {
    const renderer = this.renderer
    if (!renderer || !this.graph?.order) return
    await renderer.getCamera().animatedReset({ duration: 520, easing: 'quadraticInOut' })

    const rightInset = options.rightInset ?? 0
    if (rightInset <= 0) return
    const camera = renderer.getCamera()
    const state = camera.getState()
    const pixelsPerGraphUnit = renderer.getGraphToViewportRatio() || 1
    await camera.animate({
      x: state.x + rightInset / 2 / pixelsPerGraphUnit,
    }, { duration: 220, easing: 'quadraticOut' })
  }

  setArrowsVisible(visible: boolean): void {
    const graph = this.graph
    if (!graph) return
    graph.updateEachEdgeAttributes((_edge, attributes) => ({
      ...attributes,
      type: visible ? 'arrow' : 'line',
    }), { attributes: ['type'] })
    this.renderer?.refresh()
  }

  setSelection(selectedSlug: string | null, hoveredSlug: string | null = null): void {
    this.selectedSlug = selectedSlug
    this.hoveredSlug = hoveredSlug
    this.rebuildEmphasis()
    this.renderer?.refresh()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.request = null
    this.adjacency.clear()
    this.emphasizedNodes.clear()
    this.nebulaMotionNodes.clear()
    this.killRenderer()
  }

  private snapshotPositions(enabled: boolean): Map<string, Position> {
    const positions = new Map<string, Position>()
    if (!enabled || !this.graph) return positions
    this.graph.forEachNode((slug, attributes) => {
      positions.set(slug, { x: attributes.x, y: attributes.y })
    })
    return positions
  }

  private killRenderer(): void {
    this.stopNebulaMotion()
    this.stopForceAtlasLayout()
    this.draggingNode = null
    this.renderer?.kill()
    this.renderer = null
    this.graph = null
    this.container.replaceChildren()
    delete this.container.dataset.graphVisual
    delete this.container.dataset.graphStyle
  }

  private startNebulaMotion(): void {
    if (typeof window === 'undefined' || this.nebulaMotionNodes.size === 0) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    this.stopNebulaMotion()
    this.animationStartedAt = performance.now()
    this.animationLastFrame = 0

    const animate = (now: number) => {
      if (!this.renderer || !this.graph || this.destroyed) return
      this.animationFrame = requestAnimationFrame(animate)
      if (document.hidden || this.draggingNode || now - this.animationLastFrame < 32) return
      this.animationLastFrame = now

      const elapsed = now - this.animationStartedAt
      this.nebulaPointerYaw += (this.nebulaPointerYawTarget - this.nebulaPointerYaw) * 0.055
      this.nebulaPointerTilt += (this.nebulaPointerTiltTarget - this.nebulaPointerTilt) * 0.055
      const yaw = elapsed * 0.00017 + this.nebulaPointerYaw
      const tilt = Math.sin(elapsed * 0.00011) * 0.12 + this.nebulaPointerTilt
      const cosYaw = Math.cos(yaw)
      const sinYaw = Math.sin(yaw)
      const cosTilt = Math.cos(tilt)
      const sinTilt = Math.sin(tilt)

      this.graph.updateEachNodeAttributes((slug, attributes) => {
        const motion = this.nebulaMotionNodes.get(slug)
        if (!motion) return attributes

        const rotatedX = motion.spaceX * cosYaw + motion.spaceZ * sinYaw
        const yawDepth = -motion.spaceX * sinYaw + motion.spaceZ * cosYaw
        const rotatedY = motion.spaceY * cosTilt - yawDepth * sinTilt
        const depth = motion.spaceY * sinTilt + yawDepth * cosTilt
        const normalizedDepth = Math.max(-1, Math.min(1, depth / 190))
        const perspective = 1 / (1 - normalizedDepth * 0.16)
        const pulse = motion.shell
          ? 1
          : 1 + Math.sin(elapsed * 0.0022 + motion.phase) * 0.13
        const depthScale = 0.86 + (normalizedDepth + 1) * 0.11
        const driftX = motion.shell ? 0 : Math.cos(elapsed * 0.00038 + motion.phase) * 2.8
        const driftY = motion.shell ? 0 : Math.sin(elapsed * 0.00031 + motion.phase) * 2.2

        return {
          ...attributes,
          x: rotatedX * perspective + driftX,
          y: rotatedY * perspective + driftY,
          size: motion.baseSize * pulse * depthScale,
          zIndex: Math.round((normalizedDepth + 1) * 1000) + Number(attributes.linkCount ?? 0),
        }
      }, { attributes: ['x', 'y', 'size', 'zIndex'] })
      this.renderer.refresh()
    }

    this.animationFrame = requestAnimationFrame(animate)
  }

  private stopNebulaMotion(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = null
    this.nebulaPointerYaw = 0
    this.nebulaPointerTilt = 0
    this.nebulaPointerYawTarget = 0
    this.nebulaPointerTiltTarget = 0
  }

  /** Sigma renders; Graphology's official worker owns the live ForceAtlas2 layout. */
  private startForceAtlasLayout(graph: Graph): void {
    this.stopForceAtlasLayout()
    const inferred = forceAtlas2.inferSettings(graph)
    const layout = new FA2LayoutSupervisor(graph, {
      settings: {
        ...inferred,
        barnesHutOptimize: graph.order > 80,
        gravity: 0.12,
        scalingRatio: graph.order > 250 ? 8 : 5,
        slowDown: 4,
      },
    })
    this.forceLayout = layout
    layout.start()

    // ForceAtlas2 deliberately has no natural terminal state. Let it settle,
    // then stop the worker so an idle graph does not keep consuming CPU.
    this.forceLayoutStopTimer = window.setTimeout(() => {
      if (this.forceLayout === layout) layout.stop()
      this.forceLayoutStopTimer = null
    }, graph.order > 450 ? 10_000 : 6_500)
  }

  private stopForceAtlasLayout(): void {
    if (this.forceLayoutStopTimer !== null) window.clearTimeout(this.forceLayoutStopTimer)
    this.forceLayoutStopTimer = null
    this.forceLayout?.kill()
    this.forceLayout = null
  }

  private readThemeColors(styleId: WikiGraphStyleId): void {
    this.edgeColor = styleId === 'sigma-nebula' ? '#38516f' : '#58708f'
    this.dimNodeColor = '#26384d'
    this.dimEdgeColor = '#24364b'
    this.textColor = '#e8f1fb'
  }

  private rebuildEmphasis(): void {
    const emphasized = new Set<string>()
    for (const slug of [this.selectedSlug, this.hoveredSlug]) {
      if (!slug) continue
      emphasized.add(slug)
      for (const neighbor of this.adjacency.get(slug) ?? []) emphasized.add(neighbor)
    }
    this.emphasizedNodes = emphasized
  }

  private reduceNode(slug: string, attributes: Record<string, any>): Record<string, any> {
    const hasFocus = Boolean(this.selectedSlug || this.hoveredSlug)
    const isSelected = slug === this.selectedSlug
    const isHovered = slug === this.hoveredSlug
    const isEmphasized = this.emphasizedNodes.has(slug)

    if (hasFocus && !isEmphasized) {
      return {
        ...attributes,
        color: this.dimNodeColor,
        forceLabel: false,
        zIndex: 0,
      }
    }

    return {
      ...attributes,
      size: attributes.size + (isSelected || isHovered ? 3 : 0),
      color: isSelected || isHovered ? attributes.semanticColor : attributes.color,
      forceLabel: isSelected || isHovered,
      highlighted: isSelected || isHovered,
      zIndex: isSelected || isHovered ? 10_000 : attributes.zIndex,
    }
  }

  private reduceEdge(edge: string, attributes: Record<string, any>): Record<string, any> {
    const graph = this.graph
    if (!graph || (!this.selectedSlug && !this.hoveredSlug)) return attributes
    const [source, target] = graph.extremities(edge)
    const focus = this.hoveredSlug || this.selectedSlug
    const active = source === this.selectedSlug || target === this.selectedSlug ||
      source === this.hoveredSlug || target === this.hoveredSlug

    if (!active) {
      return { ...attributes, color: this.dimEdgeColor, size: 0.7, zIndex: 0 }
    }

    const focusType = focus && graph.hasNode(focus) ? graph.getNodeAttribute(focus, 'pageType') : 'index'
    return {
      ...attributes,
      color: WIKI_GRAPH_NODE_COLORS[focusType] || WIKI_GRAPH_NODE_COLORS.index,
      size: 2.2,
      zIndex: 10_000,
    }
  }

  private bindInteractions(renderer: Sigma, graph: Graph): void {
    renderer.on('clickNode', ({ node, event }) => {
      this.request?.callbacks.onNodeClick(node, {
        shiftKey: event.original instanceof MouseEvent && event.original.shiftKey,
      })
    })
    renderer.on('doubleClickNode', (payload) => {
      payload.preventSigmaDefault()
      this.request?.callbacks.onNodeDoubleClick(payload.node)
    })
    renderer.on('enterNode', ({ node }) => {
      this.hoveredSlug = node
      this.rebuildEmphasis()
      renderer.refresh()
      this.request?.callbacks.onNodeHover(node)
    })
    renderer.on('leaveNode', () => {
      this.hoveredSlug = null
      this.rebuildEmphasis()
      renderer.refresh()
      this.request?.callbacks.onNodeHover(null)
    })
    renderer.on('clickStage', () => this.request?.callbacks.onStageClick())

    renderer.on('downNode', ({ node }) => {
      this.draggingNode = node
      this.forceLayout?.stop()
      this.nebulaMotionNodes.delete(node)
      renderer.getCamera().disable()
    })
    renderer.getMouseCaptor().on('mousemovebody', (event) => {
      const dimensions = renderer.getDimensions()
      this.nebulaPointerYawTarget = ((event.x / Math.max(1, dimensions.width)) - 0.5) * 0.42
      this.nebulaPointerTiltTarget = ((event.y / Math.max(1, dimensions.height)) - 0.5) * -0.24
      if (!this.draggingNode) return
      const position = renderer.viewportToGraph(event)
      graph.mergeNodeAttributes(this.draggingNode, position)
      event.preventSigmaDefault()
      event.original.preventDefault()
      event.original.stopPropagation()
    })
    renderer.getMouseCaptor().on('mouseup', () => {
      this.draggingNode = null
      renderer.getCamera().enable()
    })
    renderer.getMouseCaptor().on('mousedown', () => {
      if (!renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox())
    })
  }
}
