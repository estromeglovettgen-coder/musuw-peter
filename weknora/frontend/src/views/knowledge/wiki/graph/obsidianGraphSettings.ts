import type {
  WikiGraphRenderData,
  WikiGraphRenderNode,
} from './wikiGraphRenderer.ts'

export const OBSIDIAN_GRAPH_SETTINGS_VERSION = 1
export const OBSIDIAN_GRAPH_STORAGE_PREFIX = 'weknora:wiki-graph:obsidian:1:'

export interface ObsidianGraphColorGroup {
  query: string
  color: {
    a: number
    rgb: number
  }
}

/** Mirrors every persisted field in Obsidian 1.13.7 global graph.json. */
export interface ObsidianGraphSettings {
  'collapse-filter': boolean
  search: string
  showTags: boolean
  showAttachments: boolean
  hideUnresolved: boolean
  showOrphans: boolean
  'collapse-color-groups': boolean
  colorGroups: ObsidianGraphColorGroup[]
  'collapse-display': boolean
  showArrow: boolean
  textFadeMultiplier: number
  nodeSizeMultiplier: number
  lineSizeMultiplier: number
  'collapse-forces': boolean
  centerStrength: number
  repelStrength: number
  linkStrength: number
  linkDistance: number
  scale: number
  close: boolean
}

export interface ObsidianGraphForceValues {
  centerStrength: number
  repelStrength: number
  linkStrength: number
  linkDistance: number
}

export interface ObsidianGraphStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const DEFAULT_SETTINGS: Readonly<ObsidianGraphSettings> = Object.freeze({
  'collapse-filter': false,
  search: '',
  showTags: false,
  showAttachments: false,
  hideUnresolved: false,
  showOrphans: true,
  'collapse-color-groups': false,
  colorGroups: [],
  'collapse-display': false,
  showArrow: false,
  textFadeMultiplier: 0,
  nodeSizeMultiplier: 1,
  lineSizeMultiplier: 1,
  'collapse-forces': false,
  centerStrength: 0.518713248970312,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250,
  scale: 1,
  // Panel visibility is a transient graph-view affordance. Start closed so
  // entering a graph never obscures the canvas with persisted controls.
  close: true,
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function colorGroups(value: unknown): ObsidianGraphColorGroup[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const candidate = entry as Record<string, unknown>
    const color = candidate.color
    if (typeof candidate.query !== 'string' || !color || typeof color !== 'object') return []
    const source = color as Record<string, unknown>
    if (typeof source.rgb !== 'number' || !Number.isFinite(source.rgb) || source.rgb < 0) return []
    return [{
      query: candidate.query,
      color: {
        a: finiteNumber(source.a, 1, 0, 1),
        rgb: Math.round(clamp(source.rgb, 0, 0xffffff)),
      },
    }]
  })
}

export function createDefaultObsidianGraphSettings(): ObsidianGraphSettings {
  return { ...DEFAULT_SETTINGS, colorGroups: [] }
}

export function normalizeObsidianGraphSettings(value: unknown): ObsidianGraphSettings {
  const defaults = createDefaultObsidianGraphSettings()
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    'collapse-filter': booleanValue(source['collapse-filter'], defaults['collapse-filter']),
    search: typeof source.search === 'string' ? source.search : defaults.search,
    showTags: booleanValue(source.showTags, defaults.showTags),
    showAttachments: booleanValue(source.showAttachments, defaults.showAttachments),
    hideUnresolved: booleanValue(source.hideUnresolved, defaults.hideUnresolved),
    showOrphans: booleanValue(source.showOrphans, defaults.showOrphans),
    'collapse-color-groups': booleanValue(
      source['collapse-color-groups'],
      defaults['collapse-color-groups'],
    ),
    colorGroups: colorGroups(source.colorGroups),
    'collapse-display': booleanValue(source['collapse-display'], defaults['collapse-display']),
    showArrow: booleanValue(source.showArrow, defaults.showArrow),
    textFadeMultiplier: finiteNumber(source.textFadeMultiplier, defaults.textFadeMultiplier, -3, 3),
    nodeSizeMultiplier: finiteNumber(source.nodeSizeMultiplier, defaults.nodeSizeMultiplier, 0.1, 5),
    lineSizeMultiplier: finiteNumber(source.lineSizeMultiplier, defaults.lineSizeMultiplier, 0.1, 5),
    'collapse-forces': booleanValue(source['collapse-forces'], defaults['collapse-forces']),
    centerStrength: finiteNumber(source.centerStrength, defaults.centerStrength, 0, 1),
    repelStrength: finiteNumber(source.repelStrength, defaults.repelStrength, 0, 20),
    linkStrength: finiteNumber(source.linkStrength, defaults.linkStrength, 0, 1),
    linkDistance: finiteNumber(source.linkDistance, defaults.linkDistance, 30, 500),
    scale: finiteNumber(source.scale, defaults.scale, 1 / 128, 8),
    close: booleanValue(source.close, defaults.close),
  }
}

/** Exact nonlinear mapping used by Obsidian's center and link sliders. */
export function obsidianGraphSliderToStrength(value: number, floor = 0.01): number {
  const mapped = (Math.pow(floor, 1 - clamp(value, 0, 1)) - floor) / (1 - floor)
  return Number(mapped.toFixed(12))
}

export function obsidianGraphForceValues(
  settings: ObsidianGraphSettings,
): ObsidianGraphForceValues {
  return {
    centerStrength: obsidianGraphSliderToStrength(settings.centerStrength),
    repelStrength: Number(Math.pow(settings.repelStrength, 3).toFixed(12)),
    linkStrength: obsidianGraphSliderToStrength(settings.linkStrength),
    linkDistance: settings.linkDistance,
  }
}

export function obsidianGraphStorageKey(knowledgeBaseId: string): string {
  return `${OBSIDIAN_GRAPH_STORAGE_PREFIX}${encodeURIComponent(knowledgeBaseId)}`
}

function browserStorage(): ObsidianGraphStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function loadObsidianGraphSettings(
  knowledgeBaseId: string,
  storage: ObsidianGraphStorage | null = browserStorage(),
): ObsidianGraphSettings {
  if (!storage) return createDefaultObsidianGraphSettings()
  try {
    const raw = storage.getItem(obsidianGraphStorageKey(knowledgeBaseId))
    if (!raw) return createDefaultObsidianGraphSettings()
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && 'settings' in parsed) {
      return normalizeObsidianGraphSettings((parsed as { settings: unknown }).settings)
    }
    return normalizeObsidianGraphSettings(parsed)
  } catch {
    return createDefaultObsidianGraphSettings()
  }
}

export function saveObsidianGraphSettings(
  knowledgeBaseId: string,
  settings: ObsidianGraphSettings,
  storage: ObsidianGraphStorage | null = browserStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(obsidianGraphStorageKey(knowledgeBaseId), JSON.stringify({
      version: OBSIDIAN_GRAPH_SETTINGS_VERSION,
      settings: normalizeObsidianGraphSettings(settings),
    }))
  } catch {
    // A disabled or full localStorage must not prevent graph rendering.
  }
}

interface QueryContext {
  node: WikiGraphRenderNode
  degree: number
}

function queryTokens(query: string): string[] {
  return query.match(/(?:[^\s"]+:"[^"]*"|"[^"]*"|\S+)/g) ?? []
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value
}

function includes(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase())
}

function matchesToken(context: QueryContext, rawToken: string): boolean {
  let token = rawToken
  let negative = false
  if (token.startsWith('-') && token.length > 1) {
    negative = true
    token = token.slice(1)
  }

  const separator = token.indexOf(':')
  const field = separator > 0 ? token.slice(0, separator).toLocaleLowerCase() : ''
  const value = unquote(separator > 0 ? token.slice(separator + 1) : token)
  const node = context.node
  const nodeType = node.page_type.toLocaleLowerCase()
  let matched: boolean

  switch (field) {
    case 'path':
      matched = includes(node.slug, value)
      break
    case 'title':
      matched = includes(node.title, value)
      break
    case 'type':
      matched = includes(nodeType, value)
      break
    case 'tag':
      matched = nodeType === 'tag' && (includes(node.slug, value) || includes(node.title, value))
      break
    case 'file':
      matched = includes(node.slug, value) || includes(node.title, value)
      break
    case 'is':
      matched = value.toLocaleLowerCase() === 'orphan'
        ? context.degree === 0
        : value.toLocaleLowerCase() === 'unresolved' && nodeType === 'unresolved'
      break
    default:
      matched = includes(`${node.title} ${node.slug} ${node.page_type}`, value)
  }
  return negative ? !matched : matched
}

export function obsidianGraphQueryMatches(
  node: WikiGraphRenderNode,
  degree: number,
  query: string,
): boolean {
  const tokens = queryTokens(query.trim())
  return tokens.length === 0 || tokens.every(token => matchesToken({ node, degree }, token))
}

function visibleByKind(
  node: WikiGraphRenderNode,
  degree: number,
  settings: ObsidianGraphSettings,
): boolean {
  const type = node.page_type.toLocaleLowerCase()
  if (!settings.showTags && type === 'tag') return false
  if (!settings.showAttachments && (type === 'attachment' || type === 'file')) return false
  if (settings.hideUnresolved && type === 'unresolved') return false
  if (!settings.showOrphans && degree === 0) return false
  return true
}

export function applyObsidianGraphSettings(
  data: WikiGraphRenderData,
  settings: ObsidianGraphSettings,
): WikiGraphRenderData {
  const degree = new Map(data.nodes.map(node => [node.slug, 0]))
  for (const edge of data.edges) {
    if (degree.has(edge.source) && degree.has(edge.target)) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
    }
  }

  const nodes = data.nodes.flatMap((node) => {
    const nodeDegree = degree.get(node.slug) ?? 0
    if (!visibleByKind(node, nodeDegree, settings)) return []
    if (!obsidianGraphQueryMatches(node, nodeDegree, settings.search)) return []
    const group = settings.colorGroups.find(candidate => (
      candidate.query.trim().length > 0
      && obsidianGraphQueryMatches(node, nodeDegree, candidate.query)
    ))
    return [{ ...node, color: group?.color.rgb }]
  })
  const visible = new Set(nodes.map(node => node.slug))
  return {
    nodes,
    edges: data.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)),
  }
}
