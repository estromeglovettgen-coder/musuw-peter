import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OBSIDIAN_NATIVE_PHYSICS,
  OBSIDIAN_NATIVE_RENDER,
  obsidianGraphProgressionItemCursor,
  obsidianGraphProgressionVisibleNodes,
  obsidianGraphProgressionCursor,
  obsidianGraphProgressionSpeed,
  obsidianEase,
  obsidianNodeRadius,
  obsidianNodeScale,
  obsidianTextAlpha,
  obsidianWheelTargetScale,
} from './obsidianNativeGraphContract.ts'

test('locks native Obsidian 1.13.7 physical values after UI slider mapping', () => {
  assert.equal(OBSIDIAN_NATIVE_PHYSICS.centerStrength, 0.1)
  assert.equal(OBSIDIAN_NATIVE_PHYSICS.repelStrength, -1_000)
  assert.equal(OBSIDIAN_NATIVE_PHYSICS.linkDistance, 250)
  assert.equal(OBSIDIAN_NATIVE_PHYSICS.linkStrength, 1)
  assert.equal(OBSIDIAN_NATIVE_PHYSICS.collisionRadius, 60)
  assert.equal(OBSIDIAN_NATIVE_PHYSICS.collisionStrength, 0.5)
  assert.equal(OBSIDIAN_NATIVE_PHYSICS.velocityDecay, 0.4)
  assert.equal(OBSIDIAN_NATIVE_PHYSICS.dragAlpha, 0.3)
})

test('matches native node sizing, zoom scaling and label fade formulas', () => {
  assert.equal(obsidianNodeRadius(0), 8)
  assert.equal(obsidianNodeRadius(8), 9)
  assert.equal(obsidianNodeRadius(99), 30)
  assert.equal(obsidianNodeRadius(10_000), 30)
  assert.equal(obsidianNodeScale(4), 0.5)
  assert.equal(obsidianTextAlpha(0.25), 0)
  assert.equal(obsidianTextAlpha(0.5), 0)
  assert.equal(obsidianTextAlpha(1), 1)
})

test('matches native wheel normalization and inertial interpolation', () => {
  assert.equal(obsidianWheelTargetScale(1, 120, 0), 1 / 1.5)
  assert.equal(obsidianWheelTargetScale(1, 3, 1), 1 / 1.5)
  assert.ok(Math.abs(obsidianEase(0, 1) - 0.1) < Number.EPSILON)
  assert.equal(OBSIDIAN_NATIVE_RENDER.dragThresholdSquared, 25)
  assert.equal(OBSIDIAN_NATIVE_RENDER.progressiveNodeBatch, 50)
})

test('matches the audited Obsidian timelapse progression formula', () => {
  assert.equal(obsidianGraphProgressionSpeed(0), 5)
  assert.equal(obsidianGraphProgressionSpeed(100), 5)
  assert.equal(obsidianGraphProgressionSpeed(400), 10)
  assert.equal(obsidianGraphProgressionSpeed(1_000_000), 100)

  assert.equal(obsidianGraphProgressionCursor(0, 10, 100), 1)
  assert.equal(obsidianGraphProgressionCursor(199, 10, 100), 1)
  assert.equal(obsidianGraphProgressionCursor(200, 10, 100), 2)
  assert.equal(obsidianGraphProgressionCursor(10_000, 10, 100), 10)
  assert.equal(obsidianGraphProgressionCursor(10_000, 0, 100), 0)

  // Native renderProgression advances a single item cursor. A file consumes
  // one item and each of its outgoing links consumes another, so the second
  // node is not unlocked until the first node's whole item block is passed.
  const nodeStartItems = [1, 29, 39, 49]
  assert.equal(obsidianGraphProgressionItemCursor(0, 58), 1)
  assert.equal(obsidianGraphProgressionItemCursor(5_599, 58), 28)
  assert.equal(obsidianGraphProgressionItemCursor(5_600, 58), 29)
  assert.equal(obsidianGraphProgressionVisibleNodes(28, nodeStartItems), 1)
  assert.equal(obsidianGraphProgressionVisibleNodes(29, nodeStartItems), 2)
  assert.equal(obsidianGraphProgressionVisibleNodes(58, nodeStartItems), 4)

  // Storefronts may compress wall time, but the native item ordering and
  // relative cadence stay identical.
  assert.equal(obsidianGraphProgressionItemCursor(1_750, 58, 3.2), 29)
})
