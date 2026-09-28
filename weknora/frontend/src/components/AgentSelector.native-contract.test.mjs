import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const modelSelector = readFileSync(new URL('./ModelSelector.vue', import.meta.url), 'utf8')
const inputField = readFileSync(new URL('./Input-field.vue', import.meta.url), 'utf8')
const inputBusiness = readFileSync(new URL('../assets/business-baselines/Input-field.pre-view.vue', import.meta.url), 'utf8')

test('agent selection retains the WeKnora main readiness, source-tenant, and store chain', () => {
  for (const token of [
    'const handleSelectAgent = async',
    'collectAgentNotReadyReasons(',
    'showAgentNotReadyMessage(',
    'settingsStore.selectAgent(agent.id, sourceTenantId)',
    'settingsStore.toggleAgent(!!isAgentType)',
  ]) assert.ok(inputBusiness.includes(token), `native agent chain lost ${token}`)

  for (const token of [
    "'select-agent': [agent: CustomAgent, sourceTenantId?: string]",
    "emit('select-agent', option.agent, option.sourceTenantId)",
    ':shared-agents="orgStore.sharedAgents"',
    '@select-agent="selectAgentFromPicker"',
    'handleSelectAgent?.(agent, sourceTenantId)',
  ]) assert.ok(`${modelSelector}\n${inputField}`.includes(token), `native agent bridge lost ${token}`)
})

test('agent candidates are flat rows inside the existing model picker flyout', () => {
  assert.equal(existsSync(new URL('./AgentSelector.vue', import.meta.url)), false, 'independent AgentSelector popup must be removed')
  assert.equal(inputField.includes('<AgentSelector'), false)

  const agentBranchStart = modelSelector.indexOf("hoveredSubmenu === 'agents'")
  const modelBranchStart = modelSelector.indexOf("hoveredSubmenu === 'models'", agentBranchStart)
  const agentBranch = modelSelector.slice(agentBranchStart, modelBranchStart)
  assert.notEqual(agentBranchStart, -1)
  assert.notEqual(modelBranchStart, -1)

  for (const token of [
    'role="listbox"',
    'aria-activedescendant',
    '@keydown="handleAgentKeydown"',
    'v-for="(option, index) in chatAgentOptions"',
    'visual-model-selector__chat-option',
    'visual-model-selector__chat-option-copy',
    'visual-model-selector__chat-check',
    ':aria-selected="isAgentOptionSelected(option)"',
  ]) assert.ok(agentBranch.includes(token), `flat agent list lost ${token}`)

  for (const forbidden of [
    'header',
    'manage',
    'group',
    'AgentAvatar',
    'agent-option-actions',
    'not-ready-icon',
    'detail',
    'preview',
    'control-platform',
  ]) assert.equal(agentBranch.toLowerCase().includes(forbidden.toLowerCase()), false, `flat agent list contains ${forbidden}`)
})

test('agent/model/reasoning share one shell, placement state, and keyboard pattern', () => {
  assert.equal((modelSelector.match(/class="visual-model-selector__chat-flyout"/g) || []).length, 1)
  for (const token of [
    "const hoveredSubmenu = ref<'agents' | 'models' | 'reasoning' | null>",
    "const hoverOpen = (nextView: 'agents' | 'models' | 'reasoning')",
    "const toggleHover = (nextView: 'agents' | 'models' | 'reasoning')",
    'const updateSubmenuPlacement = () =>',
    'const handleAgentKeydown =',
    'const handleModelKeydown =',
    'const handleReasoningKeydown =',
    'visual-model-selector__chat-flyout.is-agents',
    ':root[theme-mode="dark"] .visual-model-selector__chat-panel',
    '@media (prefers-reduced-motion: reduce)',
  ]) assert.ok(modelSelector.includes(token), `shared selector primitive lost ${token}`)

  for (const forbidden of [
    'dropdownStyle',
    'anchorEl',
    'agent-selector-overlay',
    'agent-selector-dropdown',
    'DETAIL_PANEL',
  ]) assert.equal(`${modelSelector}\n${inputField}`.includes(forbidden), false, `second popup mechanism remains: ${forbidden}`)
})
