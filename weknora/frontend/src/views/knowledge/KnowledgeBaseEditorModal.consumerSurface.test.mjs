import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const editor = readFileSync(new URL('./KnowledgeBaseEditorModal.vue', import.meta.url), 'utf8')
const createGuide = readFileSync(new URL('../../components/KbCreateContextualGuide.vue', import.meta.url), 'utf8')
const template = editor.slice(0, editor.indexOf('<script setup'))

test('Lite knowledge editor renders only the Basic and Advanced product sections', () => {
  assert.match(editor, /const LITE_KB_EDITOR_SECTIONS\s*=\s*\[/)
  assert.match(editor, /key:\s*'basic'/)
  assert.match(editor, /key:\s*'advanced'/)
  assert.match(editor, /if \(authStore\.isLiteMode\) \{[\s\S]*?LITE_KB_EDITOR_SECTIONS\.map/)
  assert.match(template, /<VisualSettingsShell[\s\S]*?<template #nav>[\s\S]*?class="visual-settings-nav__item"/)
  assert.match(template, /currentSection === 'advanced'[\s\S]*?KBAdvancedSettings/)
  assert.doesNotMatch(template, /v-if="!authStore\.isLiteMode && currentSection === 'advanced'"/)
})

test('Lite knowledge creation never renders the FAQ type control and always normalizes document type', () => {
  const typeControlIndex = template.indexOf('data-guide="kb-create-type"')
  assert.ok(typeControlIndex >= 0, 'Standard editor keeps the native type control')
  const typeSectionStart = template.lastIndexOf('<section', typeControlIndex)
  const typeSectionEnd = template.indexOf('>', typeSectionStart)
  assert.match(template.slice(typeSectionStart, typeSectionEnd + 1), /v-if="!authStore\.isLiteMode"/)
  assert.match(template, /v-if="!authStore\.isLiteMode"[\s\S]*?data-guide="kb-create-type"/)
  assert.match(editor, /normalizeKnowledgeBaseType\(/)
  assert.match(editor, /const initFormData = \(type: 'document' \| 'faq' = 'document'\)[\s\S]*?normalizeKnowledgeBaseType\(type\)/)
  assert.match(editor, /type:\s*normalizeKnowledgeBaseType\(formData\.value\.type\)/)
  assert.match(editor, /const createPayload:[\s\S]*?type:\s*normalizeKnowledgeBaseType\(formData\.value\.type\)/)
})

test('Lite technical section deep links fall back to Basic while Advanced remains reachable', () => {
  assert.match(editor, /const normalizeKnowledgeBaseSection\s*=\s*\(section\?: string \| null\)[\s\S]*?return section === 'advanced' \? 'advanced' : 'basic'/)
  assert.match(editor, /currentSection\.value\s*=\s*normalizeKnowledgeBaseSection\(/)
  assert.match(editor, /if \(!navItems\.value\.some\(\(item\) => item\.key === currentSection\.value\)\) \{[\s\S]*?currentSection\.value = 'basic'/)
  for (const section of ['models', 'vectorStore', 'parser', 'multimodal', 'asr', 'chunking', 'storage', 'datasource', 'share', 'activity']) {
    assert.doesNotMatch(
      editor,
      new RegExp(`if \\(authStore\\.isLiteMode && currentSection\\.value === '${section}'`),
      `Lite must not render ${section}`,
    )
  }
})

test('Lite knowledge-base creation pre-fills a first available localized name and final guide action', () => {
  assert.match(editor, /import \{ nextAvailableLocalizedName \} from '@\/utils\/localizedDefaultName'/)
  assert.match(editor, /knowledgeEditor\.basic\.defaultNameWithIndex/)
  assert.match(editor, /chatResources\.rawKnowledgeBases/)
  assert.match(editor, /name: authStore\.isLiteMode \? getLiteDefaultKnowledgeBaseName\(\) : ''/)
  assert.match(editor, /<KbCreateContextualGuide\s+:when="visible && editorMode === 'create'"/)
  assert.match(createGuide, /key: 'nameLite'/)
  assert.match(createGuide, /key: 'submitLite'/)
})

test('Lite knowledge editor does not expose model, embedding, or parser selectors', () => {
  const basic = template.slice(template.indexOf('class="kb-config-section"'), template.indexOf('<!-- Standard-tier settings'))
  assert.doesNotMatch(basic, /<ModelSelector/)
  assert.match(template, /<KBAdvancedSettings[\s\S]*?:consumer-mode="authStore\.isLiteMode"/)
  assert.doesNotMatch(template, /kb-create-embedding/)
  assert.match(template, /v-if="!authStore\.isLiteMode && currentSection === 'models'"[\s\S]*?<KBModelConfig/)
  assert.match(editor, /consumerSceneModelsForCreate/)
  assert.match(editor, /settingsStore\.getConsumerSceneModel\('rag'\)/)
})

test('Lite create submits managed auto-tag defaults without leaking user model choices', () => {
  assert.match(editor, /LITE_AUTO_TAG_MODEL_ID\s*=\s*'builtin-deepseek-v4-flash'/)
  assert.match(editor, /autoTagConfig:[\s\S]*?modelId:\s*authStore\.isLiteMode\s*\?\s*LITE_AUTO_TAG_MODEL_ID[\s\S]*?maxTags:\s*3[\s\S]*?skipIfTagged:\s*true/)
  assert.match(editor, /createPayload\.auto_tag_config\s*=\s*authStore\.isLiteMode\s*\?[\s\S]*?model_id:\s*LITE_AUTO_TAG_MODEL_ID[\s\S]*?max_tags:\s*3[\s\S]*?skip_if_tagged:\s*true/)
})

test('Lite edit payloads preserve server-owned Wiki and graph model settings', () => {
  const updateBranch = editor.slice(editor.indexOf('// 1. 更新基本信息'), editor.indexOf('// 2. 更新完整配置'))
  assert.match(updateBranch, /if \(!authStore\.isLiteMode\) \{[\s\S]*?synthesis_model_id[\s\S]*?max_pages_per_ingest/)
  assert.match(updateBranch, /if \(!authStore\.isLiteMode\) \{[\s\S]*?graph_enabled/)
  assert.match(editor, /if \(!authStore\.isLiteMode\) \{\s*await updateKBConfig\(kbId, config\)/)
})
