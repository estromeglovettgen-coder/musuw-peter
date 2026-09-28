import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const component = readFileSync(new URL('./KbUploadSourceDropdown.vue', import.meta.url), 'utf8')
const douyinLogo = readFileSync(new URL('../../../assets/img/douyin-logo.svg', import.meta.url), 'utf8')
const localeFiles = [
  '../../../i18n/locales/en-US.ts',
  '../../../i18n/locales/zh-CN.ts',
  '../../../i18n/locales/ko-KR.ts',
  '../../../i18n/locales/ru-RU.ts',
]

test('URL import modal keeps the form focused on input and supported platforms', () => {
  assert.match(component, /<t-textarea[\s\S]*?v-model="urlInputValue"[\s\S]*?:autosize="\{ minRows: 3, maxRows: 3 \}"/)
  assert.match(component, /class="visual-url-modal__textarea-wrap"/)
  assert.match(component, /v-if="urlInputValue"[\s\S]*?class="visual-url-modal__clear"/)
  assert.match(component, /position: absolute/)
  assert.match(component, /urlInputValue\.value = ''/)
  assert.match(component, /@iconify-prerendered\/vue-simple-icons/)
  for (const icon of ['IconInstagram', 'IconTiktok', 'IconX', 'IconXiaohongshu', 'IconYoutube']) {
    assert.match(component, new RegExp(icon))
  }
  for (const label of ['Instagram', 'X', '小红书', 'TikTok', 'YouTube']) {
    assert.match(component, new RegExp(label))
  }
  assert.match(component, /knowledgeBase\.douyin/)
  assert.match(component, /import douyinLogo from '@\/assets\/img\/douyin-logo\.svg'/)
  assert.match(component, /id: 'douyin',[^\n]*image: douyinLogo/)
  assert.doesNotMatch(component, /id: 'douyin',[^\n]*icon: IconTiktok/)
  assert.match(component, /<img v-if="platform\.image" :src="platform\.image" alt="" \/>/)
  assert.match(component, /visual-url-modal__platform-list/)
  assert.match(component, /v-for="platform in socialPlatforms"/)
  assert.strictEqual((component.match(/id: '/g) || []).length, 6)
  assert.match(component, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(component, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(component, /max-height: calc\(100dvh - 24px\)/)
  assert.match(component, /\.visual-url-modal__body\s*\{[\s\S]*?overflow-y: auto/)
  assert.match(component, /is-instagram/)
  assert.match(component, /is-xiaohongshu/)
  assert.match(component, /is-tiktok/)
  assert.match(component, /is-youtube/)
  assert.match(component, /#ff2442/)
  assert.match(component, /#25f4ee/)
  assert.match(component, /#fe2c55/)
  assert.match(component, /#ff0000/)
  assert.match(douyinLogo, /bytednsdoc\.com/)
  assert.match(douyinLogo, /#00FAF0/)
  assert.match(douyinLogo, /#FF0050/)
  assert.doesNotMatch(component, /logo-twitter/)
  assert.doesNotMatch(component, /visual-url-modal__platform-mark/)
  assert.doesNotMatch(component, /@enter=/)
  assert.match(component, /urlSupportedPlatforms/)
  assert.doesNotMatch(component, /knowledgeBase\.urlTip/)
  assert.doesNotMatch(component, /knowledgeBase\.urlInputHint/)
  assert.doesNotMatch(component, /knowledgeBase\.urlUsageNotice/)
})

test('URL import confirmation only enforces presence and the 4 KiB input limit', () => {
  assert.match(component, /const url = urlInputValue\.value\.trim\(\)/)
  assert.match(component, /new TextEncoder\(\)\.encode\(url\)\.length > 4096/)
  assert.match(component, /urlTooLong/)
  assert.doesNotMatch(component, /new URL\(url\)/)
  assert.doesNotMatch(component, /t\('knowledgeBase\.invalidURL'\)/)
  assert.match(component, /emit\('url', url\)/)
})

test('Add Document and link-share panels use explicit dark semantic surfaces', () => {
  assert.match(
    component,
    /:root\[theme-mode="dark"\] \.visual-upload-menu\s*\{[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/,
  )
  assert.match(
    component,
    /:root\[theme-mode="dark"\] \.visual-url-modal\s*\{[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/,
  )
  assert.match(
    component,
    /:root\[theme-mode="dark"\] \.visual-url-modal__footer\s*\{[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/,
  )
  assert.match(
    component,
    /:root\[theme-mode="dark"\] \.visual-url-modal__body :deep\(\.t-textarea__inner\)[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/,
  )
})

test('all shipped locales carry the actionable share-input labels', () => {
  for (const path of localeFiles) {
    const locale = readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.match(locale, /urlSupportedPlatforms:/)
    assert.match(locale, /urlClear:/)
    assert.match(locale, /urlTooLong:/)
    assert.match(locale, /douyinTikTok:/)
    assert.match(locale, /douyin:/)
  }
})
