import {
  obsidianGraphForceValues,
  type ObsidianGraphForceValues,
  type ObsidianGraphSettings,
} from './obsidianGraphSettings.ts'

export const OBSIDIAN_GRAPH_WORKER_PATH = 'vendor/obsidian-1.13.7/graph-sim.js'

export interface ObsidianWorkerNodeInput {
  id: string
  x: number
  y: number
}

export interface ObsidianWorkerEdgeInput {
  source: string
  target: string
}

export interface ObsidianWorkerInitMessage {
  nodes: Record<string, [number, number]>
  links: Array<[string, string]>
  forces: ObsidianGraphForceValues
  alpha: number
  alphaTarget: number
  run?: true
}

export interface ObsidianWorkerResultMessage {
  id: string[]
  buffer: ArrayBufferLike
  v?: number
}

export interface ObsidianWorkerResult {
  ids: string[]
  positions: Float32Array
  version: Uint32Array | null
  previousVersion: number | null
}

export function buildObsidianWorkerInitMessage(
  nodes: ObsidianWorkerNodeInput[],
  edges: ObsidianWorkerEdgeInput[],
  settings: ObsidianGraphSettings,
  run = true,
): ObsidianWorkerInitMessage {
  return {
    nodes: Object.fromEntries(nodes.map(node => [node.id, [node.x, node.y] as [number, number]])),
    links: edges.map(edge => [edge.source, edge.target]),
    forces: obsidianGraphForceValues(settings),
    alpha: 1,
    alphaTarget: 0,
    // The native worker starts whenever `run` is present, even when false.
    ...(run ? { run: true as const } : {}),
  }
}

export function buildObsidianWorkerForceMessage(settings: ObsidianGraphSettings) {
  return {
    forces: obsidianGraphForceValues(settings),
    alpha: 1,
    run: true as const,
  }
}

export function buildObsidianWorkerDragMessage(
  id: string,
  x: number | null,
  y: number | null,
  active: boolean,
) {
  return active
    ? {
        alpha: 0.3,
        alphaTarget: 0.3,
        run: true as const,
        forceNode: { id, x, y },
      }
    : {
        alphaTarget: 0,
        forceNode: { id, x: null, y: null },
      }
}

export function readObsidianWorkerResult(
  message: ObsidianWorkerResultMessage,
): ObsidianWorkerResult {
  const positionLength = message.id.length * 2
  const positionBytes = positionLength * Float32Array.BYTES_PER_ELEMENT
  return {
    ids: message.id,
    positions: new Float32Array(message.buffer, 0, positionLength),
    version: message.buffer.byteLength >= positionBytes + Uint32Array.BYTES_PER_ELEMENT
      ? new Uint32Array(message.buffer, positionBytes, 1)
      : null,
    previousVersion: typeof message.v === 'number' ? message.v : null,
  }
}
