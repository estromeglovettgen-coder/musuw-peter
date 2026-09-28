import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./UploadConfirmDialog.vue', import.meta.url), 'utf8')
const template = source.slice(0, source.indexOf('<script setup'))

test('Lite upload confirmation has no parser, model, chunking, media, question, or graph controls', () => {
  assert.match(source, /useAuthStore/)
  assert.match(template, /<aside v-if="!authStore\.isLiteMode" class="settings-sidebar">/)
  for (const section of ['parser', 'chunking', 'multimodal', 'asr', 'question']) {
    const extraGuard = section === 'multimodal' ? ' && !usesManagedMediaRouting' : ''
    assert.match(
      template,
      new RegExp(`<div v-if="!authStore\\.isLiteMode${extraGuard}" v-show="activeSection === '${section}'"`),
      `Lite must not render ${section} upload controls`,
    )
  }
  assert.match(
    template,
    /<div v-if="!authStore\.isLiteMode && isGraphSectionAvailable" v-show="activeSection === 'graph'"/,
  )
  assert.doesNotMatch(source, /if \(authStore\.isLiteMode\)\s*\{[\s\S]*?push\('parser'/)
})

test('Lite uploads use server-managed parsing and skip hidden media validation', () => {
  assert.match(source, /if \(authStore\.isLiteMode\) return \{\}/)
  assert.match(source, /function getDefaultSection\(\): ConfigSectionKey \{\s*if \(authStore\.isLiteMode\) return 'tags'/)
  assert.match(source, /if \(!authStore\.isLiteMode\) \{\s*loadModels\(\)\s*loadSystemInfo\(\)/)
  assert.match(source, /if \(!authStore\.isLiteMode && hasImages\.value\)/)
  assert.match(source, /if \(!authStore\.isLiteMode && hasAudio\.value\)/)
  assert.match(source, /if \(!authStore\.isLiteMode && \(\(!usesManagedMediaRouting\.value && showMultimodalModelError\.value\) \|\| showAsrModelError\.value\)\)/)
})

test('video-only and supported social imports remove the user-facing video model choice', () => {
  assert.match(source, /const isVideoOnly = computed/)
  assert.match(source, /const hasSupportedSocialSource = computed/)
  assert.match(source, /const usesManagedMediaRouting = computed/)
  assert.match(template, /v-if="!authStore\.isLiteMode && !usesManagedMediaRouting" v-show="activeSection === 'multimodal'"/)
  assert.match(source, /if \(usesManagedMediaRouting\.value\) \{\s*delete overrides\.enable_multimodel\s*delete overrides\.vlm_config\s*\}/)
})

test('Lite upload source catalog contains only ordinary file, folder, URL, and optional manual actions', () => {
  const dropdown = readFileSync(new URL('./KbUploadSourceDropdown.vue', import.meta.url), 'utf8')
  for (const deferred of [/XMind/i, /GitLab/i, /\bIMA\b/i, /腾讯\s*IMA/i]) {
    assert.doesNotMatch(dropdown, deferred)
  }
  assert.match(dropdown, /uploadDocument/)
  assert.match(dropdown, /uploadFolder/)
  assert.match(dropdown, /importURL/)
})
