/// <reference lib="webworker" />

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'

import { OBSIDIAN_NATIVE_PHYSICS } from './obsidianNativeGraphContract.ts'

interface ForceNode extends SimulationNodeDatum {
  id: string
}

interface ForceEdge extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode
  target: string | ForceNode
}

interface InitMessage {
  type: 'init'
  nodes: Array<{ id: string; x: number; y: number }>
  links: Array<{ source: string; target: string }>
  run?: boolean
}

interface DragMessage {
  type: 'drag'
  id: string
  x: number | null
  y: number | null
  active: boolean
}

type ForceMessage = InitMessage | DragMessage | { type: 'stop' }

let nodes: ForceNode[] = []
let nodeLookup = new Map<string, ForceNode>()
let simulation: Simulation<ForceNode, ForceEdge> | null = null
let sharedPositions: Float32Array | null = null
let sharedVersion: Int32Array | null = null

function publishPositions(): void {
  if (sharedPositions && sharedVersion) {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      sharedPositions[index * 2] = node.x ?? 0
      sharedPositions[index * 2 + 1] = node.y ?? 0
    }
    Atomics.add(sharedVersion, 0, 1)
    return
  }

  const positions = new Float32Array(nodes.length * 2)
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    positions[index * 2] = node.x ?? 0
    positions[index * 2 + 1] = node.y ?? 0
  }
  const buffer = positions.buffer
  self.postMessage({ type: 'positions', positions: buffer }, { transfer: [buffer] })
}

function initialize(message: InitMessage): void {
  simulation?.stop()
  nodes = message.nodes.map(node => ({ ...node, vx: 0, vy: 0, fx: null, fy: null }))
  nodeLookup = new Map(nodes.map(node => [node.id, node]))
  sharedPositions = null
  sharedVersion = null

  if (typeof SharedArrayBuffer !== 'undefined') {
    try {
      const byteLength = nodes.length * 2 * Float32Array.BYTES_PER_ELEMENT + Int32Array.BYTES_PER_ELEMENT
      const sharedBuffer = new SharedArrayBuffer(byteLength)
      sharedPositions = new Float32Array(sharedBuffer, 0, nodes.length * 2)
      sharedVersion = new Int32Array(sharedBuffer, nodes.length * 2 * Float32Array.BYTES_PER_ELEMENT, 1)
      self.postMessage({ type: 'shared-positions', positions: sharedBuffer })
    } catch {
      sharedPositions = null
      sharedVersion = null
    }
  }

  const links = message.links.map(link => ({ ...link })) as ForceEdge[]
  const linkForce = forceLink<ForceNode, ForceEdge>(links)
    .id(node => node.id)
    .distance(OBSIDIAN_NATIVE_PHYSICS.linkDistance)

  simulation = forceSimulation<ForceNode>(nodes)
    .alpha(OBSIDIAN_NATIVE_PHYSICS.alpha)
    .alphaMin(OBSIDIAN_NATIVE_PHYSICS.alphaMin)
    .alphaDecay(OBSIDIAN_NATIVE_PHYSICS.alphaDecay)
    .alphaTarget(0)
    .velocityDecay(OBSIDIAN_NATIVE_PHYSICS.velocityDecay)
    .force('x', forceX<ForceNode>(0).strength(OBSIDIAN_NATIVE_PHYSICS.centerStrength))
    .force('y', forceY<ForceNode>(0).strength(OBSIDIAN_NATIVE_PHYSICS.centerStrength))
    .force('link', linkForce)
    .force(
      'charge',
      forceManyBody<ForceNode>()
        .strength(OBSIDIAN_NATIVE_PHYSICS.repelStrength)
        .distanceMin(OBSIDIAN_NATIVE_PHYSICS.chargeDistanceMin),
    )
    .force(
      'collide',
      forceCollide<ForceNode>(OBSIDIAN_NATIVE_PHYSICS.collisionRadius)
        .strength(OBSIDIAN_NATIVE_PHYSICS.collisionStrength),
    )
    .on('tick', publishPositions)
    .on('end', publishPositions)

  if (message.run === false) simulation.stop()
  publishPositions()
}

function dragNode(message: DragMessage): void {
  const node = nodeLookup.get(message.id)
  if (!node || !simulation) return

  node.fx = message.x
  node.fy = message.y
  if (message.active) {
    simulation
      .alpha(Math.max(simulation.alpha(), OBSIDIAN_NATIVE_PHYSICS.dragAlpha))
      .alphaTarget(OBSIDIAN_NATIVE_PHYSICS.dragAlpha)
      .restart()
  } else {
    simulation.alphaTarget(0)
  }
  publishPositions()
}

self.onmessage = (event: MessageEvent<ForceMessage>) => {
  const message = event.data
  if (message.type === 'init') initialize(message)
  else if (message.type === 'drag') dragNode(message)
  else simulation?.stop()
}

export {}
