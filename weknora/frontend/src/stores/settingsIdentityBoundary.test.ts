import assert from 'node:assert/strict'
import test from 'node:test'

import { resetSettingsForIdentityBoundary } from './settingsIdentityBoundary.ts'

test('identity boundary returns an isolated copy of safe defaults', () => {
  const defaults = {
    selectedAgentId: 'builtin-smart-reasoning',
    selectedAgentSourceTenantId: null,
    isAgentEnabled: true,
    selectedKnowledgeBases: [] as string[],
    selectedFiles: [] as string[],
    selectedFileKbMap: {} as Record<string, string>,
    selectedTags: [] as unknown[],
    selectedMCPServices: [] as string[],
    selectedSkills: [] as string[],
    webSearchEnabled: false,
    conversationModels: {
      summaryModelId: '',
      rerankModelId: '',
      selectedChatModelId: '',
      thinkingEnabled: true,
      reasoningEffort: 'high',
      consumerSceneModelIds: {} as Record<string, string>,
    },
  }

  const reset = resetSettingsForIdentityBoundary(defaults)

  assert.deepEqual(reset, defaults)
  assert.notEqual(reset, defaults)
  assert.notEqual(reset.conversationModels, defaults.conversationModels)
  assert.notEqual(reset.selectedFiles, defaults.selectedFiles)

  reset.selectedFiles.push('new-account-file')
  reset.conversationModels.consumerSceneModelIds.chat = 'new-account-model'

  assert.deepEqual(defaults.selectedFiles, [])
  assert.deepEqual(defaults.conversationModels.consumerSceneModelIds, {})
})
