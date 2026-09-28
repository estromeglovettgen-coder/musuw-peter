import type {
  WikiGraphFitOptions,
  WikiGraphFocusOptions,
  WikiGraphRenderData,
  WikiGraphRenderRequest,
  WikiGraphRenderer,
} from './wikiGraphRenderer.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

const NODE_COLOR_MAP: Readonly<Record<string, string>> = {
  summary: '#0052d9',
  entity: '#2ba471',
  concept: '#e37318',
  synthesis: '#0594fa',
  comparison: '#d54941',
  index: '#8c8c8c',
}

interface WeknoraNativeNode {
  x: number
  y: number
  vx: number
  vy: number
  slug: string
  title: string
  type: string
  linkCount: number
  pinned: boolean
}

interface WeknoraNativeNodeElement {
  g: SVGGElement
  circle: SVGCircleElement
  text: SVGTextElement
  activeRing: SVGCircleElement
  node: WeknoraNativeNode
}

interface WeknoraNativeEdgeElement {
  line: SVGLineElement
  source: string
  target: string
  bidir: boolean
}

interface WeknoraNativeGraphData extends WikiGraphRenderData {
  meta?: {
    mode?: 'overview' | 'ego'
    center?: string
  }
}

interface WeknoraNativePanZoom {
  setScale: (scale: number) => void
  setTranslate: (x: number, y: number) => void
  apply: () => void
  flyTo: (x: number, y: number, scale?: number, duration?: number) => void
  getScale: () => number
  cancel: () => void
}

/** Exact radius formula from the repository's original WikiBrowser graph. */
export function weknoraNativeNodeRadius(linkCount: number): number {
  return Math.max(8, Math.min(24, 8 + Math.log(linkCount + 1) * 4))
}

/** Exact fit calculation from the repository's original WikiBrowser graph. */
export function calculateWeknoraNativeFit(
  nodes: ReadonlyArray<{ x: number; y: number }>,
  width: number,
  height: number,
  rightInset = 0,
): { x: number; y: number; scale: number } | null {
  if (nodes.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x)
    maxY = Math.max(maxY, node.y)
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const padding = 60
  const boxWidth = Math.max(maxX - minX, 100) + padding * 2
  const boxHeight = Math.max(maxY - minY, 100) + padding * 2
  const scaleX = width / boxWidth
  const scaleY = height / boxHeight
  const scale = Math.max(0.2, Math.min(2, Math.min(scaleX, scaleY)))
  const targetCx = width / 2 - rightInset / 2
  const targetCy = height / 2

  return {
    x: targetCx - cx * scale,
    y: targetCy - cy * scale,
    scale,
  }
}

/**
 * Adapter for the untouched graph behavior that shipped in WikiBrowser.vue at
 * this repository's HEAD. Rendering stays SVG-based and the layout constants,
 * event timing and force equations below are copied from that implementation.
 */
export class WeknoraNativeWikiGraphRenderer implements WikiGraphRenderer {
  private request: WikiGraphRenderRequest | null = null
  private graphNodes: WeknoraNativeNode[] = []
  private graphSvg: SVGSVGElement | null = null
  private graphAnimFrame = 0
  private graphHoverLeaveTimer: ReturnType<typeof setTimeout> | null = null
  private graphPanZoomRef: WeknoraNativePanZoom | null = null
  private graphNodeElsRef: WeknoraNativeNodeElement[] = []
  private graphEdgeElsRef: WeknoraNativeEdgeElement[] = []
  private graphAdjacencyRef = new Map<string, Set<string>>()
  private graphSelectedSlug: string | null = null
  private graphHighlightSlug: string | null = null
  private showArrows = true
  private cleanupListeners: Array<() => void> = []
  private renderRevision = 0

  constructor(private readonly container: HTMLElement) {}

  async render(request: WikiGraphRenderRequest): Promise<void> {
    const graph = request.data as WeknoraNativeGraphData
    const width = this.container.clientWidth || 800
    const height = this.container.clientHeight || 600
    const priorCoords = new Map<string, {
      x: number
      y: number
      vx: number
      vy: number
      pinned: boolean
    }>()

    if (request.preserveLayout) {
      for (const node of this.graphNodes) {
        priorCoords.set(node.slug, {
          x: node.x,
          y: node.y,
          vx: node.vx,
          vy: node.vy,
          pinned: node.pinned,
        })
      }
    }

    this.releaseRenderSurface()
    this.request = request
    this.graphSelectedSlug = request.selectedSlug
    this.graphHighlightSlug = null
    this.showArrows = request.showArrows
    this.container.dataset.graphVisual = 'weknora-native'
    this.container.dataset.graphStyle = request.styleId

    if (!graph.nodes.length) {
      this.graphNodes = []
      return
    }

    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    svg.style.width = '100%'
    svg.style.height = '100%'
    this.container.replaceChildren(svg)
    this.graphSvg = svg

    const rootG = document.createElementNS(SVG_NS, 'g')
    rootG.setAttribute('class', 'graph-root')
    svg.appendChild(rootG)

    const edgeG = document.createElementNS(SVG_NS, 'g')
    rootG.appendChild(edgeG)

    const nodeG = document.createElementNS(SVG_NS, 'g')
    rootG.appendChild(nodeG)

    const adjacency = new Map<string, Set<string>>()
    for (const edge of graph.edges) {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
      adjacency.get(edge.source)!.add(edge.target)
      adjacency.get(edge.target)!.add(edge.source)
    }

    const anchorCoord = request.anchorSlug ? priorCoords.get(request.anchorSlug) : undefined
    const anchorX = anchorCoord?.x ?? width / 2
    const anchorY = anchorCoord?.y ?? height / 2
    const nodeMap = new Map<string, WeknoraNativeNode>()

    this.graphNodes = graph.nodes.map((sourceNode, index) => {
      const prior = request.preserveLayout ? priorCoords.get(sourceNode.slug) : undefined
      let x: number
      let y: number
      let vx: number
      let vy: number
      let pinned: boolean

      if (prior) {
        x = prior.x
        y = prior.y
        vx = prior.vx
        vy = prior.vy
        pinned = prior.pinned
      } else if (request.preserveLayout && request.anchorSlug) {
        const jitterR = 40
        const angle = Math.random() * Math.PI * 2
        x = anchorX + jitterR * Math.cos(angle)
        y = anchorY + jitterR * Math.sin(angle)
        vx = 0
        vy = 0
        pinned = false
      } else {
        const angle = (2 * Math.PI * index) / graph.nodes.length
        const radius = Math.min(width, height) * 0.35
        x = width / 2 + radius * Math.cos(angle) + (Math.random() - 0.5) * 50
        y = height / 2 + radius * Math.sin(angle) + (Math.random() - 0.5) * 50
        vx = 0
        vy = 0
        pinned = false
      }

      const node: WeknoraNativeNode = {
        x,
        y,
        vx,
        vy,
        slug: sourceNode.slug,
        title: sourceNode.title,
        type: sourceNode.page_type,
        linkCount: sourceNode.link_count || 0,
        pinned,
      }
      nodeMap.set(node.slug, node)
      return node
    })

    svg.appendChild(this.createDefinitions())

    const edgePairSet = new Set<string>()
    for (const edge of graph.edges) edgePairSet.add(`${edge.source}→${edge.target}`)

    const edgeEls: WeknoraNativeEdgeElement[] = []
    const processedPairs = new Set<string>()
    for (const edge of graph.edges) {
      const pairKey = [edge.source, edge.target].sort().join('↔')
      if (processedPairs.has(pairKey)) continue
      processedPairs.add(pairKey)

      const bidir = edgePairSet.has(`${edge.target}→${edge.source}`)
      const line = document.createElementNS(SVG_NS, 'line')
      line.setAttribute('stroke', '#c0c4cc')
      line.setAttribute('stroke-width', '1.2')
      line.setAttribute('stroke-opacity', '0.4')
      line.setAttribute('marker-end', 'url(#arrow-end)')
      line.style.transition = 'stroke 0.2s, stroke-width 0.2s, stroke-opacity 0.2s'
      if (bidir) line.setAttribute('marker-start', 'url(#arrow-start)')
      edgeG.appendChild(line)
      edgeEls.push({ line, source: edge.source, target: edge.target, bidir })
    }

    const nodeEls: WeknoraNativeNodeElement[] = []
    for (const node of this.graphNodes) {
      const element = this.createNodeElement(
        node,
        graph,
        adjacency,
        nodeMap,
        edgeEls,
        nodeEls,
      )
      nodeG.appendChild(element.g)
      nodeEls.push(element)
    }

    this.graphNodeElsRef = nodeEls
    this.graphEdgeElsRef = edgeEls
    this.graphAdjacencyRef = adjacency
    this.setupPanZoom(svg, rootG)

    for (const { g, node } of nodeEls) {
      g.setAttribute('transform', `translate(${node.x},${node.y})`)
    }
    for (const edge of edgeEls) {
      const source = nodeMap.get(edge.source)
      const target = nodeMap.get(edge.target)
      if (source && target) this.setEdgePositions(edge.line, source, target)
    }

    if (this.graphSelectedSlug) {
      this.applyHighlight(this.graphSelectedSlug)
    }
    this.setArrowsVisible(this.showArrows)
    this.startForceSimulation(graph, nodeMap)
  }

  hasNode(slug: string): boolean {
    return this.graphNodes.some(node => node.slug === slug)
  }

  async focusNode(slug: string, options: WikiGraphFocusOptions = {}): Promise<void> {
    const node = this.graphNodes.find(candidate => candidate.slug === slug)
    if (!node || !this.graphPanZoomRef) return
    const width = this.container.clientWidth || 800
    const height = this.container.clientHeight || 600
    const scale = this.graphPanZoomRef.getScale()
    this.graphPanZoomRef.flyTo(
      width / 2 - node.x * scale + (options.offsetX ?? 0),
      height / 2 - node.y * scale,
    )
  }

  async fit(options: WikiGraphFitOptions = {}): Promise<void> {
    if (!this.graphPanZoomRef) return
    const fit = calculateWeknoraNativeFit(
      this.graphNodes,
      this.container.clientWidth || 800,
      this.container.clientHeight || 600,
      options.rightInset ?? 0,
    )
    if (fit) this.graphPanZoomRef.flyTo(fit.x, fit.y, fit.scale, 600)
  }

  setArrowsVisible(visible: boolean): void {
    this.showArrows = visible
    for (const edge of this.graphEdgeElsRef) {
      if (visible) {
        edge.line.setAttribute('marker-end', 'url(#arrow-end)')
        if (edge.bidir) edge.line.setAttribute('marker-start', 'url(#arrow-start)')
      } else {
        edge.line.removeAttribute('marker-end')
        edge.line.removeAttribute('marker-start')
      }
    }
  }

  setSelection(selectedSlug: string | null, hoveredSlug: string | null = null): void {
    this.graphSelectedSlug = selectedSlug
    this.graphHighlightSlug = hoveredSlug
    if (selectedSlug) {
      this.applyHighlight(selectedSlug, hoveredSlug ?? undefined)
    } else if (hoveredSlug) {
      this.applyHighlight(hoveredSlug)
    } else {
      this.clearHighlight()
    }
  }

  restartSimulation(): void {
    if (!this.request) return
    const graph = this.request.data as WeknoraNativeGraphData
    const nodeMap = new Map(this.graphNodes.map(node => [node.slug, node]))
    for (const node of this.graphNodes) node.pinned = false
    this.startForceSimulation(graph, nodeMap)
  }

  destroy(): void {
    this.renderRevision += 1
    this.releaseRenderSurface()
    this.request = null
    this.graphNodes = []
    this.container.replaceChildren()
  }

  private createDefinitions(): SVGDefsElement {
    const defs = document.createElementNS(SVG_NS, 'defs')
    defs.appendChild(this.createArrowMarker('arrow-end', false, '#c0c4cc'))
    defs.appendChild(this.createArrowMarker('arrow-start', true, '#c0c4cc'))
    defs.appendChild(this.createArrowMarker('arrow-end-hl', false, '#0052d9'))
    defs.appendChild(this.createArrowMarker('arrow-start-hl', true, '#0052d9'))

    const filter = document.createElementNS(SVG_NS, 'filter')
    filter.setAttribute('id', 'node-shadow')
    filter.setAttribute('x', '-20%')
    filter.setAttribute('y', '-20%')
    filter.setAttribute('width', '140%')
    filter.setAttribute('height', '140%')
    filter.innerHTML = '<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.15"/>'
    defs.appendChild(filter)
    return defs
  }

  private createArrowMarker(id: string, reverse: boolean, color: string): SVGMarkerElement {
    const marker = document.createElementNS(SVG_NS, 'marker')
    marker.setAttribute('id', id)
    marker.setAttribute('viewBox', '0 0 10 6')
    marker.setAttribute('refX', reverse ? '0' : '10')
    marker.setAttribute('refY', '3')
    marker.setAttribute('markerWidth', '8')
    marker.setAttribute('markerHeight', '6')
    marker.setAttribute('orient', 'auto')
    const path = document.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', reverse ? 'M10,0 L0,3 L10,6 L8,3 Z' : 'M0,0 L10,3 L0,6 L2,3 Z')
    path.setAttribute('fill', color)
    marker.appendChild(path)
    return marker
  }

  private createNodeElement(
    node: WeknoraNativeNode,
    graph: WeknoraNativeGraphData,
    adjacency: Map<string, Set<string>>,
    nodeMap: Map<string, WeknoraNativeNode>,
    edgeEls: WeknoraNativeEdgeElement[],
    nodeEls: WeknoraNativeNodeElement[],
  ): WeknoraNativeNodeElement {
    const g = document.createElementNS(SVG_NS, 'g')
    g.style.cursor = 'pointer'
    const radius = weknoraNativeNodeRadius(node.linkCount)
    const visibleNeighbors = adjacency.get(node.slug)?.size ?? 0
    const hiddenNeighbors = Math.max(0, node.linkCount - visibleNeighbors)
    const isEgoCenter = graph.meta?.mode === 'ego' && graph.meta.center === node.slug
    const showExpansionRing = hiddenNeighbors > 0 && !isEgoCenter

    const expansionRing = document.createElementNS(SVG_NS, 'circle')
    expansionRing.setAttribute('r', String(radius + 3))
    expansionRing.setAttribute('fill', 'none')
    expansionRing.setAttribute('stroke', NODE_COLOR_MAP[node.type] || '#8c8c8c')
    expansionRing.setAttribute('stroke-width', '1.5')
    expansionRing.setAttribute('stroke-dasharray', '3 3')
    expansionRing.setAttribute('pointer-events', 'none')
    expansionRing.style.opacity = showExpansionRing ? '0.55' : '0'
    expansionRing.style.transition = 'opacity 0.2s'
    expansionRing.classList.add('node-expansion-ring')
    g.appendChild(expansionRing)

    const activeRing = document.createElementNS(SVG_NS, 'circle')
    activeRing.setAttribute('r', String(radius + 5))
    activeRing.setAttribute('fill', 'none')
    activeRing.setAttribute('stroke', NODE_COLOR_MAP[node.type] || '#8c8c8c')
    activeRing.setAttribute('stroke-width', '2')
    activeRing.style.opacity = '0'
    activeRing.style.transition = 'opacity 0.2s'
    activeRing.classList.add('node-active-ring')
    g.appendChild(activeRing)

    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('r', String(radius))
    circle.setAttribute('fill', NODE_COLOR_MAP[node.type] || '#8c8c8c')
    circle.setAttribute('stroke', '#fff')
    circle.setAttribute('stroke-width', '2')
    circle.style.transition = 'r 0.2s, stroke-width 0.2s, opacity 0.2s'
    g.appendChild(circle)

    const textBg = document.createElementNS(SVG_NS, 'rect')
    g.appendChild(textBg)

    const text = document.createElementNS(SVG_NS, 'text')
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('dy', String(radius + 14))
    text.setAttribute('font-size', '11')
    text.setAttribute('fill', 'var(--td-text-color-secondary)')
    text.setAttribute('pointer-events', 'none')
    text.style.transition = 'opacity 0.2s'
    text.style.textShadow = '0 1px 3px var(--td-bg-color-container), 0 -1px 3px var(--td-bg-color-container), 1px 0 3px var(--td-bg-color-container), -1px 0 3px var(--td-bg-color-container)'
    text.textContent = node.title.length > 14 ? `${node.title.substring(0, 14)}…` : node.title
    g.appendChild(text)

    let bloomButton: SVGGElement | null = null
    const bloomButtonEligible = !isEgoCenter && graph.meta?.mode === 'ego' && hiddenNeighbors > 0
    if (bloomButtonEligible) {
      bloomButton = this.createBloomButton(radius, node.slug)
      g.appendChild(bloomButton)
    }

    const element = { g, circle, text, activeRing, node }

    const onMouseEnter = () => {
      if (this.graphHoverLeaveTimer) {
        clearTimeout(this.graphHoverLeaveTimer)
        this.graphHoverLeaveTimer = null
      }
      if (bloomButton) {
        bloomButton.style.opacity = '1'
        bloomButton.style.pointerEvents = 'auto'
      }
      this.graphHighlightSlug = node.slug
      this.request?.callbacks.onNodeHover(node.slug)
      if (!this.graphSelectedSlug) {
        this.applyHighlight(node.slug, undefined, nodeEls, edgeEls, adjacency)
      } else if (this.graphSelectedSlug !== node.slug) {
        this.applyHighlight(
          this.graphSelectedSlug,
          node.slug,
          nodeEls,
          edgeEls,
          adjacency,
        )
      }
    }

    const onMouseLeave = () => {
      if (this.graphHoverLeaveTimer) clearTimeout(this.graphHoverLeaveTimer)
      if (bloomButton) {
        bloomButton.style.opacity = '0'
        bloomButton.style.pointerEvents = 'none'
      }
      this.graphHoverLeaveTimer = setTimeout(() => {
        this.graphHoverLeaveTimer = null
        this.graphHighlightSlug = null
        this.request?.callbacks.onNodeHover(null)
        if (!this.graphSelectedSlug) {
          this.clearHighlight(nodeEls, edgeEls, adjacency)
        } else {
          this.applyHighlight(
            this.graphSelectedSlug,
            undefined,
            nodeEls,
            edgeEls,
            adjacency,
          )
        }
      }, 60)
    }

    const onClick = (event: MouseEvent) => {
      event.stopPropagation()
      this.request?.callbacks.onNodeClick(node.slug, { shiftKey: event.shiftKey })
    }

    const onDoubleClick = (event: MouseEvent) => {
      event.stopPropagation()
      this.request?.callbacks.onNodeDoubleClick(node.slug)
    }

    g.addEventListener('mouseenter', onMouseEnter)
    g.addEventListener('mouseleave', onMouseLeave)
    g.addEventListener('click', onClick)
    g.addEventListener('dblclick', onDoubleClick)
    this.cleanupListeners.push(() => {
      g.removeEventListener('mouseenter', onMouseEnter)
      g.removeEventListener('mouseleave', onMouseLeave)
      g.removeEventListener('click', onClick)
      g.removeEventListener('dblclick', onDoubleClick)
    })

    this.setupDrag(g, node, nodeMap, edgeEls)
    return element
  }

  private createBloomButton(radius: number, slug: string): SVGGElement {
    const button = document.createElementNS(SVG_NS, 'g')
    button.classList.add('node-bloom-btn')
    button.style.opacity = '0'
    button.style.transition = 'opacity 0.15s'
    button.style.pointerEvents = 'none'
    button.style.cursor = 'pointer'
    const buttonOffset = radius + 6
    const x = Math.SQRT1_2 * buttonOffset
    const y = -Math.SQRT1_2 * buttonOffset

    const background = document.createElementNS(SVG_NS, 'circle')
    background.setAttribute('cx', String(x))
    background.setAttribute('cy', String(y))
    background.setAttribute('r', '8')
    background.setAttribute('fill', 'var(--td-bg-color-container, #fff)')
    background.setAttribute('stroke', 'var(--td-brand-color, #0052d9)')
    background.setAttribute('stroke-width', '1.5')
    button.appendChild(background)

    const vertical = document.createElementNS(SVG_NS, 'line')
    vertical.setAttribute('x1', String(x))
    vertical.setAttribute('x2', String(x))
    vertical.setAttribute('y1', String(y - 4))
    vertical.setAttribute('y2', String(y + 4))
    vertical.setAttribute('stroke', 'var(--td-brand-color, #0052d9)')
    vertical.setAttribute('stroke-width', '1.8')
    vertical.setAttribute('stroke-linecap', 'round')
    button.appendChild(vertical)

    const horizontal = document.createElementNS(SVG_NS, 'line')
    horizontal.setAttribute('x1', String(x - 4))
    horizontal.setAttribute('x2', String(x + 4))
    horizontal.setAttribute('y1', String(y))
    horizontal.setAttribute('y2', String(y))
    horizontal.setAttribute('stroke', 'var(--td-brand-color, #0052d9)')
    horizontal.setAttribute('stroke-width', '1.8')
    horizontal.setAttribute('stroke-linecap', 'round')
    button.appendChild(horizontal)

    const onClick = (event: MouseEvent) => {
      event.stopPropagation()
      this.request?.callbacks.onNodeClick(slug, { shiftKey: true })
    }
    button.addEventListener('click', onClick)
    this.cleanupListeners.push(() => button.removeEventListener('click', onClick))
    return button
  }

  private setupDrag(
    g: SVGGElement,
    node: WeknoraNativeNode,
    nodeMap: Map<string, WeknoraNativeNode>,
    edgeEls: WeknoraNativeEdgeElement[],
  ): void {
    let dragging = false
    let startX = 0
    let startY = 0

    const getPoint = (event: MouseEvent) => {
      const svg = this.graphSvg
      if (!svg) return { x: event.clientX, y: event.clientY }
      const point = svg.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      const root = svg.querySelector('.graph-root') as SVGGElement | null
      const ctm = root?.getCTM()?.inverse()
      if (!ctm) return { x: event.clientX, y: event.clientY }
      const svgPoint = point.matrixTransform(ctm)
      return { x: svgPoint.x, y: svgPoint.y }
    }

    const onMove = (event: MouseEvent) => {
      if (!dragging) return
      const point = getPoint(event)
      node.x = point.x - startX
      node.y = point.y - startY
      node.vx = 0
      node.vy = 0
      g.setAttribute('transform', `translate(${node.x},${node.y})`)
      for (const edge of edgeEls) {
        if (edge.source !== node.slug && edge.target !== node.slug) continue
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (source && target) this.setEdgePositions(edge.line, source, target)
      }
    }

    const removeWindowListeners = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
    }

    const onEnd = () => {
      dragging = false
      g.querySelector('circle')?.setAttribute('stroke', '#fff')
      g.querySelector('circle')?.setAttribute('stroke-width', '2')
      removeWindowListeners()
    }

    const onStart = (event: MouseEvent) => {
      if (event.button !== 0) return
      event.stopPropagation()
      dragging = true
      node.pinned = true
      const point = getPoint(event)
      startX = point.x - node.x
      startY = point.y - node.y
      g.querySelector('circle')?.setAttribute('stroke', NODE_COLOR_MAP[node.type] || '#8c8c8c')
      g.querySelector('circle')?.setAttribute('stroke-width', '3')
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onEnd)
    }

    g.addEventListener('mousedown', onStart)
    this.cleanupListeners.push(() => {
      g.removeEventListener('mousedown', onStart)
      removeWindowListeners()
    })
  }

  private setupPanZoom(svg: SVGSVGElement, rootG: SVGGElement): void {
    let scale = 1
    let translateX = 0
    let translateY = 0
    let panning = false
    let panStartX = 0
    let panStartY = 0
    let dragStartX = 0
    let dragStartY = 0
    let animationFrame = 0

    const updateLabelsVisibility = () => {
      for (const { text, node } of this.graphNodeElsRef) {
        if (node.slug === this.graphSelectedSlug || node.slug === this.graphHighlightSlug) {
          text.style.opacity = '1'
          continue
        }

        let visibilityThreshold = 0.5
        if (node.linkCount > 10) visibilityThreshold = 0.2
        else if (node.linkCount > 5) visibilityThreshold = 0.35
        else if (node.linkCount > 2) visibilityThreshold = 0.45
        text.style.opacity = scale < visibilityThreshold ? '0' : '1'
      }
    }

    const applyTransform = () => {
      rootG.setAttribute('transform', `translate(${translateX},${translateY}) scale(${scale})`)
      updateLabelsVisibility()
    }

    this.graphPanZoomRef = {
      setScale: value => { scale = value },
      setTranslate: (x, y) => { translateX = x; translateY = y },
      apply: applyTransform,
      getScale: () => scale,
      flyTo: (targetX, targetY, targetScale, duration = 400) => {
        cancelAnimationFrame(animationFrame)
        const startX = translateX
        const startY = translateY
        const startScale = scale
        const nextScale = targetScale || scale
        const startTime = performance.now()
        const animate = (time: number) => {
          let progress = (time - startTime) / duration
          if (progress > 1) progress = 1
          const ease = 1 - Math.pow(1 - progress, 3)
          translateX = startX + (targetX - startX) * ease
          translateY = startY + (targetY - startY) * ease
          scale = startScale + (nextScale - startScale) * ease
          applyTransform()
          if (progress < 1) animationFrame = requestAnimationFrame(animate)
        }
        animationFrame = requestAnimationFrame(animate)
      },
      cancel: () => cancelAnimationFrame(animationFrame),
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const zoomFactor = event.deltaY > 0 ? 0.92 : 1.08
      const newScale = Math.max(0.2, Math.min(5, scale * zoomFactor))
      const rect = svg.getBoundingClientRect()
      const cx = event.clientX - rect.left
      const cy = event.clientY - rect.top
      translateX = cx - (cx - translateX) * (newScale / scale)
      translateY = cy - (cy - translateY) * (newScale / scale)
      scale = newScale
      applyTransform()
    }

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      const target = event.target as Element
      if (target.tagName !== 'svg' && target.tagName !== 'SVG') return
      panning = true
      panStartX = event.clientX - translateX
      panStartY = event.clientY - translateY
      dragStartX = event.clientX
      dragStartY = event.clientY
      svg.style.cursor = 'grabbing'
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!panning) return
      translateX = event.clientX - panStartX
      translateY = event.clientY - panStartY
      applyTransform()
    }

    const onMouseUp = (event: MouseEvent) => {
      if (!panning) return
      panning = false
      svg.style.cursor = 'default'
      const dx = event.clientX - dragStartX
      const dy = event.clientY - dragStartY
      const target = event.target as Element
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5
        && (target.tagName === 'svg' || target.tagName === 'SVG')) {
        this.graphSelectedSlug = null
        this.graphHighlightSlug = null
        this.clearHighlight()
        this.request?.callbacks.onStageClick()
      }
    }

    svg.addEventListener('wheel', onWheel, { passive: false })
    svg.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    this.cleanupListeners.push(() => {
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      cancelAnimationFrame(animationFrame)
    })
  }

  private startForceSimulation(
    graph: WeknoraNativeGraphData,
    nodeMap: Map<string, WeknoraNativeNode>,
  ): void {
    if (this.graphAnimFrame) cancelAnimationFrame(this.graphAnimFrame)
    const revision = ++this.renderRevision
    let alpha = 1

    const tick = () => {
      if (revision !== this.renderRevision) return
      alpha *= 0.985
      if (alpha < 0.02) {
        this.graphAnimFrame = 0
        return
      }

      const sortedNodes = [...this.graphNodes].sort((left, right) => left.x - right.x)
      const maxRepulsionDistance = 300
      const maxRepulsionDistanceSquared = maxRepulsionDistance * maxRepulsionDistance

      for (let i = 0; i < sortedNodes.length; i += 1) {
        const first = sortedNodes[i]
        for (let j = i + 1; j < sortedNodes.length; j += 1) {
          const second = sortedNodes[j]
          const dx = second.x - first.x
          if (dx > maxRepulsionDistance) break
          const dy = second.y - first.y
          if (Math.abs(dy) > maxRepulsionDistance) continue
          const distanceSquared = dx * dx + dy * dy
          if (distanceSquared > maxRepulsionDistanceSquared) continue
          const distance = Math.sqrt(distanceSquared) || 1
          const force = (200 * alpha) / Math.max(distanceSquared, 100) * 60
          const forceX = (dx / distance) * force
          const forceY = (dy / distance) * force
          if (!first.pinned) {
            first.vx -= forceX
            first.vy -= forceY
          }
          if (!second.pinned) {
            second.vx += forceX
            second.vy += forceY
          }
        }
      }

      for (const edge of graph.edges) {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (!source || !target) continue
        const dx = target.x - source.x
        const dy = target.y - source.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (distance - 120) * 0.005 * alpha
        const forceX = (dx / distance) * force
        const forceY = (dy / distance) * force
        if (!source.pinned) {
          source.vx += forceX
          source.vy += forceY
        }
        if (!target.pinned) {
          target.vx -= forceX
          target.vy -= forceY
        }
      }

      const width = this.container.clientWidth || 800
      const height = this.container.clientHeight || 600
      const gravityStrength = Math.min(0.01, 0.001 + this.graphNodes.length * 0.00002)
      for (const node of this.graphNodes) {
        if (node.pinned) continue
        node.vx += (width / 2 - node.x) * gravityStrength * alpha
        node.vy += (height / 2 - node.y) * gravityStrength * alpha
      }

      for (const node of this.graphNodes) {
        if (node.pinned) continue
        node.vx *= 0.6
        node.vy *= 0.6
        const velocity = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
        if (velocity > 20) {
          node.vx = (node.vx / velocity) * 20
          node.vy = (node.vy / velocity) * 20
        }
        node.x += node.vx
        node.y += node.vy
      }

      for (const { g, node } of this.graphNodeElsRef) {
        g.setAttribute('transform', `translate(${node.x},${node.y})`)
      }
      for (const edge of this.graphEdgeElsRef) {
        const source = nodeMap.get(edge.source)
        const target = nodeMap.get(edge.target)
        if (source && target) this.setEdgePositions(edge.line, source, target)
      }

      this.graphAnimFrame = requestAnimationFrame(tick)
    }

    this.graphAnimFrame = requestAnimationFrame(tick)
  }

  private setEdgePositions(
    line: SVGLineElement,
    source: WeknoraNativeNode,
    target: WeknoraNativeNode,
  ): void {
    const dx = target.x - source.x
    const dy = target.y - source.y
    const distance = Math.sqrt(dx * dx + dy * dy) || 1
    const ux = dx / distance
    const uy = dy / distance
    const sourceRadius = weknoraNativeNodeRadius(source.linkCount) + 4
    const targetRadius = weknoraNativeNodeRadius(target.linkCount) + 4
    line.setAttribute('x1', String(source.x + ux * sourceRadius))
    line.setAttribute('y1', String(source.y + uy * sourceRadius))
    line.setAttribute('x2', String(target.x - ux * targetRadius))
    line.setAttribute('y2', String(target.y - uy * targetRadius))
  }

  private applyHighlight(
    slug: string,
    hoverSlug?: string,
    nodeEls = this.graphNodeElsRef,
    edgeEls = this.graphEdgeElsRef,
    adjacency = this.graphAdjacencyRef,
  ): void {
    const neighbors = adjacency.get(slug) || new Set<string>()
    const hoverNeighbors = hoverSlug ? adjacency.get(hoverSlug) || new Set<string>() : new Set<string>()

    for (const { g, circle, activeRing, node } of nodeEls) {
      const radius = weknoraNativeNodeRadius(node.linkCount)
      if (node.slug === slug || (hoverSlug && node.slug === hoverSlug)) {
        circle.setAttribute('r', String(radius + 3))
        circle.setAttribute('stroke-width', '3')
        g.style.opacity = '1'
      } else if (neighbors.has(node.slug) || (hoverSlug && hoverNeighbors.has(node.slug))) {
        circle.setAttribute('r', String(radius))
        circle.setAttribute('stroke-width', '2')
        g.style.opacity = '1'
      } else {
        circle.setAttribute('r', String(radius))
        circle.setAttribute('stroke-width', '2')
        g.style.opacity = '0.2'
      }
      activeRing.style.opacity = node.slug === this.graphSelectedSlug ? '1' : '0'
    }

    for (const edge of edgeEls) {
      const highlighted = edge.source === slug || edge.target === slug
        || Boolean(hoverSlug && (edge.source === hoverSlug || edge.target === hoverSlug))
      if (highlighted) {
        edge.line.setAttribute('stroke-opacity', '0.9')
        edge.line.setAttribute('stroke-width', '2')
        const focusSlug = hoverSlug && (edge.source === hoverSlug || edge.target === hoverSlug)
          ? hoverSlug
          : slug
        const color = NODE_COLOR_MAP[
          nodeEls.find(candidate => candidate.node.slug === focusSlug)?.node.type || ''
        ] || '#0052d9'
        edge.line.setAttribute('stroke', color)
        if (this.showArrows) {
          edge.line.setAttribute('marker-end', 'url(#arrow-end-hl)')
          if (edge.bidir) edge.line.setAttribute('marker-start', 'url(#arrow-start-hl)')
        }
      } else {
        edge.line.setAttribute('stroke-opacity', '0.08')
        edge.line.setAttribute('stroke-width', '1')
        if (this.showArrows) {
          edge.line.setAttribute('marker-end', 'url(#arrow-end)')
          if (edge.bidir) edge.line.setAttribute('marker-start', 'url(#arrow-start)')
          else edge.line.removeAttribute('marker-start')
        }
      }
    }
  }

  private clearHighlight(
    nodeEls = this.graphNodeElsRef,
    edgeEls = this.graphEdgeElsRef,
    adjacency = this.graphAdjacencyRef,
  ): void {
    if (this.graphSelectedSlug) {
      this.applyHighlight(this.graphSelectedSlug, undefined, nodeEls, edgeEls, adjacency)
      return
    }

    for (const { g, circle, activeRing, node } of nodeEls) {
      circle.setAttribute('r', String(weknoraNativeNodeRadius(node.linkCount)))
      circle.setAttribute('stroke-width', '2')
      g.style.opacity = '1'
      activeRing.style.opacity = '0'
    }
    for (const edge of edgeEls) {
      edge.line.setAttribute('stroke', '#c0c4cc')
      edge.line.setAttribute('stroke-width', '1.2')
      edge.line.setAttribute('stroke-opacity', '0.4')
      if (this.showArrows) {
        edge.line.setAttribute('marker-end', 'url(#arrow-end)')
        if (edge.bidir) edge.line.setAttribute('marker-start', 'url(#arrow-start)')
        else edge.line.removeAttribute('marker-start')
      } else {
        edge.line.removeAttribute('marker-end')
        edge.line.removeAttribute('marker-start')
      }
    }
  }

  private releaseRenderSurface(): void {
    this.renderRevision += 1
    if (this.graphAnimFrame) {
      cancelAnimationFrame(this.graphAnimFrame)
      this.graphAnimFrame = 0
    }
    if (this.graphHoverLeaveTimer) {
      clearTimeout(this.graphHoverLeaveTimer)
      this.graphHoverLeaveTimer = null
    }
    this.graphPanZoomRef?.cancel()
    this.graphPanZoomRef = null
    for (const cleanup of this.cleanupListeners.splice(0)) cleanup()
    this.graphSvg = null
    this.graphNodeElsRef = []
    this.graphEdgeElsRef = []
    this.graphAdjacencyRef = new Map()
    delete this.container.dataset.graphVisual
    delete this.container.dataset.graphStyle
    this.container.replaceChildren()
  }
}
