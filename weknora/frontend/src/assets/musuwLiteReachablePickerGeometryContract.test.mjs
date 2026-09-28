import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const kbSwitcher = read('../components/KBSwitcherDropdown.vue')
const folderPicker = read('../views/knowledge/components/FolderPickerMenu.vue')
const documentCard = read('../views/knowledge/components/DocumentCardView.vue')
const documentList = read('../views/knowledge/components/DocumentListView.vue')
const uploadConfirm = read('../views/knowledge/components/UploadConfirmDialog.vue')
const documentBatch = read('../views/knowledge/components/DocumentBatchBar.vue')
const themeCompatibility = read('./musuw-visual-preference-compat.css')
const finalTheme = read('./musuw-final-theme-closure.css')

const menuSources = [
  ['KBSwitcherDropdown', kbSwitcher],
  ['FolderPickerMenu', folderPicker],
  ['DocumentCardView move menu', documentCard],
  ['DocumentListView move menu', documentList],
]

const ruleBody = (source, selector) => {
  const selectorStart = source.indexOf(selector)
  assert.ok(selectorStart >= 0, `missing rule: ${selector}`)
  const openBrace = source.indexOf('{', selectorStart)
  assert.ok(openBrace > selectorStart, `missing rule body: ${selector}`)
  let depth = 0
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(openBrace + 1, index)
    }
  }
  assert.fail(`unterminated rule: ${selector}`)
}

test('Lite reachable custom pickers share the Settings panel geometry', () => {
  for (const [name, source] of menuSources) {
    const tokens = name.includes('move menu')
      ? [
        'width: 288px !important;',
        'max-width: min(288px, calc(100vw - 32px)) !important;',
        'max-height: 256px !important;',
        'padding: 6px !important;',
        'border-radius: 16px !important;',
      ]
      : [
        'width: 288px;',
        'max-width: min(288px, calc(100vw - 32px));',
        'max-height: 256px;',
        'padding: 6px;',
        'border-radius: 16px;',
      ]
    for (const token of [
      ...tokens,
      'min-height: 36px;',
      'padding: 8px 12px;',
      'border-radius: 12px;',
      '@media (min-width: 640px)',
      'font-size: 14px;',
      'line-height: 20px;',
    ]) assert.ok(source.includes(token), `${name} is missing canonical token: ${token}`)
  }
})

test('card and list move popups keep one painted shell and one scroll owner', () => {
  for (const [name, source, prefix] of [
    ['DocumentCardView', documentCard, 'visual-card-menu'],
    ['DocumentListView', documentList, 'visual-list-menu'],
  ]) {
    const inner = ruleBody(source, `.${prefix}--move {`)
    for (const token of [
      'width: 100%;',
      'max-width: none;',
      'max-height: none;',
      'padding: 0;',
      'border: 0;',
      'border-radius: 0;',
      'overflow: visible;',
    ]) assert.ok(inner.includes(token), `${name} move layout must be unpainted: ${token}`)
    assert.doesNotMatch(inner, /overflow-y\s*:/, `${name} move layout must not create a second scroll container`)

    const shell = source.slice(source.indexOf(`:global(.card-more .t-popup__content:has(> .${prefix}--move))`))
    for (const token of [
      'width: 288px !important;',
      'max-width: min(288px, calc(100vw - 32px)) !important;',
      'max-height: 256px !important;',
      'padding: 6px !important;',
      'border-radius: 16px !important;',
      'overflow-y: auto !important;',
      'overflow-x: hidden !important;',
      'background: #fff !important;',
      'box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%), 0 8px 10px -6px rgb(0 0 0 / 10%) !important;',
    ]) assert.ok(shell.includes(token), `${name} popup shell is missing canonical token: ${token}`)
    assert.match(shell, new RegExp(`:global\\(:root\\[theme-mode="dark"\\] body \\.card-more \\.t-popup__content:has\\(> \\.${prefix}--move\\)\\)`))
    assert.match(source, new RegExp(`\\.${prefix}--move :deep\\(\\.visual-folder-picker__list\\)\\s*\\{[\\s\\S]*?overflow: visible !important;`))
  }
})

test('standalone picker scrolls its list while nested move pickers flatten it', () => {
  assert.match(kbSwitcher, /\.visual-kb-switcher\s*\{[\s\S]*?overflow-y:\s*auto;/)
  assert.match(folderPicker, /\.visual-folder-picker\s*\{[\s\S]*?overflow:\s*hidden;/)
  assert.match(folderPicker, /\.visual-folder-picker__list\s*\{[\s\S]*?overflow-y:\s*auto;/)
  for (const [name, source, prefix] of [
    ['DocumentCardView', documentCard, 'visual-card-menu'],
    ['DocumentListView', documentList, 'visual-list-menu'],
  ]) {
    assert.match(source, new RegExp(`:global\\(\\.card-more \\.t-popup__content:has\\(> \\.${prefix}--move\\)\\)[\\s\\S]*?overflow-y:\\s*auto !important;`), `${name} shell should own scrolling`)
  }
})

test('FolderPickerMenu consumers leave the popup shell to the picker', () => {
  assert.match(uploadConfirm, /overlay-class-name="upload-destination-popup"/)
  assert.match(uploadConfirm, /<FolderPickerMenu[\s\S]*:options="pickerFolderOptions"/)
  const uploadPopup = uploadConfirm.slice(uploadConfirm.indexOf('.upload-destination-popup'))
  for (const token of [
    'z-index: 3100 !important;',
    'margin-top: 6px !important;',
    'padding: 0 !important;',
    'border: 0 !important;',
    'border-radius: 0 !important;',
    'background: transparent !important;',
    'box-shadow: none !important;',
  ]) assert.ok(uploadPopup.includes(token), `UploadConfirmDialog popup shell must be transparent: ${token}`)
  assert.doesNotMatch(uploadPopup, /padding:\s*[46]px\s*!important;/)
  assert.doesNotMatch(uploadPopup, /border-radius:\s*10px\s*!important;/)

  assert.match(documentBatch, /<t-popup[\s\S]*placement="top"[\s\S]*:overlay-inner-style="\{[\s\S]*padding: 0,[\s\S]*background: 'transparent',[\s\S]*boxShadow: 'none'/)
  assert.match(documentBatch, /<FolderPickerMenu[\s\S]*:options="folderOptions \|\| \[\]"[\s\S]*@confirm="handleFolderConfirm"/)
  assert.doesNotMatch(documentBatch, /:overlay-inner-style="\{\s*padding:\s*['"]6px['"]\s*\}/)
  assert.match(
    themeCompatibility,
    /\.t-popup__content[^\{]+:not\(:has\(\.visual-folder-picker\)\)\s*\{/,
    'the broad dark popup rule must not repaint the FolderPicker parent shell',
  )
  const standaloneDarkPicker = ruleBody(
    finalTheme,
    ':root[theme-mode="dark"] body .visual-folder-picker {',
  )
  for (const token of [
    'border-color: var(--mvc-line) !important;',
    'background: var(--mvc-surface) !important;',
    'box-shadow: var(--mvc-shadow) !important;',
  ]) assert.ok(standaloneDarkPicker.includes(token), `standalone dark picker must paint one shell: ${token}`)

  const nestedDarkPicker = ruleBody(
    finalTheme,
    ':root[theme-mode="dark"] body :is(.visual-list-menu--move, .visual-card-menu--move) > .visual-folder-picker {',
  )
  for (const token of [
    'border-color: transparent !important;',
    'background: transparent !important;',
    'box-shadow: none !important;',
  ]) assert.ok(nestedDarkPicker.includes(token), `nested dark picker must leave the shell to its parent: ${token}`)
})

test('fixed labels stay intact while resource names are allowed to ellipsize', () => {
  for (const [name, source, prefix] of [
    ['FolderPickerMenu', folderPicker, 'visual-folder-picker'],
    ['DocumentCardView', documentCard, 'visual-card-menu'],
    ['DocumentListView', documentList, 'visual-list-menu'],
  ]) {
    assert.match(source, new RegExp(`\\.${prefix}__back span\\s*\\{[\\s\\S]*?overflow:\\s*visible;[\\s\\S]*?text-overflow:\\s*clip;[\\s\\S]*?white-space:\\s*nowrap;`), `${name} back label must not ellipsize`)
  }
  for (const [name, source, selectors] of [
    ['KBSwitcherDropdown', kbSwitcher, ['visual-kb-switcher__name']],
    ['FolderPickerMenu', folderPicker, ['visual-folder-picker__name']],
    ['DocumentCardView', documentCard, ['visual-card-menu__target-name', 'visual-card-menu__destination-name']],
    ['DocumentListView', documentList, ['visual-list-menu__target-name', 'visual-list-menu__destination-name']],
  ]) {
    for (const selector of selectors) {
      assert.match(source, new RegExp(`\\.${selector}(?:\\s*,[\\s\\S]*?)?\\s*\\{[\\s\\S]*?min-width:\\s*0;[\\s\\S]*?text-overflow:\\s*ellipsis;[\\s\\S]*?white-space:\\s*nowrap;`), `${name} dynamic name must ellipsize`)
    }
  }
})

test('move picker wiring remains scoped to the existing Lite menu states', () => {
  for (const [name, source] of [
    ['DocumentCardView', documentCard],
    ['DocumentListView', documentList],
  ]) {
    for (const event of ['move-back', 'move-select-target', 'move-confirm', 'update:moveMode']) {
      assert.ok(source.includes(`emit('${event}'`), `${name} lost existing move event: ${event}`)
    }
  }
  assert.match(kbSwitcher, /emit\('select', id\)/)
  for (const [name, source] of menuSources) {
    assert.doesNotMatch(source, /visual-chat-composer|TenantSelector|share-org-select-popup|sandbox-config-select-popup/, `${name} must not absorb excluded picker surfaces`)
  }
})
