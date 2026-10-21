import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import i18n, { ensureLocaleMessages, i18nReady } from './index'

test('startup keeps its fallback but does not load unused Russian and Korean dictionaries', async () => {
  await i18nReady
  assert(i18n.global.availableLocales.includes('zh-CN'))
  assert(!i18n.global.availableLocales.includes('ru-RU'))
  assert(!i18n.global.availableLocales.includes('ko-KR'))
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /^import\s+\w+\s+from\s+['"]\.\/locales\/(en-US|ru-RU|ko-KR)/m)
})

test('selecting a locale shares the pending load and provides complete translations before switching', async () => {
  const original = i18n.global.locale.value
  const first = ensureLocaleMessages('ko-KR')
  assert.equal(first, ensureLocaleMessages('ko-KR'))
  await first
  i18n.global.locale.value = 'ko-KR'
  assert.equal(i18n.global.t('common.cancel'), '취소')
  await ensureLocaleMessages('en-US')
  i18n.global.locale.value = 'en-US'
  assert.equal(i18n.global.t('common.cancel'), 'Cancel')
  await ensureLocaleMessages('ru-RU')
  i18n.global.locale.value = 'ru-RU'
  assert.equal(i18n.global.t('common.cancel'), 'Отмена')
  await ensureLocaleMessages('zh-CN')
  i18n.global.locale.value = 'zh-CN'
  assert.equal(i18n.global.t('common.cancel'), '取消')
  i18n.global.locale.value = original
})
