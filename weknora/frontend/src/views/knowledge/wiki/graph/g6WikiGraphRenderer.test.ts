import assert from 'node:assert/strict'
import test from 'node:test'

import { buildG6Behaviors, buildG6Layout } from './g6WikiGraphRenderer.ts'

test('Obsidian native drag reheats the force simulation and releases the node afterwards', () => {
  const behaviors = buildG6Behaviors('g6-obsidian')

  assert.ok(
    behaviors.some(behavior => (
      typeof behavior === 'object'
      && behavior.type === 'drag-element-force'
      && behavior.fixed === false
    )),
    'expected drag-element-force with fixed=false so connected nodes react while dragging and settle after release',
  )
  assert.ok(!behaviors.includes('drag-element'))

  const layout = buildG6Layout('g6-obsidian', 1_000, 1_200, 800)
  assert.ok(!Array.isArray(layout))
  if (Array.isArray(layout)) return
  assert.equal(layout.type, 'd3-force')
  assert.equal(layout.enableWorker, false)
})

test('non-D3 G6 layouts keep ordinary element dragging', () => {
  const behaviors = buildG6Behaviors('g6-circular')

  assert.ok(behaviors.includes('drag-element'))
  assert.ok(!behaviors.some(behavior => typeof behavior === 'object' && behavior.type === 'drag-element-force'))
})
