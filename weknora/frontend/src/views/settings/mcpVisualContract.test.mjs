import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const here = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(here, name), 'utf8')
const listSource = read('McpSettings.vue')
const drawerSource = read('components/McpServiceDialog.vue')

const scriptSetupHash = (source) => {
  const script = source.match(/<script setup lang="ts">[\s\S]*?<\/script>/)?.[0]
  assert.ok(script, 'missing <script setup lang="ts"> block')
  return createHash('sha256').update(script).digest('hex')
}

test('MCP business scripts stay byte-identical to the clean WeKnora main 81142df authority', () => {
  assert.equal(
    scriptSetupHash(listSource),
    'df2c88f2fd8af43e17438bcd9a9d5cd58e3dfd9398995bfaa4f0515af6ae4781',
    'McpSettings.vue business logic diverged from WeKnora main 81142df',
  )
  assert.equal(
    scriptSetupHash(drawerSource),
    'a01a5491e71024de5b98f9787abf558bc9391fbfacbda58cffa718a37b7fcf44',
    'McpServiceDialog.vue business logic diverged from WeKnora main 81142df',
  )
})

test('MCP cards mechanically retain the supplied two-column reference geometry', () => {
  for (const token of [
    'class="service-card"',
    'class="service-card__identity"',
    'class="service-card__badge"',
    'class="service-card__status"',
    'class="service-card__actions"',
    'class="service-card service-card--add"',
    '.services-grid',
    'grid-template-columns: repeat(2, minmax(0, 1fr));',
    'gap: 14px;',
    'border-radius: 16px;',
    'min-height: 140px;',
  ]) {
    assert.ok(listSource.includes(token), `missing MCP card visual contract token: ${token}`)
  }
})

test('MCP drawer keeps the real native actions behind the supplied slide-over hierarchy', () => {
  for (const token of [
    '<SettingDrawer',
    'width="512px"',
    ':resizable="false"',
    'class="mcp-drawer__section mcp-drawer__code-import',
    'mcp-drawer__transport-options',
    'mcp-drawer__auth-options',
    'mcp-drawer__advanced-grid',
    'class="mcp-drawer__close"',
    '.custom-headers-header .t-button--variant-text.t-button--theme-primary',
    ":name=\"codeImportOpen ? 'chevron-down' : 'chevron-up'\"",
    '<t-input v-model="formData.description"',
    'testMCPService(props.service.id)',
    'putMCPCredentials',
    'getMCPOAuthAuthorizeURL',
  ]) {
    assert.ok(drawerSource.includes(token), `missing MCP drawer contract token: ${token}`)
  }

  assert.doesNotMatch(drawerSource, /连接成功 · 已探测并激活可用工具与上下文资源/)
  assert.doesNotMatch(drawerSource, /localStorage\.setItem\(['"]musnow_mcp_servers/)
})

test('MCP list and teleported drawer define explicit dark-mode surfaces and controls', () => {
  for (const token of [
    ':root[theme-mode="dark"] .mcp-settings',
    ':root[theme-mode="dark"] .service-card',
    ':root[theme-mode="dark"] body .mcp-drawer',
    ':root[theme-mode="dark"] body .mcp-drawer .t-input',
    ':root[theme-mode="dark"] body .mcp-drawer .source-option.is-active',
    ':root[theme-mode="dark"] body .mcp-drawer .t-drawer__footer',
  ]) {
    const source = token.includes('mcp-drawer') ? drawerSource : listSource
    assert.ok(source.includes(token), `missing MCP dark-mode contract token: ${token}`)
  }
})
