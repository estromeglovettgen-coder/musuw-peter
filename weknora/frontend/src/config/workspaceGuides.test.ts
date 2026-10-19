import assert from 'node:assert/strict'
import test from 'node:test'
import { workspaceGuideSteps } from './workspaceGuides'

test('Fire tours explain the available workflow without model configuration or hidden sections', () => {
  const global = ['welcome', 'knowledge', 'agents', 'chat', 'settings', 'models', 'done'].map(key => ({ key }))
  assert.deepEqual(workspaceGuideSteps(global, 'global', true).map(step => step.key),
    ['welcome', 'knowledge', 'agents', 'chat', 'settings', 'done'])

  const agent = ['mode', 'agentType', 'name', 'navModel', 'model', 'navKnowledge', 'knowledge', 'navWebsearch', 'navMultimodal', 'multimodal', 'navTools', 'submit'].map(key => ({ key }))
  assert.deepEqual(workspaceGuideSteps(agent, 'agentCreate', true).map(step => step.key),
    ['mode', 'name', 'navKnowledge', 'knowledge', 'submit'])

  const kb = ['type', 'name', 'indexing', 'navModels', 'llm', 'embedding', 'parser', 'chunking', 'storage', 'navMultimodal', 'multimodalToggle', 'multimodalVllm', 'faq', 'submit'].map(key => ({ key }))
  assert.deepEqual(workspaceGuideSteps(kb, 'kbCreate', true).map(step => step.key),
    ['type', 'name', 'indexing', 'faq', 'submit'])
})

test('Fire Lite tours also omit model selection while native tours are returned untouched', () => {
  const before = () => { throw new Error('must not invoke a removed model step') }
  const agent = [{ key: 'modeLite' }, { key: 'nameLite' }, { key: 'modelLite', before }, { key: 'knowledgeLite' }, { key: 'submitLite' }]
  assert.deepEqual(workspaceGuideSteps(agent, 'agentCreate', true).map(step => step.key),
    ['modeLite', 'nameLite', 'knowledgeLite', 'submitLite'])
  assert.equal(workspaceGuideSteps(agent, 'agentCreate', false), agent)
})
