import test from 'node:test'
import assert from 'node:assert/strict'
import { isWorkspaceSettingsSectionVisible, workspaceRouteRedirect } from './workspaceSurface'

test('Peter keeps normal settings and model management without opening platform administration', () => {
  for (const key of ['general', 'userprofile', 'models', 'memory', 'mymemory', 'mcp', 'integration-im', 'integration-embed', 'skills', 'sandbox', 'envvars']) {
    assert.equal(isWorkspaceSettingsSectionVisible(key, true), true, key)
  }
  for (const key of ['usage', 'weknoracloud', 'tenant', 'members', 'system-global', 'storage', 'vectorstore', 'parser', 'runtime-queues']) {
    assert.equal(isWorkspaceSettingsSectionVisible(key, true), false, key)
    assert.equal(isWorkspaceSettingsSectionVisible(key, false), true, key)
  }
})

test('direct links cannot reopen hidden Peter billing, market or administration pages', () => {
  for (const path of ['/plans', '/checkout', '/pay/test', '/retain', '/platform/marketplace', '/platform/marketplace/taylor', '/platform/orders', '/platform/creator-products', '/platform/marketplace-admin', '/platform/organizations']) {
    assert.equal(workspaceRouteRedirect(path, undefined, true), '/platform/creatChat', path)
    assert.equal(workspaceRouteRedirect(path, undefined, false), null, path)
  }
  assert.equal(workspaceRouteRedirect('/platform/settings', 'usage', true), '/platform/settings?section=general')
  assert.equal(workspaceRouteRedirect('/platform/settings', 'models', true), null)
  for (const section of ['skills', 'sandbox', 'envvars']) {
    assert.equal(workspaceRouteRedirect('/platform/settings', section, true), null)
  }
  assert.equal(workspaceRouteRedirect('/platform/agents', undefined, true), null)
  assert.equal(workspaceRouteRedirect('/platform/knowledge-bases/test', undefined, true), null)
})
