import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const finalTheme = readFileSync(new URL('./musuw-final-theme-closure.css', import.meta.url), 'utf8')
const documentActions = readFileSync(new URL('../views/knowledge/components/DocumentActionMenu.vue', import.meta.url), 'utf8')
const documentList = readFileSync(new URL('../views/knowledge/components/DocumentListView.vue', import.meta.url), 'utf8')
const documentCard = readFileSync(new URL('../views/knowledge/components/DocumentCardView.vue', import.meta.url), 'utf8')
const folderPicker = readFileSync(new URL('../views/knowledge/components/FolderPickerMenu.vue', import.meta.url), 'utf8')

test('dark body exports semantic TDesign colors to teleported overlays', () => {
  assert.match(finalTheme, /:root\[theme-mode="dark"\] body\s*\{[\s\S]*?--td-bg-color-container:\s*var\(--mvc-surface\);/)
  assert.match(finalTheme, /:root\[theme-mode="dark"\] body\s*\{[\s\S]*?--td-text-color-primary:\s*var\(--mvc-text\);/)
})

test('dark session menus and document drawers own their portal surfaces', () => {
  assert.match(finalTheme, /:root\[theme-mode="dark"\] body \.visual-session-menu-popup \.t-popup__content[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(finalTheme, /:root\[theme-mode="dark"\] body \.doc-main-drawer\.t-drawer > \.t-drawer__content-wrapper[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(finalTheme, /\.doc-main-drawer \.t-drawer__body[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(finalTheme, /\.visual-shared-detail > footer button[\s\S]*?background:\s*var\(--mvc-surface-raised\)\s*!important;/)
})

test('dark selects use readable arrows, checks and custom selector surfaces', () => {
  assert.match(finalTheme, /:root\[theme-mode="dark"\] body \.t-select \.t-fake-arrow[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/)
  assert.match(finalTheme, /\.visual-knowledge-select-popup \.t-select-option\.t-is-selected::after[\s\S]*?background:\s*var\(--mvc-text-strong\)\s*!important;/)
  assert.match(finalTheme, /\.visual-kb-selector,[\s\S]*?\.visual-session-filter__panel[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(finalTheme, /\.visual-kb-switcher__row:hover,[\s\S]*?\.visual-session-filter__option:hover[\s\S]*?background:\s*var\(--mvc-hover\)\s*!important;/)
})

test('dark navigation, directory and batch actions never flash a light surface', () => {
  assert.match(finalTheme, /\.visual-sidebar__mark img,[\s\S]*?\.visual-sidebar__collapsed-logo img[\s\S]*?filter:\s*invert\(1\)/)
  assert.match(finalTheme, /\.visual-folder-tree__collapsed-trigger:hover,[\s\S]*?\.visual-folder-tree__collapse:hover[\s\S]*?background:\s*transparent\s*!important;/)
  assert.match(finalTheme, /\.visual-document-batch\s*\{[\s\S]*?background:\s*var\(--mvc-surface\)\s*!important;/)
  assert.match(finalTheme, /\.visual-document-batch__button:hover:not\(:disabled\)[\s\S]*?background:\s*var\(--mvc-hover\)\s*!important;/)
})

test('dark document action menus own the real list and shared action classes', () => {
  assert.match(documentList, /overlay-class-name="card-more"/)
  assert.match(documentList, /class="visual-list-menu/)
  assert.match(documentCard, /class="visual-card-menu/)
  assert.match(folderPicker, /class="visual-folder-picker"/)
  assert.match(documentActions, /class="visual-document-actions"/)
  assert.match(documentActions, /class="visual-document-actions__item is-danger"/)
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body \.visual-list-menu,\s*:root\[theme-mode="dark"\] body \.visual-card-menu,\s*:root\[theme-mode="dark"\] body \.visual-document-actions\s*\{[^}]*background:\s*transparent\s*!important;[^}]*color:\s*var\(--mvc-muted-strong\)\s*!important;[^}]*box-shadow:\s*none\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body \.visual-document-actions__item\s*\{[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?color:\s*var\(--mvc-muted-strong\)\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body \.visual-document-actions__item:hover,\s*:root\[theme-mode="dark"\] body \.visual-list-menu__back:hover,\s*:root\[theme-mode="dark"\] body \.visual-list-menu__target:hover,\s*:root\[theme-mode="dark"\] body \.visual-card-menu__back:hover,\s*:root\[theme-mode="dark"\] body \.visual-card-menu__target:hover\s*\{[^}]*background:\s*var\(--mvc-hover\)\s*!important;[^}]*color:\s*var\(--mvc-text-strong\)\s*!important;/,
  )
  assert.match(finalTheme, /:root\[theme-mode="dark"\] body \.visual-document-actions__item\.is-danger::before\s*\{[^}]*background:\s*var\(--mvc-line\)\s*!important;/)
  assert.match(finalTheme, /:root\[theme-mode="dark"\] body \.visual-document-actions__item\.is-danger:hover\s*\{[^}]*background:\s*rgb\(248 81 73 \/ 14%\)\s*!important;[^}]*color:\s*#ff938a\s*!important;/)
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body \.visual-card-menu__state,\s*:root\[theme-mode="dark"\] body \.visual-card-menu__target-count,\s*:root\[theme-mode="dark"\] body \.visual-card-menu__mode small\s*\{[^}]*color:\s*var\(--mvc-muted\)\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body \.visual-list-menu__destination,\s*:root\[theme-mode="dark"\] body \.visual-list-menu__mode,\s*:root\[theme-mode="dark"\] body \.visual-card-menu__destination,\s*:root\[theme-mode="dark"\] body \.visual-card-menu__mode\s*\{[^}]*border-color:\s*var\(--mvc-line\)\s*!important;[^}]*background:\s*var\(--mvc-surface-raised\)\s*!important;/,
  )
  assert.match(finalTheme, /:root\[theme-mode="dark"\] body \.visual-card-menu__mode strong\s*\{[^}]*color:\s*var\(--mvc-text-strong\)\s*!important;/)
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body :is\(\.visual-list-menu, \.visual-card-menu\) \.t-radio\.t-is-checked \.t-radio__input::after\s*\{[^}]*background-color:\s*var\(--mvc-text-strong\)\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root:not\(\[theme-mode="dark"\]\) body :is\(\.visual-list-menu, \.visual-card-menu\) \.t-radio\.t-is-checked \.t-radio__input::after\s*\{[^}]*background-color:\s*#111827\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root:not\(\[theme-mode="dark"\]\) body :is\(\.visual-document-list, \.visual-document-card, \.visual-document-batch\) \.t-checkbox\.t-is-checked \.t-checkbox__input\s*\{[^}]*background-color:\s*#111827\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body :is\(\.visual-list-menu, \.visual-card-menu\) \.t-loading\s*\{[^}]*color:\s*var\(--mvc-muted\)\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body \.visual-folder-picker__row:hover\s*\{[^}]*background:\s*var\(--mvc-hover\)\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body \.visual-folder-picker__input\s*\{[^}]*border-color:\s*var\(--mvc-line\)\s*!important;[^}]*background:\s*var\(--mvc-surface-raised\)\s*!important;[^}]*color:\s*var\(--mvc-text\)\s*!important;/,
  )
})
