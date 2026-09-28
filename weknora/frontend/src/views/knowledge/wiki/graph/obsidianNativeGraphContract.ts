/**
 * Observable graph behavior extracted from this machine's Obsidian 1.13.7
 * installation and active `.obsidian/graph.json` profile. The renderer and
 * worker both consume this contract so physics and pixels cannot drift apart.
 */
export const OBSIDIAN_NATIVE_PHYSICS = Object.freeze({
  alpha: 1,
  alphaMin: 0.001,
  alphaDecay: 1 - Math.pow(0.001, 1 / 300),
  dragAlpha: 0.3,
  centerStrength: 0.1,
  linkStrength: 1,
  linkDistance: 250,
  repelStrength: -1_000,
  chargeDistanceMin: 30,
  collisionRadius: 60,
  collisionStrength: 0.5,
  velocityDecay: 0.4,
  tickRate: 60,
})

export const OBSIDIAN_NATIVE_RENDER = Object.freeze({
  background: 0x1c1c1c,
  node: 0xb3b3b3,
  line: 0x3f3f3f,
  text: 0xdadada,
  focused: 0xa68af9,
  highlight: 0x8a5cf5,
  dimAlpha: 0.2,
  nodeSizeMultiplier: 1,
  lineSizeMultiplier: 1,
  textFadeMultiplier: 0,
  minScale: 1 / 128,
  maxScale: 8,
  dragThresholdSquared: 25,
  progressiveNodeBatch: 50,
  idleFrameLimit: 60,
})

/**
 * Observable timelapse constants from Obsidian 1.13.7's
 * `dataEngine.renderProgression()` path. The application bundle owns the
 * counter; the vendored graph Worker continues to own only force simulation.
 */
export const OBSIDIAN_GRAPH_PROGRESSION = Object.freeze({
  initial: 1,
  speedFactor: 0.5,
  minSpeed: 5,
  maxSpeed: 100,
})

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function obsidianGraphProgressionSpeed(totalLinks: number): number {
  return clamp(
    OBSIDIAN_GRAPH_PROGRESSION.speedFactor * Math.sqrt(Math.max(0, totalLinks)),
    OBSIDIAN_GRAPH_PROGRESSION.minSpeed,
    OBSIDIAN_GRAPH_PROGRESSION.maxSpeed,
  )
}

/**
 * Obsidian's data engine advances one shared item cursor. Each file and each
 * outgoing link consumes one item; a time scale may compress wall time for a
 * read-only presentation without changing the native ordering or cadence.
 */
export function obsidianGraphProgressionItemCursor(
  elapsedMs: number,
  totalItems: number,
  timeScale = 1,
): number {
  if (totalItems <= 0) return 0
  const safeTimeScale = Number.isFinite(timeScale) && timeScale > 0 ? timeScale : 1
  return Math.min(
    totalItems,
    OBSIDIAN_GRAPH_PROGRESSION.initial
      + Math.floor(
        obsidianGraphProgressionSpeed(totalItems)
          * Math.max(0, elapsedMs)
          * safeTimeScale
          / 1_000,
      ),
  )
}

/** Map the native item cursor back to the unlocked API-order node prefix. */
export function obsidianGraphProgressionVisibleNodes(
  itemCursor: number,
  nodeStartItems: readonly number[],
): number {
  const cursor = Math.max(0, Math.floor(itemCursor))
  let low = 0
  let high = nodeStartItems.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (nodeStartItems[middle] <= cursor) low = middle + 1
    else high = middle
  }
  return low
}

export function obsidianGraphProgressionCursor(
  elapsedMs: number,
  totalNodes: number,
  totalLinks: number,
): number {
  if (totalNodes <= 0) return 0
  return Math.min(
    totalNodes,
    OBSIDIAN_GRAPH_PROGRESSION.initial
      + Math.floor(obsidianGraphProgressionSpeed(totalLinks) * Math.max(0, elapsedMs) / 1_000),
  )
}

/** Obsidian treats this value as a radius, not a diameter. */
export function obsidianNodeRadius(
  weight: number,
  multiplier: number = OBSIDIAN_NATIVE_RENDER.nodeSizeMultiplier,
): number {
  return multiplier
    * Math.max(8, Math.min(3 * Math.sqrt(weight + 1), 30))
}

/** Keeps nodes legible while allowing their apparent size to grow with zoom. */
export function obsidianNodeScale(scale: number): number {
  return Math.sqrt(1 / scale)
}

export function obsidianTextAlpha(
  scale: number,
  textFadeMultiplier: number = OBSIDIAN_NATIVE_RENDER.textFadeMultiplier,
): number {
  return clamp(Math.log2(scale) + 1 - textFadeMultiplier, 0, 1)
}

export function obsidianWheelTargetScale(
  targetScale: number,
  deltaY: number,
  deltaMode: number,
): number {
  const normalizedDelta = deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 800 : deltaY
  return targetScale * Math.pow(1.5, -normalizedDelta / 120)
}

export function obsidianEase(current: number, target: number, inertia = 0.9): number {
  return current * inertia + target * (1 - inertia)
}
