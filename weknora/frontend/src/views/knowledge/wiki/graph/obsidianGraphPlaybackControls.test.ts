import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { compileScript, parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import * as vue from 'vue'
import { createDefaultObsidianGraphSettings } from './obsidianGraphSettings.ts'

const source = readFileSync(new URL('./ObsidianGraphSettingsPanel.vue', import.meta.url), 'utf8')
const { descriptor } = parse(source, { filename: 'ObsidianGraphSettingsPanel.vue' })
const compiled = compileScript(descriptor, { id: 'graph-playback-test', inlineTemplate: true })
const javascript = ts.transpileModule(compiled.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

test('rendered playback buttons dispatch play, pause, continue, replay and restore without losing state when closed', () => {
  const module = { exports: {} as any }
  const modules: Record<string, unknown> = {
    vue: { ...vue, resolveComponent: (name: string) => name },
    'vue-i18n': { useI18n: () => ({ t: (key: string) => key.split('.').at(-1) }) },
  }
  new Function('require', 'module', 'exports', javascript)(
    (name: string) => modules[name], module, module.exports,
  )
  const props = vue.reactive({
    modelValue: { ...createDefaultObsidianGraphSettings(), close: false },
    playback: { state: 'idle', visible: 5, total: 5 },
  })
  const events: string[] = []
  const render = module.exports.default.setup(props, { expose() {}, emit: (event: string) => events.push(event) })
  const buttons = () => {
    const found: vue.VNode[] = []
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'button' && String(node.props?.class).includes('playback-button')) found.push(node)
      if (Array.isArray(node.children)) node.children.forEach(visit)
    }
    visit(render({}, []))
    return found
  }

  assert.deepEqual(buttons().map(button => button.props!['aria-label']), ['playbackPlay'])
  buttons()[0].props!.onClick()
  for (const [state, label, action] of [
    ['playing', 'playbackPause', 'pause'],
    ['paused', 'playbackResume', 'resume'],
    ['complete', 'playbackReplay', 'play'],
  ]) {
    props.playback.state = state
    assert.deepEqual(buttons().map(button => button.props!['aria-label']), [label, 'playbackRestore'])
    buttons()[0].props!.onClick()
    buttons()[1].props!.onClick()
    assert.deepEqual(events.slice(-2), [action, 'restore'])
  }
  props.playback.state = 'paused'
  props.modelValue.close = true
  assert.equal(buttons().length, 0)
  props.modelValue.close = false
  assert.deepEqual(buttons().map(button => button.props!['aria-label']), ['playbackResume', 'playbackRestore'])
  props.playback.state = 'idle'
  props.playback.total = 0
  assert.equal(buttons()[0].props!.disabled, true)
})
