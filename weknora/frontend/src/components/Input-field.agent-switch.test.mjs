import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inputField = readFileSync(new URL("./Input-field.vue", import.meta.url), "utf8");
const modelSelector = readFileSync(new URL("./ModelSelector.vue", import.meta.url), "utf8");
const inputBusiness = readFileSync(new URL("../assets/business-baselines/Input-field.pre-view.vue", import.meta.url), "utf8");
const settingsStore = readFileSync(new URL("../stores/settings.ts", import.meta.url), "utf8");
const streamClient = readFileSync(new URL("../api/chat/streame.ts", import.meta.url), "utf8");
const chatView = readFileSync(new URL("../views/chat/index.vue", import.meta.url), "utf8");
const chatBusiness = readFileSync(new URL("../assets/business-baselines/ChatIndex.pre-view.vue", import.meta.url), "utf8");

test("managed chat keeps web search enabled while Lite hides the toggle", () => {
  const selectAgentStart = settingsStore.indexOf("selectAgent(agentId: string");
  const getSelectedAgentStart = settingsStore.indexOf("getSelectedAgentId()", selectAgentStart);
  const selectAgentAction = settingsStore.slice(selectAgentStart, getSelectedAgentStart);

  assert.notEqual(selectAgentStart, -1);
  assert.notEqual(getSelectedAgentStart, -1);
  assert.match(selectAgentAction, /this\.settings\.webSearchEnabled = true/);
  assert.doesNotMatch(inputField, /class="control-btn websearch-btn"/);
  assert.match(inputField, /v-if="!authStore\.isLiteMode && showWebSearchButton"/);
});

test("shared-agent web search button waits for source readiness metadata", () => {
  const showWebSearchStart = inputBusiness.indexOf("const showWebSearchButton = computed");
  const showWebSearchEnd = inputBusiness.indexOf("const showImageUploadButton", showWebSearchStart);
  const showWebSearchButton = inputBusiness.slice(showWebSearchStart, showWebSearchEnd);

  assert.notEqual(showWebSearchStart, -1);
  assert.notEqual(showWebSearchEnd, -1);
  assert.match(showWebSearchButton, /isWebSearchReadinessKnown/);
  assert.match(showWebSearchButton, /selectedSharedAgent\.value\?\.web_search_ready/);
});

test("platform agents keep image upload visible while the agent catalog loads", () => {
  const start = inputBusiness.indexOf("const isImageUploadEnabledByAgent = computed");
  const end = inputBusiness.indexOf("const showWebSearchButton", start);
  const block = inputBusiness.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(block, /BUILTIN_QUICK_ANSWER_ID/);
  assert.match(block, /BUILTIN_SMART_REASONING_ID/);
  assert.match(block, /!settingsStore\.selectedAgentSourceTenantId/);
  assert.match(block, /currentAgentConfig\.value\?\.image_upload_enabled === true/);
});

test("empty new workspaces are not mislabeled as knowledge capability mismatches", () => {
  assert.match(inputBusiness, /const mentionCompatibilityFilteredAll = ref\(false\)/);
  assert.match(
    inputBusiness,
    /mentionCompatibilityFilteredAll\.value = scopedKbCount > 0 && availableKbs\.length === 0/,
  );
  assert.match(
    inputBusiness,
    /mentionCompatibilityFilteredAll\.value\s*\? t\("mentionDetail\.noCompatibleKbForAgent"\)\s*:\s*t\("knowledgeList\.empty\.title"\)/,
  );
});

test("consumer chat can select a native agent and sends model-specific reasoning effort", () => {
  assert.match(settingsStore, /thinkingEnabled:\s*boolean/);
  assert.match(settingsStore, /selectedChatModelId:\s*""/);
  assert.match(settingsStore, /thinkingEnabled:\s*true/);
  assert.match(settingsStore, /reasoningEffort:\s*""/);
  assert.match(settingsStore, /applyLiteFirstRunDefaults\(\)/);
  assert.match(settingsStore, /selectedChatModelId:\s*DEFAULT_CHAT_MODEL_ID/);
  assert.match(settingsStore, /reasoningModelId:\s*""/);
  assert.match(settingsStore, /selectedAgentId:\s*BUILTIN_SMART_REASONING_ID/);
  assert.match(inputBusiness, /const thinkingEnabled = computed/);
  assert.match(inputBusiness, /const selectedAgentId = computed\(\{/);
  assert.doesNotMatch(inputBusiness, /get: \(\) => BUILTIN_SMART_REASONING_ID/);
  assert.match(inputBusiness, /const enabledAgents = computed/);
  assert.match(inputBusiness, /const handleSelectAgent = async/);
  assert.match(inputBusiness, /const loadMCPServices = async \(\) => \{\s*try \{/);
  assert.doesNotMatch(inputBusiness, /const loadMCPServices = async \(\) => \{\s*if \(authStore\.isLiteMode\)/);
  assert.match(inputBusiness, /const reasoningEffort = computed/);
  assert.match(inputBusiness, /const reasoningOptions = computed/);
  assert.match(inputBusiness, /modelReasoningEfforts\(selectedModel\.value\)/);
  assert.match(inputBusiness, /resolveModelReasoning\(selectedModel\.value, current\.reasoningEffort, current\.reasoningModelId\)/);
  assert.match(inputBusiness, /model\.is_builtin === true/);
  assert.match(inputBusiness, /provider\?\.trim\(\)\.toLowerCase\(\) === "openrouter"/);
  assert.match(inputField, /v-for="model in availableModels"/);
  assert.match(inputField, /modelPickerView = 'models'/);
  assert.match(inputField, /modelPickerView = 'reasoning'/);
  assert.doesNotMatch(inputField, /__add_model__|__thinking-switch/);
  assert.match(inputField, /class="visual-chat-composer__combined-picker"/);
  assert.match(modelSelector, /class="visual-model-selector__chat-row is-agent"/);
  assert.match(inputField, /<ModelSelector[\s\S]*:agents="enabledAgents"/);
  assert.match(inputField, /<ModelSelector[\s\S]*:shared-agents="orgStore\.sharedAgents"/);
  assert.match(inputField, /<ModelSelector[\s\S]*:selected-agent-id="selectedAgentId"/);
  assert.match(inputField, /<ModelSelector[\s\S]*@select-agent="selectAgentFromPicker"/);
  assert.match(inputField, /handleSelectAgent\?\.\(agent, sourceTenantId\)/);
  assert.doesNotMatch(inputField, /AgentSelector|agentPickerAnchorRef|agentPickerOpen|closeAgentSubmenu|v-for="agent in enabledAgents"/);
  assert.match(inputBusiness, /emit\(["']send-msg["'],[\s\S]*reasoningEffort\.value/);
  assert.match(chatView, /thinking: any, reasoningEffort: any\) => sendMsg\(query, modelId, mentionedItems, imageFiles, attachmentFiles, thinking, reasoningEffort\)/);
  assert.match(chatBusiness, /thinking:\s*thinkingEnabled/);
  assert.match(chatBusiness, /reasoning_effort:\s*reasoningEffort/);
  assert.match(streamClient, /thinking\?:\s*boolean/);
  assert.match(streamClient, /postBody\.thinking = params\.thinking/);
  assert.match(streamClient, /reasoning_effort\?:\s*string/);
  assert.match(streamClient, /postBody\.reasoning_effort = params\.reasoning_effort/);
});

test("visual adapter waits for model refresh and repairs mandatory reasoning before first send", () => {
  assert.match(inputField, /const waitForModelLoad = async \(\) =>/);
  assert.match(
    inputField,
    /const createSession = async \(value: string\) => \{[\s\S]*await waitForModelLoad\(\)[\s\S]*await \(state as any\)\.loadChatModels\?\.\(\)[\s\S]*ensureReasoningSelection\?\.\(\)[\s\S]*legacyCreateSession\?\.\(value\)/,
  );
  assert.match(inputField, /let legacyExposed:[\s\S]*expose\(exposed/);
  assert.match(inputField, /context\.expose\(\{[\s\S]*\.\.\.legacyExposed[\s\S]*triggerSend/);
  assert.match(inputField, /const triggerSend = \(text: string\) => \{[\s\S]*createSession\(text\)/);
  assert.match(
    inputField,
    /const handleNativeKeydown = \(event: KeyboardEvent\) => \{[\s\S]*showMention[\s\S]*event\.shiftKey[\s\S]*event\.ctrlKey[\s\S]*createSession\(value\)/,
  );
});

test("consumer chat routes the downstream request through the selected native agent", () => {
  const sendStart = chatBusiness.indexOf("const sendMsg = async");
  const sendEnd = chatBusiness.indexOf("onMounted", sendStart);
  const sendBlock = chatBusiness.slice(sendStart, sendEnd);

  assert.notEqual(sendStart, -1);
  assert.notEqual(sendEnd, -1);
  assert.match(
    sendBlock,
    /const selectedAgentId = props\.embeddedMode \? props\.agentId : \(useSettingsStoreInstance\.selectedAgentId \|\| ''\);/,
  );
  assert.match(
    sendBlock,
    /const selectedAgentSourceTenantId = props\.embeddedMode\s*\? undefined\s*:\s*\(useSettingsStoreInstance\.selectedAgentSourceTenantId \|\| undefined\);/,
  );
  assert.match(
    sendBlock,
    /const agentEnabled = props\.embeddedMode\s*\? \(props\.agentId && props\.agentId !== 'builtin-quick-answer'\)\s*:\s*useSettingsStoreInstance\.isAgentStreamMode;/,
  );
  assert.match(sendBlock, /agent_enabled:\s*agentEnabled/);
  assert.match(sendBlock, /agent_id:\s*selectedAgentId/);
  assert.match(sendBlock, /agent_source_tenant_id:\s*selectedAgentSourceTenantId/);
  assert.doesNotMatch(sendBlock, /const selectedAgentId = BUILTIN_SMART_REASONING_ID|const agentEnabled = true/);
});

test("combined selector mechanically preserves native labels, hover entry, and the source capsule shape", () => {
  const capsuleStart = inputField.indexOf('class="visual-chat-composer__combined-picker"');
  const capsuleEnd = inputField.indexOf('</button>', capsuleStart);
  const capsule = inputField.slice(capsuleStart, capsuleEnd);
  const agentRowStart = modelSelector.indexOf('class="visual-model-selector__chat-row is-agent"');
  const agentRowEnd = modelSelector.indexOf('</button>', agentRowStart);
  const agentRow = modelSelector.slice(agentRowStart, agentRowEnd);

  assert.notEqual(capsuleStart, -1);
  assert.notEqual(capsuleEnd, -1);
  assert.notEqual(agentRowStart, -1);
  assert.notEqual(agentRowEnd, -1);
  assert.match(inputField, /BUILTIN_QUICK_ANSWER_ID/);
  assert.match(inputField, /BUILTIN_SMART_REASONING_ID/);
  assert.match(inputField, /selectedAgentDisplayName[\s\S]*?t\('input\.normalMode'\)[\s\S]*?t\('input\.agentMode'\)/);
  assert.match(capsule, /\{\{ selectedAgentDisplayName \}\}/);
  assert.match(capsule, /combined-picker-dot[\s\S]*?combined-picker-model[\s\S]*?combined-picker-effort/);
  assert.doesNotMatch(capsule, /<template v-if="!isBuiltinAgentSelected">/);
  assert.match(inputField, /:aria-label="`\$\{selectedAgentDisplayName\} \$\{selectedModelCapsuleName\}/);
  assert.match(agentRow, /@mouseenter="hoverOpen\('agents'\)"/);
  assert.match(agentRow, /@click="toggleHover\('agents'\)"/);
  assert.match(agentRow, /@keydown\.enter\.stop\.prevent="toggleHover\('agents'\)"/);
  assert.match(modelSelector, /const hoveredSubmenu = ref<'agents' \| 'models' \| 'reasoning' \| null>/);
  assert.doesNotMatch(capsule, /control-platform|combined-picker-icon/);
  assert.doesNotMatch(agentRow, /control-platform|<t-icon[^>]+(?:robot|chat|app)/);
  assert.doesNotMatch(inputField, /const modelPickerWidth|modelPickerStyle/);
  for (const token of [
    'width: fit-content',
    'padding: 6px 12px',
    'border-radius: 999px',
    'font-size: 12px',
    'line-height: 18px',
    '@media (max-width: 430px)',
    ':root[theme-mode="dark"] .visual-chat-composer__combined-picker',
  ]) assert.ok(inputField.includes(token), `combined selector source token lost ${token}`);
  for (const token of [
    'width: 224px',
    'padding: 6px',
    'border-radius: 16px',
    '.visual-model-selector__chat-flyout.is-agents',
    'width: 256px',
  ]) assert.ok(modelSelector.includes(token), `shared picker source token lost ${token}`);
});

test("model overview always renders the complete selected model name", () => {
  assert.match(
    modelSelector,
    /class="visual-model-selector__chat-row-value is-model"[^>]*>\{\{ selectedModelDisplayName \}\}<\/span>/,
  );

  const ruleStart = modelSelector.indexOf('.visual-model-selector__chat-row-value.is-model');
  const ruleEnd = modelSelector.indexOf('}', ruleStart);
  const rule = modelSelector.slice(ruleStart, ruleEnd);

  assert.notEqual(ruleStart, -1);
  assert.notEqual(ruleEnd, -1);
  assert.match(rule, /white-space:\s*normal/);
  assert.match(rule, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(rule, /text-overflow:\s*ellipsis/);
});

test("model selector controller distinguishes the initial catalog load from missing configuration", () => {
  const labelStart = inputBusiness.indexOf("const selectedModelDisplayName = computed");
  const labelEnd = inputBusiness.indexOf("const modelDisplayName", labelStart);
  const selectedModelLabel = inputBusiness.slice(labelStart, labelEnd);

  assert.notEqual(labelStart, -1);
  assert.notEqual(labelEnd, -1);
  assert.match(inputBusiness, /const modelsLoadSettled = ref\(false\)/);
  assert.match(inputBusiness, /modelsLoadSettled\.value = true/);
  assert.match(selectedModelLabel, /if \(!modelsLoadSettled\.value\) return t\("common\.loading"\)/);
  assert.ok(
    selectedModelLabel.indexOf('t("common.loading")') <
      selectedModelLabel.indexOf('t("input.notConfigured")'),
  );
});
