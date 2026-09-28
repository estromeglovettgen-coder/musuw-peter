import { safeRemoveItem, safeSetItem } from "@/composables/preferenceStorage";
import { BUILTIN_QUICK_ANSWER_ID, BUILTIN_SMART_REASONING_ID } from "@/api/agent";
import { DEFAULT_CHAT_MODEL_ID } from "@/utils/managedChatModels";

export const SETTINGS_STORAGE_KEY = "WeKnora_settings";

/** Deep-clone settings so nested arrays/objects are not shared with defaults. */
export function cloneSettings<T>(settings: T): T {
  return JSON.parse(JSON.stringify(settings));
}

export function isStoredSettingsRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ReconcilableSettings = {
  selectedTags?: unknown;
  selectedMCPServices?: unknown;
  selectedSkills?: unknown;
  selectedTools?: unknown;
  selectedFileKbMap?: unknown;
  enableMemory?: unknown;
  isAgentEnabled: boolean;
  selectedAgentId?: string;
  selectedAgentSourceTenantId?: unknown;
  webSearchEnabled?: unknown;
  conversationModels?: {
    summaryModelId?: unknown;
    rerankModelId?: unknown;
    selectedChatModelId?: unknown;
    thinkingEnabled?: unknown;
    reasoningEffort?: unknown;
    reasoningModelId?: unknown;
    consumerSceneModelIds?: unknown;
  };
};

type ReconcilableConversationModels = NonNullable<
  ReconcilableSettings["conversationModels"]
>;

export type SettingsLoadOptions = {
  /** Product edition is explicit when known; otherwise infer it from the login bootstrap flag. */
  isLiteMode?: boolean;
};

function readLiteModeFlag(): boolean {
  try {
    return localStorage.getItem("weknora_lite_mode") === "true";
  } catch {
    return false;
  }
}

function reconcileLoadedSettings<T extends ReconcilableSettings>(
  loaded: T,
  defaultSettings: T,
  options: SettingsLoadOptions = {},
  sourceWasStored = true,
): T {
  const isLiteMode = options.isLiteMode ?? readLiteModeFlag();
  loaded.selectedTags ||= [];
  loaded.selectedMCPServices ||= [];
  loaded.selectedSkills ||= (loaded.selectedTools as string[] | undefined) || [];
  loaded.selectedFileKbMap ||= {};

  const defaultConversation = isStoredSettingsRecord(defaultSettings.conversationModels)
    ? defaultSettings.conversationModels
    : {};
  const loadedConversation = isStoredSettingsRecord(loaded.conversationModels)
    ? loaded.conversationModels
    : null;
  // Defaults are not user intent. Treating a freshly-cloned authority default
  // as an explicit stored preference would prevent Lite first-run defaults
  // while also forcing those Lite defaults into Standard globally.
  const storedConversation = sourceWasStored ? loadedConversation : null;
  // A boolean thinking flag is an explicit legacy preference. If it is the
  // only value present, keep its meaning instead of replacing it with the Lite
  // first-run default.
  const storedThinkingExplicit = typeof storedConversation?.thinkingEnabled === "boolean";
  const storedReasoningExplicit = typeof storedConversation?.reasoningEffort === "string"
    && storedConversation.reasoningEffort.trim() !== "";

  // Keep the stored reasoning controls internally consistent while migrating
  // old browser preferences.
  let reconciledThinking = false;
  let conversationModels: ReconcilableConversationModels;
  if (!storedConversation) {
    conversationModels = (
      !sourceWasStored || isLiteMode
        ? cloneSettings(defaultConversation)
        : { thinkingEnabled: true }
    ) as ReconcilableConversationModels;
    reconciledThinking = true;
  } else if (isLiteMode) {
    // Keep any stored user choices but fill fields omitted by older or
    // partially-written records from the authority defaults. Standard keeps
    // its historical migration shape below for compatibility.
    conversationModels = {
      ...cloneSettings(defaultConversation),
      ...storedConversation,
    };
    if (typeof conversationModels.thinkingEnabled !== "boolean") {
      conversationModels.thinkingEnabled = true;
      reconciledThinking = true;
    }
  } else {
    conversationModels = storedConversation;
    if (typeof conversationModels.thinkingEnabled !== "boolean") {
      conversationModels.thinkingEnabled = true;
      reconciledThinking = true;
    }
  }
  loaded.conversationModels = conversationModels as T["conversationModels"];

  if (
    !storedReasoningExplicit
    || typeof conversationModels.reasoningEffort !== "string"
    || conversationModels.reasoningEffort.trim() === ""
  ) {
    // Empty defers to the selected model's minimum once metadata has loaded.
    conversationModels.reasoningEffort = storedThinkingExplicit && conversationModels.thinkingEnabled === false
      ? "none" : "";
    reconciledThinking = true;
  }

  const selectedChatModelId = conversationModels.selectedChatModelId;
  if (
    isLiteMode
    && (!storedConversation || typeof selectedChatModelId !== "string" || !selectedChatModelId.trim())
  ) {
    const defaultModelId = typeof defaultConversation.selectedChatModelId === "string"
      && defaultConversation.selectedChatModelId.trim()
      ? defaultConversation.selectedChatModelId.trim()
      : DEFAULT_CHAT_MODEL_ID;
    conversationModels.selectedChatModelId = defaultModelId;
    reconciledThinking = true;
  }

  if (!isStoredSettingsRecord(conversationModels.consumerSceneModelIds)) {
    conversationModels.consumerSceneModelIds = {};
  }
  if (typeof storedConversation?.reasoningModelId !== "string") {
    // Migrate explicit legacy depths without carrying them to another model.
    conversationModels.reasoningModelId = storedReasoningExplicit || (storedThinkingExplicit && conversationModels.thinkingEnabled === false)
      ? String(conversationModels.selectedChatModelId || "") : "";
    reconciledThinking = true;
  }
  const thinkingEnabled = conversationModels.reasoningEffort !== "none";
  if (conversationModels.thinkingEnabled !== thinkingEnabled) {
    conversationModels.thinkingEnabled = thinkingEnabled;
    reconciledThinking = true;
  }

  const storedAgentID = typeof loaded.selectedAgentId === "string"
    ? loaded.selectedAgentId.trim()
    : "";
  const reconciledAgentMode = !storedAgentID || loaded.selectedAgentSourceTenantId !== null;
  loaded.selectedAgentId = storedAgentID || BUILTIN_SMART_REASONING_ID;
  loaded.selectedAgentSourceTenantId = null;
  if (loaded.selectedAgentId === BUILTIN_QUICK_ANSWER_ID) {
    loaded.isAgentEnabled = false;
  } else if (loaded.selectedAgentId === BUILTIN_SMART_REASONING_ID) {
    loaded.isAgentEnabled = true;
  } else if (typeof loaded.isAgentEnabled !== "boolean") {
    loaded.isAgentEnabled = true;
  }

  const removedLegacyMemorySetting = Object.prototype.hasOwnProperty.call(loaded, "enableMemory");
  if (removedLegacyMemorySetting) {
    delete loaded.enableMemory;
  }
  if (sourceWasStored && (removedLegacyMemorySetting || reconciledAgentMode || reconciledThinking)) {
    safeSetItem(SETTINGS_STORAGE_KEY, JSON.stringify(loaded));
  }
  return loaded;
}

function resetStoredSettings<T extends ReconcilableSettings>(
  defaultSettings: T,
  reason: unknown,
  options: SettingsLoadOptions = {},
): T {
  console.error(
    "[Musuw] Failed to parse stored settings, resetting to defaults:",
    reason,
  );
  safeRemoveItem(SETTINGS_STORAGE_KEY);
  return reconcileLoadedSettings(cloneSettings(defaultSettings), defaultSettings, options, false);
}

/** Load settings from localStorage, reconcile native Agent state, fall back on corruption. */
export function loadAndReconcileSettings<T extends ReconcilableSettings>(
  defaultSettings: T,
  options: SettingsLoadOptions = {},
): T {
  const resolvedOptions: SettingsLoadOptions = {
    ...options,
    isLiteMode: options.isLiteMode ?? readLiteModeFlag(),
  };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return reconcileLoadedSettings(
        cloneSettings(defaultSettings),
        defaultSettings,
        resolvedOptions,
        false,
      );
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredSettingsRecord(parsed)) {
      return resetStoredSettings(
        defaultSettings,
        new Error("stored value is not a settings object"),
        resolvedOptions,
      );
    }
    return reconcileLoadedSettings(parsed as T, defaultSettings, resolvedOptions, true);
  } catch (e) {
    return resetStoredSettings(defaultSettings, e, resolvedOptions);
  }
}
