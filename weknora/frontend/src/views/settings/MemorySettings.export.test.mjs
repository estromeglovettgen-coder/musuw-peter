import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const componentSource = readFileSync(new URL('./MemorySettings.vue', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../../api/memory.ts', import.meta.url), 'utf8')
const script = componentSource.slice(componentSource.indexOf('<script setup'), componentSource.indexOf('<style'))

test('memory export downloads the complete server snapshot envelope', () => {
  const exportBody = script.match(/const handleExport = async \(\) => \{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(
    exportBody,
    /JSON\.stringify\(response,\s*null,\s*2\)/,
    'the download must retain total/truncated metadata alongside data',
  )
  assert.doesNotMatch(
    exportBody,
    /JSON\.stringify\(response\.data\s*\|\|\s*\[\]/,
    'serializing only response.data makes a truncated snapshot look complete',
  )
})

test('memory export preserves metadata for normal, empty, and safety-truncated snapshots', () => {
  const exportBody = script.match(/const handleExport = async \(\) => \{([\s\S]*?)\n\}/)?.[1] || ''
  const serializedTarget = exportBody.match(/JSON\.stringify\(([^,]+),\s*null,\s*2\)/)?.[1]?.trim()
  assert.ok(serializedTarget, 'the download must serialize a response value')

  const snapshots = [
    { total: 2, truncated: false, data: [{ content: '记忆' }, { content: '偏好' }] },
    { total: 0, truncated: false, data: [] },
    { total: 20001, truncated: true, data: [{ content: '保留到安全上限' }] },
  ]
  for (const snapshot of snapshots) {
    // Interpret the current inline serializer so this test exercises the
    // downloaded shape, not just a separate copy of JSON.stringify. The old
    // `response.data || []` target deliberately fails the metadata checks.
    const value = serializedTarget === 'response'
      ? snapshot
      : serializedTarget === 'response.data || []'
        ? snapshot.data || []
        : assert.fail(`unknown export serializer target: ${serializedTarget}`)
    const downloaded = JSON.parse(JSON.stringify(value, null, 2))
    assert.equal(downloaded.total, snapshot.total)
    assert.equal(downloaded.truncated, snapshot.truncated)
    assert.deepEqual(downloaded.data, snapshot.data)
  }
})

test('exportMemoryItems declares the server truncation flag', () => {
  const exportFunction = apiSource.match(/export function exportMemoryItems\(\)[\s\S]*?\n\}/)?.[0] || ''
  assert.match(exportFunction, /truncated:\s*boolean/)
})
