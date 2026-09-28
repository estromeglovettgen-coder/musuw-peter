import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const expectTokens = (path, tokens) => {
  const source = read(path)
  for (const token of tokens) assert.ok(source.includes(token), `${path} drifted from reference-source token: ${token}`)
}

test('Sidebar.tsx source tokens remain mechanically translated', () => {
  expectTokens('../components/menu.vue', [
    'width: 256px;', 'min-width: 256px;', 'padding: 12px;', 'background: #fbfbfb;',
    'width: 56px;', 'min-width: 56px;', 'Musuw 穆苏瓦',
    'border-radius: 12px;', 'font-size: 13px;',
  ])
  expectTokens('../components/SessionSidebarRow.vue', [
    'padding: 6px 10px;', 'border-radius: 8px;', 'font-size: 12.5px;',
  ])
  expectTokens('../components/UserMenu.vue', [
    'border-radius: 12px;', 'width: 30px;', 'height: 30px;', 'font-size: 12px;', 'font-size: 10px;',
  ])
})

test('QAPanel.tsx composer tokens remain mechanically translated', () => {
  expectTokens('../components/Input-field.vue', [
    'padding: 16px;', 'border-radius: 20px;', 'background: #f4f5f7;',
    'min-height: 44px !important;', 'max-height: 180px !important;', 'font-size: 15px;',
    'gap: 12px;', 'gap: 16px;', 'width: 18px;', 'height: 18px;',
    'width: 32px;', 'height: 32px;', 'border-radius: 8px;',
  ])
  expectTokens('../components/Input-field.vue', [
    'width: min(224px, calc(100vw - 32px));', 'transform-origin: bottom right;',
    'translate(8px, 3px) scale(.96)', 'translate(6px, 2px) scale(.97)',
  ])
  expectTokens('./musuw-qapanel-reference-final.css', [
    '--mvc-icon-at-sign', 'width: 256px !important;', 'border-radius: 12px !important;',
  ])
})

test('QAPanel.tsx message stream tokens remain mechanically translated', () => {
  expectTokens('../views/chat/index.vue', [
    'width: min(768px,100%);', 'gap: 32px;', 'padding-bottom: 16px;',
    'padding: 58px 16px 24px;',
  ])
  expectTokens('../views/chat/components/usermsg.vue', [
    'max-width: 85%;', 'padding: 10px 18px;', 'border-radius: 18px;', 'background: #f4f4f4;', 'font-size: 14.5px;',
  ])
  expectTokens('../views/chat/components/botmsg.vue', [
    'font-size: 14.5px;', 'gap: 6px;', 'padding-top: 6px;', 'opacity: 0;', 'font-size: 16px;',
  ])
  expectTokens('../views/chat/components/deepThink.vue', [
    'margin-left: -6px;', 'padding: 4px 6px;', 'border-radius: 8px;', 'font-size: 12px;',
  ])
  expectTokens('../views/chat/components/RagPipelineProgress.vue', [
    'gap: 14px;', 'padding: 0 0 14px;', 'width: 16px;', 'height: 16px;', 'font-size: 12.5px;', 'font-size: 11px;',
  ])
  expectTokens('../components/css/chat-citations.less', [
    'padding: 2px 6px;', 'border-radius: 6px;', 'font-size: 10px;',
  ])
})

test('KnowledgeBase.tsx and DocumentListView.tsx tokens remain mechanically translated', () => {
  expectTokens('../views/knowledge/components/knowledge-base-layout.less', [
    'padding: 20px 28px;', 'gap: 20px;', 'padding-bottom: 16px;',
    'padding: 4px;', 'border-radius: 12px;', 'padding: 6px 14px;', 'font-size: 12px;',
  ])
  expectTokens('../views/knowledge/KnowledgeBase.vue', [
    'padding: 10px;', 'border-radius: 16px;', 'padding: 4px 10px;',
  ])
  expectTokens('../views/knowledge/components/KbFolderTree.vue', [
    'flex-basis: 48px;', 'width: 48px;', 'flex: 0 0 224px;', 'width: 224px;',
  ])
  expectTokens('../views/knowledge/components/DocumentCardView.vue', [
    'height: 192px;', 'padding: 16px;', 'border-radius: 16px;',
    'font-size: 12px;', 'font-size: 11px;', 'font-size: 10px;',
  ])
  expectTokens('./musuw-document-list-reference-final.css', [
    '@media (min-width: 640px)', 'repeat(2, minmax(0, 1fr)) !important',
    '@media (min-width: 768px)', 'repeat(3, minmax(0, 1fr)) !important',
    '@media (min-width: 1024px)', 'repeat(4, minmax(0, 1fr)) !important',
    'border-radius: 16px !important', 'flex: 0 0 32px !important',
  ])
})

test('SourcesPanel.tsx tokens remain mechanically translated', () => {
  expectTokens('../components/ChatReferencesDrawer.vue', [
    'padding: 14px 16px;', 'font-size: 14px;', 'padding: 14px;',
    'padding: 12px;', 'border-radius: 12px;', 'font-size: 12px;', 'font-size: 11px;',
    'border-color: #3b82f6;',
  ])
})

test('KnowledgeBase.tsx list tokens remain mechanically translated while native scopes stay wired', () => {
  expectTokens('../views/knowledge/KnowledgeBaseList.vue', [
    'padding: 24px;', 'gap: 18px;', 'padding-bottom: 20px;', 'font-size: 20px;',
    'grid-template-columns: repeat(2,minmax(0,1fr));', 'grid-template-columns: repeat(3,minmax(0,1fr));',
    '<ListSpaceSidebar', 'v-model="spaceSelection"',
  ])
  expectTokens('../views/knowledge/components/KnowledgeBaseListReferenceCard.vue', [
    'padding: 18px;', 'border-radius: 12px;',
    'font-size: 14px;', 'font-size: 12px;', 'font-size: 11px;',
    'visual-reference-kb-card__pinned',
  ])
  const card = read('../views/knowledge/components/KnowledgeBaseListReferenceCard.vue')
  assert.equal(card.includes('min-height: 154px;'), true, 'KB cards define the shared Agent/KB minimum height')
})

test('SettingsModal.tsx remains the accepted mechanical-reference sample', () => {
  expectTokens('../views/settings/components/VisualSettingsShell.vue', [
    'width: min(896px, 100%);', 'height: 620px;', 'border-radius: 24px;',
    'flex: 0 0 192px;', 'padding: 16px 12px 12px;',
  ])
  expectTokens('../views/settings/Settings.vue', [
    'filterSettingsNavigation(navItems.value, settingsSearchQuery.value)',
    '<VisualSettingsShell',
  ])
})

test('Lite personal settings share the authoritative full-width unboxed row geometry', () => {
  expectTokens('../views/settings/GeneralSettings.vue', [
    'max-width: none;', 'border-radius: 0;', 'min-height: 64px;',
  ])
  expectTokens('../views/settings/UsageBillingSettings.vue', [
    'max-width: none;', 'usage-billing__rows', 'usage-billing__row', 'width: 224px;',
  ])
  expectTokens('../views/settings/UserProfile.vue', [
    'max-width: none;', 'user-profile__rows', 'padding: 14px 0;',
    'font-size: 14px;', 'font-weight: 600;', 'font-family: var(--app-font-family-mono);',
  ])
})

test('BatchManageModal.tsx source geometry is used without inventing batch-pin business behavior', () => {
  expectTokens('../components/SessionBatchManageModal.vue', [
    'width: min(512px,100%);', 'border-radius: 16px;', 'padding: 16px 24px;',
    'max-height: 380px;', 'padding: 16px;', 'padding: 10px 12px;', 'font-size: 12px;',
  ])
  const batch = read('../components/SessionBatchManageModal.vue')
  assert.equal(batch.includes("emit('pin')"), false, 'visual reference must not invent unsupported batch-pin behavior')
})
