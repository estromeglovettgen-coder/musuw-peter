import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const SETTINGS_STORAGE_KEY = "WeKnora_settings";
const BUILTIN_QUICK_ANSWER_ID = "builtin-quick-answer";
const BUILTIN_SMART_REASONING_ID = "builtin-smart-reasoning";
const DEFAULT_CHAT_MODEL_ID = "builtin-deepseek-v4-flash";
const settingsStorageSource = readFileSync(new URL("./settingsStorage.ts", import.meta.url), "utf8");

// Execute the actual TypeScript module; mock only its browser/storage imports.
// Keeping a second implementation here previously hid migration regressions.
const { outputText } = ts.transpileModule(settingsStorageSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const storageExports = {};
runInThisContext(`(function(exports, require) {${outputText}\n})`)(storageExports, (name) => {
  if (name === "@/composables/preferenceStorage") return {
    safeSetItem: (key, value) => localStorage.setItem(key, value),
    safeRemoveItem: (key) => localStorage.removeItem(key),
  };
  if (name === "@/api/agent") return { BUILTIN_QUICK_ANSWER_ID, BUILTIN_SMART_REASONING_ID };
  if (name === "@/utils/managedChatModels") return { DEFAULT_CHAT_MODEL_ID };
  throw new Error(`Unexpected settings dependency: ${name}`);
});
const { cloneSettings, isStoredSettingsRecord, loadAndReconcileSettings } = storageExports;

function makeDefaults() {
  return {
    isAgentEnabled: true,
    selectedAgentId: BUILTIN_SMART_REASONING_ID,
    selectedAgentSourceTenantId: null,
    webSearchEnabled: false,
    selectedTags: [],
    selectedMCPServices: [],
    selectedSkills: [],
    selectedFileKbMap: {},
    conversationModels: {
      summaryModelId: "",
      rerankModelId: "",
      selectedChatModelId: "",
      thinkingEnabled: true,
      reasoningEffort: "",
      reasoningModelId: "",
      consumerSceneModelIds: {},
    },
    nested: { items: ["a"] },
  };
}

function installMockLocalStorage() {
  const store = {};
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => { store[key] = value; },
      removeItem: (key) => { delete store[key]; },
    },
    configurable: true,
    writable: true,
  });
  return store;
}

test("isStoredSettingsRecord rejects non-object JSON values", () => {
  assert.equal(isStoredSettingsRecord(null), false);
  assert.equal(isStoredSettingsRecord([]), false);
  assert.equal(isStoredSettingsRecord("x"), false);
  assert.equal(isStoredSettingsRecord({}), true);
});

test("cloneSettings deep-clones nested structures", () => {
  const defaults = makeDefaults();
  const cloned = cloneSettings(defaults);
  cloned.nested.items.push("b");
  assert.deepEqual(defaults.nested.items, ["a"]);
});

test("fresh settings use WeKnora main 81142df WebSearch default while keeping Musuw thinking", () => {
  const store = installMockLocalStorage();
  const defaults = makeDefaults();
  const loaded = loadAndReconcileSettings(defaults);
  loaded.selectedTags.push("tag-1");

  assert.deepEqual(defaults.selectedTags, []);
  assert.equal(loaded.webSearchEnabled, false);
  assert.equal(loaded.conversationModels.thinkingEnabled, true);
  assert.equal(loaded.conversationModels.reasoningEffort, "");
  assert.equal(loaded.selectedAgentId, BUILTIN_SMART_REASONING_ID);
  assert.equal(loaded.isAgentEnabled, true);
  assert.equal(store[SETTINGS_STORAGE_KEY], undefined);
});

test("corrupt/non-object storage resets to authority defaults", () => {
  for (const raw of ["{broken", "null"]) {
    const store = installMockLocalStorage();
    store[SETTINGS_STORAGE_KEY] = raw;
    const loaded = loadAndReconcileSettings(makeDefaults());
    assert.equal(loaded.webSearchEnabled, false);
    assert.equal(loaded.conversationModels.thinkingEnabled, true);
  }
});

test("valid stored WebSearch preference is preserved in both directions", () => {
  for (const value of [true, false]) {
    const store = installMockLocalStorage();
    store[SETTINGS_STORAGE_KEY] = JSON.stringify({
      isAgentEnabled: false,
      selectedAgentId: BUILTIN_QUICK_ANSWER_ID,
      webSearchEnabled: value,
      conversationModels: { thinkingEnabled: true },
    });
    const loaded = loadAndReconcileSettings(makeDefaults());
    assert.equal(loaded.webSearchEnabled, value);
  }
});

test("consumer settings preserve a tenant-local Agent selection and remove shared scope", () => {
  const store = installMockLocalStorage();
  store[SETTINGS_STORAGE_KEY] = JSON.stringify({
    selectedAgentId: "custom-agent",
    isAgentEnabled: true,
    selectedAgentSourceTenantId: "other-tenant",
    webSearchEnabled: false,
    conversationModels: { thinkingEnabled: true },
  });
  const loaded = loadAndReconcileSettings(makeDefaults());
  assert.equal(loaded.selectedAgentId, "custom-agent");
  assert.equal(loaded.isAgentEnabled, true);
  assert.equal(loaded.selectedAgentSourceTenantId, null);
  assert.equal(loaded.webSearchEnabled, false);
});

test("both native builtin modes retain their own execution mode", () => {
  const store = installMockLocalStorage();
  store[SETTINGS_STORAGE_KEY] = JSON.stringify({
    selectedAgentId: BUILTIN_SMART_REASONING_ID,
    isAgentEnabled: false,
    webSearchEnabled: false,
    conversationModels: { thinkingEnabled: true },
  });
  const pro = loadAndReconcileSettings(makeDefaults());
  assert.equal(pro.selectedAgentId, BUILTIN_SMART_REASONING_ID);
  assert.equal(pro.isAgentEnabled, true);

  store[SETTINGS_STORAGE_KEY] = JSON.stringify({
    selectedAgentId: BUILTIN_QUICK_ANSWER_ID,
    isAgentEnabled: true,
    webSearchEnabled: false,
    conversationModels: { thinkingEnabled: true },
  });
  const quick = loadAndReconcileSettings(makeDefaults());
  assert.equal(quick.selectedAgentId, BUILTIN_QUICK_ANSWER_ID);
  assert.equal(quick.isAgentEnabled, false);
});

test("first-Musuw thinking preference is backfilled but existing value is preserved", () => {
  const store = installMockLocalStorage();
  store[SETTINGS_STORAGE_KEY] = JSON.stringify({
    selectedAgentId: BUILTIN_QUICK_ANSWER_ID,
    isAgentEnabled: false,
    webSearchEnabled: false,
  });
  const migrated = loadAndReconcileSettings(makeDefaults());
  assert.equal(migrated.conversationModels.thinkingEnabled, true);

  store[SETTINGS_STORAGE_KEY] = JSON.stringify({
    selectedAgentId: BUILTIN_QUICK_ANSWER_ID,
    isAgentEnabled: false,
    webSearchEnabled: false,
    conversationModels: { thinkingEnabled: false },
  });
  const preserved = loadAndReconcileSettings(makeDefaults());
  assert.equal(preserved.conversationModels.thinkingEnabled, false);
  assert.equal(preserved.conversationModels.reasoningEffort, "none");
});

test("Lite fresh settings start on V4 Flash with reasoning enabled at the model minimum", () => {
  installMockLocalStorage();
  const defaults = makeDefaults();
  const loaded = loadAndReconcileSettings(defaults, { isLiteMode: true });

  assert.equal(loaded.conversationModels.selectedChatModelId, DEFAULT_CHAT_MODEL_ID);
  assert.equal(loaded.conversationModels.thinkingEnabled, true);
  assert.equal(loaded.conversationModels.reasoningEffort, "");
});

test("Lite mode is inferred from the login bootstrap flag", () => {
  const store = installMockLocalStorage();
  store.weknora_lite_mode = "true";
  const loaded = loadAndReconcileSettings(makeDefaults());

  assert.equal(loaded.conversationModels.selectedChatModelId, DEFAULT_CHAT_MODEL_ID);
  assert.equal(loaded.conversationModels.reasoningEffort, "");
  assert.equal(loaded.conversationModels.thinkingEnabled, true);
});

test("Lite missing or semi-structured conversation settings use safe defaults", () => {
  const defaults = makeDefaults();
  for (const conversationModels of [
    undefined,
    { selectedChatModelId: "" },
    { selectedChatModelId: 42 },
    { thinkingEnabled: "stale" },
  ]) {
    const store = installMockLocalStorage();
    store[SETTINGS_STORAGE_KEY] = JSON.stringify({
      isAgentEnabled: true,
      selectedAgentId: BUILTIN_SMART_REASONING_ID,
      conversationModels,
    });
    const loaded = loadAndReconcileSettings(defaults, { isLiteMode: true });

    assert.equal(loaded.conversationModels.selectedChatModelId, DEFAULT_CHAT_MODEL_ID);
    assert.equal(loaded.conversationModels.thinkingEnabled, true);
    assert.equal(loaded.conversationModels.reasoningEffort, "");
  }
});

test("Lite preserves an explicit high reasoning preference", () => {
  const store = installMockLocalStorage();
  const defaults = makeDefaults();
  store[SETTINGS_STORAGE_KEY] = JSON.stringify({
    conversationModels: {
      selectedChatModelId: DEFAULT_CHAT_MODEL_ID,
      thinkingEnabled: true,
      reasoningEffort: "high",
    },
  });
  const loaded = loadAndReconcileSettings(defaults, { isLiteMode: true });

  assert.equal(loaded.conversationModels.reasoningEffort, "high");
  assert.equal(loaded.conversationModels.reasoningModelId, DEFAULT_CHAT_MODEL_ID);
  assert.equal(loaded.conversationModels.thinkingEnabled, true);
});

test("Lite preserves an explicit legacy thinking toggle when effort is absent", () => {
  const store = installMockLocalStorage();
  const defaults = makeDefaults();
  store[SETTINGS_STORAGE_KEY] = JSON.stringify({
    conversationModels: {
      selectedChatModelId: DEFAULT_CHAT_MODEL_ID,
      thinkingEnabled: true,
    },
  });
  const loaded = loadAndReconcileSettings(defaults, { isLiteMode: true });

  assert.equal(loaded.conversationModels.reasoningEffort, "");
  assert.equal(loaded.conversationModels.thinkingEnabled, true);
});

test("Standard fresh settings wait for model metadata to select the minimum", () => {
  installMockLocalStorage();
  const loaded = loadAndReconcileSettings(makeDefaults(), { isLiteMode: false });

  assert.equal(loaded.conversationModels.selectedChatModelId, "");
  assert.equal(loaded.conversationModels.reasoningEffort, "");
  assert.equal(loaded.conversationModels.thinkingEnabled, true);
});

test("source code preserves native local Agents while removing shared scope", () => {
  assert.match(settingsStorageSource, /loaded\.selectedAgentId\s*=\s*storedAgentID \|\| BUILTIN_SMART_REASONING_ID/);
  assert.match(settingsStorageSource, /loaded\.selectedAgentSourceTenantId\s*=\s*null/);
  assert.match(settingsStorageSource, /loaded\.selectedAgentId === BUILTIN_QUICK_ANSWER_ID/);
  assert.match(settingsStorageSource, /loaded\.selectedAgentId === BUILTIN_SMART_REASONING_ID/);
  assert.doesNotMatch(settingsStorageSource, /webSearchEnabled\s*=/);
  assert.doesNotMatch(settingsStorageSource, /withAuthorityDefaults/);
  assert.match(settingsStorageSource, /thinkingEnabled/);
  assert.match(settingsStorageSource, /isLiteMode/);
  assert.match(settingsStorageSource, /DEFAULT_CHAT_MODEL_ID/);
  assert.match(settingsStorageSource, /selectedChatModelId/);
  assert.match(settingsStorageSource, /storedReasoningExplicit/);
});

for (const isLiteMode of [true, false]) {
  test(`stored model depth binding survives reload (Lite=${isLiteMode})`, () => {
    const store = installMockLocalStorage();
    store[SETTINGS_STORAGE_KEY] = JSON.stringify({ conversationModels: {
      selectedChatModelId: "model-b", reasoningModelId: "model-a", reasoningEffort: "high",
    }});
    const loaded = loadAndReconcileSettings(makeDefaults(), { isLiteMode });
    assert.equal(loaded.conversationModels.selectedChatModelId, "model-b");
    assert.equal(loaded.conversationModels.reasoningModelId, "model-a");
    assert.equal(loaded.conversationModels.reasoningEffort, "high");
  });

  test(`legacy explicit Off is bound to its model (Lite=${isLiteMode})`, () => {
    const store = installMockLocalStorage();
    store[SETTINGS_STORAGE_KEY] = JSON.stringify({ conversationModels: {
      selectedChatModelId: "model-a", thinkingEnabled: false,
    }});
    const loaded = loadAndReconcileSettings(makeDefaults(), { isLiteMode });
    assert.equal(loaded.conversationModels.reasoningModelId, "model-a");
    assert.equal(loaded.conversationModels.reasoningEffort, "none");
    assert.equal(loaded.conversationModels.thinkingEnabled, false);
  });
}
