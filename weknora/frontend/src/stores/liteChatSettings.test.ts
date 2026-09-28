import assert from 'node:assert/strict'
import test from 'node:test'

import { reconcileLiteChatSettings } from '../utils/liteChatSettings'

test('Lite activation keeps MCP selections but removes hidden skills/tools', () => {
  const standardSettings = {
    webSearchEnabled: true,
    selectedMCPServices: ['mcp-1'],
    selectedSkills: ['skill-1'],
    selectedTools: ['legacy-tool'],
    selectedAgentSourceTenantId: 'shared-tenant',
    selectedKnowledgeBases: ['kb-1'],
  }

  const liteSettings = reconcileLiteChatSettings(standardSettings)

  assert.equal(liteSettings.webSearchEnabled, true)
  assert.deepEqual(liteSettings.selectedMCPServices, ['mcp-1'])
  assert.deepEqual(liteSettings.selectedSkills, [])
  assert.deepEqual(liteSettings.selectedTools, [])
  assert.equal(liteSettings.selectedAgentSourceTenantId, null)
  assert.deepEqual(liteSettings.selectedKnowledgeBases, ['kb-1'])
  assert.equal(standardSettings.webSearchEnabled, true)
})
