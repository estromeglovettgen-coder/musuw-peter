import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./KnowledgeBaseEditorModal.vue', import.meta.url), 'utf8')
const agentSource = readFileSync(new URL('../agent/AgentEditorModal.vue', import.meta.url), 'utf8')
const uploadSource = readFileSync(new URL('./components/KbUploadSourceDropdown.vue', import.meta.url), 'utf8')
const planErrorSource = readFileSync(new URL('../../utils/consumerPlanError.ts', import.meta.url), 'utf8')

test('knowledge-base creation limit uses the shared upgrade prompt instead of a toast', () => {
  assert.match(source, /useConsumerUpgradePrompt/)
  assert.match(source, /consumerPlanErrorKey/)
  assert.match(source, /consumerPlanErrorKey(?:FromError)?\([\s\S]*?showConsumerUpgradePrompt\([\s\S]*?t\(planErrorKey\)/)
})

test('agent save errors use the same upgrade prompt contract when a plan gate is returned', () => {
  assert.match(agentSource, /useConsumerUpgradePrompt/)
  assert.match(agentSource, /consumerPlanErrorKey/)
  assert.match(agentSource, /consumerPlanErrorKey(?:FromError)?\([\s\S]*?showConsumerUpgradePrompt\([\s\S]*?t\(planErrorKey\)/)
})

test('the plan error classifier recognizes the server knowledge-base limit message', () => {
  assert.match(planErrorSource, /freeKnowledgeBaseLimit/)
  assert.match(planErrorSource, /免费版仅支持 1 个知识库；升级后可继续创建/)
})

test('knowledge-base uploads use the shared upgrade prompt for storage exhaustion', () => {
  assert.match(uploadSource, /import \{ exceedsConsumerStorageQuota \} from '@\/utils\/consumerUploadLimits'/)
  assert.match(uploadSource, /exceedsConsumerStorageQuota\(entitlement, allowedFiles\)/)
  assert.match(uploadSource, /showConsumerUpgradePrompt\(String\(t\('entitlement\.storageQuotaUpgradeBody'\)\)\)/)
  assert.match(uploadSource, /exceedsConsumerStorageQuota\(entitlement\)[\s\S]*?onCancel:[\s\S]*?urlDialogVisible\.value = true/)
  assert.match(planErrorSource, /'Storage quota exceeded': 'entitlement\.storageQuotaUpgradeBody'/)
})
