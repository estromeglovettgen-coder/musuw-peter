import assert from 'node:assert/strict'
import test from 'node:test'

test('invalid persisted theme color falls back to Musuw and reload applies it', { concurrency: false }, async () => {
  const values = new Map<string, string>([
    ['weknora_user', JSON.stringify({ id: 17 })],
    ['WeKnora_17_theme_color', 'not-a-theme'],
  ])
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const attributes = new Map<string, string>()
  globalThis.localStorage = localStorage as Storage
  globalThis.document = {
    createElement: () => ({}),
    documentElement: {
      setAttribute: (key: string, value: string) => { attributes.set(key, value) },
    },
  } as unknown as Document
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => undefined }),
  } as unknown as Window & typeof globalThis

  const theme = await import(`./useTheme.ts?invalid-color=${Date.now()}`)
  const api = theme.useTheme()
  assert.equal(api.currentThemeColor.value, 'musuw')
  theme.initTheme()
  assert.equal(attributes.get('theme-color'), 'musuw')
  assert.equal(api.setThemeColor('weknora'), true)
  assert.equal(values.get('WeKnora_17_theme_color'), 'weknora')
  values.set('WeKnora_17_theme_color', 'still-invalid')
  theme.reloadThemeFromStorage()
  assert.equal(api.currentThemeColor.value, 'musuw')
  assert.equal(attributes.get('theme-color'), 'musuw')
})

test('theme color migrates from the anonymous namespace into the active user namespace', { concurrency: false }, async () => {
  const values = new Map<string, string>([
    ['weknora_user', JSON.stringify({ id: 23 })],
    ['WeKnora_anon_theme_color', 'weknora'],
  ])
  globalThis.localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  } as unknown as Storage

  const theme = await import(`./useTheme.ts?migrate-color=${Date.now()}`)
  theme.reloadThemeFromStorage()
  assert.equal(values.get('WeKnora_23_theme_color'), 'weknora')
  assert.equal(values.has('WeKnora_anon_theme_color'), false)
})

test('runtime theme ownership releases the temporary boot canvas', { concurrency: false }, async () => {
  const values = new Map<string, string>([
    ['weknora_user', JSON.stringify({ id: 31 })],
    ['WeKnora_31_theme', 'dark'],
  ])
  const removed: string[] = []
  const style = (owner: string) => ({
    removeProperty: (name: string) => { removed.push(`${owner}:${name}`) },
  })

  globalThis.localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  } as unknown as Storage
  globalThis.document = {
    documentElement: {
      setAttribute: () => undefined,
      style: style('html'),
    },
    body: { style: style('body') },
  } as unknown as Document
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener: () => undefined }),
  } as unknown as Window & typeof globalThis

  const theme = await import(`./useTheme.ts?boot-canvas=${Date.now()}`)
  theme.initTheme()

  assert.deepEqual(removed, [
    'html:background',
    'html:color-scheme',
    'body:background',
  ])
})
