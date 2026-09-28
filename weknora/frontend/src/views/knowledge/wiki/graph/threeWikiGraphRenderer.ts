import ForceGraph3D, {
  type ForceGraph3DInstance,
  type LinkObject,
  type NodeObject,
} from '3d-force-graph'
import { forceRadial } from 'd3-force-3d'
import { FogExp2, Vector2 } from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

import {
  WIKI_GRAPH_NODE_COLORS,
  buildWikiGraphAdjacency,
  type WikiGraphFitOptions,
  type WikiGraphFocusOptions,
  type WikiGraphRenderRequest,
  type WikiGraphRenderer,
} from './wikiGraphRenderer.ts'

interface NebulaNode extends NodeObject {
  id: string
  slug: string
  title: string
  pageType: string
  degree: number
  val: number
  targetRadius: number
  semanticColor: string
  nebulaColor: string
}

interface NebulaLink extends LinkObject<NebulaNode> {
  source: string | NebulaNode
  target: string | NebulaNode
  sourceSlug: string
  targetSlug: string
  carriesLight: boolean
}

interface Position3D {
  x: number
  y: number
  z: number
}

interface OrbitControlsLike {
  autoRotate: boolean
  autoRotateSpeed: number
  dampingFactor: number
  enableDamping: boolean
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const NEBULA_NODE_COLORS: Readonly<Record<string, string>> = {
  summary: '#d8ebff',
  entity: '#d8f8e5',
  concept: '#fff0c7',
  synthesis: '#d4f2ff',
  comparison: '#ffd9dc',
  index: '#e1eaf4',
}

function endpointId(endpoint: string | NebulaNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

function seededSpherePosition(index: number, total: number, radius: number): Position3D {
  const latitude = 1 - 2 * ((index + 0.5) / Math.max(1, total))
  const ringRadius = Math.sqrt(Math.max(0, 1 - latitude * latitude))
  const angle = index * GOLDEN_ANGLE
  return {
    x: Math.cos(angle) * ringRadius * radius,
    y: latitude * radius,
    z: Math.sin(angle) * ringRadius * radius,
  }
}

/**
 * True 3D renderer based on the same MIT stack used by current Obsidian
 * galaxy plugins: 3d-force-graph + Three.js + d3-force-3d. The libraries own
 * camera controls, force simulation, picking, dragging, bloom and fog; this
 * adapter only maps Wiki product data and interaction callbacks.
 */
export class ThreeWikiGraphRenderer implements WikiGraphRenderer {
  private graph: ForceGraph3DInstance<NebulaNode, NebulaLink> | null = null
  private request: WikiGraphRenderRequest | null = null
  private nodes: NebulaNode[] = []
  private links: NebulaLink[] = []
  private nodeById = new Map<string, NebulaNode>()
  private adjacency = new Map<string, Set<string>>()
  private selectedSlug: string | null = null
  private hoveredSlug: string | null = null
  private resizeObserver: ResizeObserver | null = null
  private bloomPass: UnrealBloomPass | null = null
  private fitFrame: number | null = null
  private destroyed = false

  constructor(private readonly container: HTMLElement) {}

  async render(request: WikiGraphRenderRequest): Promise<void> {
    if (this.destroyed) return

    const previousPositions = this.snapshotPositions(request.preserveLayout === true)
    this.killGraph()

    this.request = request
    this.selectedSlug = request.selectedSlug
    this.hoveredSlug = null
    this.adjacency = buildWikiGraphAdjacency(request.data)
    this.container.dataset.graphVisual = 'cosmic'
    this.container.dataset.graphStyle = request.styleId

    const nodeCount = request.data.nodes.length
    const sphereRadius = Math.max(150, Math.sqrt(Math.max(1, nodeCount)) * 32)
    const maxConnectivity = Math.max(
      1,
      ...request.data.nodes.map(node => Math.log1p(node.link_count)),
    )
    const sortedDegrees = request.data.nodes
      .map(node => node.link_count)
      .sort((left, right) => left - right)
    const lightThreshold = sortedDegrees[Math.floor(sortedDegrees.length * 0.9)] ?? 1
    const anchorPosition = request.anchorSlug ? previousPositions.get(request.anchorSlug) : undefined

    this.nodes = request.data.nodes.map((node, index) => {
      const connectivity = Math.log1p(node.link_count) / maxConnectivity
      const coreBias = Math.pow(connectivity, 0.72)
      const targetRadius = Math.max(sphereRadius * 0.14, sphereRadius * (0.96 - coreBias * 0.76))
      const seeded = seededSpherePosition(index, nodeCount, targetRadius)
      const previous = previousPositions.get(node.slug)
      const position = previous ?? (anchorPosition
        ? {
            x: anchorPosition.x + seeded.x * 0.08,
            y: anchorPosition.y + seeded.y * 0.08,
            z: anchorPosition.z + seeded.z * 0.08,
          }
        : seeded)
      const pageType = node.page_type || 'index'

      return {
        id: node.slug,
        slug: node.slug,
        title: node.title,
        pageType,
        degree: node.link_count,
        val: Math.max(0.7, Math.pow(Math.log2(node.link_count + 2), 1.45)),
        targetRadius,
        semanticColor: WIKI_GRAPH_NODE_COLORS[pageType] || WIKI_GRAPH_NODE_COLORS.index,
        nebulaColor: NEBULA_NODE_COLORS[pageType] || NEBULA_NODE_COLORS.index,
        ...position,
      }
    })
    this.nodeById = new Map(this.nodes.map(node => [node.id, node]))

    this.links = request.data.edges.flatMap((edge) => {
      const source = this.nodeById.get(edge.source)
      const target = this.nodeById.get(edge.target)
      if (!source || !target) return []
      return [{
        source: source.id,
        target: target.id,
        sourceSlug: source.id,
        targetSlug: target.id,
        carriesLight: Math.max(source.degree, target.degree) >= lightThreshold,
      } satisfies NebulaLink]
    })

    const width = Math.max(1, this.container.clientWidth || 800)
    const height = Math.max(1, this.container.clientHeight || 600)
    const isLarge = nodeCount > 1_600
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const graph = new ForceGraph3D(this.container, {
      controlType: 'orbit',
      rendererConfig: {
        alpha: false,
        antialias: !isLarge,
        powerPreference: 'high-performance',
      },
    }) as unknown as ForceGraph3DInstance<NebulaNode, NebulaLink>
    this.graph = graph

    graph
      .width(width)
      .height(height)
      .backgroundColor('#050b14')
      .showNavInfo(false)
      .nodeId('id')
      .nodeVal('val')
      .nodeRelSize(isLarge ? 1.55 : 2.25)
      .nodeResolution(isLarge ? 4 : 8)
      .nodeOpacity(0.92)
      .nodeColor(node => this.nodeColor(node))
      .nodeLabel(node => this.nodeLabel(node))
      .linkColor(link => this.linkColor(link))
      .linkOpacity(isLarge ? 0.14 : 0.25)
      .linkWidth(link => this.linkWidth(link))
      .linkDirectionalArrowLength(request.showArrows ? 2.8 : 0)
      .linkDirectionalArrowRelPos(0.94)
      .linkDirectionalArrowResolution(4)
      .linkDirectionalArrowColor(() => '#a8d8ff')
      .linkDirectionalParticles(link => !isLarge && link.carriesLight ? 1 : 0)
      .linkDirectionalParticleColor(() => '#c7ecff')
      .linkDirectionalParticleSpeed(0.00135)
      .linkDirectionalParticleWidth(0.34)
      .enableNodeDrag(true)
      .warmupTicks(reducedMotion ? 30 : 10)
      .cooldownTicks(isLarge ? 100 : 240)
      .cooldownTime(isLarge ? 5_500 : 10_000)
      .d3AlphaDecay(isLarge ? 0.03 : 0.018)
      .d3VelocityDecay(0.25)
      .onNodeHover((node) => this.handleNodeHover(node))
      .onNodeClick((node, event) => this.handleNodeClick(node, event))
      .onBackgroundClick(() => request.callbacks.onStageClick())
      .onEngineStop(() => {
        if (this.graph === graph && this.nodes.length > 0) graph.zoomToFit(700, 72)
      })

    // d3-force-3d supplies the sphere constraint. Highly connected nodes are
    // pulled toward the core while low-degree notes form the outer star shell.
    graph.d3Force('sphere', forceRadial<NebulaNode>(node => node.targetRadius, 0, 0, 0)
      .strength(node => node.degree >= lightThreshold ? 0.045 : 0.085))
    graph.d3Force('charge')?.strength?.(isLarge ? -18 : -34)
    graph.d3Force('link')?.distance?.(isLarge ? 24 : 38)
    graph.d3Force('link')?.strength?.(isLarge ? 0.08 : 0.13)

    graph.scene().fog = new FogExp2('#050b14', Math.min(0.00055, 0.32 / sphereRadius))
    graph.renderer().setPixelRatio(isLarge ? 1 : Math.min(window.devicePixelRatio, 1.75))

    if (!isLarge) {
      const bloomPass = new UnrealBloomPass(
        new Vector2(width, height),
        1.05,
        0.62,
        0.18,
      )
      this.bloomPass = bloomPass
      graph.postProcessingComposer().addPass(bloomPass)
    }

    const controls = graph.controls() as OrbitControlsLike
    controls.autoRotate = !reducedMotion
    controls.autoRotateSpeed = 0.24
    controls.enableDamping = true
    controls.dampingFactor = 0.072

    this.resizeObserver = new ResizeObserver(() => this.resizeGraph())
    this.resizeObserver.observe(this.container)
    graph.graphData({ nodes: this.nodes, links: this.links })

    this.fitFrame = window.requestAnimationFrame(() => {
      this.fitFrame = null
      if (this.graph === graph && this.nodes.length > 0) graph.zoomToFit(650, 76)
    })
  }

  hasNode(slug: string): boolean {
    return this.nodeById.has(slug)
  }

  async focusNode(slug: string, options: WikiGraphFocusOptions = {}): Promise<void> {
    const graph = this.graph
    const node = this.nodeById.get(slug)
    if (!graph || !node || node.x === undefined || node.y === undefined || node.z === undefined) return

    const camera = graph.cameraPosition()
    const dx = camera.x - node.x
    const dy = camera.y - node.y
    const dz = camera.z - node.z
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
    const distance = 105 + Math.cbrt(node.val) * 15
    const targetOffsetX = -(options.offsetX ?? 0) * distance / Math.max(1, this.container.clientWidth)
    graph.cameraPosition({
      x: node.x + dx / length * distance,
      y: node.y + dy / length * distance,
      z: node.z + dz / length * distance,
    }, {
      x: node.x + targetOffsetX,
      y: node.y,
      z: node.z,
    }, 480)
  }

  async fit(options: WikiGraphFitOptions = {}): Promise<void> {
    if (!this.graph || this.nodes.length === 0) return
    const padding = 72 + Math.min(180, (options.rightInset ?? 0) * 0.25)
    this.graph.zoomToFit(650, padding)
  }

  setArrowsVisible(visible: boolean): void {
    this.graph?.linkDirectionalArrowLength(visible ? 2.8 : 0).refresh()
  }

  setSelection(selectedSlug: string | null, hoveredSlug: string | null = null): void {
    this.selectedSlug = selectedSlug
    this.hoveredSlug = hoveredSlug
    this.graph?.refresh()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.request = null
    this.adjacency.clear()
    this.nodeById.clear()
    this.nodes = []
    this.links = []
    this.killGraph()
  }

  private snapshotPositions(enabled: boolean): Map<string, Position3D> {
    const positions = new Map<string, Position3D>()
    if (!enabled) return positions
    for (const node of this.nodes) {
      if (node.x === undefined || node.y === undefined || node.z === undefined) continue
      positions.set(node.id, { x: node.x, y: node.y, z: node.z })
    }
    return positions
  }

  private nodeColor(node: NebulaNode): string {
    const focus = this.hoveredSlug || this.selectedSlug
    if (!focus) return node.nebulaColor
    if (node.id === focus) return '#ffffff'
    if (this.adjacency.get(focus)?.has(node.id)) return node.semanticColor
    return '#17283c'
  }

  private nodeLabel(node: NebulaNode): HTMLElement {
    const label = document.createElement('div')
    label.className = 'wiki-graph-three-tooltip'
    label.textContent = node.title
    return label
  }

  private linkIsActive(link: NebulaLink): boolean {
    const focus = this.hoveredSlug || this.selectedSlug
    if (!focus) return false
    return endpointId(link.source) === focus || endpointId(link.target) === focus
  }

  private linkColor(link: NebulaLink): string {
    const focus = this.hoveredSlug || this.selectedSlug
    if (!focus) return '#56789d'
    return this.linkIsActive(link) ? '#b8e1ff' : '#142438'
  }

  private linkWidth(link: NebulaLink): number {
    return this.linkIsActive(link) ? 1.15 : 0.28
  }

  private handleNodeHover(node: NebulaNode | null): void {
    this.hoveredSlug = node?.id ?? null
    this.graph?.refresh()
    this.request?.callbacks.onNodeHover(this.hoveredSlug)
  }

  private handleNodeClick(node: NebulaNode, event: MouseEvent): void {
    this.request?.callbacks.onNodeClick(node.id, { shiftKey: event.shiftKey })
    if (event.detail >= 2) this.request?.callbacks.onNodeDoubleClick(node.id)
  }

  private resizeGraph(): void {
    const graph = this.graph
    if (!graph) return
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    graph.width(width).height(height)
    this.bloomPass?.setSize(width, height)
  }

  private killGraph(): void {
    if (this.fitFrame !== null) window.cancelAnimationFrame(this.fitFrame)
    this.fitFrame = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.bloomPass?.dispose()
    this.bloomPass = null
    this.graph?._destructor()
    this.graph = null
    this.container.replaceChildren()
    delete this.container.dataset.graphVisual
    delete this.container.dataset.graphStyle
  }
}
