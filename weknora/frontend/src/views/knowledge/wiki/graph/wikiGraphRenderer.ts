import type { ObsidianGraphSettings } from './obsidianGraphSettings.ts'

export type WikiGraphRendererMode = 'obsidian' | 'weknora' | 'three' | 'sigma' | 'g6'

export const GRAPH_RENDERER_MODES = [
  { id: 'obsidian', label: 'Obsidian 原生' },
  { id: 'weknora', label: 'WeKnora 原生' },
  { id: 'three', label: 'Obsidian 3D' },
  { id: 'sigma', label: 'Sigma.js' },
  { id: 'g6', label: 'AntV G6' },
] as const satisfies ReadonlyArray<{
  id: WikiGraphRendererMode
  label: string
}>

export type WikiGraphStyleId =
  | 'obsidian-exact'
  | 'weknora-native'
  | 'three-nebula'
  | 'sigma-nebula'
  | 'sigma-force'
  | 'sigma-circle'
  | 'sigma-orbit'
  | 'sigma-clusters'
  | 'g6-obsidian'
  | 'g6-force'
  | 'g6-forceatlas2'
  | 'g6-fruchterman'
  | 'g6-mds'
  | 'g6-radial'
  | 'g6-concentric'
  | 'g6-circular'
  | 'g6-grid'

export interface WikiGraphStylePreset {
  id: WikiGraphStyleId
  engine: WikiGraphRendererMode
  labelKey: string
  descriptionKey: string
}

/** Curated layouts from all renderers. The local Obsidian profile is the default visual. */
export const GRAPH_STYLE_PRESETS = [
  {
    id: 'obsidian-exact',
    engine: 'obsidian',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.obsidianExact.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.obsidianExact.desc',
  },
  {
    id: 'weknora-native',
    engine: 'weknora',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.weknoraNative.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.weknoraNative.desc',
  },
  {
    id: 'three-nebula',
    engine: 'three',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.threeNebula.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.threeNebula.desc',
  },
  {
    id: 'sigma-nebula',
    engine: 'sigma',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaNebula.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaNebula.desc',
  },
  {
    id: 'sigma-force',
    engine: 'sigma',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaForce.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaForce.desc',
  },
  {
    id: 'sigma-circle',
    engine: 'sigma',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaCircle.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaCircle.desc',
  },
  {
    id: 'sigma-orbit',
    engine: 'sigma',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaOrbit.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaOrbit.desc',
  },
  {
    id: 'sigma-clusters',
    engine: 'sigma',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaClusters.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.sigmaClusters.desc',
  },
  {
    id: 'g6-obsidian',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Obsidian.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Obsidian.desc',
  },
  {
    id: 'g6-force',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Force.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Force.desc',
  },
  {
    id: 'g6-forceatlas2',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6ForceAtlas2.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6ForceAtlas2.desc',
  },
  {
    id: 'g6-fruchterman',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Fruchterman.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Fruchterman.desc',
  },
  {
    id: 'g6-mds',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Mds.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Mds.desc',
  },
  {
    id: 'g6-radial',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Radial.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Radial.desc',
  },
  {
    id: 'g6-concentric',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Concentric.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Concentric.desc',
  },
  {
    id: 'g6-circular',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Circular.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Circular.desc',
  },
  {
    id: 'g6-grid',
    engine: 'g6',
    labelKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Grid.name',
    descriptionKey: 'knowledgeEditor.wikiBrowser.graphStyles.g6Grid.desc',
  },
] as const satisfies ReadonlyArray<WikiGraphStylePreset>

export const DEFAULT_WIKI_GRAPH_STYLE: WikiGraphStyleId = 'obsidian-exact'

export function getWikiGraphStylePreset(styleId: WikiGraphStyleId): WikiGraphStylePreset {
  return GRAPH_STYLE_PRESETS.find(preset => preset.id === styleId) ?? GRAPH_STYLE_PRESETS[0]
}

export interface WikiGraphRenderNode {
  slug: string
  title: string
  page_type: string
  link_count: number
  /** Optional renderer-ready RGB color supplied by an ordered color group. */
  color?: number
}

export interface WikiGraphRenderEdge {
  source: string
  target: string
}

export interface WikiGraphRenderData {
  nodes: WikiGraphRenderNode[]
  edges: WikiGraphRenderEdge[]
  /** Existing WeKnora slice metadata used only to retain canvas affordances. */
  meta?: {
    mode?: string
    center?: string
    [key: string]: unknown
  }
}

export interface WikiGraphPointerModifiers {
  shiftKey: boolean
}

export type WikiGraphPlaybackState = 'idle' | 'playing' | 'paused' | 'complete'

export interface WikiGraphPlaybackSnapshot {
  state: WikiGraphPlaybackState
  visible: number
  total: number
}

export function createIdleWikiGraphPlaybackSnapshot(total = 0): WikiGraphPlaybackSnapshot {
  return { state: 'idle', visible: total, total }
}

export interface WikiGraphRendererCallbacks {
  onNodeClick: (slug: string, modifiers: WikiGraphPointerModifiers) => void
  onNodeDoubleClick: (slug: string) => void
  onNodeHover: (slug: string | null) => void
  onStageClick: () => void
  onCameraScaleChange?: (scale: number) => void
  onPlaybackChange?: (snapshot: WikiGraphPlaybackSnapshot) => void
}

export interface WikiGraphRenderRequest {
  styleId: WikiGraphStyleId
  data: WikiGraphRenderData
  selectedSlug: string | null
  showArrows: boolean
  obsidianSettings?: ObsidianGraphSettings
  /** Optional wall-time compression; native item ordering remains unchanged. */
  progressionTimeScale?: number
  preserveLayout?: boolean
  anchorSlug?: string
  callbacks: WikiGraphRendererCallbacks
}

export type WikiGraphRenderInput = Omit<WikiGraphRenderRequest, 'styleId'>

export interface WikiGraphFocusOptions {
  /** Horizontal viewport offset in CSS pixels, used to leave room for the detail drawer. */
  offsetX?: number
}

export interface WikiGraphFitOptions {
  /** Space reserved on the right side of the viewport, in CSS pixels. */
  rightInset?: number
  /** Space reserved below the viewport, in CSS pixels (bottom-sheet drawers). */
  bottomInset?: number
  /** Fit only nodes unlocked by the current native progression. */
  visibleOnly?: boolean
  /** Fit only this explicit set of graph nodes. */
  nodeSlugs?: readonly string[]
  /** Never zoom in beyond this presentation scale. */
  maxScale?: number
}

export interface WikiGraphViewportPoint {
  x: number
  y: number
  scale: number
}

export const WIKI_GRAPH_NODE_COLORS: Readonly<Record<string, string>> = {
  summary: '#0052d9',
  entity: '#2ba471',
  concept: '#e37318',
  synthesis: '#0594fa',
  comparison: '#d54941',
  index: '#8c8c8c',
}

/** Renderer-ready form of the original WeKnora legend palette. */
export function wikiGraphNodeColor(pageType: string): number {
  const hex = WIKI_GRAPH_NODE_COLORS[pageType.toLowerCase()] ?? WIKI_GRAPH_NODE_COLORS.index
  return Number.parseInt(hex.slice(1), 16)
}

export function wikiGraphNodeRadius(linkCount: number): number {
  return Math.max(7, Math.min(18, 7 + Math.log(linkCount + 1) * 3.2))
}

export function buildWikiGraphAdjacency(data: WikiGraphRenderData): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  for (const node of data.nodes) adjacency.set(node.slug, new Set())
  for (const edge of data.edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue
    adjacency.get(edge.source)!.add(edge.target)
    adjacency.get(edge.target)!.add(edge.source)
  }
  return adjacency
}

export function seedWikiGraphPosition(index: number, total: number): { x: number; y: number } {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const radius = Math.max(1, Math.sqrt(index + 1) * Math.max(3, Math.sqrt(total)))
  return {
    x: Math.cos(index * goldenAngle) * radius,
    y: Math.sin(index * goldenAngle) * radius,
  }
}

/**
 * The intentionally small contract shared by every graph adapter. WikiBrowser
 * owns product behavior; renderers own only rendering, physics and camera details.
 */
export interface WikiGraphRenderer {
  render(request: WikiGraphRenderRequest): Promise<void>
  hasNode(slug: string): boolean
  focusNode(slug: string, options?: WikiGraphFocusOptions): Promise<void>
  getNodeViewportPoint?(slug: string): WikiGraphViewportPoint | null
  fit(options?: WikiGraphFitOptions): Promise<void>
  setArrowsVisible(visible: boolean): void
  setSelection(selectedSlug: string | null, hoveredSlug?: string | null): void
  setProgressionTimeScale?(timeScale: number): void
  setObsidianSettings?(settings: ObsidianGraphSettings): void
  restartSimulation?(): void
  startProgression?(): void
  pauseProgression?(): void
  resumeProgression?(): void
  restoreProgression?(): void
  destroy(): void
}

export type WikiGraphRendererFactory = (container: HTMLElement) => Promise<WikiGraphRenderer>

export type WikiGraphRendererFactories = Record<WikiGraphRendererMode, WikiGraphRendererFactory>

const defaultFactories: WikiGraphRendererFactories = {
  obsidian: async (container) => {
    const { ObsidianWikiGraphRenderer } = await import('./obsidianWikiGraphRenderer.ts')
    return new ObsidianWikiGraphRenderer(container)
  },
  weknora: async (container) => {
    const { WeknoraNativeWikiGraphRenderer } = await import('./weknoraNativeWikiGraphRenderer.ts')
    return new WeknoraNativeWikiGraphRenderer(container)
  },
  three: async (container) => {
    const { ThreeWikiGraphRenderer } = await import('./threeWikiGraphRenderer.ts')
    return new ThreeWikiGraphRenderer(container)
  },
  sigma: async (container) => {
    const { SigmaWikiGraphRenderer } = await import('./sigmaWikiGraphRenderer.ts')
    return new SigmaWikiGraphRenderer(container)
  },
  g6: async (container) => {
    const { G6WikiGraphRenderer } = await import('./g6WikiGraphRenderer.ts')
    return new G6WikiGraphRenderer(container)
  },
}

/**
 * Owns the lifetime of whichever renderer is active. Lazy imports can resolve
 * out of order when a user clicks both style buttons quickly, so every render
 * is revision-gated and stale instances are immediately released.
 */
export class WikiGraphRendererController {
  private active: { mode: WikiGraphRendererMode; renderer: WikiGraphRenderer } | null = null
  private revision = 0

  constructor(
    private readonly container: HTMLElement,
    private readonly factories: WikiGraphRendererFactories = defaultFactories,
  ) {}

  async render(styleId: WikiGraphStyleId, request: WikiGraphRenderInput): Promise<boolean> {
    const revision = ++this.revision
    const mode = getWikiGraphStylePreset(styleId).engine
    const styledRequest: WikiGraphRenderRequest = { ...request, styleId }

    if (this.active?.mode === mode) {
      const renderer = this.active.renderer
      await renderer.render(styledRequest)
      return revision === this.revision && this.active?.renderer === renderer
    }

    if (this.active) {
      this.active.renderer.destroy()
      this.active = null
    }

    const renderer = await this.factories[mode](this.container)
    if (revision !== this.revision) {
      renderer.destroy()
      return false
    }

    this.active = { mode, renderer }
    await renderer.render(styledRequest)
    return revision === this.revision && this.active?.renderer === renderer
  }

  hasNode(slug: string): boolean {
    return this.active?.renderer.hasNode(slug) ?? false
  }

  async focusNode(slug: string, options?: WikiGraphFocusOptions): Promise<void> {
    await this.active?.renderer.focusNode(slug, options)
  }

  async fit(options?: WikiGraphFitOptions): Promise<void> {
    await this.active?.renderer.fit(options)
  }

  setArrowsVisible(visible: boolean): void {
    this.active?.renderer.setArrowsVisible(visible)
  }

  setSelection(selectedSlug: string | null, hoveredSlug: string | null = null): void {
    this.active?.renderer.setSelection(selectedSlug, hoveredSlug)
  }

  setObsidianSettings(settings: ObsidianGraphSettings): void {
    this.active?.renderer.setObsidianSettings?.(settings)
  }

  restartSimulation(): void {
    this.active?.renderer.restartSimulation?.()
  }

  startProgression(): void {
    this.active?.renderer.startProgression?.()
  }

  pauseProgression(): void {
    this.active?.renderer.pauseProgression?.()
  }

  resumeProgression(): void {
    this.active?.renderer.resumeProgression?.()
  }

  restoreProgression(): void {
    this.active?.renderer.restoreProgression?.()
  }

  destroy(): void {
    this.revision += 1
    this.active?.renderer.destroy()
    this.active = null
  }
}
