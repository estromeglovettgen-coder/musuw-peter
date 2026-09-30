import test from 'node:test'
import assert from 'node:assert/strict'
import { isWorkspaceKnowledgeBaseSectionVisible, isWorkspaceSettingsSectionVisible, isWorkspaceUploadSectionVisible, workspaceRouteRedirect } from './workspaceSurface'

test('Peter keeps normal settings and model management without opening platform administration', () => {
  for (const key of ['general', 'userprofile', 'models', 'memory', 'mymemory', 'chathistory', 'mcp', 'integration-im', 'integration-embed', 'skills']) {
    assert.equal(isWorkspaceSettingsSectionVisible(key, true), true, key)
  }
  for (const key of ['usage', 'weknoracloud', 'tenant', 'members', 'system-global', 'storage', 'vectorstore', 'parser', 'sandbox', 'envvars', 'runtime-queues']) {
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
  assert.equal(workspaceRouteRedirect('/platform/settings', 'chathistory', true), null)
  for (const section of ['skills']) {
    assert.equal(workspaceRouteRedirect('/platform/settings', section, true), null)
  }
  assert.equal(workspaceRouteRedirect('/platform/settings', 'envvars', true), '/platform/settings?section=general')
  assert.equal(workspaceRouteRedirect('/platform/settings', 'sandbox', true), '/platform/settings?section=general')
  assert.equal(workspaceRouteRedirect('/platform/agents', undefined, true), null)
  assert.equal(workspaceRouteRedirect('/platform/knowledge-bases/test', undefined, true), null)
})

test('Peter knowledge-base and customer editors keep business settings while hiding managed processing', () => {
  for (const key of ['customer', 'sources', 'basic', 'models', 'faq']) {
    assert.equal(isWorkspaceKnowledgeBaseSectionVisible(key, true), true, key)
  }
  for (const key of ['vectorStore', 'parser', 'storage', 'chunking', 'multimodal', 'asr', 'graph', 'advanced', 'datasource', 'share', 'activity']) {
    assert.equal(isWorkspaceKnowledgeBaseSectionVisible(key, true), false, key)
    assert.equal(isWorkspaceKnowledgeBaseSectionVisible(key, false), true, key)
  }
  assert.equal(isWorkspaceKnowledgeBaseSectionVisible('multimodal', true, true), true)
  assert.equal(isWorkspaceKnowledgeBaseSectionVisible('asr', true, true), true)
  assert.equal(isWorkspaceKnowledgeBaseSectionVisible('graph', true, true), false)
})

test('Peter upload confirmation only shows tags and media repair controls when configuration is broken', () => {
  assert.equal(isWorkspaceUploadSectionVisible('tags', false, true), true)
  for (const key of ['parser', 'chunking', 'question', 'graph', 'multimodal', 'asr']) {
    assert.equal(isWorkspaceUploadSectionVisible(key, false, true), false, key)
    assert.equal(isWorkspaceUploadSectionVisible(key, false, false), true, key)
  }
  assert.equal(isWorkspaceUploadSectionVisible('multimodal', true, true), true)
  assert.equal(isWorkspaceUploadSectionVisible('asr', true, true), true)
})
