import assert from 'node:assert/strict'
import test from 'node:test'

import i18n from '../i18n'
import { consumerPlanErrorKey, consumerPlanErrorKeyFromError, localizeConsumerPlanError } from './consumerPlanError'

test('consumer plan errors follow the active UI locale without changing unknown errors', () => {
  i18n.global.locale.value = 'zh-CN'
  assert.equal(
    localizeConsumerPlanError('Free plan supports one knowledge base; upgrade to create another'),
    '免费版仅支持 1 个知识库；升级后可继续创建。',
  )
  assert.equal(localizeConsumerPlanError('unrelated backend error'), 'unrelated backend error')
  assert.equal(
    consumerPlanErrorKey('免费版仅支持 1 个知识库；升级后可继续创建。'),
    'entitlement.freeKnowledgeBaseLimit',
  )
  assert.equal(
    consumerPlanErrorKeyFromError({ error: { message: 'Storage quota exceeded' } }),
    'entitlement.storageQuotaUpgradeBody',
  )
})
