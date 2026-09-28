import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const en = readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8')
const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
const plans = readFileSync(new URL('./Plans.vue', import.meta.url), 'utf8')
const checkout = readFileSync(new URL('./Checkout.vue', import.meta.url), 'utf8')
const homepage = readFileSync(new URL('../../../../../storefront/src/homepageMarketingRefresh.js', import.meta.url), 'utf8')

test('consumer plan cards use the same copy as the public homepage', () => {
  assert.match(en, /planDescriptions:\s*\{ free: 'Explore the full workflow', plus: 'For a growing knowledge base', pro: 'For daily knowledge work', max: 'For intensive knowledge work' \}/)
  assert.match(en, /featureStorage:\s*'\{amount\} GiB storage'/)
  assert.match(en, /featureFreeKnowledge:\s*'1 knowledge base \(10 docs\)'/)
  assert.match(en, /featureBudgetModel:\s*'Standard models'/)
  assert.match(en, /featureUnlimitedKnowledge:\s*'Unlimited knowledge bases'/)
  assert.match(en, /featureAllModels:\s*'Advanced models'/)
  assert.match(en, /featureVideo:\s*'Video & link import'/)

  assert.match(zh, /planDescriptions:\s*\{ free: '体验完整知识闭环', plus: '适合增长中的知识库', pro: '适合日常知识工作', max: '适合高强度知识工作' \}/)
  assert.match(zh, /featureStorage:\s*'\{amount\} GiB 存储空间'/)
  assert.match(zh, /featureFreeKnowledge:\s*'1 个知识库（10 篇文档）'/)
  assert.match(zh, /featureBudgetModel:\s*'标准模型'/)
  assert.match(zh, /featureUnlimitedKnowledge:\s*'不限知识库与文档数'/)
  assert.match(zh, /featureAllModels:\s*'高级模型'/)
  assert.match(zh, /featureVideo:\s*'视频与多平台导入'/)

  for (const copy of [
    'Explore the full workflow',
    'For a growing knowledge base',
    'For daily knowledge work',
    'For intensive knowledge work',
    '1 knowledge base (10 docs)',
    'Standard models',
    'Documents and notes',
    'Unlimited knowledge bases',
    'Advanced models',
    'Video & link import',
    '体验完整知识闭环',
    '适合增长中的知识库',
    '适合日常知识工作',
    '适合高强度知识工作',
    '1 个知识库（10 篇文档）',
    '标准模型',
    '文档与笔记导入',
    '不限知识库与文档数',
    '高级模型',
    '视频与多平台导入',
  ]) assert.ok(homepage.includes(copy), `homepage is missing: ${copy}`)
})

test('plans and checkout keep the four enforced storage tiers and shared feature keys', () => {
  assert.match(plans, /const storage = \{ free: 1, plus: 10, pro: 30, max: 100 \}\[plan\]/)
  assert.doesNotMatch(plans, /featureAllowance/)
  assert.match(plans, /featureBudgetModel/)
  assert.match(plans, /freeImportFeature/)
  assert.match(plans, /'文档与笔记导入'/)
  assert.match(plans, /'Documents and notes'/)
  assert.doesNotMatch(plans, /文档与网页导入|Documents and web links/)
  assert.match(plans, /featureAllModels/)
  assert.match(checkout, /const storage = \{ plus: 10, pro: 30, max: 100 \}\[plan\]/)
  assert.doesNotMatch(checkout, /featureAllowance/)
  assert.match(checkout, /featureAllModels/)
})
