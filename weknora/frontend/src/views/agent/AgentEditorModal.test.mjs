import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./AgentEditorModal.vue', import.meta.url), 'utf8')
const listSource = readFileSync(new URL('./AgentList.vue', import.meta.url), 'utf8')
const editorResourceSource = readFileSync(new URL('../../stores/editorResources.ts', import.meta.url), 'utf8')

test('editing an agent closes the editor after a successful save', () => {
  assert.match(
    source,
    /await updateAgent\(formData\.value\.id, formData\.value\);\s*MessagePlugin\.success\(t\('agent\.messages\.updated'\)\);\s*emit\('success'\);\s*handleClose\(\);/,
  )
})
test('the first successful create stays open for integration setup', () => {
  const createBranch = source.match(
    /if \(editorMode\.value === 'create'\) \{([\s\S]*?)^\s{4}\} else \{/m,
  )?.[1]
  assert.ok(createBranch, 'expected to find the create branch')
  assert.doesNotMatch(createBranch, /handleClose\(\)/)
  assert.match(createBranch, /savedAgent\.value = created;/)
})

test('save button labels distinguish create from save-and-close', () => {
  assert.match(
    source,
    /const saveButtonLabel = computed\(\(\) =>\s*editorMode\.value === 'create'\s*\? t\('agent\.editor\.buttons\.create'\)\s*: t\('agent\.editor\.buttons\.saveAndClose'\)\s*\)/,
  )
  assert.match(source, /saveButtonLabel/)
})

test('shows a post-create hint after the first successful save', () => {
  assert.match(source, /const isPostCreateSession = computed\(\(\) => !!savedAgent\.value\)/)
  assert.match(source, /settings-footer-note/)
  assert.match(source, /agent\.editor\.postCreateHint\.title/)
  assert.match(source, /authStore\.isLiteMode[\s\S]*agent\.editor\.postCreateHint\.footerLite/)
})

test('new agents use deterministic upstream defaults with a Lite scene fallback', () => {
  const defaultBlock = source.slice(
    source.indexOf('const applyDefaultModelsIfEmpty = () =>'),
    source.indexOf('const agentMode = computed'),
  )
  assert.match(source, /import \{ DEFAULT_CHAT_MODEL_ID \} from '@\/utils\/managedChatModels'/)
  assert.match(defaultBlock, /model\.id === DEFAULT_CHAT_MODEL_ID/)
  assert.match(defaultBlock, /authStore\.isLiteMode \? DEFAULT_CHAT_MODEL_ID/)
  assert.match(defaultBlock, /selectInitialModelId\(allModels\.value, 'KnowledgeQA'\)/)
  assert.match(defaultBlock, /selectInitialModelId\(allModels\.value, 'Rerank'\)/)
  assert.match(defaultBlock, /selectInitialModelId\(allModels\.value, 'VLLM'\)/)
  assert.match(defaultBlock, /selectInitialModelId\(allModels\.value, 'ASR'\)/)
  assert.match(defaultBlock, /consumerSceneOptions\.rag\?\.effective_model_id/)
  assert.match(defaultBlock, /consumerSceneOptions\.rerank\?\.effective_model_id/)
  assert.match(defaultBlock, /consumerSceneOptions\.vision\?\.effective_model_id/)
  assert.match(defaultBlock, /consumerSceneOptions\.asr\?\.effective_model_id/)
  assert.match(defaultBlock, /config\.model_id = modelId/)
  assert.match(defaultBlock, /config\.query_understand_model_id = modelId/)
  assert.match(defaultBlock, /config\.rerank_model_id = rerankModelId/)
  assert.match(defaultBlock, /config\.vlm_model_id = vlmModelId/)
  assert.match(defaultBlock, /config\.asr_model_id = asrModelId/)
})

test('new agents keep the description empty until the user writes one', () => {
  const createPath = source.slice(
    source.indexOf('// 创建新智能体，使用系统默认值'),
    source.indexOf('if (!authStore.isLiteMode) await syncInstalledSkills()'),
  )
  const defaultForm = source.slice(
    source.indexOf('const defaultFormData = {'),
    source.indexOf('const formData = ref'),
  )
  assert.match(defaultForm, /description:\s*''/)
  assert.doesNotMatch(createPath, /formData\.value\.description\s*=\s*getPresetDefaultDescription\(preset\)/)
})

test('new agents leave the description blank instead of copying a type preset', () => {
  const createPath = source.slice(
    source.indexOf('// 创建新智能体，使用系统默认值'),
    source.indexOf('if (!authStore.isLiteMode) await syncInstalledSkills()'),
  )
  assert.match(createPath, /const newFormData = JSON\.parse\(JSON\.stringify\(defaultFormData\)\)/)
  assert.doesNotMatch(
    createPath,
    /formData\.value\.description\s*=\s*getPresetDefaultDescription\(preset\)/,
    'preset descriptions are useful for explicit type switches, not for a new blank form',
  )
})

test('new agents prefer the managed DeepSeek V4 Flash chat model', () => {
  const defaultBlock = source.slice(
    source.indexOf('const applyDefaultModelsIfEmpty = () =>'),
    source.indexOf('const agentMode = computed'),
  )
  assert.match(source, /DEFAULT_CHAT_MODEL_ID/)
  assert.match(defaultBlock, /model\.id === DEFAULT_CHAT_MODEL_ID/)
  assert.match(defaultBlock, /authStore\.isLiteMode \? DEFAULT_CHAT_MODEL_ID/)
})

test('Lite new agents receive a first available localized name in either mode', () => {
  const createPath = source.slice(
    source.indexOf('// 创建新智能体，使用系统默认值'),
    source.indexOf('if (!authStore.isLiteMode) await syncInstalledSkills()'),
  )
  assert.match(source, /import \{ nextAvailableLocalizedName \} from '@\/utils\/localizedDefaultName'/)
  assert.match(source, /agentEditor\.defaultNameWithIndex/)
  assert.match(source, /existingAgentNames\?: string\[\]/)
  assert.match(source, /props\.existingAgentNames\s*\?\?\s*\(Array\.isArray\(chatResources\.agents\)/)
  assert.match(listSource, /:existing-agent-names="agents\.map\(\(agent\) => agent\.name\)"/)
  assert.match(source, /chatResources\.agents/)
  assert.match(createPath, /if \(authStore\.isLiteMode && !formData\.value\.name\) \{[\s\S]*getLiteDefaultAgentName\(\)/)
  assert.match(createPath, /if \(newFormData\.config\.agent_mode === 'smart-reasoning'\)/)
  assert.match(createPath, /if \(!authStore\.isLiteMode\) \{[\s\S]*getPresetDefaultName\(preset\)/)
})

test('new agents alone receive ready upload, web, and regular-tool defaults', () => {
  const createPath = source.slice(
    source.indexOf('// 创建新智能体，使用系统默认值'),
    source.indexOf('if (!authStore.isLiteMode) await syncInstalledSkills()'),
  )
  const editPathStart = source.indexOf("if (props.mode === 'edit' && props.agent)")
  assert.notEqual(editPathStart, -1, 'expected to find the edit branch')
  const editPath = source.slice(
    editPathStart,
    source.indexOf('// 创建新智能体，使用系统默认值'),
  )
  const policy = source.slice(
    source.indexOf('const getDefaultSmartReasoningTools = () =>'),
    source.indexOf('const agentMode = computed'),
  )

  assert.match(createPath, /applyAgentTypePreset\(preset\)[\s\S]*applyNewAgentCapabilityDefaults\(\)/)
  assert.doesNotMatch(editPath, /applyNewAgentCapabilityDefaults\(\)/)
  assert.match(policy, /image_upload_enabled = true/)
  assert.match(policy, /audio_upload_enabled = true/)
  assert.match(policy, /attachment_image_understanding = true/)
  assert.match(policy, /web_search_enabled = true/)
  assert.match(policy, /web_fetch_enabled = true/)
  assert.match(policy, /web_search_max_results = 5/)
  assert.match(policy, /web_fetch_top_n = 2/)
  assert.match(policy, /allTools\.value\.map\(\(tool\) => tool\.value\)/)
  assert.match(policy, /search_conversations/)
  assert.match(policy, /mcp_selection_mode = 'none'/)
  assert.match(policy, /skills_selection_mode = 'none'/)
  assert.match(policy, /sandbox_config_id = ''/)

  const legacyDefaults = source.slice(
    source.indexOf('const defaultFormData = {'),
    source.indexOf('const formData = ref'),
  )
  assert.match(legacyDefaults, /image_upload_enabled:\s*false/)
  assert.match(legacyDefaults, /attachment_image_understanding:\s*false/)
  assert.match(legacyDefaults, /web_search_enabled:\s*false/)
  assert.doesNotMatch(legacyDefaults, /allowed_tools:\s*\[(?!\])/)
})

test('new regular-tool defaults exclude sandbox, skills, and governed memory', () => {
  const policyStart = source.indexOf('const getDefaultSmartReasoningTools = () =>')
  assert.notEqual(policyStart, -1, 'expected a creation-only capability policy')
  const policy = source.slice(
    policyStart,
    source.indexOf('const agentMode = computed'),
  )
  for (const excluded of [
    'shell_exec',
    'list_sandbox_files',
    'read_sandbox_file',
    'write_sandbox_file',
    'edit_sandbox_file',
    'read_skill',
    'execute_skill_script',
    'search_memory',
  ]) {
    assert.doesNotMatch(policy, new RegExp(`['\"]${excluded}['\"]`))
  }
})

test('effective web tools respect the independent page-fetch switch', () => {
  const effectiveTools = source.slice(
    source.indexOf('const effectiveTools = computed'),
    source.indexOf('// 勾选了但当前配置下无法生效的工具数量'),
  )
  assert.match(
    effectiveTools,
    /if \(formData\.value\.config\.web_search_enabled\) \{[\s\S]*?value: 'web_search'/,
  )
  assert.match(
    effectiveTools,
    /if \(formData\.value\.config\.web_search_enabled && formData\.value\.config\.web_fetch_enabled\) \{[\s\S]*?value: 'web_fetch'/,
  )
})

test('explicit mode switches use full smart tools and keep quick answer tool-free', () => {
  const modeWatcher = source.slice(
    source.indexOf('watch(agentMode, (val, _oldVal) => {'),
    source.indexOf('// 监听知识库启用状态变化'),
  )
  assert.match(
    modeWatcher,
    /if \(isInitializing\.value\) return/,
    'loading an existing agent must not be mistaken for an explicit mode switch',
  )
  assert.match(
    modeWatcher,
    /val === 'smart-reasoning'[\s\S]*allowed_tools = getDefaultSmartReasoningTools\(\)/,
  )
  assert.match(
    modeWatcher,
    /else \{[\s\S]*allowed_tools = \[\][\s\S]*max_iterations = 1/,
  )
})

test('new agents and missing legacy preferences default to thinking enabled', () => {
  assert.match(source, /thinking:\s*true,/)
  assert.match(source, /if \(agentData\.config\.thinking == null\) \{\s*agentData\.config\.thinking = true;/)
})

test('agent dependencies retain the fail-together Promise.all contract', () => {
  const dependencies = source.slice(
    source.indexOf('const loadDependencies = async () =>'),
    source.indexOf('// 跳转到模型管理页面添加模型'),
  )
  assert.match(dependencies, /await Promise\.all\(\[/)
  assert.match(dependencies, /chatResources\.ensureConsumerSceneOptions\('rag'\)/)
  assert.match(dependencies, /chatResources\.ensureConsumerSceneOptions\('rerank'\)/)
  assert.match(dependencies, /chatResources\.ensureConsumerSceneOptions\('vision'\)/)
  assert.match(dependencies, /chatResources\.ensureConsumerSceneOptions\('asr'\)/)
  assert.match(dependencies, /chatResources\.ensureKnowledgeBases\(\)/)
  assert.match(dependencies, /chatResources\.ensureWebSearchProviders\(\)/)
  assert.match(dependencies, /chatResources\.ensureSandboxConfigs\(\)/)
  assert.match(dependencies, /editorResources\.prefetchAgentEditorDeps\(\)/)
  assert.doesNotMatch(dependencies, /Promise\.allSettled/)
  assert.match(source, /if \(!authStore\.isLiteMode\) await syncInstalledSkills\(\)/)
  assert.match(source, /if \(!props\.visible \|\| authStore\.isLiteMode\) return[\s\S]*await syncInstalledSkills\(\)/)
  assert.match(source, /async function syncInstalledSkills\(force = false\) \{\s*if \(authStore\.isLiteMode\) return/)
  assert.match(source, /function openSkillSettings\(\) \{\s*if \(authStore\.isLiteMode\) return/)
})

test('consumer agent editor keeps the compact Lite tabs while Standard exposes main tabs', () => {
  const navBlock = source.match(
    /const navItems = computed\(\(\) => \{([\s\S]*?)^\}\);/m,
  )?.[1]
  const basicSection = source.slice(
    source.indexOf('<!-- 基础设置 -->'),
    source.indexOf('<!-- 提示词 -->'),
  )
  assert.ok(navBlock, 'expected the native agent navigation definition')
  assert.doesNotMatch(navBlock, /key: 'model'/)

  const standardStart = navBlock.indexOf("items.push({ key: 'conversation'")
  assert.ok(standardStart >= 0, 'expected the Standard navigation branch')
  const liteBranch = navBlock.slice(navBlock.indexOf('if (authStore.isLiteMode)'), standardStart)
  assert.match(liteBranch, /if \(authStore\.isLiteMode\)/)
  assert.match(liteBranch, /if \(isAgentMode\.value\)[\s\S]*key: 'mcp'/)
  assert.doesNotMatch(liteBranch, /hasKnowledgeBase/)
  for (const hidden of ['suggestions', 'conversation', 'retrieval', 'websearch', 'multimodal', 'tools', 'skills', 'share']) {
    assert.doesNotMatch(liteBranch, new RegExp(`key: '${hidden}'`))
  }

  const standardBranch = navBlock.slice(standardStart)
  for (const visible of ['conversation', 'websearch', 'multimodal', 'suggestions']) {
    assert.match(standardBranch, new RegExp(`key: '${visible}'`))
  }
  assert.match(standardBranch, /key: 'retrieval'/)
  assert.match(standardBranch, /key: 'tools'/)
  assert.match(standardBranch, /key: 'skills'/)
  assert.match(standardBranch, /key: 'mcp'/)
  assert.match(standardBranch, /key: 'share'/)
  for (const visible of ['basic', 'knowledge', 'prompts']) {
    assert.match(navBlock, new RegExp(`key: '${visible}'`))
  }

  assert.match(source, /const LITE_EDITOR_VISIBLE_SECTIONS = new Set\(\['basic', 'knowledge', 'prompts', 'mcp'\]\)/)
  assert.match(source, /const visibleSections = authStore\.isLiteMode\s*\?\s*LITE_EDITOR_VISIBLE_SECTIONS\s*:\s*EDITOR_VISIBLE_SECTIONS/)
  assert.match(source, /if \(resolved !== section \|\| !navItems\.value\.some\(\(item\) => item\.key === resolved\)\)/)
  assert.match(source, /key: 'retrieval'/)
  assert.match(basicSection, /data-agent-field="summary_model"/)
  assert.match(basicSection, /<ModelSelector model-type="KnowledgeQA"/)
  assert.match(basicSection, /:all-models="authStore\.isLiteMode \? \[\] : allModels"/)
  assert.match(basicSection, /:show-add-model="!authStore\.isLiteMode"/)
  assert.match(basicSection, /:scene-options="authStore\.isLiteMode \? agentModelSceneOptions : \[\]"/)
  assert.doesNotMatch(source, /data-guide="agent-create-agent-type"/)
})

test('an unreadable tenant storage config cannot discard public agent defaults', () => {
  const storageLoader = editorResourceSource.slice(
    editorResourceSource.indexOf('async function ensureStorageEngine'),
    editorResourceSource.indexOf('function resolveUsableStorageProvider'),
  )

  assert.match(storageLoader, /getStorageEngineConfig\(\)\.catch\(\(\) => null\)/)
  assert.match(storageLoader, /getStorageEngineStatus\(\)/)
  assert.match(storageLoader, /storageConfig\.value = configRes\?\.data \?\? null/)
})

test('Lite agent knowledge copy and RAG preset description stay document-only while Standard keeps FAQ wording', () => {
  assert.match(source, /knowledgeConfigDescription/)
  assert.match(source, /authStore\.isLiteMode\s*\?\s*t\('agent\.editor\.knowledgeConfigDescLite'\)\s*:\s*t\('agent\.editor\.knowledgeConfigDesc'\)/)
  assert.match(source, /authStore\.isLiteMode[\s\S]*?p\.id === 'rag-qa'[\s\S]*?agentEditor\.agentType\.liteDescriptions\.ragQa/)
})

test('prompt configuration exposes only the system prompt while preserving hidden values', () => {
  const promptNavBlock = source.match(
    /const promptNavItems = computed\(\(\) => \{([\s\S]*?)^\}\);/m,
  )?.[1]
  assert.ok(promptNavBlock, 'expected the native prompt navigation definition')
  assert.doesNotMatch(promptNavBlock, /key: '(?:context|intent|rewrite-system|rewrite-user|fallback)'/)
  assert.match(source, /v-if="false"\s+data-agent-hidden-prompts="advanced"/)
  assert.match(source, /context_template: ''/)
})

test('quick agents retain hidden context validation and model errors return to Basic', () => {
  const saveBlock = source.slice(source.indexOf('const handleSave = async () =>'))
  assert.match(
    saveBlock,
    /!isAgentMode\.value && \(!formData\.value\.config\.context_template \|\| !formData\.value\.config\.context_template\.trim\(\)\)[\s\S]*?contextTemplateRequired[\s\S]*?currentSection\.value = 'prompts'/,
  )
  assert.match(saveBlock, /modelRequired[\s\S]*?currentSection\.value = 'basic'/)
  assert.match(
    saveBlock,
    /audio_upload_enabled && !formData\.value\.config\.asr_model_id[\s\S]*?asrModelRequired[\s\S]*?currentSection\.value = 'basic'/,
  )
})

test('knowledge scope keeps bounded selection controls but hides file type restrictions', () => {
  const knowledgeSection = source.slice(
    source.indexOf('<!-- 知识库配置 -->'),
    source.indexOf('<!-- 网络搜索设置 -->'),
  )
  assert.match(knowledgeSection, /kbSelectionMode/)
  assert.match(knowledgeSection, /kbSelectionMode === 'selected'/)
  assert.match(knowledgeSection, /retrieve_kb_only_when_mentioned/)
  assert.match(knowledgeSection, /v-if="false"\s+data-agent-hidden-field="supported-file-types"/)
})

test('scope selectors use a bounded Musuw setting control instead of a clipped radio strip', () => {
  const scopeLabels = [
    'agent.editor.knowledgeBases',
    'agentEditor.mcp.label',
    'agent.editor.skillsSelection',
  ]
  for (const label of scopeLabels) {
    assert.ok(source.includes(label), `expected scope label ${label}`)
  }
  assert.match(source, /class="setting-control agent-scope-select-control"[\s\S]*?<t-select[\s\S]*?kbSelectionMode/)
  assert.match(source, /class="setting-control agent-scope-select-control"[\s\S]*?<t-select[\s\S]*?mcpSelectionMode/)
  assert.match(source, /class="setting-control agent-scope-select-control"[\s\S]*?<t-select[\s\S]*?skillsSelectionMode/)
  assert.doesNotMatch(source, /agent-segmented-control agent-segmented-control--scope/)
  assert.doesNotMatch(source, /agent-segmented-control--scope\s*\{[\s\S]*?overflow-x\s*:/)
})

test('agent tool choices keep the settings-row language and compact neutral cards', () => {
  const toolSection = source.slice(source.lastIndexOf('class="setting-row setting-row-vertical"', source.indexOf('data-agent-field="allowed_tools"')), source.indexOf('<!-- 有效工具预览'))
  assert.match(toolSection, /setting-row setting-row-vertical/)
  assert.match(toolSection, /tool-card--compact/)
  assert.doesNotMatch(toolSection, /background:\s*(?:#(?:0*eaf|fff7|fef)|var\(--td-(?:brand|warning)-color-[^)]+\))/)
})

test('conversation settings stay reachable in smart-reasoning mode', () => {
  assert.match(source, /v-show="currentSection === 'conversation'"/)
  assert.doesNotMatch(source, /currentSection === 'conversation' && !isAgentMode/)
  const navItems = source.match(/const navItems = computed\(\(\) => \{([\s\S]*?)^\}\);/m)?.[1]
  assert.ok(navItems, 'expected to find the nav items computed')
  assert.match(navItems, /^  items\.push\(\{ key: 'conversation'/m)
})

test('history turns is editable in smart-reasoning mode', () => {
  assert.match(source, /v-model="formData\.config\.history_turns"/)
  assert.match(source, /formData\.config\.multi_turn_enabled \|\| isAgentMode[\s\S]{0,500}history_turns/)
})

test('multi-turn switch stays hidden in smart-reasoning mode', () => {
  assert.match(source, /v-if="!isAgentMode" class="setting-row">[\s\S]{0,420}v-model="formData\.config\.multi_turn_enabled"/)
})

test('query rewrite stays hidden in smart-reasoning mode', () => {
  assert.match(source, /v-if="formData\.config\.multi_turn_enabled && !isAgentMode" class="setting-row">[\s\S]{0,420}v-model="formData\.config\.enable_rewrite"/)
})

test('the section description matches what the mode actually shows', () => {
  assert.match(source, /isAgentMode\.value\s*\?\s*t\('agentEditor\.desc\.conversationSectionAgent'\)/)
  assert.match(source, /<p class="section-description">\{\{ conversationSectionDesc \}\}<\/p>/)
})

test('history turns can be raised beyond the old 20 cap', () => {
  const input = source.match(/<t-input-number v-model="formData\.config\.history_turns"[^>]*>/)
  assert.ok(input, 'expected to find the history turns input')
  assert.match(input[0], /:max="100"/)
})

test('retrieval retention is offered to agents that actually have a knowledge base', () => {
  assert.match(source, /v-if="isAgentMode && hasKnowledgeBase" class="setting-row">[\s\S]{0,420}v-model="formData\.config\.retain_retrieval_history"/)
})

test('skills and sandbox share one editor section', () => {
  const navItems = source.match(/const navItems = computed\(\(\) => \{([\s\S]*?)^\}\);/m)?.[1]
  assert.ok(navItems, 'expected to find the nav items computed')
  assert.match(navItems, /key: 'skills'/)
  assert.match(navItems, /icon: SKILL_ICON/)
  assert.doesNotMatch(navItems, /key: 'sandbox'/)
  assert.match(source, /v-show="currentSection === 'skills' && isAgentMode"/)
  assert.doesNotMatch(source, /currentSection === 'sandbox' && isAgentMode/)
  assert.match(source, /sandbox: 'skills'/)
  assert.match(source, /formData\.value\.config\.sandbox_config_id/)
  assert.match(source, /:disabled="!canEnableSkills"/)
  assert.match(source, /sandbox-option/)
  assert.doesNotMatch(source, /skill-info-box/)
})

test('agent skill picker uses the catalog and only enables ready installs', () => {
  assert.match(source, /function autoBindSoleSandbox\(/)
  assert.match(source, /canEnableSkills/)
  assert.match(source, /catalogSkillRows/)
  assert.match(source, /showCatalogSkillList/)
  assert.match(source, /skillsSelectionMode\.value !== 'none'/)
  assert.match(source, /:disabled="!skill\.selectable"/)
  assert.match(source, /catalogPendingCount/)
  assert.match(source, /installPartial/)
  assert.match(source, /installCatalogToCurrent/)
  assert.match(source, /agent\.editor\.installToThisSandbox/)
  assert.match(source, /skill-pick-list/)
  assert.match(source, /skill-ready-stat/)
  assert.match(source, /skillsListSummaryReadyOnly/)
  assert.match(source, /selectedSandboxSummary/)
  assert.match(source, /line-clamp: 2/)
  assert.doesNotMatch(source, /skillsSelectionMode === 'selected' && catalogSkillRows/)
  assert.doesNotMatch(source, /skill-list-summary/)
})
