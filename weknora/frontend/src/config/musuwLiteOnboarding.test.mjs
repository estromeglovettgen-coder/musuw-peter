import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

const globalGuide = read('../components/NewUserGuide.vue')
const agentCreateGuide = read('../components/AgentCreateContextualGuide.vue')
const guideConfig = read('./contextualGuides.ts')
const userMenu = read('../components/UserMenu.vue')
const workspaceOnboarding = read('../views/auth/WorkspaceOnboarding.vue')
const knowledgeBase = read('../views/knowledge/KnowledgeBase.vue')
const uploadSource = read('../views/knowledge/components/KbUploadSourceDropdown.vue')

test('Lite onboarding follows the shortest current Musuw activation path', () => {
  const liteStart = globalGuide.indexOf('const liteSteps')
  const standardStart = globalGuide.indexOf('const standardSteps')

  assert.notEqual(liteStart, -1, 'Lite must own an explicit onboarding path')
  assert.ok(standardStart > liteStart, 'Lite and Standard paths must remain separate')

  const liteBlock = globalGuide.slice(liteStart, standardStart)
  const keys = [...liteBlock.matchAll(/key:\s*'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(keys, ['welcomeLite', 'knowledgeLite', 'agentsLite', 'chatLite', 'settingsLite', 'doneLite'])
  for (const legacyStep of ['settings', 'models', 'members', 'workspace']) {
    assert.equal(liteBlock.includes(`key: '${legacyStep}'`), false)
  }
  assert.match(liteBlock, /key: 'settingsLite'\s*,\s*target: '\[data-guide="user-menu"\]'/)
  assert.match(liteBlock, /key: 'agentsLite'[\s\S]*optional: true[\s\S]*key: 'chatLite'/)

  assert.match(globalGuide, /<GlobalInvitationBell v-if="!authStore\.isLiteMode"/)
  assert.match(globalGuide, /<AgentListContextualGuideBridge v-if="!authStore\.isLiteMode"/)
  assert.match(globalGuide, /@dismiss="onFinish"/)
})

test('guide completion is isolated per signed-in account', () => {
  assert.match(guideConfig, /from '@\/composables\/preferenceStorage'/)
  assert.match(guideConfig, /userKey\(GLOBAL_USER_GUIDE_KEY\)/)
  assert.match(guideConfig, /userKey\(config\.storageKey\)/)
  assert.match(guideConfig, /export function markGlobalUserGuideDone/)
  assert.doesNotMatch(globalGuide, /localStorage\.(?:getItem|setItem)\(GLOBAL_USER_GUIDE_KEY/)
})

test('guide storage namespace follows the active account at runtime', async () => {
  const values = new Map()
  const previousStorage = globalThis.localStorage
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  }

  try {
    const preferences = await import(`../composables/preferenceStorage.ts?guide-scope=${Date.now()}`)

    values.set('weknora_user', JSON.stringify({ id: 'lite-user-a' }))
    const accountAKey = preferences.userKey('musuw:new-user-guide-done:v2')

    values.set('weknora_user', JSON.stringify({ id: 'lite-user-b' }))
    const accountBKey = preferences.userKey('musuw:new-user-guide-done:v2')

    assert.equal(accountAKey, 'WeKnora_lite-user-a_musuw:new-user-guide-done:v2')
    assert.equal(accountBKey, 'WeKnora_lite-user-b_musuw:new-user-guide-done:v2')
    assert.notEqual(accountAKey, accountBKey)
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previousStorage
  }
})

test('Lite users do not get a replay control that the consumer surface cannot support', () => {
  assert.match(
    userMenu,
    /v-if="!authStore\.isLiteMode"[^>]*class="visual-user-menu__guide"[^>]*@click\.stop="reopenGuide"/,
  )
  assert.doesNotMatch(
    userMenu,
    /<button type="button" class="visual-user-menu__guide"[^>]*@click\.stop="reopenGuide"/,
  )
})

test('Lite agent creation guide stays inside the compact editor', () => {
  assert.match(agentCreateGuide, /useAuthStore/)
  assert.match(agentCreateGuide, /authStore\.isLiteMode\s*\?\s*liteSteps\s*:\s*standardSteps/)

  const liteStart = agentCreateGuide.indexOf('const liteSteps')
  const standardStart = agentCreateGuide.indexOf('const standardSteps')
  assert.notEqual(liteStart, -1)
  assert.ok(standardStart > liteStart)
  const liteBlock = agentCreateGuide.slice(liteStart, standardStart)

  for (const key of ['modeLite', 'nameLite', 'modelLite', 'knowledgeLite', 'submitLite']) {
    assert.ok(liteBlock.includes(`key: '${key}'`), `missing compact Lite step ${key}`)
  }
  for (const hiddenTarget of [
    'agent-editor-nav-model',
    'agent-editor-nav-websearch',
    'agent-editor-nav-multimodal',
    'agent-editor-nav-tools',
  ]) {
    assert.equal(liteBlock.includes(hiddenTarget), false, `Lite guide targets hidden ${hiddenTarget}`)
  }
})

test('tenantless Lite fallback explains automatic personal-space preparation', () => {
  assert.match(workspaceOnboarding, /authStore\.isLiteMode[\s\S]*workspaceOnboarding\.liteTitle/)
  assert.match(workspaceOnboarding, /workspaceOnboarding\.liteDescription/)
  assert.match(workspaceOnboarding, /workspaceOnboarding\.retry/)
  assert.doesNotMatch(
    workspaceOnboarding,
    /v-if="authStore\.isLiteMode"[\s\S]{0,500}<CreateTenantDialog/,
  )
})

test('an empty Lite knowledge base introduces RAG and Wiki before both ingestion actions', () => {
  assert.match(knowledgeBase, /import ContextualGuide from '@\/components\/ContextualGuide\.vue'/)
  assert.match(
    knowledgeBase,
    /<ContextualGuide\s+tour="kbDetail"\s+:when="authStore\.isLiteMode\s*&&\s*!isFAQ\s*&&\s*canEdit[^"]*"\s*\/>/,
  )
  assert.match(knowledgeBase, /data-guide="kb-detail-add-doc"/)
  assert.match(uploadSource, /data-guide="kb-detail-import-url"/)

  const kbDetailStart = guideConfig.indexOf('  kbDetail: {')
  const chatStart = guideConfig.indexOf('\n  chat: {', kbDetailStart)
  assert.notEqual(kbDetailStart, -1)
  assert.ok(chatStart > kbDetailStart)

  const kbDetailBlock = guideConfig.slice(kbDetailStart, chatStart)
  const keys = [...kbDetailBlock.matchAll(/key:\s*'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(keys, ['rag', 'wiki', 'uploadFile', 'uploadUrl'])
  assert.doesNotMatch(
    kbDetailBlock.slice(0, kbDetailBlock.indexOf("key: 'uploadFile'")),
    /target:/,
    'RAG and Wiki are explanatory cards and must not depend on page selectors',
  )
  assert.match(kbDetailBlock, /key: 'uploadFile'[\s\S]*data-guide="kb-detail-add-doc"/)
  assert.match(kbDetailBlock, /key: 'uploadUrl'[\s\S]*data-guide="kb-detail-import-url"/)
})

test('Lite new resource defaults use loaded names and fill the first available suffix', () => {
  const knowledgeEditor = read('../views/knowledge/KnowledgeBaseEditorModal.vue')
  const agentEditor = read('../views/agent/AgentEditorModal.vue')
  const defaultName = read('../utils/localizedDefaultName.ts')

  assert.match(knowledgeEditor, /nextAvailableLocalizedName\(/)
  assert.match(knowledgeEditor, /knowledgeEditor\.basic\.defaultNameWithIndex/)
  assert.match(agentEditor, /nextAvailableLocalizedName\(/)
  assert.match(agentEditor, /agentEditor\.defaultNameWithIndex/)
  assert.match(defaultName, /while \(usedNames\.has\(candidate\)\)/)
  assert.match(defaultName, /index \+= 1/)
})

test('Lite home chat guide starts with the combined picker and preserves the native composer', () => {
  const chat = read('../views/creatChat/creatChat.vue')
  const input = read('../components/Input-field.vue')
  const pickerIndex = guideConfig.indexOf("key: 'picker'")
  const kbIndex = guideConfig.indexOf("key: 'kb'")
  const inputIndex = guideConfig.indexOf("key: 'input'")
  const sendIndex = guideConfig.indexOf("key: 'send'")

  assert.match(chat, /<ContextualGuide\s+tour="chat"[\s\S]*authStore\.isLiteMode[\s\S]*route\.name === 'globalCreatChat'/)
  assert.match(input, /class="visual-chat-composer__combined-picker"[\s\S]*data-guide="chat-picker"/)
  assert.ok(pickerIndex >= 0 && pickerIndex < kbIndex && kbIndex < inputIndex && inputIndex < sendIndex)
})

test('all supported locales carry the complete Lite onboarding copy', () => {
  for (const locale of ['zh-CN', 'en-US', 'ko-KR', 'ru-RU']) {
    const source = read(`../i18n/locales/${locale}.ts`)
    for (const key of [
      'welcomeLite:',
      'chatLite:',
      'knowledgeLite:',
      'agentsLite:',
      'settingsLite:',
      'doneLite:',
      'modeLite:',
      'nameLite:',
      'modelLite:',
      'submitLite:',
      'rag:',
      'wiki:',
      'uploadFile:',
      'uploadUrl:',
      'picker:',
      'liteTitle:',
      'liteDescription:',
    ]) {
      assert.ok(source.includes(key), `${locale} is missing ${key}`)
    }

    const kbDetailStart = source.indexOf('    kbDetail: {')
    const siblingStarts = ['\n    agentCreate: {', '\n    chat: {']
      .map((marker) => source.indexOf(marker, kbDetailStart))
      .filter((index) => index > kbDetailStart)
    const kbDetailEnd = Math.min(...siblingStarts)
    assert.notEqual(kbDetailStart, -1, `${locale} is missing the knowledge-base guide`)
    assert.ok(Number.isFinite(kbDetailEnd), `${locale} knowledge-base guide has no sibling boundary`)

    const kbDetailBlock = source.slice(kbDetailStart, kbDetailEnd)
    const kbDetailKeys = [...kbDetailBlock.matchAll(/^        ([a-zA-Z]+): \{$/gm)]
      .map((match) => match[1])
    assert.deepEqual(
      kbDetailKeys,
      ['rag', 'wiki', 'uploadFile', 'uploadUrl'],
      `${locale} knowledge-base guide must keep the same four-step order`,
    )
    assert.match(kbDetailBlock, /rag:[\s\S]*title: ['"]RAG[:：]/)
    assert.match(kbDetailBlock, /wiki:[\s\S]*title: ['"]Wiki[:：]/)

    const settingsStart = source.indexOf('settingsLite:')
    const settingsEnd = source.indexOf('\n      },', settingsStart)
    const settingsLiteCopy = source.slice(settingsStart, settingsEnd)
    assert.doesNotMatch(settingsLiteCopy, /member|tenant|workspace|成员|租户|멤버|участник/i)
  }
})
