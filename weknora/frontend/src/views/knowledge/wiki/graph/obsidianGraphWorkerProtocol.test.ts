import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

import { createDefaultObsidianGraphSettings } from './obsidianGraphSettings.ts'
import {
  buildObsidianWorkerDragMessage,
  buildObsidianWorkerForceMessage,
  buildObsidianWorkerInitMessage,
  readObsidianWorkerResult,
} from './obsidianGraphWorkerProtocol.ts'

test('keeps the local Obsidian 1.13.7 worker byte-for-byte unchanged', () => {
  const worker = readFileSync(new URL(
    '../../../../../public/vendor/obsidian-1.13.7/graph-sim.js',
    import.meta.url,
  ))
  assert.equal(
    createHash('sha256').update(worker).digest('hex'),
    '549be2f69710af360d521c92b80c83718f673594d3dc2255a65e251199eee25d',
  )
})

test('init message matches the vendored Obsidian worker protocol', () => {
  const message = buildObsidianWorkerInitMessage(
    [
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: -5, y: 8 },
    ],
    [{ source: 'a', target: 'b' }],
    createDefaultObsidianGraphSettings(),
  )

  assert.deepEqual(message, {
    nodes: { a: [10, 20], b: [-5, 8] },
    links: [['a', 'b']],
    forces: {
      centerStrength: 0.1,
      repelStrength: 1000,
      linkStrength: 1,
      linkDistance: 250,
    },
    alpha: 1,
    alphaTarget: 0,
    run: true,
  })
})

test('force and drag messages preserve the original alpha lifecycle', () => {
  const settings = {
    ...createDefaultObsidianGraphSettings(),
    centerStrength: 1,
    repelStrength: 5,
    linkStrength: 0.5,
    linkDistance: 300,
  }
  assert.deepEqual(buildObsidianWorkerForceMessage(settings), {
    forces: {
      centerStrength: 1,
      repelStrength: 125,
      linkStrength: 0.090909090909,
      linkDistance: 300,
    },
    alpha: 1,
    run: true,
  })
  assert.deepEqual(buildObsidianWorkerDragMessage('a', 7, 9, true), {
    alpha: 0.3,
    alphaTarget: 0.3,
    run: true,
    forceNode: { id: 'a', x: 7, y: 9 },
  })
  assert.deepEqual(buildObsidianWorkerDragMessage('a', null, null, false), {
    alphaTarget: 0,
    forceNode: { id: 'a', x: null, y: null },
  })
})

test('a restored snapshot leaves the real native worker idle until the next graph interaction', () => {
  const workerSource = readFileSync(new URL(
    '../../../../../public/vendor/obsidian-1.13.7/graph-sim.js', import.meta.url,
  ), 'utf8')
  const timers: unknown[] = []
  const worker: { onmessage?: (event: { data: unknown }) => void } = {}
  runInNewContext(workerSource, {
    self: worker,
    WebAssembly: {},
    console: { log() {} },
    postMessage() {},
    setTimeout(callback: unknown) { timers.push(callback); return timers.length },
  })
  worker.onmessage!({ data: buildObsidianWorkerInitMessage(
    [{ id: 'a', x: 10, y: 20 }, { id: 'b', x: 30, y: 40 }],
    [{ source: 'a', target: 'b' }],
    createDefaultObsidianGraphSettings(),
    false,
  ) })
  assert.equal(timers.length, 0, 'restoring coordinates must not restart the force simulation')
  worker.onmessage!({ data: buildObsidianWorkerDragMessage('a', 7, 9, true) })
  assert.equal(timers.length, 1, 'the restored graph must remain interactive')
})

test('worker result reader exposes positions and the shared version counter', () => {
  const buffer = new SharedArrayBuffer(20)
  new Float32Array(buffer, 0, 4).set([1, 2, 3, 4])
  new Uint32Array(buffer, 16, 1)[0] = 7

  const result = readObsidianWorkerResult({ id: ['a', 'b'], buffer, v: 6 })
  assert.deepEqual(result.ids, ['a', 'b'])
  assert.deepEqual([...result.positions], [1, 2, 3, 4])
  assert.equal(result.version?.[0], 7)
  assert.equal(result.previousVersion, 6)
})
