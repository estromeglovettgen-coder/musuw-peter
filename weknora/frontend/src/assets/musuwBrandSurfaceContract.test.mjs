import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import test from 'node:test'

const url = (path) => new URL(path, import.meta.url)
const read = (path) => readFileSync(url(path), 'utf8')

test('shipped browser and operations surfaces contain only Musuw branding', () => {
  const visibleSources = [
    read('../../operations.html'),
    read('../../index.html'),
    read('../../public/musuw-widget.js'),
    read('../../../../scripts/musuw-admin-server.mjs'),
    ...readdirSync(url('../operations/pages/'))
      .filter((name) => name.endsWith('.vue'))
      .map((name) => read(`../operations/pages/${name}`)),
  ]
  for (const source of visibleSources) {
    const withoutCompatibilityContracts = source
      .replaceAll('WeKnora_theme', '')
      .replaceAll('global.WeKnora = api;', '')
    assert.equal(withoutCompatibilityContracts.includes('WeKnora'), false)
    assert.equal(withoutCompatibilityContracts.includes('TDesign Starter · Tencent'), false)
  }

  assert.equal(existsSync(url('../../public/weknora-widget.js')), false)
  assert.match(read('../../public/musuw-widget.js'), /global\.Musuw = api/)
  assert.match(read('../../public/musuw-widget.js'), /global\.WeKnora = api/)
  assert.match(read('../../operations.html'), /musuw-logo\.png\?v=20260822/)
})

test('public integration names use Musuw endpoints and headers', () => {
  const activeContracts = [
    read('../api/embed/index.ts'),
    read('../../nginx.conf'),
    read('../../../../integration/weknora-production/nginx.conf.template'),
    read('../../../../integration/weknora-candidate/nginx.conf.template'),
    read('../../../internal/application/service/embed_webhook.go'),
    read('../i18n/locales/en-US.ts'),
    read('../i18n/locales/zh-CN.ts'),
    read('../i18n/locales/ko-KR.ts'),
    read('../i18n/locales/ru-RU.ts'),
  ]
  assert.match(activeContracts[0], /musuw-widget\.js/)
  for (const nginx of activeContracts.slice(1, 4)) {
    assert.match(nginx, /location = \/musuw-widget\.js/)
    assert.match(nginx, /location = \/weknora-widget\.js \{\s*return 308 \/musuw-widget\.js;/)
    assert.match(nginx, /location = \/operations\.html \{\s*return 404;/)
  }
  assert.match(activeContracts[4], /X-Musuw-Signature/)
  assert.match(activeContracts[4], /X-WeKnora-Signature/)
  for (const locale of activeContracts.slice(5)) assert.match(locale, /X-Musuw-Signature/)
})

test('fallback favicon is no longer the retired wordmark', () => {
  const favicon = readFileSync(url('../../public/favicon.ico'))
  const digest = createHash('sha256').update(favicon).digest('hex')
  assert.notEqual(digest, 'bed4c794c3a4e9242c810f693a5e0d9e7a46c2e1abb615cbdde5ae4fb7c658a0')
})
