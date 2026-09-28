import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveInitialLocale } from './locale.ts'

test('product locale resolution prefers saved preference over website signal, browser, and fallback', () => {
    assert.equal(resolveInitialLocale({
      storage: { getItem: () => 'ko-KR' },
      cookie: 'musuw_locale=zh-CN',
      languages: ['en-US'],
    }), 'ko-KR')
})

test('product locale resolution uses the website signal before the browser language', () => {
    assert.equal(resolveInitialLocale({
      storage: { getItem: () => null },
      cookie: 'foo=bar; musuw_locale=zh-CN',
      languages: ['en-US'],
    }), 'zh-CN')
})

test('product locale resolution recognizes supported browser languages and defaults to English', () => {
    assert.equal(resolveInitialLocale({
      storage: { getItem: () => null },
      cookie: '',
      languages: ['ko-KR'],
    }), 'ko-KR')
    assert.equal(resolveInitialLocale({
      storage: { getItem: () => null },
      cookie: '',
      languages: ['fr-FR'],
    }), 'en-US')
})
