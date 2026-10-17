import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'
import en from '../i18n/locales/en-US'
import zh from '../i18n/locales/zh-CN'
import ko from '../i18n/locales/ko-KR'
import ru from '../i18n/locales/ru-RU'

const source = ts.createSourceFile('helper.ts', readFileSync(new URL('./recoverableAsyncComponent.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
const declaration = source.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'defineRecoverableAsyncComponent')!
const javascript = ts.transpileModule(declaration.getText(source).replace('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText

function setup() {
  let dialog: any
  const events: string[] = []
  const define = new Function('defineAsyncComponent', 'DialogPlugin', 'i18n', 'window', `${javascript}; return defineRecoverableAsyncComponent`)(
    (options: any) => options,
    { confirm(options: any) { dialog = options; return { destroy() { events.push('destroy') } } } },
    { global: { t: (key: string) => key } },
    { location: { reload() { events.push('reload') } } },
  )
  return { define, events, get dialog() { return dialog } }
}

test('a failed lazy module offers explicit refresh without an automatic reload or ineffective import retry', () => {
  const app = setup(), loader = async () => ({})
  const component = app.define(loader, () => app.events.push('cancel-consumer'))
  assert.equal(component.loader, loader)
  component.onError(new Error('network'), () => app.events.push('retry-import'), () => app.events.push('fail'))
  assert.deepEqual(app.events, [])
  assert.equal(app.dialog.header, 'common.resourceLoadFailed.title')
  app.dialog.onConfirm()
  assert.deepEqual(app.events, ['destroy', 'reload'])
})

test('cancel invokes the consumer close callback and releases the failed module request', () => {
  const app = setup()
  const component = app.define(async () => ({}), () => app.events.push('cancel-consumer'))
  component.onError(new Error('network'), () => app.events.push('retry-import'), () => app.events.push('fail'))
  app.dialog.onClose()
  assert.deepEqual(app.events, ['cancel-consumer', 'destroy', 'fail'])
})

for (const [relative, name, expected] of [
  ['../App.vue', 'ManualKnowledgeEditor', 'manual'],
  ['../views/platform/index.vue', 'Settings', 'settings'],
  ['../components/GlobalCommandPalette.vue', 'RetrievalSettings', 'drawer'],
] as const) {
  test(`${name} closes only its own native visible state when recovery is canceled`, () => {
    const { descriptor } = parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))
    const script = ts.createSourceFile(name + '.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true)
    const statement = script.statements.find(statement => ts.isVariableStatement(statement)
      && statement.declarationList.declarations.some(item => item.name.getText(script) === name))!
    const js = ts.transpileModule(statement.getText(script), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
    const closed: string[] = [], drawerVisible = { value: true }
    const cancel = new Function('defineRecoverableAsyncComponent', 'uiStore', 'drawerVisible', `${js}; return ${name}`)(
      (_loader: any, onCancel: () => void) => onCancel,
      { closeManualEditor() { closed.push('manual') }, closeSettings() { closed.push('settings') } }, drawerVisible,
    )
    cancel()
    assert.deepEqual(closed, expected === 'drawer' ? [] : [expected])
    assert.equal(drawerVisible.value, expected !== 'drawer')
  })
}

test('all shipped locales provide the same short resource-recovery actions', () => {
  for (const locale of [en, zh, ko, ru]) {
    assert.ok(locale.common.resourceLoadFailed.title.length > 0)
    assert.ok(locale.common.resourceLoadFailed.body.length > 0)
    assert.ok(locale.common.resourceLoadFailed.reload.length > 0)
  }
})
