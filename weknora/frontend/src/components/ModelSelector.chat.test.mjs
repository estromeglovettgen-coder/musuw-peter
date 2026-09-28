import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./ModelSelector.vue', import.meta.url), 'utf8')
const inputField = readFileSync(new URL('./Input-field.vue', import.meta.url), 'utf8')
const finalContract = readFileSync(new URL('../assets/musuw-final-contract-closure.css', import.meta.url), 'utf8')

const chatTemplate = source.slice(source.indexOf('<template v-if="mode === \'chat\'">'), source.indexOf('\n    <t-select'))

test('chat picker mirrors the compact native agent/model/reasoning listbox contract', () => {
  for (const token of [
    "mode === 'chat'",
    "view === 'overview'",
    'visual-model-selector__chat-row',
    'role="listbox"',
    'tabindex="0"',
    'aria-activedescendant',
    'handleModelKeydown',
    'handleReasoningKeydown',
    'handleAgentKeydown',
    'ArrowDown',
    'ArrowUp',
    "event.key === 'Escape'",
    "event.key === ' '",
    'v-for="model in chatModels"',
    'v-for="(option, index) in reasoningOptions"',
    'v-for="(option, index) in chatAgentOptions"',
    'max-height: min(250px, calc(var(--visual-model-menu-max-height, 340px) - 52px), 48vh)',
    'props.models.filter(model => !!model.id)',
    "props.mode === 'catalog' && !props.allModels",
  ]) {
    assert.ok(source.includes(token), `chat picker lost ${token}`)
  }
  const modelKeyboard = source.slice(
    source.indexOf('const handleModelKeydown'),
    source.indexOf('const handleReasoningKeydown'),
  )
  const reasoningKeyboard = source.slice(
    source.indexOf('const handleReasoningKeydown'),
    source.indexOf('const handlePanelKeydown'),
  )
  const agentKeyboard = source.slice(
    source.indexOf('const handleAgentKeydown'),
    source.indexOf('const handleModelKeydown'),
  )
  assert.match(agentKeyboard, /event\.key === ' '/, 'agent listbox Space must select the active option')
  assert.match(modelKeyboard, /event\.key === ' '/, 'model listbox Space must select the active option')
  assert.match(reasoningKeyboard, /event\.key === ' '/, 'reasoning listbox Space must select the active option')

  for (const removedToken of [
    'role="combobox"',
    'visual-model-selector__chat-search',
    'searchQuery',
    'modelGroups',
    'providerLabel',
    'model.description',
    'reasoningDescription',
  ]) assert.equal(chatTemplate.includes(removedToken), false, `chat template still contains ${removedToken}`)
  assert.equal(chatTemplate.includes('<small'), false, 'chat list options must remain single-line labels')
})

test('chat picker preserves the native business state and keeps catalog mode intact', () => {
  for (const token of [
    "'select-model'",
    "'select-reasoning'",
    "'update:view'",
    '@change="handleModelChange"',
    'value="__add_model__"',
    ':models="availableModels"',
    ':selected-model-id="selectedModelId"',
    ':reasoning-options="reasoningOptions"',
    ':reasoning-effort="reasoningEffort"',
  ]) {
    const haystack = `${source}\n${inputField}`
    assert.ok(haystack.includes(token), `business contract lost ${token}`)
  }
  assert.match(source, /emit\('update:selectedModelId', value(?: \|\| '')?\)/)
  assert.equal(inputField.includes('<AgentSelector'), false, 'agent candidates must not own a second popup component')
  assert.ok(source.includes('class="visual-model-selector__chat-row is-agent"'))
  assert.ok(source.includes("hoverOpen('agents')"))
  assert.ok(source.includes("emit('select-agent', option.agent, option.sourceTenantId)"))
  assert.ok(inputField.includes(':agents="enabledAgents"'))
  assert.ok(inputField.includes(':shared-agents="orgStore.sharedAgents"'))
  assert.ok(inputField.includes('@select-agent="selectAgentFromPicker"'))
  assert.equal(inputField.includes('agentPickerOpen'), false, 'agent selection must not gain a second open state')
  assert.equal(inputField.includes('v-for="agent in enabledAgents"'), false, 'composer must not duplicate native agent selection')
  assert.equal(inputField.includes('__thinking-switch'), false)
})

test('chat picker keeps locked scene options visible and opens the shared upgrade prompt without selecting them', () => {
  for (const token of [
    'locked',
    'selectable',
    'aria-disabled',
    'showConsumerUpgradePrompt',
    "t('entitlement.advancedModelUpgradeBody')",
    "if (option.locked || !option.selectable)",
  ]) assert.ok(source.includes(token), `scene picker lost ${token}`)
  assert.match(source, /option\.locked[\s\S]*?showConsumerUpgradePrompt/)
})

test('chat picker keeps long names in a single aligned column and adapts to narrow screens', () => {
  for (const token of [
    'display: flex',
    'gap: 4px',
    'min-height: 44px',
    'padding: 6px 10px',
    'text-overflow: ellipsis',
    'white-space: nowrap',
    '@media (max-width: 430px)',
    '@media (max-width: 540px)',
    'bottom: calc(100% + 6px)',
    'right: 0 !important',
    'calc(100vw - 32px)',
    'max-height: min(250px, calc(var(--visual-model-menu-max-height, 340px) - 52px), 48vh)',
    'overflow-y: auto',
    'visualModelDropdownStyle',
    'window.innerHeight - rect.top + 6',
    'window.innerWidth - rect.right',
    ':style="visualModelDropdownStyle"',
    'width: min(224px, calc(100vw - 32px))',
    'visual-chat-composer__combined-picker',
    'visual-model-selector__chat-row is-agent',
  ]) assert.ok(inputField.includes(token) || source.includes(token), `layout contract lost ${token}`)
  const optionRule = source.match(/\.visual-model-selector__chat-option\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  assert.doesNotMatch(optionRule, /min-height:/, 'reference flyout rows must keep their source compact height')
  assert.equal(inputField.includes('height: style.maxHeight'), false, 'overview must size to content')
  assert.equal(inputField.includes('visual-model-selector__chat-search-wrap'), false, 'legacy search layout must stay removed')
})

test('chat picker owns complete light and dark surface tokens', () => {
  for (const token of [
    '--chat-picker-ink:',
    '--chat-picker-hover:',
    '--chat-picker-selected:',
    ':root[theme-mode="dark"] .visual-model-selector__chat-panel',
    '@media (prefers-color-scheme: dark)',
  ]) assert.ok(source.includes(token), `theme contract lost ${token}`)
  for (const token of [
    ':root[theme-mode="dark"] .visual-chat-composer__combined-picker',
  ]) assert.ok(inputField.includes(token), `composer theme contract lost ${token}`)
})

test('composer capsule keeps the model label visible and never replaces it with a loading spinner', () => {
  const modelIndex = inputField.indexOf('class="visual-chat-composer__combined-picker-model"')
  assert.ok(modelIndex >= 0, 'composer capsule must render the selected model label')
  assert.equal(
    inputField.lastIndexOf('v-if="!isBuiltinAgentSelected"', modelIndex),
    -1,
    'builtin quick/reasoning modes must keep the model label in the capsule',
  )
  assert.doesNotMatch(inputField, /<t-loading[^>]*modelsLoading/, 'capsule must not show a loading spinner')
  assert.match(
    inputField,
    /const selectedModelCapsuleName = computed\([\s\S]*?selectedModel\?\.display_name\?\.trim\(\)[\s\S]*?sceneOptions\.find\(\(option\) => option\.model_id === selectedModelId\)\?\.display_name\?\.trim\(\)[\s\S]*?if \(selectedModelId\) return selectedModelId/,
    'capsule must resolve a stable model label without changing the frozen controller',
  )
  assert.match(inputField, /\{\{ selectedModelCapsuleName \}\}/)
  assert.match(inputField, /legacyName !== t\('common\.loading'\)/)
})

test('agent candidates reuse the model flyout shell, rows, checkmark, placement, and open state', () => {
  for (const token of [
    "const hoveredSubmenu = ref<'agents' | 'models' | 'reasoning' | null>",
    "const hoverOpen = (nextView: 'agents' | 'models' | 'reasoning')",
    "const toggleHover = (nextView: 'agents' | 'models' | 'reasoning')",
    "hoveredSubmenu === 'agents'",
    'visual-model-selector__chat-flyout',
    'visual-model-selector__chat-list',
    'visual-model-selector__chat-option',
    'visual-model-selector__chat-check',
    'updateSubmenuPlacement',
    'submenuPlacement',
  ]) assert.ok(source.includes(token), `agent picker failed to reuse ${token}`)

  for (const forbidden of [
    'agent-selector-overlay',
    'agent-selector-dropdown',
    'detailPanelStyle',
    'activeDetail',
    'AgentAvatar',
    'manageAgents',
    'builtinAgents)',
    'customAgents)',
  ]) assert.equal(source.includes(forbidden), false, `agent picker retained independent UI ${forbidden}`)
})
