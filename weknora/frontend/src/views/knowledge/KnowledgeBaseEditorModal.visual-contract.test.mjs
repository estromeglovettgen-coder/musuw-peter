import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const editor = readFileSync(new URL('./KnowledgeBaseEditorModal.vue', import.meta.url), 'utf8')
const template = editor.slice(0, editor.indexOf('<script setup'))

test('knowledge editor reuses the Musuw settings shell instead of a parallel modal', () => {
  assert.match(editor, /import VisualSettingsShell from '@\/views\/settings\/components\/VisualSettingsShell\.vue'/)
  assert.match(template, /<VisualSettingsShell[\s\S]*?:visible="visible"[\s\S]*?modal-class="kb-settings-shell"/)
  assert.match(template, /<template #nav>[\s\S]*?class="visual-settings-nav__item"/)
  assert.match(template, /<template #footer>[\s\S]*?<t-button[^>]*variant="outline"[\s\S]*?<t-button[^>]*theme="primary"/)
  assert.doesNotMatch(template, /kb-config-overlay|kb-config-modal|kb-config-header|kb-config-nav/)
})

test('basic knowledge settings use the same unboxed row and bounded-control grammar', () => {
  assert.match(template, /currentSection === 'basic'[\s\S]*?class="section-header"[\s\S]*?class="settings-group"/)
  assert.match(template, /class="setting-row"[^>]*data-guide="kb-create-indexing"/)
  assert.match(template, /class="setting-info"[\s\S]*?class="setting-control"/)
  assert.match(template, /v-model="formData\.indexingStrategy\.vectorEnabled"/)
  assert.match(template, /v-model="formData\.indexingStrategy\.wikiEnabled"/)
  assert.match(template, /<t-select[\s\S]*?v-model="formData\.wikiConfig\.extractionGranularity"/)
  assert.doesNotMatch(template, /kb-config-strategies|kb-config-strategy|kb-config-granularity/)
})

test('knowledge editor keeps Lite and Standard in one responsive shell contract', () => {
  assert.match(template, /:content-label="currentSectionLabel"/)
  assert.match(template, /v-for="item in navItems"/)
  assert.match(template, /:class="\{ 'is-active': currentSection === item\.key \}"/)
  assert.match(template, /<KBAdvancedSettings[\s\S]*?:consumer-mode="authStore\.isLiteMode"/)
  assert.match(editor, /\.kb-settings-content[\s\S]*?\.kb-settings-scroll/)
  assert.match(editor, /@media \(max-width: 560px\)/)
})

test('knowledge text areas rely on the native field counter without duplicate manual counters', () => {
  assert.doesNotMatch(template, /class="kb-config-count"/)
})
