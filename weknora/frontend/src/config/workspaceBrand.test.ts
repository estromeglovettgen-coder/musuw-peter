import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { workspaceBrandCopy, workspaceBrandMessages } from './workspaceBrand'
import zhCN from '../i18n/locales/zh-CN'
import enUS from '../i18n/locales/en-US'
import ruRU from '../i18n/locales/ru-RU'
import koKR from '../i18n/locales/ko-KR'

test('Fire replaces display branding while preserving URLs and protocol identifiers', () => {
  assert.equal(workspaceBrandCopy('欢迎使用 Musuw，Hi，我是 Musuw。穆苏瓦', true), '欢迎使用 火种，Hi，我是 火种。火种')
  assert.equal(workspaceBrandCopy('打开 https://docs.musuw.com，使用 X-Musuw-Signature，返回 Musuw', true), '打开 https://docs.musuw.com，使用 X-Musuw-Signature，返回 火种')
  const original = { musuw: { title: 'Musuw Skill', examples: ['使用 Musuw', 'musuw/images'] } }
  assert.deepEqual(workspaceBrandMessages(original, true), { musuw: { title: '火种 Skill', examples: ['使用 火种', 'musuw/images'] } })
  assert.equal(original.musuw.title, 'Musuw Skill')
  assert.equal(workspaceBrandMessages(original, false), original)
})

test('startup HTML uses Fire copy while retaining preference and DOM identifiers', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  const fire = workspaceBrandCopy(html, true)
  assert.doesNotMatch(fire, /正在打开 Musuw|Opening Musuw|<title>Musuw<|<strong>Musuw</)
  assert.match(fire, /正在打开 火种/)
  assert.match(fire, /Musuw_theme/)
  assert.match(fire, /id="musuw-startup"/)
  assert.equal(workspaceBrandCopy(html, false), html)
})

test('Fire onboarding and readiness feedback never ask users to configure or choose models', () => {
  const original = { 'zh-CN': zhCN, 'en-US': enUS, 'ru-RU': ruRU, 'ko-KR': koKR }
  const fire = workspaceBrandMessages(original, true)
  for (const [locale, bundle] of Object.entries(fire)) {
    const displayedCopy = [
      bundle.newUserGuide.steps.welcomeLite.desc,
      bundle.newUserGuide.steps.chatLite.desc,
      bundle.newUserGuide.steps.agents.desc,
      bundle.newUserGuide.steps.agentsLite.desc,
      bundle.contextualGuide.chat.steps.picker.desc,
      bundle.contextualGuide.agentList.steps.create.desc,
      bundle.contextualGuide.agentCreate.steps.knowledge.desc,
      bundle.contextualGuide.agentCreate.steps.submitLite.desc,
      bundle.contextualGuide.kbCreate.steps.submit.desc,
      bundle.knowledgeBase.notInitialized,
      bundle.knowledgeList.uninitializedBanner,
    ].join('\n')
    assert.doesNotMatch(displayedCopy, /模型|model|модел|모델|DeepSeek/iu, locale)
    assert.match(bundle.newUserGuide.steps.welcomeLite.desc, /Taylor/)
  }
  assert.equal(workspaceBrandMessages(original, false), original)
  assert.match(original['zh-CN'].contextualGuide.chat.steps.picker.desc, /模型/)
})
