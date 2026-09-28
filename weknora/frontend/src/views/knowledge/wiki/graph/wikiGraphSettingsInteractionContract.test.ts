import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const wikiBrowser = readFileSync(new URL('../WikiBrowser.vue', import.meta.url), 'utf8')
const template = wikiBrowser.slice(0, wikiBrowser.indexOf('<script setup'))
const graphSettings = readFileSync(new URL('./obsidianGraphSettings.ts', import.meta.url), 'utf8')
const graphSettingsPanel = readFileSync(new URL('./ObsidianGraphSettingsPanel.vue', import.meta.url), 'utf8')

function functionSlice(startMarker: string, endMarker: string): string {
  const start = wikiBrowser.indexOf(startMarker)
  assert.ok(start >= 0, `missing function marker: ${startMarker}`)
  const end = wikiBrowser.indexOf(endMarker, start)
  assert.ok(end > start, `missing function boundary: ${endMarker}`)
  return wikiBrowser.slice(start, end)
}

test('graph settings start closed and are force-closed on graph entry or KB changes', () => {
  // The persisted graph physics remain per-KB, but panel visibility is a
  // transient affordance. A stale close=false value must never make a newly
  // entered graph open with the settings panel already covering the canvas.
  assert.match(graphSettings, /\n\s*close:\s*true,/)
  assert.match(wikiBrowser, /function closeObsidianGraphSettings\(\)[\s\S]*?close:\s*true/)

  const viewWatcher = functionSlice(
    'watch(\n  () => props.view',
    'watch(\n  () => route.query.slug',
  )
  assert.match(viewWatcher, /closeObsidianGraphSettings\(\)/)

  const knowledgeBaseWatcher = functionSlice(
    'watch(() => props.knowledgeBaseId',
    'const graphSearchOptions',
  )
  assert.match(knowledgeBaseWatcher, /closeObsidianGraphSettings\(\)/)

  const mounted = functionSlice('onMounted(() => {', 'onUnmounted(() => {')
  assert.match(mounted, /if \(props\.view === ["']graph["']\)[\s\S]*closeObsidianGraphSettings\(\)/)
})

test('settings entry is in the legend between actions and the overview status card', () => {
  const actions = template.indexOf('<div class="legend-actions">')
  const settings = template.indexOf('<div class="legend-settings">')
  const overview = template.indexOf('<template v-if="graphStatusCard">')

  assert.ok(actions >= 0, 'legend actions must remain present')
  assert.ok(settings > actions, 'settings entry must follow the legend actions')
  assert.ok(overview > settings, 'settings entry must precede the overview card')
  assert.equal(
    template.match(/<ObsidianGraphSettingsPanel/g)?.length,
    1,
    'the graph settings panel should have one inline legend mount',
  )
  const panelStyle = graphSettingsPanel.slice(graphSettingsPanel.indexOf('<style'))
  assert.match(panelStyle, /\.obsidian-graph-controls-wrap\s*\{[\s\S]*position:\s*static;/)
  assert.match(panelStyle, /\.obsidian-graph-controls-wrap\s*\{[\s\S]*width:\s*100%;/)
  assert.match(graphSettingsPanel, /class="graph-settings-trigger legend-action"/)
  assert.match(
    graphSettingsPanel,
    /knowledgeEditor\.wikiBrowser\.obsidianGraph\.settings/,
    'the settings trigger should be a labeled legend row, not an icon-only square',
  )
  assert.doesNotMatch(
    panelStyle,
    /\.obsidian-graph-controls-wrap\s*\{[^}]*position:\s*absolute;/,
  )
})

test('graph interactions close settings through one capture boundary without closing inside the panel', () => {
  assert.match(
    template,
    /<div class="wiki-graph"[^>]*@pointerdown\.capture="handleGraphPointerDown"/,
    'the graph root must capture outside interactions before canvas/legend handlers run',
  )

  const pointerHandler = functionSlice('function handleGraphPointerDown', 'function toggleGraphFilterType')
  assert.match(pointerHandler, /obsidian-graph-controls-wrap/)
  assert.match(pointerHandler, /contains\(/, 'clicking the settings panel itself must stay open')
  assert.match(pointerHandler, /closeObsidianGraphSettings\(\)/)

  // The drawer is rendered by TDesign through a teleport, so its node-detail
  // open path also closes the panel explicitly instead of relying solely on
  // the graph-root capture boundary.
  const drawerOpen = functionSlice('async function openGraphDrawer', 'function handleGraphDrawerClick')
  assert.match(drawerOpen, /closeObsidianGraphSettings\(\)/)

  const reset = functionSlice('function resetObsidianGraphSettings', 'function startObsidianGraphProgression')
  assert.match(
    reset,
    /close:\s*obsidianGraphSettings\.value\.close/,
    'resetting graph physics must preserve the currently open settings panel',
  )
})

test('growth playback keeps its state-aware action beside a separate restore action', () => {
  const display = graphSettingsPanel.indexOf("toggleCollapse('collapse-display')")
  const playback = graphSettingsPanel.indexOf('graph-playback-section')
  const forces = graphSettingsPanel.indexOf("toggleCollapse('collapse-forces')")

  assert.ok(display >= 0, 'display settings must remain present')
  assert.ok(playback > display, 'playback must follow display settings')
  assert.ok(forces > playback, 'playback must be independent from force settings')
  assert.match(graphSettingsPanel, /playback:\s*WikiGraphPlaybackSnapshot/)
  assert.match(graphSettingsPanel, /handlePlaybackAction/)
  assert.match(graphSettingsPanel, /playback\.state === 'playing'/)
  assert.match(graphSettingsPanel, /emit\('pause'\)/)
  assert.match(graphSettingsPanel, /emit\('resume'\)/)
  assert.match(graphSettingsPanel, /emit\('play'\)/)
  assert.match(graphSettingsPanel, /emit\('restore'\)/)
  assert.match(graphSettingsPanel, /v-if="playback\.state !== 'idle'"/)
  assert.match(graphSettingsPanel, /\.graph-playback-actions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;/)
  assert.doesNotMatch(graphSettingsPanel, /emit\('animate'\)/)

  assert.match(template, /:playback="graphPlayback"/)
  assert.match(template, /@play="startObsidianGraphProgression"/)
  assert.match(template, /@pause="pauseObsidianGraphProgression"/)
  assert.match(template, /@resume="resumeObsidianGraphProgression"/)
  assert.match(template, /@restore="restoreObsidianGraphProgression"/)
  assert.doesNotMatch(template, /@animate=/)
})
