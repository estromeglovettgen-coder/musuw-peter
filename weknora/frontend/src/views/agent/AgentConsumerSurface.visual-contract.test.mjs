import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const list = readFileSync(new URL('./AgentList.vue', import.meta.url), 'utf8')
const editor = readFileSync(new URL('./AgentEditorModal.vue', import.meta.url), 'utf8')
const settings = readFileSync(new URL('../settings/Settings.vue', import.meta.url), 'utf8')
const settingsShell = readFileSync(new URL('../settings/components/VisualSettingsShell.vue', import.meta.url), 'utf8')
const nativeDirectoryStyles = readFileSync(new URL('../../assets/musuw-native-directory-reference.css', import.meta.url), 'utf8')
const finalTheme = readFileSync(new URL('../../assets/musuw-final-theme-closure.css', import.meta.url), 'utf8')

test('consumer Agent list preserves native CRUD while matching the compact reference surface', () => {
  for (const token of [
    'handleCreateAgent',
    'handleEdit(agent)',
    'handleCopy(agent)',
    'handleDelete(agent)',
    'handleCardClick(agent)',
    'class="agents-panel__search"',
    'class="agents-panel__title-icon"',
    '<t-icon name="add"',
    "$t('agent.searchPlaceholder')",
    "$t('agent.newAgent')",
    '<t-icon class="more-icon" name="ellipsis"',
    'agent-card-skeleton',
    'border-radius: 12px',
    'padding: 18px',
    ':root[theme-mode="dark"] .agent-list-container',
    ':root[theme-mode="dark"] .agent-list-content > .header',
    'background: var(--mvc-page, #151619) !important',
    'box-shadow: var(--mvc-shadow) !important',
  ]) assert.ok(list.includes(token), `Agent list contract lost ${token}`)
  assert.doesNotMatch(list, /class="sparkles-icon"/)
  assert.match(list, /\.agents-panel__header\s*\{[\s\S]*?padding-bottom:\s*20px;[\s\S]*?border-bottom:\s*1px solid #e5e7eb;/)
  assert.match(list, /\.agents-panel__search\s*\{[\s\S]*?width:\s*224px;[\s\S]*?border-radius:\s*12px;[\s\S]*?background:\s*#fff;/)
  assert.match(list, /\.agent-create-header-btn\s*\{[\s\S]*?border-radius:\s*12px !important;[\s\S]*?background:\s*#111827 !important;/)
  assert.match(list, /:root\[theme-mode="dark"\] \.agents-panel__search\s*\{[\s\S]*?border-color:\s*#3f3f46;[\s\S]*?background:\s*#27272a;/)
  assert.match(list, /:root\[theme-mode="dark"\] \.agent-create-header-btn,[\s\S]*?\{[\s\S]*?border-color:\s*#f4f4f5 !important;[\s\S]*?background:\s*#f4f4f5 !important;[\s\S]*?color:\s*#18181b !important;/)
  assert.doesNotMatch(list, /handleToggle(?:Shared)?Disabled/)
  assert.doesNotMatch(list, /setSharedAgentDisabledByMe/)
  assert.doesNotMatch(list, /agent-card-meta|agentModelLabel/, 'Agent cards must not expose their internal model ID')
  assert.match(nativeDirectoryStyles, /\.agent-card \.card-bottom,[\s\S]*?min-height:\s*20px !important;/)
  assert.match(nativeDirectoryStyles, /\.agent-card \.more-wrap,[\s\S]*?width:\s*24px !important;[\s\S]*?height:\s*24px !important;[\s\S]*?padding:\s*4px !important;[\s\S]*?box-sizing:\s*border-box !important;/)
  assert.match(nativeDirectoryStyles, /\.agent-card \.card-header,[\s\S]*?min-height:\s*24px !important;/)
  assert.match(nativeDirectoryStyles, /\.agent-card \.builtin-avatar,[\s\S]*?width:\s*24px !important;[\s\S]*?height:\s*24px !important;/)
  assert.match(nativeDirectoryStyles, /\.agent-card \.card-content,[\s\S]*?margin:\s*6px 0 0 !important;/)
  assert.match(list, /const fetchList = \(force = false\) => \{[\s\S]*?return Promise\.all\(\[[\s\S]*?\]\)\.finally\(\(\) => \{ loading\.value = false \}\)\.then\(\(\) => \{/)
  assert.doesNotMatch(list, /loadError|retryFetchList|agent-list-error/)
  assert.doesNotMatch(list, /@\/assets\/img\/more\.png/)
  assert.match(list, /\.agent-section-header\s*\{[\s\S]*?position:\s*static;/)
  assert.doesNotMatch(list, /\.agent-card\s*\{[\s\S]{0,900}linear-gradient/, 'consumer cards must not keep the decorative gradient')
  assert.match(
    nativeDirectoryStyles,
    /:root\[theme-mode="dark"\] \.agent-card:hover\s*\{[\s\S]*?border-color:\s*var\(--mvc-line-strong, #484c54\) !important;[\s\S]*?background:\s*var\(--mvc-hover, #25272c\) !important;[\s\S]*?box-shadow:\s*var\(--mvc-shadow\) !important;/,
    'Agent hover must reuse the KnowledgeBase dark surface tokens and shadow',
  )
  assert.match(
    list,
    /:root\[theme-mode="dark"\] \.agent-card:hover\s*\{[^}]*background:\s*var\(--mvc-hover, #25272c\) !important;[^}]*border-color:\s*var\(--mvc-line-strong, #484c54\) !important;[^}]*box-shadow:\s*var\(--mvc-shadow\) !important;/,
    'the component-level dark rule must keep the shared KnowledgeBase hover treatment',
  )
  assert.match(
    list,
    /:root\[theme-mode="dark"\] \.agent-list-content \.agents-panel__title-icon\s*\{[^}]*color:\s*var\(--mvc-text-strong, #fff\) !important;/,
    'Agent title icon must use the shared strong-text token in dark mode',
  )
  assert.match(
    list,
    /const showShareGroupHeaders = computed\(\(\) => !authStore\.isLiteMode\)/,
    'Lite must keep the same first-card origin as KnowledgeBase while Standard retains grouping',
  )
})

test('Agent delete confirmation uses the shared TDesign confirmation surface', () => {
  assert.match(list, /dialog-class-name="visual-confirm-dialog"/)
  assert.match(list, /<button type="button" class="circle-btn-txt"[\s\S]*?common\.cancel/)
  assert.match(list, /<button type="button" class="circle-btn-txt confirm"[\s\S]*?confirmDelete/)
  assert.doesNotMatch(list, /del-agent-dialog/)
  assert.doesNotMatch(list, /<span class="circle-btn-txt"/)
  assert.doesNotMatch(list, /:deep\(\.del-agent-dialog\)/)
  assert.match(
    nativeDirectoryStyles,
    /body \.t-dialog\.visual-confirm-dialog,[\s\S]*?body \.t-dialog\.visual-kb-delete-dialog\s*\{[\s\S]*?border-radius:\s*16px !important;/,
  )
  assert.match(nativeDirectoryStyles, /body \.t-dialog\.visual-confirm-dialog \.circle-btn-txt,[\s\S]*?body \.t-dialog\.visual-kb-delete-dialog \.visual-kb-delete footer button\s*\{[\s\S]*?min-height:\s*32px !important;[\s\S]*?border-radius:\s*10px !important;/)
  assert.doesNotMatch(nativeDirectoryStyles, /body \.t-dialog\.del-org-dialog/)
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] body \.t-dialog\.visual-confirm-dialog,[\s\S]*?body \.t-dialog\.visual-kb-delete-dialog\s*\{[\s\S]*?background:\s*var\(--mvc-surface\) !important;/,
  )
})

test('Settings and Agent editor render the same shared visual shell while Agent keeps native save fields', () => {
  for (const token of [
    'handleSave',
    'createAgent',
    'updateAgent',
    '<VisualSettingsShell',
    'class="visual-settings-nav__item"',
    'role="tablist"',
    'role="tab"',
    '@keydown.enter.prevent',
    '@keydown.space.prevent',
    'data-agent-hidden-field="agent-id"',
    'data-agent-hidden-field="integrations"',
    ':root[theme-mode="dark"] .agent-editor-modal',
    'background: #27272a !important',
  ]) assert.ok(editor.includes(token), `Agent editor contract lost ${token}`)
  assert.match(settings, /import VisualSettingsShell from '.\/components\/VisualSettingsShell\.vue'/)
  assert.match(settings, /<VisualSettingsShell[\s\S]*?<template #nav>/)
  assert.match(editor, /import VisualSettingsShell from '@\/views\/settings\/components\/VisualSettingsShell\.vue'/)
  assert.doesNotMatch(editor, /class="settings-overlay"|class="settings-modal agent-editor-modal"|class="nav-icon"/)

  for (const token of [
    'class="visual-settings-overlay"',
    'class="visual-settings-modal"',
    'class="visual-settings-sidebar"',
    'class="visual-settings-close-wrap"',
    'class="visual-settings-close"',
    'class="visual-settings-nav"',
    'class="visual-settings-content"',
    'class="visual-settings-content__inner"',
    'class="visual-settings-footer"',
    'width: min(896px, 100%)',
    '@media (min-width: 1024px)',
    'width: min(1024px, 100%)',
    'height: 620px',
    'flex: 0 0 192px',
    'padding: 32px',
    ':root[theme-mode="dark"] .visual-settings-sidebar',
    'background: rgb(9 9 11 / 60%)',
    'background: #18181b',
  ]) assert.ok(settingsShell.includes(token), `shared Settings shell contract lost ${token}`)
})

test('Agent mode keeps its compact toggle while scope choices use bounded settings selects', () => {
  assert.match(editor, /<t-radio-group[^>]*class="agent-segmented-control"[^>]*v-model="agentMode"/)
  assert.match(editor, /<t-radio-group[^>]*class="agent-segmented-control"[^>]*v-model="formData\.config\.fallback_strategy"/)
  assert.match(editor, /<div class="setting-control agent-scope-select-control">[\s\S]*?<t-select[^>]*v-model="kbSelectionMode"/)
  assert.match(editor, /<div class="setting-control agent-scope-select-control">[\s\S]*?<t-select[^>]*v-model="mcpSelectionMode"/)
  assert.match(editor, /<div class="setting-control agent-scope-select-control sandbox-select-control">[\s\S]*?<t-select[^>]*v-model="skillsSelectionMode"/)
  assert.equal((editor.match(/agent-segmented-control--scope/g) || []).length, 0)
  assert.match(editor, /\.agent-segmented-control\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?padding:\s*4px;[\s\S]*?border-radius:\s*12px;/)
  assert.match(editor, /\.agent-segmented-control :deep\(\.t-radio-button\)\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?padding:\s*6px 14px;[\s\S]*?border-radius:\s*8px;[\s\S]*?font-size:\s*12px;/)
  assert.match(editor, /\.agent-scope-select-control\s*\{[\s\S]*?flex:\s*0 1 280px;/)
  assert.match(editor, /\.setting-row\s*\{[\s\S]*?display:\s*flex !important;[\s\S]*?gap:\s*16px !important;/)
  assert.match(editor, /label\s*\{[\s\S]*?font-size:\s*14px !important;[\s\S]*?line-height:\s*20px !important;[\s\S]*?font-weight:\s*600 !important;/)
  assert.match(editor, /\.setting-control\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?max-width:\s*280px !important;/)
  assert.match(editor, /&\.setting-row-vertical\s*\{[\s\S]*?flex-direction:\s*column;/)
})

test('the final visual owner preserves authoritative Agent segmented, switch and footer colors', () => {
  assert.match(
    finalTheme,
    /\.agent-editor-modal \.agent-segmented-control\s*\{[^}]*border-color:\s*rgb\(229 231 235 \/ 60%\)\s*!important;[^}]*background:\s*#f3f4f6\s*!important;/,
  )
  assert.match(
    finalTheme,
    /\.agent-editor-modal \.agent-segmented-control \.t-radio-button\.t-is-checked\s*\{[^}]*background:\s*#fff\s*!important;[^}]*color:\s*#111827\s*!important;[^}]*box-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 5%\)\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] \.agent-editor-modal \.agent-segmented-control\s*\{[^}]*border-color:\s*rgb\(63 63 70 \/ 60%\)\s*!important;[^}]*background:\s*#27272a\s*!important;/,
  )
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] \.agent-editor-modal \.agent-segmented-control \.t-radio-button\.t-is-checked\s*\{[^}]*background:\s*#3f3f46\s*!important;[^}]*color:\s*#fff\s*!important;/,
  )
  assert.match(finalTheme, /:root\[theme-mode="dark"\] \.agent-editor-modal \.t-switch\.t-is-checked\s*\{[^}]*background:\s*#f4f4f5\s*!important;/)
  assert.match(finalTheme, /:root\[theme-mode="dark"\] \.agent-editor-modal \.t-switch\s*\{[^}]*background:\s*#3f3f46\s*!important;/)
  assert.match(finalTheme, /:root\[theme-mode="dark"\] \.agent-editor-modal \.t-switch \.t-switch__handle::before\s*\{[^}]*background:\s*#a1a1aa\s*!important;/)
  assert.match(finalTheme, /:root\[theme-mode="dark"\] \.agent-editor-modal \.t-switch\.t-is-checked \.t-switch__handle::before\s*\{[^}]*background:\s*#18181b\s*!important;/)
  assert.match(finalTheme, /\.agent-editor-modal \.t-switch\s*\{[^}]*width:\s*44px\s*!important;[^}]*min-width:\s*44px\s*!important;[^}]*height:\s*24px\s*!important;[^}]*transition:\s*background-color 200ms ease-in-out, border-color 200ms ease-in-out\s*!important;/)
  assert.match(
    finalTheme,
    /\.agent-editor-modal \.t-switch \.t-switch__handle,\s*\.agent-editor-modal \.t-switch\.t-is-checked \.t-switch__handle\s*\{[^}]*width:\s*20px\s*!important;[^}]*height:\s*20px\s*!important;/,
  )
  assert.match(finalTheme, /\.agent-editor-modal \.t-switch \.t-switch__handle\s*\{[^}]*box-shadow:\s*0 1px 3px rgb\(0 0 0 \/ 10%\),\s*0 1px 2px rgb\(0 0 0 \/ 6%\)\s*!important;[^}]*transition:\s*transform 200ms ease-in-out\s*!important;/)
  assert.match(finalTheme, /\.agent-editor-modal \.t-switch\.t-is-checked \.t-switch__handle\s*\{[^}]*transform:\s*translateX\(20px\)\s*!important;/)
  assert.match(
    finalTheme,
    /:root\[theme-mode="dark"\] \.agent-editor-modal \.settings-footer-actions \.t-button--theme-primary\s*\{[^}]*border-color:\s*#f4f4f5\s*!important;[^}]*background:\s*#f4f4f5\s*!important;[^}]*color:\s*#18181b\s*!important;/,
  )
  assert.match(
    finalTheme,
    /\.agent-editor-modal \.settings-footer-actions \.t-button\s*\{[^}]*height:\s*34px\s*!important;[^}]*min-height:\s*34px\s*!important;[^}]*border-radius:\s*12px\s*!important;[^}]*font-size:\s*12px\s*!important;/,
  )
  assert.match(finalTheme, /\.agent-editor-modal \.settings-footer-actions \.t-button--theme-primary\s*\{[^}]*padding-inline:\s*20px\s*!important;[^}]*box-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 5%\)\s*!important;/)
  assert.match(finalTheme, /\.agent-editor-modal \.settings-footer-actions \.t-button--variant-outline\s*\{[^}]*font-weight:\s*500\s*!important;[^}]*box-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 5%\)\s*!important;/)
  assert.match(finalTheme, /\.agent-editor-modal \.settings-footer-actions \.t-button--theme-primary:hover\s*\{[^}]*background:\s*#000\s*!important;/)
  assert.match(finalTheme, /:root\[theme-mode="dark"\] \.agent-editor-modal \.settings-footer-actions \.t-button--variant-outline\s*\{[^}]*color:\s*#d4d4d8\s*!important;/)
  assert.match(finalTheme, /:root\[theme-mode="dark"\] \.agent-editor-modal \.settings-footer-actions \.t-button--variant-outline:hover\s*\{[^}]*background:\s*#27272a\s*!important;/)
  assert.match(
    finalTheme,
    /\.agent-editor-modal \.agent-segmented-control \.t-radio-button\s*\{[^}]*padding:\s*6px 14px\s*!important;/,
  )
  assert.match(
    finalTheme,
    /\.agent-editor-modal \.agent-segmented-control\[data-guide="agent-create-mode"\] \.t-radio-button\s*\{[^}]*padding-inline:\s*16px\s*!important;/,
  )
  assert.match(editor, /\.agent-segmented-control\[data-guide="agent-create-mode"\] :deep\(\.t-radio-button\)\s*\{[^}]*padding-inline:\s*16px;/)
  assert.match(editor, /\.agent-segmented-control :deep\(\.t-radio-button\)\s*\{[^}]*padding:\s*6px 14px;/)
})

test('authoritative workspace 7 basic tab uses full-width counted name and description fields', () => {
  assert.match(editor, /class="setting-row setting-row--basic-name"/)
  assert.match(editor, /class="setting-row__heading"[\s\S]*?class="setting-row__counter"[\s\S]*?\{\{ formData\.name\.length \}\}\/50/)
  assert.match(editor, /v-model="formData\.name"[\s\S]*?:maxlength="50"/)
  assert.match(editor, /class="setting-row setting-row--basic-description"/)
  assert.match(editor, /v-model="formData\.description"[\s\S]*?:maxlength="200"/)
  assert.doesNotMatch(
    editor,
    /setting-row--basic-description[\s\S]{0,500}formData\.description\.length/,
    'the textarea already renders its maxlength counter and must not duplicate it in the row heading',
  )
  assert.match(editor, /\.setting-row--basic-name,[\s\S]*?\.setting-row--basic-description\s*\{[\s\S]*?flex-direction:\s*column;/)
  assert.match(
    editor,
    /\.setting-row--basic-name\s*>\s*\.setting-control-full,[\s\S]*?\.setting-row--basic-description\s*>\s*\.setting-control-full\s*\{[\s\S]*?flex:\s*0 0 auto !important;/,
    'vertical full-width controls must not interpret the shared 280px horizontal basis as height',
  )
  assert.match(editor, /\.settings-footer-actions :deep\(\.t-button--theme-primary\)\s*\{[\s\S]*?background:\s*#111827 !important;/)
  const footer = editor.match(/<template #footer>[\s\S]*?<\/template>/)?.[0] || ''
  const primary = footer.match(/<t-button v-if="!props\.readOnly"[\s\S]*?<\/t-button>/)?.[0] || ''
  assert.ok(primary, 'expected the authoritative primary action')
  assert.doesNotMatch(primary, /<t-icon|#icon|check/)
})

test('hidden legacy editor sections cannot leave the authoritative shell on a blank panel', () => {
  assert.match(
    editor,
    /const EDITOR_VISIBLE_SECTIONS = new Set\(\[[\s\S]*?'basic'[\s\S]*?'knowledge'[\s\S]*?'prompts'[\s\S]*?'conversation'[\s\S]*?'retrieval'[\s\S]*?'websearch'[\s\S]*?'multimodal'[\s\S]*?'skills'[\s\S]*?'share'[\s\S]*?'suggestions'[\s\S]*?'tools'[\s\S]*?'mcp'/,
  )
  assert.match(
    editor,
    /const LITE_EDITOR_VISIBLE_SECTIONS = new Set\(\['basic', 'knowledge', 'prompts', 'mcp'\]\)/,
  )
  assert.match(
    editor,
    /if \(authStore\.isLiteMode\) \{[\s\S]*?if \(isAgentMode\.value\) \{[\s\S]*?key: 'mcp'[\s\S]*?return items;/,
  )
  assert.match(
    editor,
    /const visibleSections = authStore\.isLiteMode\s*\?\s*LITE_EDITOR_VISIBLE_SECTIONS\s*:\s*EDITOR_VISIBLE_SECTIONS/,
  )
  assert.match(editor, /const currentSection = ref\((?:normalizeEditorSection|resolveEditorSection)\(props\.initialSection\)\)/)
  assert.match(editor, /currentSection\.value = (?:normalizeEditorSection|resolveEditorSection)\(props\.initialSection\)/)
  assert.doesNotMatch(editor, /currentSection\.value = 'multimodal'/)
})
