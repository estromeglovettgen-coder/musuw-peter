import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

function load(fire: boolean, font?: string) {
  const values = new Map<string, string>([['weknora_user', '{"id":7}']])
  if (font) values.set('Musuw_7_font_sans', font)
  const styles = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const common = { localStorage, document: { documentElement: { style: {
    setProperty: (key: string, value: string) => { styles.set(key, value) },
    removeProperty: (key: string) => { styles.delete(key) },
  } } }, navigator: { userAgent: 'Macintosh', platform: 'MacIntel' } }
  const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const preferences = {}
  runInNewContext(compile('./preferenceStorage.ts'), { ...common, exports: preferences })
  const app: any = {}
  runInNewContext(compile('./useFont.ts'), { ...common, exports: app, require(name: string) {
    if (name === 'vue') return { ref: (value: unknown) => ({ value }) }
    if (name === './preferenceStorage') return preferences
    if (name === '@/config/workspaceSurface') return { isPeterWorkspace: fire }
    throw Error('Unexpected dependency: ' + name)
  } })
  return { app, styles, values }
}

test('Fire starts with the existing system font stack without saving a preference', () => {
  const { app, styles, values } = load(true)
  app.initFont()
  assert.equal(styles.get('--app-font-family'), app.SANS_STACKS.system)
  assert.equal(values.has('Musuw_7_font_sans'), false)
})

test('saved font, live font choice, and size remain native user preferences', () => {
  const { app, styles, values } = load(true, 'georgia')
  app.initFont()
  assert.equal(styles.get('--app-font-family'), app.SANS_STACKS.georgia)
  app.useFont().setSansFont('pingfang')
  app.useFont().setFontSize('large')
  assert.equal(styles.get('--app-font-family'), app.SANS_STACKS.pingfang)
  assert.equal(styles.get('zoom'), '1.125')
  assert.equal(values.get('Musuw_7_font_sans'), 'pingfang')
})

test('switching accounts restores the Fire default without inheriting another account font', () => {
  const { app, styles, values } = load(true, 'georgia')
  app.initFont()
  values.set('weknora_user', '{"id":8}')
  app.reloadFontFromStorage()
  assert.equal(styles.get('--app-font-family'), app.SANS_STACKS.system)
  assert.equal(values.get('Musuw_7_font_sans'), 'georgia')
  assert.equal(values.has('Musuw_8_font_sans'), false)
})

test('other workspace profiles keep the original stylesheet font default', () => {
  const { app, styles } = load(false)
  app.initFont()
  assert.equal(styles.has('--app-font-family'), false)
})
