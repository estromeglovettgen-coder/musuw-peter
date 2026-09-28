import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { computed, effectScope, nextTick, ref, watch } from 'vue'
import { getAgentNotReadyReasonKeys } from '../utils/agent-readiness'

// Execute the controller's actual catalog/getter/change/watch declarations.
// The wrapper's displayed state alone cannot prove its send-time closure agrees.
const source = readFileSync(new URL('../assets/business-baselines/Input-field.pre-view.vue', import.meta.url), 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
const ast = ts.createSourceFile('Input-field.ts', source, ts.ScriptTarget.Latest, true)
const names = ['sceneOptionsFor', 'sceneModelsFor', 'sceneManagedByConsumerResolver', 'availableModels', 'selectedModelId', 'handleModelChange', 'collectAgentNotReadyReasons']
const declarations = names.map(name => ast.statements.find(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(declaration => declaration.name.getText(ast) === name))!.getText(ast))
const modelWatch = ast.statements.find(statement => statement.getText(ast).startsWith('watch(')
  && statement.getText(ast).includes('[selectedAgentId, () => settingsStore.selectedAgentSourceTenantId, agentModelId]'))!.getText(ast)
const javascript = ts.transpileModule(`${declarations.join('\n')}\n${modelWatch}\nreturn { availableModels, selectedModelId, handleModelChange, sceneManagedByConsumerResolver, collectAgentNotReadyReasons };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText

function controller({ lite = true, market = true } = {}) {
  const model = ref('flash')
  const agentModelId = ref('flash')
  const selectedAgentId = ref('custom-agent')
  const scope = effectScope()
  const updates: unknown[] = []
  const state = scope.run(() => new Function('context', `const { computed, watch, isCustomAgent, authStore, settingsStore, selectedAgentId, agentModelId, effectiveConsumerScene, consumerSceneOptions, allModels, fallbackAvailableModels, BUILTIN_QUICK_ANSWER_ID, BUILTIN_SMART_REASONING_ID, readLastChatModelID, writeLastChatModelID, ensureReasoningSelection, showModelSelector, marketplaceChat, getAgentNotReadyReasonKeys, formatAgentNotReadyReasons } = context; ${javascript}`)({
    computed, watch, isCustomAgent: ref(true), authStore: { isLiteMode: lite }, selectedAgentId, agentModelId,
    settingsStore: {
      selectedAgentId: 'custom-agent', selectedAgentSourceTenantId: null,
      settings: { marketplaceProductId: market ? 'taylor' : '' },
      conversationModels: { get selectedChatModelId() { return model.value } },
      getConsumerSceneModel: () => model.value,
      updateConsumerSceneModel: (_: string, id: string) => { model.value = id },
      updateConversationModels: (value: any) => { if (value.selectedChatModelId !== undefined) model.value = value.selectedChatModelId; updates.push(value) },
    },
    effectiveConsumerScene: ref('rag'),
    consumerSceneOptions: ref({ rag: { options: [
      { model_id: 'flash', display_name: 'Flash', selectable: true, locked: false },
      { model_id: 'allowed', display_name: 'Allowed reasoning model', selectable: true, locked: false },
      { model_id: 'locked', display_name: 'Higher tier model', selectable: false, locked: true },
    ] } }),
    allModels: ref([]), fallbackAvailableModels: ref([]),
    BUILTIN_QUICK_ANSWER_ID: 'builtin-quick-answer', BUILTIN_SMART_REASONING_ID: 'builtin-smart-reasoning',
    readLastChatModelID: () => '', writeLastChatModelID() {}, ensureReasoningSelection() { updates.push('reasoning') }, showModelSelector: ref(true),
    marketplaceChat: { agent: { id: 'market-agent' } }, getAgentNotReadyReasonKeys, formatAgentNotReadyReasons: (keys: string[]) => keys,
  }))!
  return { ...state, model, agentModelId, updates, stop: () => scope.stop() }
}

test('marketplace composer uses membership scene models when raw source models are absent', () => {
  const app = controller()
  try {
    assert.deepEqual(app.availableModels.value.map((model: any) => model.id), ['flash', 'allowed', 'locked'])
    app.handleModelChange('allowed')
    assert.equal(app.selectedModelId.value, 'allowed')
    assert.ok(app.updates.includes('reasoning'))
    app.handleModelChange('locked')
    assert.equal(app.selectedModelId.value, 'allowed')
    app.handleModelChange('unknown-source-model')
    assert.equal(app.selectedModelId.value, 'allowed')
  } finally { app.stop() }
})

test('late agent metadata does not overwrite the selected consumer model', async () => {
  const app = controller()
  try {
    app.model.value = 'allowed'
    app.agentModelId.value = 'source-private-model'
    await nextTick()
    assert.equal(app.selectedModelId.value, 'allowed')
  } finally { app.stop() }
})

test('owned Lite agents use the same catalog while Standard native custom agents retain their contract', () => {
  const lite = controller({ market: false })
  const standard = controller({ lite: false, market: false })
  try {
    assert.equal(lite.sceneManagedByConsumerResolver.value, true)
    assert.equal(standard.sceneManagedByConsumerResolver.value, false)
  } finally { lite.stop(); standard.stop() }
})

test('owned Lite readiness validates the selected member model even if source defaults are missing', () => {
  const app = controller({ market: false })
  try {
    app.handleModelChange('allowed')
    const readiness = app.collectAgentNotReadyReasons({ id: 'owned', is_builtin: false, config: { model_id: 'old-source-model', kb_selection_mode: 'none' } }, true)
    assert.deepEqual(readiness.keys, [])
  } finally { app.stop() }
})

test('manual Standard shared-builtin selection preserves its source-model behavior while Lite retains the member model', async () => {
  const actionSource = ast.statements.find(statement => ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some(declaration => declaration.name.getText(ast) === 'handleSelectAgent'))!.getText(ast)
  const actionJS = ts.transpileModule(`${actionSource}; return handleSelectAgent`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  for (const lite of [false, true]) {
    const selectedModelId = ref('member-choice')
    const action = new Function('context', `const { authStore, chatResources, settingsStore, agents, collectAgentNotReadyReasons, sceneManagedByConsumerResolver, ensureModelSelection, selectedModelId, BUILTIN_QUICK_ANSWER_ID, BUILTIN_SMART_REASONING_ID, t, MessagePlugin } = context; ${actionJS}`)({
      authStore: { isLiteMode: lite }, chatResources: { isFresh: () => true },
      settingsStore: { selectAgent() {}, toggleAgent() {} }, agents: ref([]),
      collectAgentNotReadyReasons: () => ({ keys: [], labels: [] }), sceneManagedByConsumerResolver: ref(true),
      ensureModelSelection() {}, selectedModelId, BUILTIN_QUICK_ANSWER_ID: 'quick', BUILTIN_SMART_REASONING_ID: 'smart',
      t: (key: string) => key, MessagePlugin: { success() {} },
    })
    await action({ id: 'smart', is_builtin: true, config: { model_id: 'source-model', agent_mode: 'smart-reasoning' } }, '77')
    assert.equal(selectedModelId.value, lite ? 'member-choice' : 'source-model')
  }
})
