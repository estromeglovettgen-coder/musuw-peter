import {
  CanvasEvent,
  Graph,
  NodeEvent,
  type BehaviorOptions,
  type EdgeData,
  type LayoutOptions,
  type NodeData,
  type State,
} from '@antv/g6'

import {
  WIKI_GRAPH_NODE_COLORS,
  buildWikiGraphAdjacency,
  seedWikiGraphPosition,
  type WikiGraphFitOptions,
  type WikiGraphFocusOptions,
  type WikiGraphRenderRequest,
  type WikiGraphRenderer,
  type WikiGraphStyleId,
} from './wikiGraphRenderer.ts'

type Position = { x: number; y: number }

export function buildG6Behaviors(styleId: WikiGraphStyleId): BehaviorOptions {
  const usesLiveD3Force = styleId === 'g6-obsidian' || styleId === 'g6-force'
  return [
    'drag-canvas',
    'zoom-canvas',
    usesLiveD3Force
      ? { type: 'drag-element-force', fixed: false }
      : 'drag-element',
    'auto-adapt-label',
  ]
}

function g6NodeSize(linkCount: number): number {
  return Math.max(6, Math.min(24, 5 + Math.log2(linkCount + 2) * 2.6))
}

export function buildG6Layout(
  styleId: WikiGraphStyleId,
  nodeCount: number,
  width: number,
  height: number,
  focusNode?: string,
): LayoutOptions {
  const center: [number, number] = [width / 2, height / 2]
  const radius = Math.max(120, Math.min(width, height) * 0.44)

  switch (styleId) {
    case 'g6-obsidian':
      return {
        type: 'd3-force',
        preLayout: false,
        // DragElementForce must own the live d3 simulation on the main thread.
        // A worker-only simulation cannot be reheated by pointer interaction.
        enableWorker: false,
        iterations: nodeCount > 700 ? 160 : 300,
        centerX: center[0],
        centerY: center[1],
        // Values mirrored from this machine's Obsidian 1.13.7 Graph View
        // defaults/current graph.json, executed by G6's built-in D3 layout.
        centerStrength: 0.518713248970312,
        linkDistance: 250,
        edgeStrength: 1,
        nodeStrength: -1_000,
        preventOverlap: true,
        collideStrength: 0.5,
        collideIterations: 1,
      }
    case 'g6-forceatlas2':
      return {
        type: 'force-atlas2',
        preLayout: true,
        enableWorker: nodeCount > 180,
        center,
        width,
        height,
        maxIteration: nodeCount > 500 ? 180 : 420,
        minMovement: 0.42,
        barnesHut: nodeCount > 250,
        prune: nodeCount > 100,
        mode: 'linlog',
        kr: nodeCount > 450 ? 11 : 18,
        kg: 1.2,
        ks: 0.12,
        preventOverlap: true,
        nodeSize: 18,
        nodeSpacing: 4,
      }
    case 'g6-fruchterman':
      return {
        type: 'fruchterman',
        preLayout: true,
        enableWorker: nodeCount > 180,
        center,
        width,
        height,
        maxIteration: nodeCount > 500 ? 180 : 420,
        minMovement: 0.45,
        gravity: 8,
        speed: nodeCount > 350 ? 3.2 : 4.6,
        clustering: true,
        clusterGravity: 12,
        nodeClusterBy: 'pageType',
      }
    case 'g6-mds':
      return {
        type: 'mds',
        preLayout: true,
        enableWorker: nodeCount > 140,
        center,
        width,
        height,
        linkDistance: nodeCount > 350 ? 52 : 84,
      }
    case 'g6-radial':
      return {
        type: 'radial',
        preLayout: true,
        center,
        focusNode: focusNode || null,
        unitRadius: Math.max(42, radius / Math.max(2, Math.sqrt(nodeCount) / 2.4)),
        preventOverlap: nodeCount < 700,
        maxPreventOverlapIteration: nodeCount > 300 ? 80 : 180,
        strictRadial: false,
        sortBy: 'pageType',
        sortStrength: 12,
        maxIteration: nodeCount > 500 ? 220 : 600,
      }
    case 'g6-concentric':
      return {
        type: 'concentric',
        preLayout: true,
        center,
        preventOverlap: true,
        nodeSize: 18,
        nodeSpacing: 6,
        equidistant: true,
        sortBy: (node: NodeData) => Number(node.data?.linkCount ?? 0),
      }
    case 'g6-circular':
      return {
        type: 'circular',
        preLayout: true,
        center,
        startRadius: Math.max(24, radius * 0.08),
        endRadius: radius,
        divisions: Math.max(3, Math.min(14, Math.ceil(nodeCount / 70))),
        ordering: 'degree',
        angleRatio: 1,
      }
    case 'g6-grid':
      return {
        type: 'grid',
        preLayout: true,
        begin: [36, 44],
        preventOverlap: true,
        nodeSize: 18,
        nodeSpacing: 8,
        condense: false,
        sortBy: 'degree',
      }
    default:
      return {
        type: 'd3-force',
        preLayout: true,
        enableWorker: nodeCount > 220,
        iterations: nodeCount > 700 ? 70 : nodeCount > 350 ? 120 : 220,
        centerX: center[0],
        centerY: center[1],
        centerStrength: 0.08,
        linkDistance: nodeCount > 500 ? 58 : 96,
        edgeStrength: 0.18,
        nodeStrength: nodeCount > 500 ? -52 : nodeCount > 250 ? -95 : -160,
        preventOverlap: true,
        collideStrength: 0.8,
        collideIterations: 2,
      }
  }
}

export class G6WikiGraphRenderer implements WikiGraphRenderer {
  private graph: Graph | null = null
  private request: WikiGraphRenderRequest | null = null
  private adjacency = new Map<string, Set<string>>()
  private selectedSlug: string | null = null
  private hoveredSlug: string | null = null
  private nodeIds: string[] = []
  private edgeData: EdgeData[] = []
  private destroyed = false
  private edgeColor = '#526b89'
  private dimColor = '#24364b'
  private textColor = '#e8f1fb'
  private labelBackground = '#0c1727'

  constructor(private readonly container: HTMLElement) {}

  async render(request: WikiGraphRenderRequest): Promise<void> {
    if (this.destroyed) return

    const previousPositions = this.snapshotPositions(request.preserveLayout === true)
    this.killGraph()

    this.request = request
    this.selectedSlug = request.selectedSlug
    this.hoveredSlug = null
    this.adjacency = buildWikiGraphAdjacency(request.data)
    this.nodeIds = request.data.nodes.map(node => node.slug)
    this.readThemeColors()
    this.container.dataset.graphVisual = 'cosmic'
    this.container.dataset.graphStyle = request.styleId

    const width = this.container.clientWidth || 800
    const height = this.container.clientHeight || 600
    const center = { x: width / 2, y: height / 2 }
    const isObsidianStyle = request.styleId === 'g6-obsidian'
    const anchorPosition = request.anchorSlug ? previousPositions.get(request.anchorSlug) : undefined
    const nodeIds = new Set(this.nodeIds)

    const labelCount = isObsidianStyle ? 0 : Math.max(8, Math.round(request.data.nodes.length * 0.055))
    const nodes: NodeData[] = request.data.nodes.map((node, index) => {
      const seeded = seedWikiGraphPosition(index, request.data.nodes.length)
      const previous = previousPositions.get(node.slug)
      const position = previous ?? (anchorPosition
        ? {
            x: anchorPosition.x + seeded.x * 0.8,
            y: anchorPosition.y + seeded.y * 0.8,
          }
        : {
            x: center.x + seeded.x * 5,
            y: center.y + seeded.y * 5,
          })

      return {
        id: node.slug,
        data: {
          title: node.title,
          pageType: node.page_type,
          linkCount: node.link_count,
          nodeSize: isObsidianStyle
            ? Math.max(16, Math.min(6 * Math.sqrt(node.link_count + 1), 60))
            : g6NodeSize(node.link_count),
          showLabel: index < labelCount,
        },
        style: { x: position.x, y: position.y },
      }
    })

    this.edgeData = request.data.edges.flatMap((edge, index) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return []
      return [{
        id: `wiki-edge-${index}`,
        source: edge.source,
        target: edge.target,
        data: { sourceSlug: edge.source, targetSlug: edge.target },
      } satisfies EdgeData]
    })

    const graph = new Graph({
      container: this.container,
      autoResize: true,
      autoFit: 'view',
      padding: 48,
      zoomRange: [0.05, 8],
      background: 'transparent',
      animation: isObsidianStyle,
      theme: 'dark',
      data: { nodes, edges: this.edgeData },
      layout: request.preserveLayout
        ? undefined
        : buildG6Layout(
            request.styleId,
            request.data.nodes.length,
            width,
            height,
            request.selectedSlug || request.data.nodes[0]?.slug,
          ),
      behaviors: buildG6Behaviors(request.styleId),
      node: {
        type: 'circle',
        style: (datum) => {
          const data = datum.data ?? {}
          const pageType = String(data.pageType ?? 'index')
          const color = WIKI_GRAPH_NODE_COLORS[pageType] || WIKI_GRAPH_NODE_COLORS.index
          const showLabel = Boolean(data.showLabel)
          return {
            size: Number(data.nodeSize ?? 8),
            fill: isObsidianStyle ? '#9da9b6' : color,
            stroke: isObsidianStyle ? '#9da9b6' : '#bed2e8',
            lineWidth: isObsidianStyle ? 0 : 1.2,
            cursor: 'pointer',
            shadowColor: isObsidianStyle ? 'transparent' : `${color}5c`,
            shadowBlur: isObsidianStyle ? 0 : 7,
            label: true,
            labelText: String(data.title ?? datum.id),
            labelPlacement: 'bottom',
            labelOffsetY: 5,
            labelFill: this.textColor,
            labelFontSize: 11,
            labelMaxWidth: 180,
            labelTextOverflow: 'ellipsis',
            labelOpacity: showLabel ? 0.9 : 0,
            labelBackground: true,
            labelBackgroundFill: this.labelBackground,
            labelBackgroundFillOpacity: showLabel ? 0.82 : 0,
            labelPadding: [2, 4],
            labelRadius: 3,
          }
        },
        state: {
          selected: {
            fill: '#79bfff',
            stroke: '#e8f5ff',
            lineWidth: 4,
            shadowBlur: 16,
            labelFontWeight: 600,
            labelOpacity: 1,
            labelBackgroundFillOpacity: 1,
            zIndex: 20,
          },
          active: {
            fill: '#79bfff',
            stroke: '#e8f5ff',
            lineWidth: 4,
            shadowBlur: 16,
            labelFontWeight: 600,
            labelOpacity: 1,
            labelBackgroundFillOpacity: 1,
            zIndex: 20,
          },
          neighbor: {
            opacity: 1,
            labelOpacity: 1,
          },
          dimmed: {
            opacity: 0.18,
            labelOpacity: 0.12,
            shadowBlur: 0,
          },
        },
      },
      edge: {
        type: 'line',
        style: {
          stroke: isObsidianStyle ? '#536171' : this.edgeColor,
          lineWidth: isObsidianStyle ? 0.58 : 0.72,
          opacity: isObsidianStyle ? 0.24 : 0.3,
          endArrow: request.showArrows,
          endArrowSize: 6,
        },
        state: {
          active: {
            stroke: WIKI_GRAPH_NODE_COLORS.summary,
            lineWidth: 2.4,
            opacity: 0.95,
            zIndex: 10,
          },
          dimmed: {
            stroke: this.dimColor,
            lineWidth: 0.8,
            opacity: 0.12,
          },
        },
      },
    })
    this.graph = graph
    this.bindInteractions(graph)
    await graph.render()
    await this.applySelection()
  }

  hasNode(slug: string): boolean {
    return this.nodeIds.includes(slug)
  }

  async focusNode(slug: string, options: WikiGraphFocusOptions = {}): Promise<void> {
    const graph = this.graph
    if (!graph || !this.hasNode(slug)) return
    await graph.focusElement(slug, { duration: 380, easing: 'ease-out' })
    const offsetX = options.offsetX ?? 0
    if (offsetX) await graph.translateBy([offsetX, 0], { duration: 220, easing: 'ease-out' })
  }

  async fit(options: WikiGraphFitOptions = {}): Promise<void> {
    const graph = this.graph
    if (!graph || this.nodeIds.length === 0) return
    await graph.fitView({ when: 'always', direction: 'both' }, { duration: 520, easing: 'ease-in-out' })
    const rightInset = options.rightInset ?? 0
    if (rightInset) await graph.translateBy([-rightInset / 2, 0], { duration: 220, easing: 'ease-out' })
  }

  setArrowsVisible(visible: boolean): void {
    const graph = this.graph
    if (!graph) return
    graph.updateEdgeData(this.edgeData.map(edge => ({
      id: edge.id,
      style: { endArrow: visible },
    })))
    void graph.draw()
  }

  setSelection(selectedSlug: string | null, hoveredSlug: string | null = null): void {
    this.selectedSlug = selectedSlug
    this.hoveredSlug = hoveredSlug
    void this.applySelection()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.request = null
    this.nodeIds = []
    this.edgeData = []
    this.adjacency.clear()
    this.killGraph()
  }

  private snapshotPositions(enabled: boolean): Map<string, Position> {
    const positions = new Map<string, Position>()
    const graph = this.graph
    if (!enabled || !graph) return positions
    for (const slug of this.nodeIds) {
      try {
        const [x, y] = graph.getElementPosition(slug)
        positions.set(slug, { x, y })
      } catch {
        // A layout may be tearing down while a rapid renderer switch occurs.
      }
    }
    return positions
  }

  private killGraph(): void {
    if (this.graph) {
      this.graph.off()
      this.graph.destroy()
      this.graph = null
    }
    this.container.replaceChildren()
    delete this.container.dataset.graphVisual
    delete this.container.dataset.graphStyle
  }

  private readThemeColors(): void {
    this.edgeColor = '#526b89'
    this.dimColor = '#24364b'
    this.textColor = '#e8f1fb'
    this.labelBackground = '#0c1727'
  }

  private async applySelection(): Promise<void> {
    const graph = this.graph
    if (!graph || this.destroyed) return
    const focusSlugs = [this.selectedSlug, this.hoveredSlug].filter((slug): slug is string => Boolean(slug))
    const emphasized = new Set<string>(focusSlugs)
    for (const slug of focusSlugs) {
      for (const neighbor of this.adjacency.get(slug) ?? []) emphasized.add(neighbor)
    }

    const states: Record<string, State[]> = {}
    for (const slug of this.nodeIds) {
      if (slug === this.selectedSlug) states[slug] = ['selected']
      else if (slug === this.hoveredSlug) states[slug] = ['active']
      else if (focusSlugs.length === 0) states[slug] = []
      else if (emphasized.has(slug)) states[slug] = ['neighbor']
      else states[slug] = ['dimmed']
    }

    for (const edge of this.edgeData) {
      const source = String(edge.source)
      const target = String(edge.target)
      const active = focusSlugs.some(slug => source === slug || target === slug)
      states[String(edge.id)] = focusSlugs.length === 0 ? [] : active ? ['active'] : ['dimmed']
    }

    try {
      await graph.setElementState(states, false)
    } catch {
      // The graph can be destroyed while an async state update is in flight.
    }
  }

  private bindInteractions(graph: Graph): void {
    graph.on(NodeEvent.CLICK, (event) => {
      const slug = String((event as any).target?.id ?? '')
      if (!slug) return
      const originalEvent = (event as any).originalEvent as MouseEvent | PointerEvent | undefined
      this.request?.callbacks.onNodeClick(slug, { shiftKey: Boolean(originalEvent?.shiftKey) })
    })
    graph.on(NodeEvent.DBLCLICK, (event) => {
      const slug = String((event as any).target?.id ?? '')
      if (slug) this.request?.callbacks.onNodeDoubleClick(slug)
    })
    graph.on(NodeEvent.POINTER_ENTER, (event) => {
      const slug = String((event as any).target?.id ?? '')
      if (!slug) return
      this.hoveredSlug = slug
      void this.applySelection()
      this.request?.callbacks.onNodeHover(slug)
    })
    graph.on(NodeEvent.POINTER_LEAVE, () => {
      this.hoveredSlug = null
      void this.applySelection()
      this.request?.callbacks.onNodeHover(null)
    })
    graph.on(CanvasEvent.CLICK, () => this.request?.callbacks.onStageClick())
  }
}
