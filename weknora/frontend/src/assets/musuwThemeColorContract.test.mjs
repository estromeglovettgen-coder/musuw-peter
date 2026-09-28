import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('theme color is a validated per-user preference separate from theme mode', () => {
  const useTheme = read('../composables/useTheme.ts')
  const storage = read('../composables/preferenceStorage.ts')
  assert.match(useTheme, /export type ThemeColor = 'musuw' \| 'weknora'/)
  assert.match(useTheme, /const THEME_COLOR_KEY = 'theme_color'/)
  assert.match(useTheme, /function loadThemeColor\(\): ThemeColor/)
  assert.match(useTheme, /['"]musuw['"]/) 
  assert.match(useTheme, /setThemeColor\(color: ThemeColor\)/)
  assert.match(useTheme, /savePreference\(THEME_COLOR_KEY, color\)/)
  assert.match(useTheme, /setAttribute\('theme-color', color\)/)
  assert.match(storage, /'theme_color'/)
})

test('theme.css exposes the official Musuw and WeKnora TDesign brand palettes', () => {
  const theme = read('./theme/theme.css')
  assert.match(theme, /:root\[theme-color="musuw"\]/)
  assert.match(theme, /:root\[theme-color="weknora"\]/)
  assert.match(theme, /:root\[theme-color="weknora"\]\s*\{/)
  assert.match(theme, /\.visual-knowledge-page\.is-graph-tab\s*\{/)
  for (const token of [
    '--td-brand-color-1: #e9f8ec', '--td-brand-color-2: #09f479',
    '--td-brand-color-3: #08dd6e', '--td-brand-color-4: #07c05f',
    '--td-brand-color-5: #06b04d', '--td-brand-color-6: #049b38',
    '--td-brand-color-7: #038626', '--td-brand-color-8: #027218',
    '--td-brand-color-9: #015e0d', '--td-brand-color-10: #004b05',
    '--td-brand-color: var(--td-brand-color-4)',
    '--td-brand-color-hover: var(--td-brand-color-3)',
    '--td-brand-color-active: var(--td-brand-color-5)',
    '--td-brand-color-disabled: #8ce0af',
  ]) assert.match(theme, new RegExp(token.replace(/[()]/g, '\\$&')))
  for (const token of [
    '--td-brand-color-1: #06b04d20', '--td-brand-color-2: #015e0d',
    '--td-brand-color-3: #027218', '--td-brand-color-4: #038626',
    '--td-brand-color-5: #049b38', '--td-brand-color-6: #06b04d',
    '--td-brand-color-7: #07c05f', '--td-brand-color-8: #08dd6e',
    '--td-brand-color-9: #09f479', '--td-brand-color-10: #a6fccf',
    '--td-brand-color: var(--td-brand-color-6)',
    '--td-brand-color-hover: var(--td-brand-color-5)',
    '--td-brand-color-active: var(--td-brand-color-7)',
    '--td-brand-color-disabled: #1a6b3b',
  ]) assert.match(theme, new RegExp(token.replace(/[()]/g, '\\$&')))
})

test('General Settings exposes theme mode and theme color in Lite and Standard', () => {
  const source = read('../views/settings/GeneralSettings.vue')
  assert.match(source, /id="visual-theme-select"/)
  assert.match(source, /id="visual-theme-color-select"/)
  assert.match(source, /setThemeColor\(value\)/)
  assert.doesNotMatch(source, /<div v-if="!authStore\.isLiteMode" class="visual-setting-row">[\s\S]*visual-theme-select/)
})

test('all supported locales carry theme color labels', () => {
  for (const locale of ['en-US', 'zh-CN', 'ko-KR', 'ru-RU']) {
    const source = read(`../i18n/locales/${locale}.ts`)
    for (const key of ['color:', 'colorDescription:', 'musuw:', 'weknora:', 'selectColor:']) {
      assert.match(source, new RegExp(key), `${locale} is missing theme.${key}`)
    }
  }
})

test('Lite guide surfaces never expose legacy model-management steps', () => {
  const globalGuide = read('../components/NewUserGuide.vue')
  const tenantGuide = read('../components/TenantModelsGuide.vue')
  assert.match(globalGuide, /useAuthStore\(\)/)
  assert.match(globalGuide, /authStore\.isLiteMode[\s\S]*models/) 
  assert.match(tenantGuide, /useAuthStore\(\)/)
  assert.match(tenantGuide, /authStore\.isLiteMode/) 
})
