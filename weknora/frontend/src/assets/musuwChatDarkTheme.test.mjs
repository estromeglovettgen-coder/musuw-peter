import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const finalTheme = readFileSync(new URL('./musuw-final-theme-closure.css', import.meta.url), 'utf8')
const reachableSurface = readFileSync(new URL('./musuw-reachable-surface-final.css', import.meta.url), 'utf8')
const composer = readFileSync(new URL('../components/Input-field.vue', import.meta.url), 'utf8')
const chatView = readFileSync(new URL('../views/chat/index.vue', import.meta.url), 'utf8')
const closureStart = finalTheme.indexOf('/* Chat dark contrast closure.')
const chatDark = closureStart >= 0 ? finalTheme.slice(closureStart) : ''

test('dark chat sidebar owns readable base, active and icon states', () => {
  assert.match(chatDark, /:root\[theme-mode="dark"\]\s*\{/)
  assert.match(chatDark, /\.visual-sidebar__primary\.is-kb[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/)
  assert.match(chatDark, /\.visual-session-row[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/)
  assert.match(chatDark, /\.visual-sidebar__primary\.is-kb[\s\S]*?\.visual-sidebar__kb-count[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/)
  assert.match(chatDark, /\.visual-session-row:hover[\s\S]*?background:\s*var\(--mvc-hover\)\s*!important;/)
  assert.match(chatDark, /\.visual-session-row\.is-active[\s\S]*?background:\s*var\(--mvc-active\)\s*!important;/)
  assert.match(chatDark, /\.visual-session-row \.t-icon[\s\S]*?color:\s*inherit\s*!important;/)
})

test('dark chat composer owns textarea caret, tool icons and send states', () => {
  assert.match(chatDark, /\.visual-chat-composer__textarea\s*\{[\s\S]*?color:\s*var\(--mvc-text\)\s*!important;[\s\S]*?caret-color:\s*var\(--mvc-text\)\s*!important;/)
  assert.match(chatDark, /\.visual-chat-composer__textarea::placeholder[\s\S]*?color:\s*var\(--mvc-faint\)\s*!important;/)
  assert.match(chatDark, /\.visual-chat-composer__tool[\s\S]*?color:\s*var\(--mvc-muted\)\s*!important;/)
  assert.match(chatDark, /\.visual-chat-composer__tool:hover[\s\S]*?color:\s*var\(--mvc-text-strong\)\s*!important;/)
  assert.match(chatDark, /\.visual-chat-composer__send\.is-disabled[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/)
  assert.match(chatDark, /\.visual-chat-composer__send:not\(\.is-disabled\):not\(:disabled\)[\s\S]*?background:\s*var\(--mvc-active\)\s*!important;/)
  assert.match(chatDark, /\.visual-chat-composer__send(?:\s+|\s*>\s*)\.t-icon[\s\S]*?color:\s*inherit\s*!important;/)
})

test('dark model picker keeps row values and option lock/selection states legible', () => {
  assert.match(chatDark, /\.visual-model-selector__chat-row-value[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/)
  assert.match(chatDark, /\.visual-model-selector__chat-row\.is-disabled \.visual-model-selector__chat-row-value[\s\S]*?color:\s*var\(--mvc-muted\)\s*!important;/)
  assert.match(chatDark, /\.visual-model-selector__chat-option-copy strong[\s\S]*?color:\s*inherit\s*!important;/)
  assert.match(chatDark, /\.visual-model-selector__chat-option\.is-selected[\s\S]*?background:\s*var\(--mvc-active\)\s*!important;/)
  assert.match(chatDark, /\.visual-model-selector__chat-option\.is-locked:hover[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/)
  assert.match(composer, /:root\[theme-mode="dark"\] \.visual-chat-composer__combined-picker\.is-open[\s\S]*?box-shadow:/)
  assert.match(finalTheme, /\.visual-model-selector__chat-panel,[\s\S]*?\.visual-model-selector__chat-flyout,[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
})

test('dark chat messages and rich markdown never reuse light text or white surfaces', () => {
  assert.match(chatDark, /\.visual-assistant-message[\s\S]*?color:\s*var\(--mvc-text\)\s*!important;/)
  assert.match(chatDark, /\.visual-user-message__bubble[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;[\s\S]*?color:\s*var\(--mvc-text\)\s*!important;/)
  assert.match(chatDark, /\.visual-assistant-resource[\s\S]*?\.visual-user-attachment[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/)
  assert.match(chatDark, /\.visual-thinking-panel__content[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/)
  assert.match(chatDark, /\.visual-assistant-markdown\s+:is\(p, li\)[\s\S]*?color:\s*var\(--mvc-text\)\s*!important;/)
  assert.match(chatDark, /\.answer-content\.markdown-content\s+:is\(p, li\)[\s\S]*?color:\s*var\(--mvc-text\)\s*!important;/)
  assert.match(chatDark, /\.answer-content\.markdown-content\s+\.chat-code-block[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(chatDark, /\.answer-content\.markdown-content\s+\.chat-markdown-table[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(chatDark, /\.visual-assistant-markdown\s+\.chat-code-block[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(chatDark, /\.visual-assistant-markdown\s+\.chat-markdown-table[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(chatDark, /\.visual-assistant-markdown\s+\.hljs-keyword[\s\S]*?color:\s*#ff7b72\s*!important;/)
})

test('dark chat header, request metadata and upload cards own every interactive state', () => {
  assert.match(chatDark, /\.visual-chat-header(?:,|\s*\{)[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(chatDark, /\.visual-chat-header__menu-button:hover:not\(:disabled\)[\s\S]*?background:\s*var\(--mvc-hover\)\s*!important;/)
  assert.match(chatDark, /\.visual-chat-header-menu-popup \.t-popup__content[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(chatDark, /\.visual-request-info-popup \.t-popup__content[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(chatDark, /\.visual-attachment-card[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/)
  assert.match(chatDark, /\.visual-attachment-card__remove:hover[\s\S]*?background:\s*var\(--mvc-hover\)\s*!important;/)
})

test('teleported feedback uses a dark surface in dark mode', () => {
  assert.match(reachableSurface, /:root\[theme-mode="dark"\] body \.t-message\s*\{[\s\S]*?background:\s*#18181b\s*!important;[\s\S]*?color:\s*#f4f4f5\s*!important;/)
})

test('chat no longer renders the obstructive floating scroll-to-bottom control', () => {
  assert.doesNotMatch(chatView, /visual-chat-scroll-bottom/)
  assert.doesNotMatch(chatView, /@click="onClickScrollToBottom"/)
})
