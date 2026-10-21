const state = {
  mode: "image",
  files: {},
  promptLocked: false,
  poseStrict: true,
  promptPreview: { valid: false, errors: [] },
  siteConfig: { publicMode: false, requireInvite: false, requireLogin: false, modelOptions: [] },
  user: null,
  trackers: [],
  authMode: "login",
  loginMethod: "phone",
  smsCountdownTimer: null,
  pendingGenerationTimer: null,
  sceneAnalysisText: "",
  sceneAnalysisSlotId: "image-three",
  generationController: null,
  sceneMask: {
    active: false,
    drawing: false,
    sourceCanvas: null,
    lastDisplayPoint: null,
    lastSourcePoint: null
  },
  lightboxMask: {
    active: false,
    drawing: false,
    lastPoint: null,
    history: [],
    slotId: ""
  },
  paymentPollTimer: null,
  activePaymentOrderId: "",
  adminAuthenticated: false,
  adminRechargeOrders: [],
  adminRechargeFilter: "success",
  adminUserFilter: "active",
  adminUserSearch: "",
  adminUserPage: 1,
  adminUserPageSize: 20,
  adminProviderSettings: null,
  adminProviderView: "web",
  adminReconciliation: { pending: [], recent: [] },
  adminManualRechargeUsername: "",
  adminManualRechargeRequestId: "",
  imageHistory: {},
  resultHistory: [],
  historyWriteQueue: Promise.resolve(),
  locale: localStorage.getItem("alphai-locale") || "zh-CN",
  activeTrackerId: ""
};

const legalPreviewMode = window.location.hostname === "alphai.art"
  || (window.location.hostname.endsWith(".alphai.pages.dev") && window.location.hostname !== "alphai.pages.dev");
const localLoginPreviewMode = ["127.0.0.1", "localhost"].includes(window.location.hostname)
  && new URLSearchParams(window.location.search).get("login-preview") === "1";
const sensitiveConsentStorageKey = "alphai-sensitive-image-consent:2026-08-26-preview-v1";
let sensitiveConsentResolver = null;

const els = {
  subject: document.querySelector("#subject") || { value: "" },
  ratio: document.querySelector("#ratio"),
  size: document.querySelector("#size"),
  count: document.querySelector("#count"),
  environment: document.querySelector("#environment") || { value: "" },
  negative: document.querySelector("#negative") || { value: "" },
  inviteCode: document.querySelector("#invite-code"),
  loginScreen: document.querySelector("#login-screen"),
  loginUsername: document.querySelector("#login-username"),
  loginPassword: document.querySelector("#login-password"),
  authPhone: document.querySelector("#auth-phone"),
  authCode: document.querySelector("#auth-code"),
  sendSmsCode: document.querySelector("#send-sms-code"),
  passwordLoginMethod: document.querySelector("#password-login-method"),
  loginAdminSecretTrigger: document.querySelector("#login-admin-secret-trigger"),
  authCopy: document.querySelector("#auth-copy"),
  loginButton: document.querySelector("#login-button"),
  loginHint: document.querySelector("#login-hint"),
  legalAuthConsent: document.querySelector("#legal-auth-consent"),
  userPill: document.querySelector("#user-pill"),
  adminSecretTrigger: document.querySelector("#admin-secret-trigger"),
  headerBalance: document.querySelector("#header-balance"),
  headerBalanceValue: document.querySelector("#header-balance-value"),
  languageButton: document.querySelector("#language-button"),
  languageMenu: document.querySelector("#language-menu"),
  navStudio: document.querySelector("#nav-studio"),
  navMetadataCleaner: document.querySelector("#nav-metadata-cleaner"),
  navWallet: document.querySelector("#nav-wallet"),
  navTracker: document.querySelector("#nav-tracker"),
  studio: document.querySelector("#studio"),
  metadataCleanerPage: document.querySelector("#metadata-cleaner-page"),
  walletPage: document.querySelector("#wallet-page"),
  trackerPage: document.querySelector("#tracker-page"),
  walletUser: document.querySelector("#wallet-user"),
  walletBalance: document.querySelector("#wallet-balance"),
  walletSpent: document.querySelector("#wallet-spent"),
  logoutButton: document.querySelector("#logout-button"),
  accountDrawer: document.querySelector("#account-drawer"),
  accountClose: document.querySelector("#account-close"),
  accountName: document.querySelector("#account-name"),
  accountBalance: document.querySelector("#account-balance"),
  accountRechargeButton: document.querySelector("#account-recharge-button"),
  accountCredits: document.querySelector("#account-credits"),
  accountPlan: document.querySelector("#account-plan"),
  securityPassword: document.querySelector("#security-password"),
  securityPasswordConfirm: document.querySelector("#security-password-confirm"),
  passwordEditor: document.querySelector("#password-editor"),
  togglePasswordEditor: document.querySelector("#toggle-password-editor"),
  cancelPasswordEditor: document.querySelector("#cancel-password-editor"),
  saveAccountSecurity: document.querySelector("#save-account-security"),
  securityHint: document.querySelector("#security-hint"),
  rechargeAmount: document.querySelector("#recharge-amount"),
  rechargeAmountOptions: document.querySelector("#recharge-amount-options"),
  rechargeMethod: document.querySelector("#recharge-method"),
  rechargeMethodOptions: document.querySelector("#recharge-method-options"),
  openRechargeQr: document.querySelector("#open-recharge-qr"),
  rechargeNote: document.querySelector("#recharge-note"),
  submitRecharge: document.querySelector("#submit-recharge-button"),
  rechargeHint: document.querySelector("#recharge-hint"),
  rechargeOrders: document.querySelector("#recharge-orders"),
  usageLogBody: document.querySelector("#usage-log-body"),
  adminSecret: document.querySelector("#admin-secret"),
  adminConfirm: document.querySelector("#admin-confirm"),
  adminAuthView: document.querySelector("#admin-auth-view"),
  adminAuthHint: document.querySelector("#admin-auth-hint"),
  adminWorkspace: document.querySelector("#admin-workspace"),
  adminRechargeOrders: document.querySelector("#admin-recharge-orders"),
  adminUsers: document.querySelector("#admin-users"),
  adminUserSearch: document.querySelector("#admin-user-search"),
  adminUserSearchButton: document.querySelector("#admin-user-search-button"),
  adminUserPagination: document.querySelector("#admin-user-pagination"),
  adminUserPageSummary: document.querySelector("#admin-user-page-summary"),
  adminUsageAccount: document.querySelector("#admin-usage-account"),
  loadAdminUsage: document.querySelector("#load-admin-usage"),
  adminUsageSummary: document.querySelector("#admin-usage-summary"),
  adminUsageLogBody: document.querySelector("#admin-usage-log-body"),
  adminReconciliationList: document.querySelector("#admin-reconciliation-list"),
  adminReconciliationHistory: document.querySelector("#admin-reconciliation-history"),
  adminReconciliationHint: document.querySelector("#admin-reconciliation-hint"),
  loadAdminReconciliation: document.querySelector("#load-admin-reconciliation"),
  adminProviderSettings: document.querySelector("#admin-provider-settings"),
  adminProviderHint: document.querySelector("#admin-provider-hint"),
  adminConsoleModal: document.querySelector("#admin-console-modal"),
  adminConsoleClose: document.querySelector("#admin-console-close"),
  adminManualRechargeModal: document.querySelector("#admin-manual-recharge-modal"),
  adminManualRechargeClose: document.querySelector("#admin-manual-recharge-close"),
  adminManualRechargeCancel: document.querySelector("#admin-manual-recharge-cancel"),
  adminManualRechargeConfirm: document.querySelector("#admin-manual-recharge-confirm"),
  adminManualRechargeUser: document.querySelector("#admin-manual-recharge-user"),
  adminManualRechargeCredits: document.querySelector("#admin-manual-recharge-credits"),
  adminManualRechargeHint: document.querySelector("#admin-manual-recharge-hint"),
  wechatPayQr: document.querySelector("#wechat-pay-qr"),
  alipayPayQr: document.querySelector("#alipay-pay-qr"),
  payModal: document.querySelector("#pay-modal"),
  payModalClose: document.querySelector("#pay-modal-close"),
  payCancelButton: document.querySelector("#pay-cancel-button"),
  payModalMethod: document.querySelector("#pay-modal-method"),
  payModalTitle: document.querySelector("#pay-modal-title"),
  payConfirm: document.querySelector("#pay-confirm"),
  payConfirmAmount: document.querySelector("#pay-confirm-amount"),
  payConfirmTokens: document.querySelector("#pay-confirm-tokens"),
  payConfirmMethod: document.querySelector("#pay-confirm-method"),
  payConfirmButton: document.querySelector("#pay-confirm-button"),
  payQrFrame: document.querySelector("#pay-qr-frame"),
  payModalQr: document.querySelector("#pay-modal-qr"),
  payModalEmpty: document.querySelector("#pay-modal-empty"),
  payModalHint: document.querySelector("#pay-modal-hint"),
  sensitiveConsentModal: document.querySelector("#sensitive-consent-modal"),
  sensitiveConsentCheckbox: document.querySelector("#sensitive-consent-checkbox"),
  sensitiveConsentHint: document.querySelector("#sensitive-consent-hint"),
  sensitiveConsentCancel: document.querySelector("#sensitive-consent-cancel"),
  sensitiveConsentConfirm: document.querySelector("#sensitive-consent-confirm"),
  payStatus: document.querySelector("#pay-status"),
  payStatusTitle: document.querySelector("#pay-status-title"),
  payStatusDetail: document.querySelector("#pay-status-detail"),
  trackerUrl: document.querySelector("#tracker-url"),
  addTrackerButton: document.querySelector("#add-tracker-button"),
  trackerHint: document.querySelector("#tracker-hint"),
  refreshTrackers: document.querySelector("#refresh-trackers"),
  openTrackerAdd: document.querySelector("#open-tracker-add"),
  trackerAddModal: document.querySelector("#tracker-add-modal"),
  trackerAddClose: document.querySelector("#tracker-add-close"),
  trackerAddCancel: document.querySelector("#tracker-add-cancel"),
  trackerDetailModal: document.querySelector("#tracker-detail-modal"),
  trackerDetailClose: document.querySelector("#tracker-detail-close"),
  trackerDetailSummary: document.querySelector("#tracker-detail-summary"),
  trackerDetailHistory: document.querySelector("#tracker-detail-history"),
  trackerTotal: document.querySelector("#tracker-total"),
  trackerSnapshots: document.querySelector("#tracker-snapshots"),
  trackerLatestUpdate: document.querySelector("#tracker-latest-update"),
  trackerSelect: document.querySelector("#tracker-select"),
  trackerFollowers: document.querySelector("#tracker-followers"),
  trackerWorks: document.querySelector("#tracker-works"),
  trackerNewWorks: document.querySelector("#tracker-new-works"),
  trackerLikes: document.querySelector("#tracker-likes"),
  trackerComments: document.querySelector("#tracker-comments"),
  trackerShares: document.querySelector("#tracker-shares"),
  trackerSaves: document.querySelector("#tracker-saves"),
  trackerTitle: document.querySelector("#tracker-title"),
  trackerWorkUrl: document.querySelector("#tracker-work-url"),
  trackerRecordNote: document.querySelector("#tracker-record-note"),
  addTrackerRecordButton: document.querySelector("#add-tracker-record-button"),
  trackerCount: document.querySelector("#tracker-count"),
  trackerList: document.querySelector("#tracker-list"),
  modelChoice: document.querySelector("#model-choice"),
  modelHelp: document.querySelector("#model-help"),
  model: document.querySelector("#model"),
  apiKey: document.querySelector("#api-key"),
  proxy: document.querySelector("#proxy"),
  apiBase: document.querySelector("#api-base"),
  endpointMode: document.querySelector("#endpoint-mode"),
  providerSort: document.querySelector("#provider-sort"),
  modelSuffix: document.querySelector("#model-suffix"),
  imageFieldMode: document.querySelector("#image-field-mode"),
  output: document.querySelector("#prompt-output"),
  promptMode: document.querySelector("#prompt-mode"),
  defaultPromptGuide: document.querySelector("#default-prompt-guide"),
  customPromptEditor: document.querySelector("#custom-prompt-editor"),
  promptModeButtons: [...document.querySelectorAll("[data-prompt-mode]")],
  savedPromptSelect: document.querySelector("#saved-prompt-select"),
  promptCharacterCount: document.querySelector("#prompt-character-count"),
  generationCost: document.querySelector("#generation-cost"),
  generate: document.querySelector("#generate-button"),
  generateLabel: document.querySelector("#generate-label"),
  toast: document.querySelector("#toast"),
  resultView: document.querySelector("#result-view"),
  resultImage: document.querySelector("#result-image"),
  resultMeta: document.querySelector("#result-meta"),
  downloadLink: document.querySelector("#download-link"),
  previewPlaceholder: document.querySelector("#preview-placeholder"),
  resultGrid: document.querySelector("#result-grid"),
  resultHistory: document.querySelector("#result-history"),
  lightbox: document.querySelector("#image-lightbox"),
  lightboxImage: document.querySelector("#lightbox-image"),
  lightboxCaption: document.querySelector("#lightbox-caption"),
  lightboxClose: document.querySelector("#lightbox-close"),
  lightboxMaskCanvas: document.querySelector("#lightbox-mask-canvas"),
  lightboxMaskToolbar: document.querySelector("#lightbox-mask-toolbar"),
  lightboxBrushSize: document.querySelector("#lightbox-brush-size"),
  undoLightboxMask: document.querySelector("#undo-lightbox-mask"),
  clearLightboxMask: document.querySelector("#clear-lightbox-mask"),
  applyLightboxMask: document.querySelector("#apply-lightbox-mask"),
  serverHint: document.querySelector("#server-hint"),
  analyzeScene: document.querySelector("#analyze-scene-button"),
  sceneAnalysis: document.querySelector("#scene-analysis"),
  sceneAnalysisText: document.querySelector("#scene-analysis-text"),
  copySceneAnalysis: document.querySelector("#copy-scene-analysis"),
  applySceneAnalysis: document.querySelector("#apply-scene-analysis"),
  maskScene: document.querySelector("#mask-scene-button"),
  sceneMaskCanvas: document.querySelector("#scene-mask-canvas"),
  sceneMaskToolbar: document.querySelector("#scene-mask-toolbar"),
  sceneBrushSize: document.querySelector("#scene-brush-size"),
  clearSceneMask: document.querySelector("#clear-scene-mask"),
  saveSceneMask: document.querySelector("#save-scene-mask"),
  addReference: document.querySelector("#add-reference-button"),
  referenceMobileCount: document.querySelector("#reference-mobile-count"),
  savePrompt: document.querySelector("#save-prompt-button"),
  promptLock: document.querySelector("#prompt-lock"),
  rememberKey: document.querySelector("#remember-key"),
  clearHistory: document.querySelector("#clear-connection-history")
};

const memoryKeys = {
  settings: "aiShowcase.connectionSettings",
  modelChoice: "aiShowcase.modelChoice",
  defaultModelChoiceRevision: "fire.defaultModelChoiceRevision",
  models: "aiShowcase.modelHistory",
  proxies: "aiShowcase.proxyHistory",
  apiBases: "aiShowcase.apiBaseHistory",
  apiKey: "aiShowcase.rememberedApiKey",
  inviteCode: "aiShowcase.inviteCode",
  authToken: "aiShowcase.authToken",
  authUser: "aiShowcase.authUser",
  savedPrompts: "aiShowcase.savedPrompts"
};

const imageHistoryKey = "aiShowcase.imageHistory";
const activeReferenceOrderKey = "aiShowcase.activeReferenceOrder";
const pendingGenerationKey = "alphai.pendingGeneration";
const activeWebGenerationKey = "alphai.activeWebGeneration";
const pendingGenerationHoldMs = 10 * 60 * 1000;
const resultHistoryKey = "aiShowcase.resultHistory";
const historyDatabaseName = "alphai-image-history";
const historyStoreName = "account-history";
let historyStorageWarningShown = false;
// Slots identify editor tools only. Image count and reference roles are dynamic.
const imageSlotIds = ["image-one", "image-two", "image-three"];
const slotNames = { "image-one": "图 1", "image-two": "图 2", "image-three": "图 3" };
const slotUploadLabels = {};
let promptPreviewTimer = null;
let promptPreviewController = null;
let promptPreviewRevision = 0;
const preparedPayloadRevisions = new WeakMap();
let durableClient = null;
let durablePreparing = false;
let referenceFilesReading = 0;
const importedGenerationTasks = new Set();

function durableGenerationEnabled() {
  return Boolean(state.siteConfig.durableGenerationEnabled);
}

function updateDurableGenerationControls() {
  if (!durableGenerationEnabled() || !els.generate) return;
  const references = currentReferenceSequence();
  const custom = selectedPromptMode() === "custom";
  const needsReferences = !custom && references.length < 2;
  const needsDescription = custom && !els.output.value.trim();
  const needsRoles = !custom && references.some((image) => !image.roles?.length);
  const uploadsReady = references.every((image) => durableClient?.assetState(image).status === "uploaded");
  const allowed = !window.FireShowcaseHost || window.FireShowcaseHost.canGenerate();
  els.generate.disabled = durablePreparing || referenceFilesReading > 0 || needsReferences || needsDescription || needsRoles || !uploadsReady || !allowed;
  els.generateLabel.textContent = durablePreparing ? "正在保存任务…" : !allowed ? window.FireShowcaseHost.unavailableReason() : referenceFilesReading ? "正在读取图片…" : needsReferences ? "至少添加 2 张参考图" : needsDescription ? "请先描述想要的画面" : !uploadsReady ? "等待素材保存" : needsRoles ? "请选择每张图参考的内容" : state.siteConfig.generationPaused ? "保存生成任务" : "生成作品";
}

function syncDurableGeneration(snapshot) {
  updateDurableGenerationControls();
  const completed = snapshot.tasks.filter((task) => task.status === "succeeded" && task.result?.images?.length && !importedGenerationTasks.has(task.id)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const task of completed) {
    importedGenerationTasks.add(task.id);
    const items = task.result.images.map((image, index) => ({ image, meta: `${window.FireShowcaseHost ? "展示面" : task.result.model || task.modelChoice || "生成作品"}${task.result.size ? ` · ${task.result.size}` : ""}`, savedAt: Date.parse(task.updatedAt || task.createdAt) + index }));
    rememberResults(items);
    const visible = items.filter((item) => readResultHistory().some((saved) => saved.image === item.image));
    if (visible.length) showResultImage(visible[0], visible, visible.length);
  }
  notifyFireWorkbench();
}

function initializeDurableGeneration() {
  if (!durableGenerationEnabled() || durableClient) return;
  if (!window.GenerationTasks) throw new Error("任务模块未加载，请刷新页面重试。");
  durableClient = window.GenerationTasks.create({ headers: authHeaders, onChange: syncDurableGeneration });
}

function queueReferenceUpload(slotId, image, retry = false) {
  if (!durableGenerationEnabled() || !image?.dataUrl) return;
  initializeDurableGeneration();
  const dataUrl = image.dataUrl;
  if (retry) durableClient.changed();
  void durableClient.upload(image, { retry }).then((asset) => {
    if (state.files[slotId]?.dataUrl !== dataUrl) return;
    state.files[slotId] = { ...state.files[slotId], assetId: asset.id };
    rememberImage(slotId, state.files[slotId]);
    persistActiveReferenceSequence();
  }).catch(() => { /* The photo keeps its own visible retry action. */ }).finally(() => {
    updateDurableGenerationControls(); notifyFireWorkbench();
  });
}

async function submitDurableGeneration() {
  if (durablePreparing || referenceFilesReading) return;
  initializeDurableGeneration();
  durablePreparing = true; updateDurableGenerationControls();
  saveConnectionSettings();
  try {
    const payload = await buildImagePayload();
    assertPreparedPayloadCurrent(payload);
    const task = await durableClient.submit(payload);
    els.serverHint.textContent = task.status === "queued" && state.siteConfig.generationPaused ? "任务已保存，等待生成开启；你可以继续准备其他作品。" : "任务已提交，进度会保存在任务列表中。";
    showToast(task.status === "queued" ? "生成任务已保存" : "生成任务已提交");
  } catch (error) {
    els.serverHint.textContent = userFacingError(error, "任务提交结果尚未确认，请查看任务列表。");
    showToast(els.serverHint.textContent);
  } finally { durablePreparing = false; updateDurableGenerationControls(); notifyFireWorkbench(); }
}

function isFireWorkbench() {
  return document.body.classList.contains("fire-workbench");
}

function selectedPromptMode() {
  // Only an explicit current-session route can enable free creation; stale
  // legacy preferences cannot silently change reference composition.
  return isFireWorkbench() ? document.body.dataset.creationMode === "free" ? "custom" : "default" : els.promptMode?.value || "default";
}

function notifyFireWorkbench() {
  window.fireWorkbench?.refresh();
}

function connectFireWorkbench() {
  if (!isFireWorkbench() || !window.fireWorkbench) return;
  window.fireWorkbench.connect({
    getReferences: () => imageSlotIds.filter((id) => state.files[id]).map((slotId) => ({ ...state.files[slotId], slotId })),
    getRoles: referenceRoles,
    getMaterials: materialHistoryItems,
    getRemovedMaterialCount: () => new Set(Object.values(readImageHistory()).flat().filter((item) => item.removedAt).map((item) => item.dataUrl)).size,
    removeMaterial: (item) => deleteHistoryImage("", item),
    restoreMaterials: restoreMaterialHistory,
    getResults: readResultHistory,
    getRemovedResultCount: () => (state.resultHistory || []).filter((item) => item.removedAt).length,
    removeResult: removeResultHistory,
    restoreResults: restoreResultHistory,
    getSiteConfig: () => state.siteConfig,
    getValidation: () => state.promptPreview,
    getReferenceUpload: (image) => durableClient?.assetState(image) || { status: "idle", asset: null, error: "" },
    retryReferenceUpload: (slotId) => { if (state.files[slotId]) queueReferenceUpload(slotId, state.files[slotId], true); },
    getTaskState: () => durableClient?.snapshot() || { tasks: [], pending: [], loading: false, error: "" },
    taskAction: async (id, action) => {
      try { return action === "list" ? await durableClient.refresh() : await durableClient.action(id, action); }
      catch (error) { showToast(error.message || "任务状态暂时无法同步。"); return null; }
    },
    showTaskResult: (id) => {
      const task = durableClient?.snapshot().tasks.find((item) => item.id === id);
      if (!task?.result?.images?.length) return;
      const items = task.result.images.map((image) => ({ image, meta: `${window.FireShowcaseHost ? "展示面" : task.result.model || task.modelChoice || "生成作品"}${task.result.size ? ` · ${task.result.size}` : ""}`, savedAt: Date.parse(task.updatedAt || task.createdAt) }));
      showResultImage(items[0], items, items.length); renderResultHistory(items[0].image);
    },
    setCreationMode: (mode) => {
      document.body.dataset.creationMode = mode === "custom" ? "free" : "compose";
      syncPromptModeUi();
    },
    getActiveResult: () => els.resultView?.classList.contains("has-image") && els.resultImage?.getAttribute("src") ? readResultHistory().find((item) => item.image === els.resultImage.src) || { image: els.resultImage.src, meta: els.resultMeta?.textContent || "生成作品" } : null,
    useMaterial: (item) => {
      const slotId = nextReferenceSlot();
      if (!slotId) { showToast(referenceAddUnavailableMessage()); return false; }
      const roles = rolesForReusedImage(item, currentReferenceSequence(), referenceRoles());
      setSlotImage(slotId, { ...item, roles }, { preserveRoles: false });
      rememberImage(slotId, state.files[slotId]);
      persistActiveReferenceSequence();
      return true;
    },
    previewMaterial: (item) => { if (item?.dataUrl) openLightbox(item.dataUrl, item.name || "参考素材"); },
    previewReference: openReferenceLightbox,
    showResult: (item) => { showResultImage(item); renderResultHistory(item.image); },
    previewResult: (item) => { if (item?.image) openLightbox(item.image, item.meta || "生成作品"); },
    downloadResult: (item, trigger) => { if (item?.image) return downloadOriginalImage(item.image, "fire-workbench-result", trigger); },
    useResult: useResultAsReference,
    uploadFiles: appendReferenceFiles,
    moveReference: (slotId, direction) => {
      const ids = imageSlotIds.filter((id) => state.files[id]);
      const index = ids.indexOf(slotId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= ids.length) return;
      const images = currentReferenceSequence();
      const [moved] = images.splice(index, 1);
      images.splice(targetIndex, 0, moved);
      applyReferenceSequence(images);
    },
    notify: showToast
  });
}

window.addEventListener("fire-workbench-ready", connectFireWorkbench);

function referenceRoles() {
  return Array.isArray(state.siteConfig.referenceWorkflow?.roles) ? state.siteConfig.referenceWorkflow.roles : [];
}

function referenceSelectionErrors(images, roles, custom) {
  if (custom) return [];
  const errors = [];
  if (images.length < 2) errors.push("参考图合成至少需要 2 张图片。");
  if (!roles.length) errors.push("参考要素尚未加载，请稍候或刷新页面。");
  const owners = new Map();
  const known = new Map(roles.map((role) => [role.id, role]));
  images.forEach((image, index) => {
    const selected = Array.isArray(image.roles) ? [...new Set(image.roles)] : [];
    if (!selected.length) errors.push(`图 ${index + 1} 尚未选择参考内容。`);
    selected.forEach((roleId) => {
      if (!known.has(roleId)) errors.push(`图 ${index + 1} 有已失效的参考内容，请取消后重新选择。`);
      if (owners.has(roleId) && !known.get(roleId)?.allowMultipleSources) errors.push(`${known.get(roleId)?.label || roleId} 同时由图 ${owners.get(roleId) + 1} 和图 ${index + 1} 提供，请只保留一个来源。`);
      else owners.set(roleId, index);
    });
  });
  return errors;
}

function rolesForReusedImage(image, otherImages, roles) {
  const occupied = new Set(otherImages.flatMap((item) => item.roles || []));
  const known = new Map(roles.map((role) => [role.id, role]));
  return [...new Set(image.roles || [])].filter((id) => known.has(id) && (known.get(id).allowMultipleSources || !occupied.has(id)));
}

function ensureReferenceSlot(index) {
  while (imageSlotIds.length <= index) {
    const number = imageSlotIds.length + 1;
    const id = `image-reference-${number}`;
    imageSlotIds.push(id);
    slotNames[id] = `图 ${number}`;
    const block = document.createElement("article");
    block.className = "upload-block dynamic-reference";
    block.hidden = true;
    block.innerHTML = `<div class="upload-head"><span class="chip">图 ${number}</span><div><h2>参考图片</h2><p>选择这张图提供的要素</p></div></div><label class="dropzone" for="${id}" title="上传参考图片"><input id="${id}" type="file" accept="image/*"><img alt="" class="preview" data-preview="${id}"><span>上传参考图</span></label><div class="image-history" data-history="${id}" aria-label="图 ${number} 历史图片"></div>`;
    els.addReference.before(block);
    setupReferenceInputEvents(id);
  }
  setupReferenceDeleteButtons();
  return imageSlotIds[index];
}

function canAddReferenceImage(images, roles, custom) {
  if (custom) return true;
  const occupied = new Set(images.flatMap((image) => image.roles || []));
  return roles.some((role) => role.allowMultipleSources || !occupied.has(role.id));
}

function referenceAddUnavailableMessage() {
  return referenceRoles().length ? "当前没有可追加的参考要素，请调整已有选择后重试。" : "参考要素尚未加载，请稍候或刷新页面。";
}

function nextReferenceSlot() {
  const custom = selectedPromptMode() === "custom";
  if (!canAddReferenceImage(currentReferenceSequence(), referenceRoles(), custom)) return "";
  const empty = imageSlotIds.find((id) => !state.files[id]);
  return empty || ensureReferenceSlot(imageSlotIds.length);
}

function updateReferenceRoleUi() {
  const roles = referenceRoles();
  const custom = selectedPromptMode() === "custom";
  const activeIds = imageSlotIds.filter((id) => state.files[id]);
  imageSlotIds.forEach((slotId) => {
    const block = document.querySelector(`#${slotId}`)?.closest(".upload-block");
    if (!block) return;
    let picker = block.querySelector(".reference-role-picker");
    if (!picker) {
      picker = document.createElement("fieldset");
      picker.className = "reference-role-picker";
      block.querySelector(".dropzone").after(picker);
      picker.addEventListener("change", (event) => {
        const checkbox = event.target.closest("input[data-reference-role]");
        if (!checkbox || !state.files[slotId]) return;
        const selected = new Set(state.files[slotId].roles || []);
        if (checkbox.checked) selected.add(checkbox.dataset.referenceRole);
        else selected.delete(checkbox.dataset.referenceRole);
        state.files[slotId] = { ...state.files[slotId], roles: [...selected] };
        persistActiveReferenceSequence();
        updateReferenceRoleUi();
        schedulePromptPreview();
      });
    }
    picker.hidden = custom || !state.files[slotId];
    if (picker.hidden) return;
    const selected = new Set(state.files[slotId].roles || []);
    picker.innerHTML = `<legend>要参考的是</legend><div class="reference-role-options"></div>`;
    const options = picker.querySelector(".reference-role-options");
    roles.forEach((role) => {
      const others = activeIds.filter((id) => id !== slotId && (state.files[id].roles || []).includes(role.id));
      const shared = Boolean(role.allowMultipleSources);
      const sourceCount = others.length + Number(selected.has(role.id));
      const owner = shared ? null : others[0];
      const conflict = selected.has(role.id) && Boolean(owner);
      const label = document.createElement("label");
      label.className = `reference-role-chip${selected.has(role.id) ? " is-selected" : ""}${shared ? " is-shared" : ""}${owner && !conflict ? " is-occupied" : ""}${conflict ? " has-conflict" : ""}`;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.referenceRole = role.id;
      checkbox.checked = selected.has(role.id);
      checkbox.disabled = Boolean(owner && !conflict);
      const text = document.createElement("span");
      text.textContent = role.label;
      label.append(checkbox, text);
      if (shared) {
        const note = document.createElement("small");
        note.textContent = `联合参考 · 已选 ${sourceCount} 张`;
        label.append(note);
        label.title = "支持多张图片联合提供这项参考内容";
      } else if (owner) {
        const note = document.createElement("small");
        note.textContent = `${conflict ? "冲突：" : "来自"}${slotNames[owner]}`;
        label.append(note);
        label.title = conflict ? `与${slotNames[owner]}重复，请取消一个来源` : `已由${slotNames[owner]}提供`;
      }
      options.append(label);
    });
    const invalid = [...selected].filter((id) => !roles.some((role) => role.id === id));
    invalid.forEach((id) => {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "invalid-role-button";
      remove.textContent = `移除已失效要素：${id}`;
      remove.addEventListener("click", () => {
        state.files[slotId] = { ...state.files[slotId], roles: [...selected].filter((value) => value !== id) };
        persistActiveReferenceSequence(); updateReferenceRoleUi(); schedulePromptPreview();
      });
      picker.append(remove);
    });
  });
  const poseControl = document.querySelector("#pose-fidelity-control");
  if (poseControl) {
    const hasPose = activeIds.some((id) => (state.files[id].roles || []).includes("pose"));
    poseControl.hidden = isFireWorkbench() ? false : custom || !hasPose;
    poseControl.disabled = isFireWorkbench() && !hasPose;
    const hint = document.querySelector("#pose-selection-hint");
    if (hint) hint.textContent = hasPose ? "保持动作关系，同时自然协调人体结构。" : "选择动作参考图后可设置。";
  }
  const status = document.querySelector("#reference-workflow-status");
  if (status) {
    const occupied = new Set(currentReferenceSequence().flatMap((image) => image.roles || []));
    const remaining = roles.filter((role) => !occupied.has(role.id)).length;
    const sharedLabels = roles.filter((role) => role.allowMultipleSources).map((role) => role.label);
    const capacityNote = remaining ? `还可选择 ${remaining} 项要素` : sharedLabels.length ? `可继续补充${sharedLabels.join("、")}联合参考` : "所有要素已分配，可修改已有选择";
    status.textContent = custom ? `${activeIds.length} 张参考图片 · 可不添加图片，直接描述画面` : roles.length ? `${activeIds.length} 张参考图 · ${occupied.size} 项已选择 · ${capacityNote}` : "参考要素加载失败，暂时无法合成；请刷新页面重试。";
  }
  updateAddReferenceButton();
  notifyFireWorkbench();
}

function promptDraft() {
  return {
    promptMode: selectedPromptMode(),
    prompt: selectedPromptMode() === "custom" ? els.output.value.trim() : "",
    poseStrict: state.poseStrict,
    layoutHints: { ratio: els.ratio.value },
    images: imageSlotIds.filter((id) => state.files[id]).map((id) => ({ id, name: state.files[id].name || "", roles: [...(state.files[id].roles || [])] }))
  };
}

function schedulePromptPreview() {
  updateDurableGenerationControls();
  promptPreviewRevision += 1;
  durableClient?.changed();
  state.promptPreview = { valid: false, errors: [] };
  notifyFireWorkbench();
  clearTimeout(promptPreviewTimer);
  promptPreviewController?.abort();
  const validation = document.querySelector("#prompt-validation");
  if (validation) validation.textContent = "正在同步实际发送提示词…";
  promptPreviewTimer = setTimeout(() => { void refreshPromptPreview(); }, 180);
}

async function refreshPromptPreview(draft = promptDraft()) {
  const revision = promptPreviewRevision;
  const controller = new AbortController();
  promptPreviewController?.abort();
  promptPreviewController = controller;
  try {
    const response = await fetch(apiUrl("/api/prompt"), { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(draft), signal: controller.signal });
    const result = await readJsonResponse(response);
    if (!response.ok) throw new Error(result.error || "提示词预览暂时不可用");
    if (revision !== promptPreviewRevision) return null;
    state.promptPreview = result;
    notifyFireWorkbench();
    const preview = document.querySelector("#compiled-prompt");
    if (preview) preview.value = result.prompt || "";
    const validation = document.querySelector("#prompt-validation");
    if (validation) {
      validation.textContent = result.valid ? "已同步。生成时使用相同的提示词规则。" : (result.errors || []).join(" ");
      validation.classList.toggle("has-errors", !result.valid);
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError" || revision !== promptPreviewRevision) return null;
    state.promptPreview = { valid: false, errors: ["参考要素暂时无法同步，请检查本地服务后重试。"] };
    notifyFireWorkbench();
    const preview = document.querySelector("#compiled-prompt");
    if (preview) preview.value = "";
    const validation = document.querySelector("#prompt-validation");
    if (validation) { validation.textContent = state.promptPreview.errors[0]; validation.classList.add("has-errors"); }
    return state.promptPreview;
  } finally {
    if (promptPreviewController === controller) promptPreviewController = null;
  }
}

function tokenAccountId() {
  const token = localStorage.getItem(memoryKeys.authToken) || "";
  const payload = token.split(".")[0] || "";
  if (!payload) return "";
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return String(JSON.parse(atob(padded))?.username || "").trim();
  } catch {
    return "";
  }
}

function accountStorageKey(baseKey) {
  if (window.FireShowcaseHost) return `${baseKey}:fire:${window.FireShowcaseHost.userId}`;
  const accountId = tokenAccountId()
    || String(state.user?.loginAccount || state.user?.username || "guest").trim().toLowerCase();
  return `${baseKey}:${encodeURIComponent(accountId || "guest")}`;
}

async function initializeMeiqiaCustomer() {
  if (!state.user || typeof window._MEIQIA !== "function") return;
  const internalUserId = tokenAccountId();
  if (!internalUserId) return;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`alphai:${internalUserId}`));
  const clientId = [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const displayName = String(state.user.username || "Alphai 用户").trim().slice(0, 64);
  window._MEIQIA("clientId", clientId);
  window._MEIQIA("metadata", {
    name: displayName,
    comment: `Alphai用户ID：${internalUserId}`
  });
  window._MEIQIA("init");
}

function openHistoryDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("当前浏览器不支持 IndexedDB"));
    const request = indexedDB.open(historyDatabaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(historyStoreName)) {
        request.result.createObjectStore(historyStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("图片历史存储打开失败"));
  });
}

async function historyDatabaseGet(key, fallback) {
  try {
    const db = await openHistoryDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(historyStoreName, "readonly");
      const request = transaction.objectStore(historyStoreName).get(key);
      request.onsuccess = () => resolve(request.result ?? fallback);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
    });
  } catch {
    return fallback;
  }
}

async function historyDatabasePut(key, value) {
  let db;
  try {
    db = await openHistoryDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(historyStoreName, "readwrite");
      transaction.objectStore(historyStoreName).put(value, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    historyStorageWarningShown = false;
    return true;
  } catch {
    if (!historyStorageWarningShown) showToast("本次仍可使用，但历史保存失败，刷新后图片或记录可能丢失。", { tone: "error", duration: 10000 });
    historyStorageWarningShown = true;
    return false;
  } finally {
    db?.close();
  }
}

function queueHistoryDatabasePut(key, value) {
  state.historyWriteQueue = state.historyWriteQueue
    .catch(() => {})
    .then(() => historyDatabasePut(key, value));
  return state.historyWriteQueue;
}

async function historyDatabaseDelete(key) {
  try {
    const db = await openHistoryDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(historyStoreName, "readwrite");
      transaction.objectStore(historyStoreName).delete(key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  } catch {
    // Nothing else is required when the browser has already cleared storage.
  }
}

async function loadAccountImageHistory() {
  const imageKey = accountStorageKey(imageHistoryKey);
  const resultKey = accountStorageKey(resultHistoryKey);
  const legacyImages = readStoredJson(imageKey, {});
  const legacyResults = readStoredJson(resultKey, []);
  state.imageHistory = await historyDatabaseGet(imageKey, legacyImages);
  state.resultHistory = await historyDatabaseGet(resultKey, legacyResults);
  state.resultHistory = (Array.isArray(state.resultHistory) ? state.resultHistory : [])
    .map((item) => (item?.blob instanceof Blob ? { ...item, image: URL.createObjectURL(item.blob) } : item))
    .filter((item) => item?.blob instanceof Blob || !String(item?.image || "").startsWith("blob:"));
  if (!Object.keys(legacyImages).length || await historyDatabasePut(imageKey, state.imageHistory)) localStorage.removeItem(imageKey);
  if (!legacyResults.length || await historyDatabasePut(resultKey, state.resultHistory)) localStorage.removeItem(resultKey);
}

const defaults = {
  subject: "按照每张参考图已选的内容，合成自然、协调的人物照片。",
  environment: "真实生活场景，自然环境光，背景不抢主体，手机随手拍质感。",
  negative: "避免生硬拼贴、僵硬表情、不自然五官、错误的人体结构和不统一的光线。"
};

function apiUrl(pathname) {
  return pathname;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error("服务暂时不可用，请稍后再试");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("服务暂时不可用，请稍后再试");
  }
}

function userFacingError(error, fallback = "操作失败，请稍后再试") {
  const message = String(error?.message || "").trim();
  if (!message) return fallback;
  if (/^\s*[\[{]|request\s*id|new_api_error|xorpay|d1_|sqlite|sql|api[_\s-]?key|http\s*\d|cloudflare|server_api|yunwu|接口返回|配置/i.test(message)) {
    return fallback;
  }
  return message;
}

function readStoredJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStoredJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function addHistory(key, value) {
  const clean = String(value || "").trim();
  if (!clean) return;
  const items = readStoredJson(key, []);
  const next = [clean, ...items.filter((item) => item !== clean)].slice(0, 12);
  writeStoredJson(key, next);
}

function escapeOptionValue(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fillHistoryList(id, key) {
  const list = document.querySelector(`#${id}`);
  if (!list) return;
  const items = readStoredJson(key, []);
  list.innerHTML = items.map((item) => `<option value="${escapeOptionValue(item)}"></option>`).join("");
}

function refreshConnectionHistory() {
  fillHistoryList("model-history", memoryKeys.models);
  fillHistoryList("proxy-history", memoryKeys.proxies);
  fillHistoryList("api-base-history", memoryKeys.apiBases);
}

function readSavedPrompts() {
  return readStoredJson(memoryKeys.savedPrompts, []);
}

function writeSavedPrompts(items) {
  writeStoredJson(memoryKeys.savedPrompts, items.slice(0, 40));
}

function renderPromptModeOptions(selectedValue = selectedPromptMode()) {
  if (!els.promptMode) return;
  els.promptMode.innerHTML = [
    `<option value="default">参考图合成</option>`,
    `<option value="custom">自定义提示词</option>`
  ].join("");
  els.promptMode.value = isFireWorkbench() ? selectedPromptMode() : selectedValue === "default" ? "default" : "custom";
  renderSavedPromptOptions();
  syncPromptModeUi();
}

function renderSavedPromptOptions(selectedId = "") {
  if (!els.savedPromptSelect) return;
  const saved = readSavedPrompts();
  els.savedPromptSelect.innerHTML = [
    `<option value="">使用预设提示词</option>`,
    ...saved.map((item) => {
      const label = item.note ? `${item.name} - ${item.note}` : item.name;
      return `<option value="${escapeOptionValue(item.id)}" title="${escapeOptionValue(item.note || item.name)}">${escapeOptionValue(label)}</option>`;
    })
  ].join("");
  els.savedPromptSelect.value = saved.some((item) => item.id === selectedId) ? selectedId : "";
  els.savedPromptSelect.disabled = saved.length === 0;
}

function updatePromptCharacterCount() {
  if (!els.promptCharacterCount || !els.output) return;
  els.promptCharacterCount.textContent = `已输入 ${els.output.value.length} 字符`;
}

function syncPromptModeUi() {
  const value = selectedPromptMode();
  if (isFireWorkbench() && els.promptMode) els.promptMode.value = value;
  const custom = value !== "default";
  els.defaultPromptGuide?.classList.toggle("is-hidden", custom);
  els.customPromptEditor?.classList.toggle("is-hidden", !custom);
  els.promptModeButtons?.forEach((button) => {
    const active = button.dataset.promptMode === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updatePromptCharacterCount();
  updatePrimaryReferenceVisibility();
  schedulePromptPreview();
}

function selectedSavedPrompt(id = els.savedPromptSelect?.value || "") {
  return readSavedPrompts().find((item) => item.id === id) || null;
}

function saveCurrentPrompt() {
  const text = els.output.value.trim();
  if (!text) {
    showToast("请先填写自定义提示词");
    els.output.focus();
    return;
  }

  const name = window.prompt("给这条提示词起个名字：", "");
  if (name === null) return;
  const cleanName = name.trim();
  if (!cleanName) {
    showToast("名称不能为空");
    return;
  }

  const note = window.prompt("备注一下用途，可以留空：", "") || "";
  const item = {
    id: `prompt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    note: note.trim(),
    text,
    savedAt: Date.now()
  };
  const next = [
    item,
    ...readSavedPrompts().filter((saved) => saved.name !== cleanName || saved.text !== text)
  ];
  writeSavedPrompts(next);
  renderPromptModeOptions("custom");
  renderSavedPromptOptions(item.id);
  showToast("提示词已保存");
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem(memoryKeys.authToken);
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

async function loadSiteConfig() {
  try {
    const response = await fetch(apiUrl("/api/config"));
    if (!response.ok && window.FireShowcaseHost) throw new Error("工作台配置暂时无法读取，请刷新重试。");
    if (response.ok) {
      state.siteConfig = await readJsonResponse(response);
      initializeDurableGeneration();
    }
  } catch (error) {
    if (window.FireShowcaseHost) throw error;
    state.siteConfig = { publicMode: false, requireInvite: false, requireLogin: false, modelOptions: [] };
  }
  renderModelOptions();
  updateReferenceRoleUi();
  schedulePromptPreview();
}

function saveAuthUser(user) {
  if (user) localStorage.setItem(memoryKeys.authUser, JSON.stringify(user));
  else localStorage.removeItem(memoryKeys.authUser);
}

function clearAuthSession() {
  localStorage.removeItem(memoryKeys.authToken);
  localStorage.removeItem(memoryKeys.authUser);
  state.user = null;
}

async function loadCurrentUser({ useCacheOnError = true } = {}) {
  if (!state.siteConfig.requireLogin) {
    state.user = state.siteConfig.localPreviewUser?.username
      ? state.siteConfig.localPreviewUser
      : null;
    return true;
  }
  const token = localStorage.getItem(memoryKeys.authToken);
  if (!token) {
    state.user = null;
    return false;
  }
  try {
    const response = await fetch(apiUrl("/api/me"), {
      headers: authHeaders(),
      cache: "no-store"
    });
    const data = await readJsonResponse(response);
    if (response.status === 401) {
      clearAuthSession();
      return false;
    }
    if (!response.ok) throw new Error(data.error || "登录状态暂时无法验证");
    if (!data.user) {
      clearAuthSession();
      return false;
    }
    state.user = data.user;
    saveAuthUser(data.user);
    return true;
  } catch (error) {
    if (useCacheOnError) {
      try {
        const cachedUser = JSON.parse(localStorage.getItem(memoryKeys.authUser) || "null");
        if (cachedUser?.username) {
          state.user = cachedUser;
          console.warn("登录验证服务暂时不可用，已保留本地登录状态", error);
          return true;
        }
      } catch {
        localStorage.removeItem(memoryKeys.authUser);
      }
    }
    state.user = null;
    return false;
  }
}

function setFieldHidden(input, hidden) {
  const field = input?.closest(".field");
  if (field) field.hidden = hidden;
}

function renderModelOptions() {
  if (!els.modelChoice) return;
  const options = availableModelOptions();
  const configuredDefault = state.siteConfig.defaultModelChoice;
  const defaultChoice = options.some((option) => option.id === configuredDefault) ? configuredDefault : options[0]?.id || "default";
  const defaultRevision = state.siteConfig.defaultModelChoiceRevision || configuredDefault;
  // Apply a changed deployment default once. Explicit choices made afterwards
  // remain preferences; historical task snapshots and pending receipts are not edited.
  if (configuredDefault === defaultChoice && defaultRevision && localStorage.getItem(memoryKeys.defaultModelChoiceRevision) !== defaultRevision) {
    localStorage.setItem(memoryKeys.modelChoice, defaultChoice);
    localStorage.setItem(memoryKeys.defaultModelChoiceRevision, defaultRevision);
  }
  const saved = localStorage.getItem(memoryKeys.modelChoice);
  els.modelChoice.innerHTML = options
    .map((option) => `<option value="${escapeOptionValue(option.id)}">${escapeOptionValue(option.label)}</option>`)
    .join("");
  els.modelChoice.value = options.some((option) => option.id === saved) ? saved : defaultChoice;
  syncGenerationResolutionForModel();
  syncGenerationCountOptions();
  updateModelDescription();
  updateGenerationCost();
}

function availableModelOptions() {
  if (window.FireShowcaseHost) return [{ id: state.siteConfig.defaultModelChoice, label: "展示面", tokenCost: 1 }];
  const fallback = [
    { id: "quality", label: "高质量模式", description: "细节与人物一致性优先，生成时间较长", tokenCost: 2 },
    { id: "fast", label: "快速模式", description: "速度优先，适合快速预览和反复调整", tokenCost: 1 }
  ];
  const configured = Array.isArray(state.siteConfig.modelOptions)
    ? state.siteConfig.modelOptions.filter((option) => String(option?.id || "").trim())
    : [];
  if (!configured.length) return fallback;
  return configured.map((option) => {
    const defaultOption = fallback.find((item) => item.id === option.id);
    return {
      ...option,
      label: String(option.label || defaultOption?.label || option.id).trim(),
      description: String(option.description || defaultOption?.description || "").trim()
    };
  });
}

function selectedModelOption() {
  const options = availableModelOptions();
  return options.find((option) => option.id === els.modelChoice?.value) || options[0] || null;
}

function selectedModelTokenCost() {
  const option = selectedModelOption();
  const optionId = String(option?.id || "").toLowerCase();
  const optionLabel = String(option?.label || "").toLowerCase();
  const isQuality = optionId.includes("quality") || optionLabel.includes("高质量");
  if (isQuality && els.size?.value === "4k") return 6;
  if (isQuality && els.size?.value === "2k") return 4;
  const configuredCost = Number(option?.tokenCost);
  if (Number.isFinite(configuredCost) && configuredCost > 0) return configuredCost;
  if (option?.id === "quality") return 2;
  if (option?.id === "fast") return 1;
  const fallback = Number(state.siteConfig.generationTokenCost || 1);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 1;
}

function updateModelDescription() {
  if (!els.modelHelp) return;
  const options = state.siteConfig.modelOptions?.length
    ? state.siteConfig.modelOptions
    : [
        { label: "高质量模式", description: "细节与人物一致性优先，生成时间较长" },
        { label: "快速模式", description: "速度优先，适合快速预览和反复调整" }
      ];
  const explanation = options
    .map((option) => `${option.label}：${option.description || "暂无说明"}`)
    .join("\n");
  els.modelHelp.dataset.tooltip = explanation;
  els.modelHelp.setAttribute("aria-label", explanation);
}

function applySiteMode() {
  const publicMode = Boolean(state.siteConfig.publicMode);
  const requireLogin = Boolean(state.siteConfig.requireLogin);
  const inviteField = els.inviteCode?.closest(".invite-field");
  if (inviteField) inviteField.hidden = true;

  if (els.loginScreen) {
    els.loginScreen.hidden = !requireLogin || Boolean(state.user);
  }
  document.body.classList.toggle("auth-locked", requireLogin && !state.user);

  if (els.userPill) {
    els.userPill.hidden = !state.user;
    if (state.user) {
      const accountLabel = String(state.user.phone || state.user.username || "-");
      const avatarText = Array.from(accountLabel.trim())[0] || "?";
      els.userPill.innerHTML = `
        <span class="user-avatar">${escapeOptionValue(avatarText.toUpperCase())}</span>
        <span class="user-name">${escapeOptionValue(accountLabel)}</span>
        <span class="user-chevron" aria-hidden="true">
          <svg viewBox="0 0 20 12" focusable="false"><path d="M2 2l8 8 8-8"></path></svg>
        </span>
      `;
    } else {
      els.userPill.textContent = "";
    }
  }
  if (els.headerBalance) els.headerBalance.hidden = !state.user;
  renderAccountHome();
  if (els.logoutButton) {
    els.logoutButton.hidden = !state.user;
  }

  [
    els.model,
    els.apiKey,
    els.proxy,
    els.apiBase,
    els.endpointMode,
    els.providerSort,
    els.modelSuffix,
    els.imageFieldMode
  ].forEach((input) => setFieldHidden(input, publicMode));

  const memoryOptions = els.rememberKey?.closest(".memory-options");
  if (memoryOptions) memoryOptions.hidden = publicMode;

  updateGenerationCost();
  const localStatus = document.querySelector("#local-status");
  if (localStatus) {
    const status = durableGenerationEnabled()
      ? state.siteConfig.generationPaused ? "任务先保存排队，生成未开启" : "任务队列已开启，不自动重试"
      : state.siteConfig.generationSubmitted
      ? "本次测试已提交，不会重复扣费"
      : state.siteConfig.generationPaused
        ? "提交已暂停，尚未调用模型"
        : "单张测试，按 Token 计费";
    localStatus.textContent = `参考图合成 · ${selectedModelOption()?.label || "GPT Image 2.5"} · ${status}`;
  }
  if (durableGenerationEnabled()) {
    updateDurableGenerationControls();
    els.serverHint.textContent = window.FireShowcaseHost ? "原图保存在当前账号，按你选择的参考内容合成。" : state.siteConfig.generationPaused ? "原图先保存在本机，不压缩；新任务先保存排队，开启后单次提交，不自动重试。" : "原图先保存在本机，不压缩；生成时原图直传，不自动重试。";
  } else if (els.generate && state.siteConfig.generationSubmitted) {
    els.generate.disabled = true;
    els.generateLabel.textContent = isFireWorkbench() ? "本次请求已提交" : "本次测试已提交";
    if (isFireWorkbench()) els.serverHint.textContent = "本次请求已提交，不会重复提交；已返回的图片可在作品区查看。";
  } else if (els.generate && state.siteConfig.generationPaused) {
    els.generate.disabled = true;
    els.generateLabel.textContent = isFireWorkbench() ? "生成已暂停" : "提交已暂停";
    els.serverHint.textContent = isFireWorkbench() ? "先把素材和想法准备好，当前不会发起生成。" : "参考图工作流已就绪。当前提交已暂停；调整参考内容不会调用付费模型。";
  } else if (els.generate) {
    els.generate.disabled = false;
    els.generateLabel.textContent = isFireWorkbench() ? "生成作品" : "开始生成";
  }
  notifyFireWorkbench();
}

const translations = {
  "zh-CN": {
    navStudio: "工作台", navWallet: "钱包", navTracker: "数据跟踪",
    walletTitle: "钱包", currentBalance: "当前余额", historicalSpent: "历史消耗",
    chooseRecharge: "选择充值额度", rechargeHint: "固定额度，档位越高，实付价格越优惠",
    choosePayment: "选择支付方式", wechatPay: "微信支付", alipayPay: "支付宝支付",
    trackerTitle: "数据跟踪", personalCenter: "个人中心", profileTitle: "个人主页",
    account: "账号", adminEntry: "管理员入口", viewRequests: "查看申请",
    viewUsers: "查看用户", logout: "退出登录"
  },
  en: {
    navStudio: "Studio", navWallet: "Wallet", navTracker: "Tracking",
    walletTitle: "Wallet", currentBalance: "Current balance", historicalSpent: "Total spent",
    chooseRecharge: "Choose recharge amount", rechargeHint: "Higher tiers offer better prices",
    choosePayment: "Choose payment method", wechatPay: "WeChat Pay", alipayPay: "Alipay",
    trackerTitle: "Data tracking", personalCenter: "Account", profileTitle: "Profile",
    account: "Username", adminEntry: "Admin access", viewRequests: "View requests",
    viewUsers: "View users", logout: "Log out"
  },
  ja: {
    navStudio: "スタジオ", navWallet: "ウォレット", navTracker: "データ追跡",
    walletTitle: "ウォレット", currentBalance: "現在の残高", historicalSpent: "累計使用量",
    chooseRecharge: "チャージ額を選択", rechargeHint: "金額が高いほどお得になります",
    choosePayment: "支払い方法を選択", wechatPay: "WeChat Pay", alipayPay: "Alipay",
    trackerTitle: "データ追跡", personalCenter: "アカウント", profileTitle: "プロフィール",
    account: "ユーザー名", adminEntry: "管理者入口", viewRequests: "申請を見る",
    viewUsers: "ユーザーを見る", logout: "ログアウト"
  },
  ko: {
    navStudio: "스튜디오", navWallet: "지갑", navTracker: "데이터 추적",
    walletTitle: "지갑", currentBalance: "현재 잔액", historicalSpent: "누적 사용량",
    chooseRecharge: "충전 금액 선택", rechargeHint: "금액이 높을수록 더 많은 할인이 적용됩니다",
    choosePayment: "결제 수단 선택", wechatPay: "위챗페이", alipayPay: "알리페이",
    trackerTitle: "데이터 추적", personalCenter: "계정", profileTitle: "프로필",
    account: "사용자 이름", adminEntry: "관리자 입구", viewRequests: "신청 보기",
    viewUsers: "사용자 보기", logout: "로그아웃"
  }
};

function applyLocale(locale) {
  const nextLocale = translations[locale] ? locale : "zh-CN";
  state.locale = nextLocale;
  localStorage.setItem("alphai-locale", nextLocale);
  document.documentElement.lang = nextLocale;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const value = translations[nextLocale][element.dataset.i18n];
    if (value) element.textContent = value;
  });
  document.querySelectorAll("[data-locale]").forEach((button) => {
    const active = button.dataset.locale === nextLocale;
    button.classList.toggle("active", active);
    button.setAttribute("aria-current", active ? "true" : "false");
  });
}

function toggleLanguageMenu(forceOpen) {
  if (!els.languageMenu || !els.languageButton) return;
  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : els.languageMenu.hidden;
  els.languageMenu.hidden = !shouldOpen;
  els.languageButton.setAttribute("aria-expanded", String(shouldOpen));
}

function setAuthMode(mode) {
  state.authMode = "auto";
  setLoginMethod(state.loginMethod);
}

function setLoginMethod(method) {
  state.loginMethod = method === "password" ? "password" : "phone";
  const usePassword = state.loginMethod === "password";
  document.querySelectorAll(".password-login-only").forEach((node) => { node.hidden = !usePassword; });
  document.querySelectorAll(".phone-auth-only").forEach((node) => { node.hidden = usePassword; });
  if (els.passwordLoginMethod) els.passwordLoginMethod.textContent = usePassword ? "验证码登录" : "密码登录";
  if (els.authCopy) els.authCopy.textContent = usePassword ? "密码登录" : "手机号登录";
  if (els.loginButton) els.loginButton.textContent = usePassword ? "登录" : "登录 / 注册";
  if (els.loginHint) els.loginHint.textContent = usePassword ? "请输入账号和密码。" : "";
}

function renderAccountHome() {
  const user = state.user || {};
  const accountLabel = user.phone || user.username || "-";
  if (els.headerBalanceValue) els.headerBalanceValue.textContent = String(Number(user.balance || 0));
  if (els.accountName) els.accountName.textContent = accountLabel;
  if (els.accountBalance) els.accountBalance.innerHTML = `<span class="energy-icon">⚡</span>${escapeOptionValue(Number(user.balance || 0))}`;
  if (els.accountCredits) els.accountCredits.textContent = String(Number(user.credits || 0));
  if (els.accountPlan) els.accountPlan.textContent = renderPlanLabel(user.plan);
  if (els.walletUser) els.walletUser.textContent = `账号：${accountLabel}`;
  if (els.walletBalance) els.walletBalance.innerHTML = `<span class="energy-icon">⚡</span>${escapeOptionValue(Number(user.balance || 0))}`;
  if (els.walletSpent) els.walletSpent.innerHTML = `<span class="energy-icon">⚡</span>${escapeOptionValue(Number(user.historicalSpent || 0))}`;
  renderRechargePackages();
  renderPaymentCodes();
}

function renderPlanLabel(plan) {
  const cleanPlan = String(plan || "").trim().toLowerCase();
  if (!cleanPlan || cleanPlan === "free") return "免费版";
  if (cleanPlan === "beta") return "体验版";
  return plan;
}

async function showAppPage(page) {
  const isStudio = page === "studio";
  const isMetadataCleaner = page === "metadata-cleaner";
  const isWallet = page === "wallet";
  if (els.studio) els.studio.hidden = !isStudio;
  if (els.metadataCleanerPage) els.metadataCleanerPage.hidden = !isMetadataCleaner;
  if (els.walletPage) els.walletPage.hidden = !isWallet;
  if (els.trackerPage) els.trackerPage.hidden = true;
  els.navStudio?.classList.toggle("active", isStudio);
  els.navMetadataCleaner?.classList.toggle("active", isMetadataCleaner);
  els.navWallet?.classList.toggle("active", isWallet);
  if (els.navStudio) els.navStudio.setAttribute("aria-current", isStudio ? "page" : "false");
  if (els.navMetadataCleaner) els.navMetadataCleaner.setAttribute("aria-current", isMetadataCleaner ? "page" : "false");
  if (els.navWallet) els.navWallet.setAttribute("aria-current", isWallet ? "page" : "false");
  if (isWallet) {
    renderAccountHome();
    await Promise.all([loadRechargeOrders(), loadUsageLog()]);
  }
}

function renderPaymentCodes() {
  updateRechargeQrButton();
}

const DEFAULT_RECHARGE_PACKAGES = [
  { amount: 50, credits: 100, originalAmount: 50, discountPercent: 0, label: "50 元" },
  { amount: 98, credits: 200, originalAmount: 100, discountPercent: 2, label: "98 元" },
  { amount: 190, credits: 400, originalAmount: 200, discountPercent: 5, label: "190 元" },
  { amount: 450, credits: 1000, originalAmount: 500, discountPercent: 10, label: "450 元" },
  { amount: 850, credits: 2000, originalAmount: 1000, discountPercent: 15, label: "850 元" }
];

function availableRechargePackages() {
  return Array.isArray(state.siteConfig.rechargePackages) && state.siteConfig.rechargePackages.length
    ? state.siteConfig.rechargePackages
    : DEFAULT_RECHARGE_PACKAGES;
}

function renderRechargePackages() {
  if (!els.rechargeAmount) return;
  const packages = availableRechargePackages().slice(0, 5);
  const exchangeRate = Number(state.siteConfig.tokenExchangeRate || 2);
  const packageCredits = (item) => Number(item.credits || Number(item.amount) * exchangeRate);
  const recommendedPackage = packages.find((item) => packageCredits(item) === 200) || packages[0];
  els.rechargeAmount.innerHTML = packages
    .map((item) => {
      const credits = packageCredits(item);
      return `<option value="${escapeOptionValue(item.amount)}">⚡${escapeOptionValue(credits)}</option>`;
    })
    .join("");
  if (recommendedPackage) els.rechargeAmount.value = String(recommendedPackage.amount);
  if (els.rechargeAmountOptions) {
    els.rechargeAmountOptions.innerHTML = packages
      .map((item) => {
        const amount = Number(item.amount || 0);
        const credits = packageCredits(item);
        const originalAmount = Number(item.originalAmount || credits / exchangeRate);
        const isRecommended = item === recommendedPackage;
        const isActive = isRecommended ? " active" : "";
        const recommendedClass = isRecommended ? " is-recommended" : "";
        const originalPrice = originalAmount > amount
          ? `<del>原价 ¥${escapeOptionValue(originalAmount)}</del>`
          : "";
        return `<button class="choice-button${isActive}${recommendedClass}" data-recharge-amount="${escapeOptionValue(amount)}" data-recharge-credits="${escapeOptionValue(credits)}" type="button" aria-label="${escapeOptionValue(credits)} 积分，实付 ${escapeOptionValue(amount)} 元">
          ${isRecommended ? '<span class="recharge-recommendation"><span class="recharge-recommendation-desktop">推荐入门</span><span class="recharge-recommendation-mobile">★ 推荐</span></span>' : ""}
          <span class="recharge-option-main"><span class="energy-icon">⚡</span><strong>${escapeOptionValue(credits)}</strong><small>积分</small></span>
          <span class="recharge-option-price"><strong>实付 ¥${escapeOptionValue(amount)}</strong>${originalPrice}</span>
          <span class="recharge-option-usage">
            <span>快速 <strong>约 ${escapeOptionValue(Math.floor(credits))} 张</strong></span>
            <span>高质量 <strong>约 ${escapeOptionValue(Math.floor(credits / 2))} 张</strong></span>
          </span>
        </button>`;
      })
      .join("");
  }
  updateRechargeQrButton();
}

function selectedRechargePackage() {
  const amount = Number(els.rechargeAmount?.value || 0);
  const packages = availableRechargePackages();
  const exchangeRate = Number(state.siteConfig.tokenExchangeRate || 2);
  return packages.find((item) => Number(item.amount) === amount) || {
    amount,
    credits: amount * exchangeRate,
    label: `${amount} 元`
  };
}

function paymentMethodText(method) {
  if (method === "offline") return "线下充值";
  if (method === "alipay") return "支付宝";
  if (method === "wechat") return "微信";
  return method || "-";
}

function updateChoiceButtons(container, selector, value, activeClass = "active") {
  container?.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle(activeClass, button.dataset.rechargeAmount === value || button.dataset.payMethod === value);
  });
}

function updateRechargeQrButton() {
  const amount = Number(els.rechargeAmount?.value || 0);
  const method = els.rechargeMethod?.value || "alipay";
  const paymentLabel = els.rechargeMethodOptions?.querySelector(`[data-pay-method="${method}"] span`);
  if (paymentLabel) paymentLabel.textContent = `${paymentMethodText(method)}支付`;
  if (!els.openRechargeQr) return;
  els.openRechargeQr.textContent = `创建${paymentMethodText(method)} ${amount || "-"} 元支付订单`;
}

function selectRechargeAmount(amount) {
  if (!els.rechargeAmount) return;
  els.rechargeAmount.value = String(amount);
  updateChoiceButtons(els.rechargeAmountOptions, "[data-recharge-amount]", String(amount));
  updateRechargeQrButton();
}

function selectRechargeMethod(method) {
  if (!els.rechargeMethod) return;
  els.rechargeMethod.value = method;
  updateChoiceButtons(els.rechargeMethodOptions, "[data-pay-method]", method);
  updateRechargeQrButton();
  openRechargePaymentModal();
}

function openRechargePaymentModal() {
  if (!els.payModal) return;
  const amount = Number(els.rechargeAmount?.value || 0);
  const method = els.rechargeMethod?.value || "alipay";
  if (els.payModalMethod) els.payModalMethod.textContent = "充值确认";
  if (els.payModalTitle) els.payModalTitle.textContent = "确认充值";
  if (els.payConfirmAmount) els.payConfirmAmount.textContent = `${amount || "-"} 元`;
  const selectedPackage = selectedRechargePackage();
  const exchangeRate = Number(state.siteConfig.tokenExchangeRate || 2);
  const tokens = Number(selectedPackage.credits || amount * exchangeRate);
  if (els.payConfirmTokens) els.payConfirmTokens.innerHTML = `<span class="energy-icon">⚡</span>${escapeOptionValue(tokens)}`;
  if (els.payConfirmMethod) els.payConfirmMethod.textContent = paymentMethodText(method);
  els.payModal.querySelector(".pay-modal-card")?.classList.remove("is-alipay", "is-success");
  if (els.payConfirm) els.payConfirm.hidden = false;
  if (els.payQrFrame) els.payQrFrame.hidden = true;
  if (els.payStatus) els.payStatus.hidden = true;
  if (els.payModalHint) els.payModalHint.textContent = "确认后将创建支付订单并展示收款二维码。";
  if (els.payConfirmButton) {
    els.payConfirmButton.disabled = false;
    els.payConfirmButton.textContent = "确认";
  }
  els.payModal.hidden = false;
}

function showRechargeQr() {
  const amount = Number(els.rechargeAmount?.value || 0);
  const method = els.rechargeMethod?.value || "alipay";
  const codes = state.siteConfig.paymentCodes || {};
  const src = method === "alipay" ? codes.alipay : codes.wechat;
  if (els.payModalMethod) els.payModalMethod.textContent = `${paymentMethodText(method)}付款`;
  if (els.payModalTitle) els.payModalTitle.textContent = `请支付 ${amount || "-"} 元`;
  if (els.payConfirm) els.payConfirm.hidden = true;
  if (els.payQrFrame) els.payQrFrame.hidden = false;
  if (els.payModalQr) {
    if (src) {
      els.payModalQr.src = src;
      els.payModalQr.hidden = false;
    } else {
      els.payModalQr.hidden = true;
      els.payModalQr.removeAttribute("src");
    }
  }
  if (els.payModalEmpty) els.payModalEmpty.hidden = Boolean(src);
  if (els.payModalHint) els.payModalHint.textContent = "付款完成后关闭弹窗，在钱包里提交充值申请。";
}

function showXorPayPayment(payment, order) {
  if (!els.payModal || !payment) return;
  const method = order?.method || els.rechargeMethod?.value || "alipay";
  const amount = Number(order?.amount || els.rechargeAmount?.value || 0);
  const qr = payment.qrImage || payment.qr || "";
  const payUrl = payment.payUrl || "";
  const isAlipay = method === "alipay";
  const modalCard = els.payModal.querySelector(".pay-modal-card");
  modalCard?.classList.toggle("is-alipay", isAlipay);
  modalCard?.classList.remove("is-success");
  if (els.payModalMethod) els.payModalMethod.textContent = `${paymentMethodText(method)}付款`;
  if (els.payModalTitle) {
    els.payModalTitle.textContent = isAlipay
      ? "请使用支付宝扫一扫"
      : "请使用微信扫一扫";
  }
  if (els.payConfirm) els.payConfirm.hidden = true;
  if (els.payQrFrame) els.payQrFrame.hidden = false;
  if (els.payModalQr) {
    if (qr) {
      els.payModalQr.src = qr;
      els.payModalQr.hidden = false;
    } else {
      els.payModalQr.hidden = true;
      els.payModalQr.removeAttribute("src");
    }
  }
  if (els.payModalEmpty) {
    els.payModalEmpty.hidden = Boolean(qr);
    els.payModalEmpty.innerHTML = payUrl
      ? `<a href="${escapeOptionValue(payUrl)}" target="_blank" rel="noopener">打开支付页面</a>`
      : "暂时无法获取付款二维码，请稍后再试。";
  }
  setPaymentStatus(
    "waiting",
    "等待扫码付款",
    `请使用${paymentMethodText(method)}扫描上方二维码，支付 ¥${amount.toFixed(2)}`
  );
  if (els.payModalHint) els.payModalHint.textContent = `订单号：${order?.id || "-"} · 页面会自动确认支付结果，请勿重复付款。`;
  els.payModal.hidden = false;
  if (order?.id) startPaymentPolling(order.id);
}

function closeRechargePaymentModal() {
  stopPaymentPolling();
  if (els.payModal) els.payModal.hidden = true;
}

function setPaymentStatus(status, title, detail) {
  if (!els.payStatus) return;
  els.payStatus.hidden = false;
  els.payStatus.className = `pay-status ${status}`;
  if (els.payStatusTitle) els.payStatusTitle.textContent = title;
  if (els.payStatusDetail) els.payStatusDetail.textContent = detail;
}

function stopPaymentPolling() {
  if (state.paymentPollTimer) {
    clearInterval(state.paymentPollTimer);
    state.paymentPollTimer = null;
  }
  state.activePaymentOrderId = "";
}

async function checkPaymentOrder(orderId) {
  try {
    const response = await fetch(apiUrl("/api/recharges"), {
      headers: authHeaders(),
      cache: "no-store"
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "查询支付状态失败");
    const order = (data.orders || []).find((item) => item.id === orderId);
    if (!order || state.activePaymentOrderId !== orderId) return;

    if (order.status === "approved") {
      stopPaymentPolling();
      els.payModal?.querySelector(".pay-modal-card")?.classList.add("is-success");
      if (els.payModalTitle) els.payModalTitle.textContent = "支付成功";
      setPaymentStatus("success", "支付成功，余额已到账", "余额已自动更新，无需再次操作");
      if (els.payModalHint) els.payModalHint.textContent = `订单号：${orderId} · 已完成`;
      await loadCurrentUser();
      applySiteMode();
      await loadRechargeOrders();
      showToast("支付成功，余额已到账");
      window.setTimeout(() => {
        if (!els.payModal?.hidden) closeRechargePaymentModal();
      }, 2600);
      return;
    }

    if (order.status === "rejected") {
      stopPaymentPolling();
      setPaymentStatus("error", "订单未完成", "该订单已关闭，请重新创建支付订单");
    }
  } catch {
    if (state.activePaymentOrderId === orderId) {
      setPaymentStatus("waiting", "正在确认支付结果", "网络暂时不稳定，系统会继续自动查询");
    }
  }
}

function startPaymentPolling(orderId) {
  stopPaymentPolling();
  state.activePaymentOrderId = orderId;
  checkPaymentOrder(orderId);
  state.paymentPollTimer = window.setInterval(() => checkPaymentOrder(orderId), 2000);
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem(memoryKeys.authToken) || "";
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function orderStatusText(status) {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已驳回";
  return "待支付";
}

function formatOrderTime(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return value;
  }
}

function renderRechargeOrders(target, orders, options = {}) {
  if (!target) return;
  const visibleOrders = options.admin ? (orders || []) : (orders || []).filter((order) => order.status !== "pending");
  if (!visibleOrders.length) {
    target.innerHTML = `<p class="hint">${options.emptyMessage || (options.admin ? "暂无充值申请。" : "暂无已完成充值记录。")}</p>`;
    return;
  }
  target.innerHTML = visibleOrders
    .map((order) => {
      const actions = options.admin && order.status === "pending"
        ? `<div class="recharge-order-actions">
            <button class="mini-button" data-review="approve" data-order-id="${escapeOptionValue(order.id)}" type="button">通过</button>
            <button class="mini-button" data-review="reject" data-order-id="${escapeOptionValue(order.id)}" type="button">驳回</button>
          </div>`
        : "";
      return `<article class="recharge-order ${escapeOptionValue(order.status || "pending")}">
        <div>
          <strong>${order.method === "offline" ? "线下充值" : `${escapeOptionValue(order.amount)} 元`} → <span class="energy-icon">⚡</span>${escapeOptionValue(order.credits)}</strong>
          <span>${escapeOptionValue(orderStatusText(order.status))}</span>
        </div>
        <p>${options.admin ? `账号：${escapeOptionValue(order.username || "-")} · 手机号：${escapeOptionValue(order.phone || "-")} · ` : ""}单号：${escapeOptionValue(order.id || "-")}</p>
        <p>方式：${escapeOptionValue(paymentMethodText(order.method || ""))} · ${escapeOptionValue(formatOrderTime(order.createdAt))}</p>
        ${order.note ? `<p class="recharge-note">${escapeOptionValue(order.note)}</p>` : ""}
        ${actions}
      </article>`;
    })
    .join("");
}

async function loadRechargeOrders() {
  if (!state.user || !els.rechargeOrders) return;
  try {
    const response = await fetch(apiUrl("/api/recharges"), { headers: authHeaders() });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "读取充值记录失败");
    renderRechargeOrders(els.rechargeOrders, data.orders || []);
  } catch (error) {
    els.rechargeOrders.innerHTML = `<p class="hint">${escapeOptionValue(userFacingError(error, "暂时无法读取充值记录"))}</p>`;
  }
}

function usageStatusText(status) {
  if (status === "succeeded") return "成功";
  if (status === "failed_refunded") return "失败已退回";
  if (status === "processing" || status === "timeout_unknown") return "待确认";
  return "失败";
}

function renderUsageLog(entries, target = els.usageLogBody) {
  if (!target) return;
  const adminView = target === els.adminUsageLogBody;
  if (!entries.length) {
    target.innerHTML = `<tr><td colspan="${adminView ? 9 : 6}" class="usage-log-empty">暂无使用记录</td></tr>`;
    return;
  }
  target.innerHTML = entries.map((entry) => {
    const amount = Number(entry.amount || 0);
    const balance = entry.balanceAfter === null || entry.balanceAfter === undefined
      ? "—"
      : `<span class="energy-icon">⚡</span>${escapeOptionValue(entry.balanceAfter)}`;
    const isAnalysis = entry.type === "image_analysis";
    const isBillingAdjustment = entry.type === "billing_adjustment";
    const typeLabel = isBillingAdjustment ? "计费补正" : isAnalysis ? "图片识别" : "图片生成";
    const description = entry.type === "image_generation" && entry.modeLabel
      ? entry.modeLabel
      : entry.description || `${typeLabel} · ${Number(entry.imageCount || 1)}张`;
    const status = entry.status || "succeeded";
    const accountName = entry.loginAccount || entry.username || "-";
    const internalUsername = entry.username && entry.username !== accountName
      ? `<small>ID：${escapeOptionValue(entry.username)}</small>`
      : "";
    return `<tr>
      <td>${escapeOptionValue(formatOrderTime(entry.createdAt))}</td>
      ${adminView ? `<td><strong>${escapeOptionValue(accountName)}</strong>${internalUsername}</td>
      <td class="usage-phone">${escapeOptionValue(entry.phone || "-")}</td>` : ""}
      <td>${typeLabel}</td>
      <td><strong>${escapeOptionValue(description)}</strong></td>
      ${adminView ? `<td class="usage-task-id">${escapeOptionValue(entry.taskId || "-")}</td>` : ""}
      <td class="usage-cost"><span class="energy-icon">⚡</span>${escapeOptionValue(amount)}</td>
      <td class="usage-balance">${balance}</td>
      <td><span class="usage-status ${escapeOptionValue(status)}">${escapeOptionValue(usageStatusText(status))}</span></td>
    </tr>`;
  }).join("");
}

async function loadUsageLog() {
  if (!state.user || !els.usageLogBody) return;
  try {
    const response = await fetch(apiUrl("/api/usage"), {
      headers: authHeaders(),
      cache: "no-store"
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "读取使用日志失败");
    renderUsageLog(data.entries || []);
  } catch (error) {
    els.usageLogBody.innerHTML = `<tr><td colspan="6" class="usage-log-empty">${escapeOptionValue(userFacingError(error, "暂时无法读取使用日志"))}</td></tr>`;
  }
}

async function submitRechargeOrder() {
  if (!state.user) return;
  const amount = Number(els.rechargeAmount?.value || 0);
  const method = els.rechargeMethod?.value || "";
  const note = els.rechargeNote?.value.trim() || "";
  if (els.submitRecharge) {
    els.submitRecharge.disabled = true;
    els.submitRecharge.textContent = "正在创建订单...";
  }
  if (els.payConfirmButton) {
    els.payConfirmButton.disabled = true;
    els.payConfirmButton.textContent = "正在创建...";
  }
  if (els.rechargeHint) els.rechargeHint.textContent = "正在创建支付订单...";
  if (els.payModalHint) els.payModalHint.textContent = "正在创建支付订单，请稍候...";
  try {
    const rechargeEndpoint = method === "wechat" ? "/api/wechat-recharges" : "/api/recharges";
    const response = await fetch(apiUrl(rechargeEndpoint), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ amount, method, note })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) {
      const diagnostic = String(data.diagnostic || "").trim();
      throw new Error(diagnostic ? `微信支付预览诊断：${diagnostic}` : (data.error || "创建支付订单失败"));
    }
    if (els.rechargeHint) {
      els.rechargeHint.textContent = data.payment
        ? `已创建支付订单，单号：${data.order.id}`
        : "暂时无法获取支付信息，请稍后重试。";
    }
    if (els.rechargeNote) els.rechargeNote.value = "";
    if (data.payment) showXorPayPayment(data.payment, data.order);
    await loadRechargeOrders();
    showToast(data.payment ? "支付订单已创建" : "订单已创建");
  } catch (error) {
    const message = userFacingError(error, "暂时无法创建支付订单，请稍后再试");
    if (els.rechargeHint) els.rechargeHint.textContent = message;
    if (els.payModalHint) els.payModalHint.textContent = message;
    setPaymentStatus("error", "订单创建失败", "请稍后重试");
  } finally {
    if (els.submitRecharge) {
      els.submitRecharge.disabled = false;
      els.submitRecharge.textContent = "立即支付";
    }
    if (els.payConfirmButton && !els.payConfirm?.hidden) {
      els.payConfirmButton.disabled = false;
      els.payConfirmButton.textContent = "确认";
    }
  }
}

function adminHeaders(extra = {}) {
  const secret = els.adminSecret?.value.trim() || "";
  return secret ? { ...extra, "X-Admin-Secret": secret } : extra;
}

async function authenticateAdmin() {
  const secret = els.adminSecret?.value.trim() || "";
  if (!secret) {
    if (els.adminAuthHint) els.adminAuthHint.textContent = "请输入管理员口令。";
    return;
  }
  if (els.adminConfirm) {
    els.adminConfirm.disabled = true;
    els.adminConfirm.textContent = "验证中...";
  }
  if (els.adminAuthHint) els.adminAuthHint.textContent = "";
  try {
    const response = await fetch(apiUrl("/api/admin/session"), {
      headers: adminHeaders(),
      cache: "no-store"
    });
    const data = await readJsonResponse(response);
    if (!response.ok || !data.authenticated) throw new Error(data.error || "管理员口令不正确。");
    state.adminAuthenticated = true;
    if (els.adminAuthView) els.adminAuthView.hidden = true;
    if (els.adminWorkspace) els.adminWorkspace.hidden = false;
    setAdminTab("recharges");
  } catch (error) {
    state.adminAuthenticated = false;
    if (els.adminAuthHint) els.adminAuthHint.textContent = error.message || "管理员口令不正确。";
  } finally {
    if (els.adminConfirm) {
      els.adminConfirm.disabled = false;
      els.adminConfirm.textContent = "确认";
    }
  }
}

function setAdminTab(tabName) {
  if (!state.adminAuthenticated) return;
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminTab === tabName);
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== tabName;
  });
  if (tabName === "recharges" && !state.adminRechargeOrders.length) loadAdminRechargeOrders();
  if (tabName === "users") loadAdminUsers();
  if (tabName === "providers") loadAdminProviders();
  if (tabName === "reconciliation") loadAdminReconciliation();
  if (tabName === "usage") {
    window.setTimeout(() => els.adminUsageAccount?.focus(), 0);
    loadAdminUsage();
  }
}

async function loadAdminReconciliation() {
  if (!state.adminAuthenticated || !els.adminReconciliationList) return;
  els.adminReconciliationList.innerHTML = `<p class="hint">正在读取待对账任务...</p>`;
  if (els.adminReconciliationHint) els.adminReconciliationHint.textContent = "";
  try {
    const response = await fetch(apiUrl("/api/admin/reconciliation"), {
      headers: adminHeaders(),
      cache: "no-store"
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "读取待对账任务失败");
    state.adminReconciliation = {
      pending: Array.isArray(data.pending) ? data.pending : [],
      recent: Array.isArray(data.recent) ? data.recent : []
    };
    renderAdminReconciliation();
  } catch (error) {
    els.adminReconciliationList.innerHTML = `<p class="hint">${escapeOptionValue(error.message || "读取待对账任务失败")}</p>`;
  }
}

function renderAdminReconciliation() {
  const pending = state.adminReconciliation?.pending || [];
  const recent = state.adminReconciliation?.recent || [];
  if (els.adminReconciliationList) {
    els.adminReconciliationList.innerHTML = pending.length ? pending.map((job) => `
      <article class="admin-reconciliation-card">
        <div class="admin-reconciliation-card-heading">
          <div><strong>${escapeOptionValue(job.username || "-")}</strong><p>任务 ${escapeOptionValue(job.id || "-")}</p></div>
          <span class="admin-provider-status missing">${escapeOptionValue(job.status || "-")}</span>
        </div>
        <p>预留：⚡${escapeOptionValue(Number(job.token_cost || 0))} · 当前余额：⚡${escapeOptionValue(Number(job.current_balance || 0))} · 流水：${escapeOptionValue(job.usage_status || "缺失")}</p>
        <p>模式：${escapeOptionValue(job.mode_id || "-")} · 供应商：${escapeOptionValue(job.provider_id || "-")} · 请求 ID：${escapeOptionValue(job.provider_request_id || "-")}</p>
        <p>创建：${escapeOptionValue(formatTrackerTime(job.created_at))} · 更新：${escapeOptionValue(formatTrackerTime(job.updated_at))}</p>
        <p class="admin-reconciliation-error">${escapeOptionValue(job.error_message || "无错误信息")}</p>
        <div class="admin-reconciliation-actions">
          <button class="secondary-button primary" type="button" data-reconcile-job="${escapeOptionValue(job.id)}" data-reconcile-action="confirm_succeeded">确认成功</button>
          <button class="secondary-button danger" type="button" data-reconcile-job="${escapeOptionValue(job.id)}" data-reconcile-action="refund">确认退款</button>
        </div>
      </article>`).join("") : `<p class="hint">当前没有待对账任务。</p>`;
  }
  if (els.adminReconciliationHistory) {
    els.adminReconciliationHistory.innerHTML = recent.length ? recent.map((item) => `
      <article class="admin-reconciliation-history-row">
        <strong>${item.action === "refund" ? "已退款" : "确认成功"} · ${escapeOptionValue(item.username || "-")}</strong>
        <p>任务 ${escapeOptionValue(item.job_id || "-")} · ⚡${escapeOptionValue(Number(item.token_cost || 0))} · 余额 ${escapeOptionValue(Number(item.balance_before || 0))} → ${escapeOptionValue(Number(item.balance_after || 0))}</p>
        <p>${escapeOptionValue(item.note || "-")} · ${escapeOptionValue(formatTrackerTime(item.created_at))}</p>
      </article>`).join("") : `<p class="hint">暂无人工处置记录。</p>`;
  }
}

async function resolveAdminReconciliation(jobId, action, button) {
  if (!state.adminAuthenticated || !jobId || !["confirm_succeeded", "refund"].includes(action)) return;
  const actionLabel = action === "refund" ? "确认退款" : "确认生成成功";
  const note = window.prompt(`请输入${actionLabel}的核对依据（4–500 字）：`, "已核对供应商后台与请求记录");
  if (note === null) return;
  if (note.trim().length < 4 || note.trim().length > 500) {
    showToast("处置备注需填写 4–500 个字符");
    return;
  }
  if (!window.confirm(`${actionLabel}任务 ${jobId}？\n\n该动作会立即改变任务账务状态，且不可改为另一种处置。`)) return;
  if (button) { button.disabled = true; button.textContent = "处理中..."; }
  try {
    const response = await fetch(apiUrl("/api/admin/reconciliation/resolve"), {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ jobId, action, note: note.trim() })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "对账处置失败");
    showToast(data.idempotent ? "该任务此前已完成相同处置" : `${actionLabel}完成`);
    await loadAdminReconciliation();
  } catch (error) {
    if (els.adminReconciliationHint) els.adminReconciliationHint.textContent = error.message || "对账处置失败";
    showToast(error.message || "对账处置失败");
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = actionLabel; }
  }
}

async function loadAdminProviders() {
  if (!state.adminAuthenticated || !els.adminProviderSettings) return;
  els.adminProviderSettings.innerHTML = `<p class="hint">正在读取供应商配置...</p>`;
  if (els.adminProviderHint) els.adminProviderHint.textContent = "";
  try {
    const response = await fetch(apiUrl("/api/admin/providers"), { headers: adminHeaders(), cache: "no-store" });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "读取供应商配置失败");
    state.adminProviderSettings = data;
    renderAdminProviders();
  } catch (error) {
    els.adminProviderSettings.innerHTML = `<p class="hint">${escapeOptionValue(error.message || "读取供应商配置失败")}</p>`;
  }
}

function renderAdminProviders() {
  const data = state.adminProviderSettings || {};
  const providers = Array.isArray(data.providers) ? data.providers : [];
  const modes = Array.isArray(data.modes) ? data.modes : [];
  if (!els.adminProviderSettings) return;
  const providerCards = providers.map((provider) => `
    <article class="admin-provider-detail-card">
      <div class="admin-provider-detail-heading">
        <div><strong>${escapeOptionValue(provider.label)}</strong></div>
        <span class="admin-provider-status ${provider.configured ? "configured" : "missing"}">${provider.configured ? "已配置" : "未配置"}</span>
      </div>
      <label>API Base<input type="text" value="${escapeOptionValue(provider.apiBase || "未配置")}" readonly></label>
      <label>备注<textarea maxlength="300" data-provider-note="${escapeOptionValue(provider.id)}" placeholder="例如：价格、联系人、额度、稳定性或使用场景">${escapeOptionValue(data.notes?.[provider.id] || "")}</textarea></label>
      <button class="secondary-button" type="button" data-save-provider-note="${escapeOptionValue(provider.id)}">保存备注</button>
    </article>`).join("");
  const channelPanels = ["web", "mini"].map((channel) => {
    const modeCards = modes.filter((mode) => !Array.isArray(mode.channels) || mode.channels.includes(channel)).map((mode) => {
    const activeId = data.bindings?.[channel]?.[mode.id] || "";
    const options = providers.map((provider) => {
      const supportsMode = !Array.isArray(provider.supportedModes) || provider.supportedModes.includes(mode.id);
      const miniReady = channel !== "mini" || provider.miniConfigured;
      const selectable = provider.configured && supportsMode && miniReady;
      const suffix = !provider.configured ? "（未配置）" : !miniReady ? "（小程序 Worker 未配置）" : supportsMode ? "" : "（不支持此模式）";
      return `
      <option value="${escapeOptionValue(provider.id)}" ${provider.id === activeId ? "selected" : ""} ${selectable ? "" : "disabled"}>
        ${escapeOptionValue(provider.label)}${suffix}
      </option>`;
    }).join("");
    return `<article class="admin-provider-card">
      <div><strong>${escapeOptionValue(mode.label)}</strong><p>当前通道：${escapeOptionValue(providers.find((item) => item.id === activeId)?.label || activeId || "-")}</p></div>
      <div class="admin-provider-control">
        <select data-provider-channel="${channel}" data-provider-mode="${escapeOptionValue(mode.id)}">${options}</select>
        <button class="secondary-button primary" type="button" data-provider-channel="${channel}" data-save-provider="${escapeOptionValue(mode.id)}">保存切换</button>
      </div>
    </article>`;
    }).join("") || `<p class="hint">暂无可配置的生图模式。</p>`;
    const label = channel === "web" ? "网页端" : "小程序端";
    return `<div data-admin-provider-panel="${channel}" hidden>
      <div class="admin-provider-section-title"><strong>${label}</strong><span>下一次${channel === "web" ? "网页" : "小程序"}生图立即生效</span></div>
      <div class="admin-provider-mode-list">${modeCards}</div>
    </div>`;
  }).join("");
  els.adminProviderSettings.innerHTML = `
    ${channelPanels}
    <div data-admin-provider-panel="list">
      <div class="admin-provider-section-title"><strong>供应商清单</strong><span>${providers.length} 个通道</span></div>
      <div class="admin-provider-list">${providerCards || `<p class="hint">暂无供应商。</p>`}</div>
    </div>`;
  setAdminProviderView(state.adminProviderView);
}

function setAdminProviderView(view) {
  state.adminProviderView = ["web", "mini", "list"].includes(view) ? view : "web";
  document.querySelectorAll("[data-admin-provider-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminProviderView === state.adminProviderView);
  });
  els.adminProviderSettings?.querySelectorAll("[data-admin-provider-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.adminProviderPanel !== state.adminProviderView;
  });
}

async function saveAdminProviderNote(providerId, button) {
  const textarea = els.adminProviderSettings?.querySelector(`[data-provider-note="${providerId}"]`);
  if (!state.adminAuthenticated || !textarea) return;
  if (button) { button.disabled = true; button.textContent = "保存中..."; }
  try {
    const response = await fetch(apiUrl("/api/admin/providers"), {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "note", providerId, note: textarea.value })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "保存备注失败");
    state.adminProviderSettings = data;
    renderAdminProviders();
    if (els.adminProviderHint) els.adminProviderHint.textContent = "备注已保存。";
  } catch (error) {
    if (els.adminProviderHint) els.adminProviderHint.textContent = error.message || "保存备注失败";
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = "保存备注"; }
  }
}

async function saveAdminProvider(modeId, button) {
  if (!state.adminAuthenticated || !modeId) return;
  const channel = button?.dataset.providerChannel || "web";
  const select = els.adminProviderSettings?.querySelector(`[data-provider-channel="${channel}"][data-provider-mode="${modeId}"]`);
  const providerId = select?.value || "";
  if (!providerId) return;
  if (!window.confirm(`确认切换${channel === "mini" ? "小程序端" : "网页端"}该生图模式的 API 供应商吗？`)) return;
  if (button) { button.disabled = true; button.textContent = "保存中..."; }
  if (els.adminProviderHint) els.adminProviderHint.textContent = "";
  try {
    const response = await fetch(apiUrl("/api/admin/providers"), {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ channel, modeId, providerId })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "切换供应商失败");
    state.adminProviderSettings = data;
    renderAdminProviders();
    if (els.adminProviderHint) els.adminProviderHint.textContent = `已保存，下一次${channel === "mini" ? "小程序" : "网页"}生图将使用新通道。`;
    showToast("供应商已切换");
  } catch (error) {
    if (els.adminProviderHint) els.adminProviderHint.textContent = error.message || "切换供应商失败";
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = "保存切换"; }
  }
}
function setAdminRechargeFilter(filter) {
  state.adminRechargeFilter = filter === "failed" ? "failed" : "success";
  document.querySelectorAll("[data-admin-recharge-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminRechargeFilter === state.adminRechargeFilter);
  });
  renderAdminRechargeOrders();
}

function renderAdminRechargeOrders() {
  const success = state.adminRechargeFilter === "success";
  const orders = state.adminRechargeOrders.filter((order) =>
    success ? order.status === "approved" : order.status !== "approved"
  );
  renderRechargeOrders(els.adminRechargeOrders, orders, {
    admin: true,
    emptyMessage: success ? "暂无成功充值记录。" : "暂无失败充值记录。"
  });
}

async function loadAdminRechargeOrders() {
  if (!state.adminAuthenticated) return;
  if (els.adminRechargeOrders) els.adminRechargeOrders.innerHTML = `<p class="hint">正在读取申请...</p>`;
  try {
    const response = await fetch(apiUrl("/api/admin/recharges"), { headers: adminHeaders(), cache: "no-store" });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "读取审核列表失败");
    state.adminRechargeOrders = Array.isArray(data.orders) ? data.orders : [];
    renderAdminRechargeOrders();
  } catch (error) {
    if (els.adminRechargeOrders) els.adminRechargeOrders.innerHTML = `<p class="hint">${escapeOptionValue(error.message || "读取审核列表失败")}</p>`;
  }
}

async function reviewRechargeOrder(orderId, action) {
  if (!state.adminAuthenticated || !orderId) return;
  try {
    const response = await fetch(apiUrl("/api/admin/recharges/review"), {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: orderId, action })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "处理失败");
    showToast(action === "approve" ? "已通过并更新余额" : "已驳回");
    await loadAdminRechargeOrders();
    await loadCurrentUser();
    renderAccountHome();
    await loadRechargeOrders();
  } catch (error) {
    showToast(error.message || "处理失败");
  }
}

function renderAdminUsers(data) {
  if (!els.adminUsers) return;
  const users = Array.isArray(data.users) ? data.users : [];
  const total = Number(data.total || 0);
  const page = Number(data.page || 1);
  const totalPages = Number(data.totalPages || 1);
  state.adminUserPage = page;
  const matchLabel = state.adminUserSearch ? "匹配账号" : (state.adminUserFilter === "disabled" ? "已停用账号" : "正常账号");
  const summary = `<p class="admin-user-summary">${matchLabel}：${total} 个（真实总数）</p>`;
  if (els.adminUserPagination) els.adminUserPagination.hidden = totalPages <= 1;
  if (els.adminUserPageSummary) els.adminUserPageSummary.textContent = `第 ${page} / ${totalPages} 页`;
  els.adminUserPagination?.querySelector('[data-admin-user-page="previous"]')?.toggleAttribute("disabled", page <= 1);
  els.adminUserPagination?.querySelector('[data-admin-user-page="next"]')?.toggleAttribute("disabled", page >= totalPages);
  if (!users.length) {
    els.adminUsers.innerHTML = `${summary}<p class="hint">${state.adminUserSearch ? "没有找到匹配的用户。" : "暂无注册用户。"}</p>`;
    return;
  }

  els.adminUsers.innerHTML = summary + users
    .map((user) => `
      <article class="admin-user-card">
        <div class="admin-user-card-heading">
          <strong>${escapeOptionValue(user.loginAccount || user.username || "-")}</strong>
          <div class="admin-user-actions">
            ${user.status === "disabled"
              ? `<button class="mini-button admin-delete-user-button" type="button" data-admin-delete-user="${escapeOptionValue(user.username || "")}" data-admin-delete-user-label="${escapeOptionValue(user.loginAccount || user.username || "-")}">删除账号</button>`
              : `<button class="mini-button admin-manual-recharge-button" type="button" data-admin-manual-recharge="${escapeOptionValue(user.username || "")}" data-admin-manual-recharge-label="${escapeOptionValue(user.loginAccount || user.username || "-")}">手动充值</button><button class="mini-button admin-disable-user-button" type="button" data-admin-user-status="${escapeOptionValue(user.username || "")}" data-admin-user-next-status="disabled">停用账号</button>`}
          </div>
        </div>
        ${user.loginAccount && user.loginAccount !== user.username ? `<p>内部账号：${escapeOptionValue(user.username)}</p>` : ""}
        <p>余额：<span class="energy-icon">⚡</span>${escapeOptionValue(Number(user.balance || 0))}</p>
        <p>手机号：${escapeOptionValue(user.phone || "-")} · 充值次数：${escapeOptionValue(Number(user.rechargeCount || 0))} 次 · 注册方式：${escapeOptionValue(user.registrationMethod || "-")}</p>
        <p>使用的内测码：${escapeOptionValue(user.inviteCode || "-")}</p>
        <p>状态：${escapeOptionValue(user.status === "disabled" ? "已停用" : "正常")}</p>
        <p>注册时间：${escapeOptionValue(formatTrackerTime(user.createdAt))}</p>
      </article>`)
    .join("");
}

async function loadAdminUsers() {
  if (!state.adminAuthenticated) return;
  if (els.adminUsers) els.adminUsers.innerHTML = `<p class="hint">正在读取用户...</p>`;
  if (els.adminUserPagination) els.adminUserPagination.hidden = true;
  try {
    const params = new URLSearchParams({ status: state.adminUserFilter, page: String(state.adminUserPage), pageSize: String(state.adminUserPageSize) });
    if (state.adminUserSearch) params.set("search", state.adminUserSearch);
    const response = await fetch(apiUrl(`/api/admin/users?${params}`), { headers: adminHeaders(), cache: "no-store" });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "读取用户失败");
    renderAdminUsers(data);
  } catch (error) {
    if (els.adminUsers) els.adminUsers.innerHTML = `<p class="hint">${escapeOptionValue(error.message || "读取用户失败")}</p>`;
    if (els.adminUserPagination) els.adminUserPagination.hidden = true;
  }
}

function setAdminUserFilter(filter) {
  state.adminUserFilter = filter === "disabled" ? "disabled" : "active";
  state.adminUserPage = 1;
  document.querySelectorAll("[data-admin-user-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminUserFilter === state.adminUserFilter);
  });
  loadAdminUsers();
}

function searchAdminUsers() {
  state.adminUserSearch = String(els.adminUserSearch?.value || "").trim();
  state.adminUserPage = 1;
  loadAdminUsers();
}

function changeAdminUserPage(direction) {
  if (direction === "previous" && state.adminUserPage > 1) state.adminUserPage -= 1;
  if (direction === "next") state.adminUserPage += 1;
  loadAdminUsers();
}

async function updateAdminUserStatus(username, nextStatus) {
  if (!state.adminAuthenticated || !username || !["active", "disabled"].includes(nextStatus)) return;
  const actionText = nextStatus === "disabled" ? "停用" : "恢复";
  if (!window.confirm(`确认${actionText}账号 ${username} 吗？`)) return;
  try {
    const response = await fetch(apiUrl("/api/admin/users/status"), {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ username, status: nextStatus })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || `${actionText}账号失败`);
    showToast(`${actionText}账号成功`);
    await loadAdminUsers();
  } catch (error) {
    showToast(error.message || `${actionText}账号失败`);
  }
}

async function deleteAdminUser(username, label) {
  if (!state.adminAuthenticated || !username) return;
  const confirmed = window.confirm(`删除账号 ${label || username}？\n\n该操作会删除账号、手机号绑定、充值记录、使用日志和生成记录，删除后手机号可以重新注册，且无法恢复。`);
  if (!confirmed) return;
  try {
    const response = await fetch(apiUrl("/api/admin/users/delete"), {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ username })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "删除账号失败");
    showToast("账号已删除");
    await loadAdminUsers();
  } catch (error) {
    showToast(error.message || "删除账号失败");
  }
}

function openAdminManualRecharge(username, label) {
  if (!state.adminAuthenticated || !username || !els.adminManualRechargeModal) return;
  state.adminManualRechargeUsername = username;
  state.adminManualRechargeRequestId = crypto.randomUUID();
  if (els.adminManualRechargeUser) els.adminManualRechargeUser.textContent = `用户：${label || username}`;
  if (els.adminManualRechargeCredits) els.adminManualRechargeCredits.value = "200";
  if (els.adminManualRechargeHint) els.adminManualRechargeHint.textContent = "确认后将立即增加余额，并写入一条成功的线下充值记录。";
  els.adminManualRechargeModal.hidden = false;
  window.setTimeout(() => els.adminManualRechargeCredits?.focus(), 0);
}

function closeAdminManualRecharge() {
  if (els.adminManualRechargeModal) els.adminManualRechargeModal.hidden = true;
  state.adminManualRechargeUsername = "";
  state.adminManualRechargeRequestId = "";
}

async function submitAdminManualRecharge() {
  const username = state.adminManualRechargeUsername;
  const credits = Number(els.adminManualRechargeCredits?.value || 0);
  if (!username || !Number.isInteger(credits) || credits < 1 || credits > 100000) {
    if (els.adminManualRechargeHint) els.adminManualRechargeHint.textContent = "请输入 1–100000 之间的整数代币数量。";
    return;
  }
  if (!window.confirm(`确认给用户 ${username} 充值 ${credits} 代币吗？`)) return;
  const button = els.adminManualRechargeConfirm;
  if (button) {
    button.disabled = true;
    button.textContent = "充值中...";
  }
  try {
    const response = await fetch(apiUrl("/api/admin/users/recharge"), {
      method: "POST",
      headers: adminHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        username,
        credits,
        requestId: state.adminManualRechargeRequestId
      })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "手动充值失败");
    if (!data.success) throw new Error(data.error || "充值未完成，请核对充值记录。");
    closeAdminManualRecharge();
    showToast(`充值成功，当前余额 ⚡${Number(data.balance || 0)}`);
    await Promise.all([loadAdminUsers(), loadAdminRechargeOrders()]);
    await loadCurrentUser();
    renderAccountHome();
  } catch (error) {
    if (els.adminManualRechargeHint) els.adminManualRechargeHint.textContent = error.message || "手动充值失败，请稍后再试。";
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "确认充值";
    }
  }
}

async function loadAdminUsage() {
  if (!state.adminAuthenticated || !els.adminUsageLogBody) return;
  const account = els.adminUsageAccount?.value.trim() || "";
  if (!account) {
    if (els.adminUsageSummary) els.adminUsageSummary.textContent = "正在读取平台最新 50 条记录...";
  } else if (els.adminUsageSummary) els.adminUsageSummary.textContent = "正在查询...";
  els.adminUsageLogBody.innerHTML = `<tr><td colspan="9" class="usage-log-empty">正在读取使用日志...</td></tr>`;
  try {
    const endpoint = account ? `/api/admin/usage?account=${encodeURIComponent(account)}` : "/api/admin/usage";
    const response = await fetch(apiUrl(endpoint), {
      headers: adminHeaders(),
      cache: "no-store"
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "读取使用日志失败");
    const user = data.user || {};
    if (els.adminUsageSummary) {
      els.adminUsageSummary.textContent = data.scope === "platform"
        ? "平台最新 50 条使用记录"
        : `账号：${user.loginAccount || user.username || account}${user.phone ? ` · 手机号：${user.phone}` : ""}`;
    }
    renderUsageLog(data.entries || [], els.adminUsageLogBody);
  } catch (error) {
    if (els.adminUsageSummary) els.adminUsageSummary.textContent = error.message || "读取使用日志失败";
    els.adminUsageLogBody.innerHTML = `<tr><td colspan="9" class="usage-log-empty">暂无可展示记录</td></tr>`;
  }
}

function togglePasswordVisibility(button) {
  const input = document.querySelector(`#${button.dataset.passwordToggle}`);
  if (!input) return;
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  button.textContent = visible ? "◉" : "◎";
  const label = visible ? "显示密码" : "隐藏密码";
  button.setAttribute("aria-label", label);
  button.title = label;
}

function numberText(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("zh-CN");
}

function formatTrackerTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return value;
  }
}

function latestTrackerRecord(tracker) {
  return Array.isArray(tracker?.records) && tracker.records.length ? tracker.records[0] : null;
}

function trackerDelta(tracker, key) {
  const records = Array.isArray(tracker?.records) ? tracker.records : [];
  if (records.length < 2) return null;
  return Number(records[0]?.[key] || 0) - Number(records[1]?.[key] || 0);
}

function trackerDeltaHtml(value) {
  if (value === null) return `<span class="tracker-delta neutral">暂无对比</span>`;
  const className = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  const prefix = value > 0 ? "+" : "";
  return `<span class="tracker-delta ${className}">${prefix}${numberText(value)}</span>`;
}

function trackerAvatarText(name) {
  return Array.from(String(name || "?").trim())[0]?.toUpperCase() || "?";
}

function formatTrackerShortTime(value) {
  if (!value) return "暂无";
  try {
    return new Date(value).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  } catch {
    return value;
  }
}

function renderTrackers() {
  const trackers = Array.isArray(state.trackers) ? state.trackers : [];
  const snapshotCount = trackers.reduce((total, item) => total + (Array.isArray(item.records) ? item.records.length : 0), 0);
  const latestTimestamp = trackers
    .flatMap((item) => (Array.isArray(item.records) ? item.records.map((record) => record.createdAt) : []))
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  if (els.trackerCount) els.trackerCount.textContent = `${trackers.length} 个账号`;
  if (els.trackerTotal) els.trackerTotal.textContent = numberText(trackers.length);
  if (els.trackerSnapshots) els.trackerSnapshots.textContent = numberText(snapshotCount);
  if (els.trackerLatestUpdate) els.trackerLatestUpdate.textContent = formatTrackerShortTime(latestTimestamp);

  if (els.trackerSelect) {
    els.trackerSelect.innerHTML = trackers.length
      ? trackers.map((item) => `<option value="${escapeOptionValue(item.id)}">${escapeOptionValue(item.name || "未命名博主")}</option>`).join("")
      : `<option value="">先添加一个博主</option>`;
  }

  if (!els.trackerList) return;
  if (!trackers.length) {
    els.trackerList.innerHTML = `<div class="tracker-empty">
      <span class="tracker-empty-icon">◎</span>
      <strong>还没有关注账号</strong>
      <p>添加一个抖音主页链接，开始记录账号数据</p>
      <button class="secondary-button" data-open-tracker-add type="button">＋ 添加第一个账号</button>
    </div>`;
    return;
  }

  els.trackerList.innerHTML = trackers
    .map((tracker) => {
      const summary = tracker.summary || {};
      const latest = latestTrackerRecord(tracker);
      const followerDelta = trackerDelta(tracker, "followers");
      const workDelta = trackerDelta(tracker, "works");
      return `<article class="tracker-card" data-view-tracker="${escapeOptionValue(tracker.id)}">
        <div class="tracker-account-cell">
          <span class="tracker-avatar">${escapeOptionValue(trackerAvatarText(tracker.name))}</span>
          <div>
            <h4>${escapeOptionValue(tracker.name || "未命名博主")}</h4>
            <p>抖音账号</p>
          </div>
        </div>
        <div class="tracker-metric-cell">
          <span>粉丝数</span>
          <strong>${numberText(summary.followers)}</strong>
          ${trackerDeltaHtml(followerDelta)}
        </div>
        <div class="tracker-metric-cell">
          <span>作品数</span>
          <strong>${numberText(summary.works)}</strong>
          ${trackerDeltaHtml(workDelta)}
        </div>
        <div class="tracker-metric-cell">
          <span>新作品</span>
          <strong>${numberText(summary.newWorks)}</strong>
          <small>${latest?.title ? escapeOptionValue(latest.title) : "暂无记录"}</small>
        </div>
        <div class="tracker-time-cell">
          <span>最近更新</span>
          <strong>${latest ? escapeOptionValue(formatTrackerShortTime(latest.createdAt)) : "未记录"}</strong>
        </div>
        <button class="tracker-row-action" data-view-tracker="${escapeOptionValue(tracker.id)}" type="button">查看详情 ›</button>
      </article>`;
    })
    .join("");
}

function openTrackerAddModal() {
  if (!els.trackerAddModal) return;
  els.trackerAddModal.hidden = false;
  window.setTimeout(() => els.trackerUrl?.focus(), 0);
}

function closeTrackerAddModal() {
  if (els.trackerAddModal) els.trackerAddModal.hidden = true;
}

function renderTrackerDetail(tracker) {
  if (!tracker || !els.trackerDetailSummary || !els.trackerDetailHistory) return;
  const summary = tracker.summary || {};
  const records = Array.isArray(tracker.records) ? tracker.records : [];
  const latest = records[0] || null;
  els.trackerDetailSummary.innerHTML = `
    <div class="tracker-detail-header">
      <div class="tracker-account-cell">
        <span class="tracker-avatar large">${escapeOptionValue(trackerAvatarText(tracker.name))}</span>
        <div>
          <h2>${escapeOptionValue(tracker.name || "未命名博主")}</h2>
          <p>抖音账号</p>
        </div>
      </div>
      <div class="tracker-detail-actions">
        <button class="secondary-button" data-open-tracker="${escapeOptionValue(tracker.url)}" type="button">打开主页</button>
        <button class="secondary-button danger" data-delete-tracker="${escapeOptionValue(tracker.id)}" type="button">删除账号</button>
      </div>
    </div>
    <div class="tracker-detail-stats">
      <article><span>粉丝数</span><strong>${numberText(summary.followers)}</strong>${trackerDeltaHtml(trackerDelta(tracker, "followers"))}</article>
      <article><span>作品数</span><strong>${numberText(summary.works)}</strong>${trackerDeltaHtml(trackerDelta(tracker, "works"))}</article>
      <article><span>点赞</span><strong>${numberText(summary.likes)}</strong>${trackerDeltaHtml(trackerDelta(tracker, "likes"))}</article>
      <article><span>收藏</span><strong>${numberText(summary.saves)}</strong>${trackerDeltaHtml(trackerDelta(tracker, "saves"))}</article>
    </div>`;
  els.trackerDetailHistory.innerHTML = records.length
    ? records.map((record, index) => {
      const previous = records[index + 1];
      const delta = previous ? Number(record.followers || 0) - Number(previous.followers || 0) : null;
      return `<article class="tracker-history-item">
        <div><strong>${escapeOptionValue(formatTrackerTime(record.createdAt))}</strong>${trackerDeltaHtml(delta)}</div>
        <p>粉丝 ${numberText(record.followers)} · 作品 ${numberText(record.works)} · 新作品 ${numberText(record.newWorks)}</p>
        ${record.title ? `<p class="tracker-history-title">${escapeOptionValue(record.title)}</p>` : ""}
      </article>`;
    }).join("")
    : `<div class="tracker-detail-empty">还没有历史记录，在右侧保存第一条数据。</div>`;
  if (els.trackerSelect) els.trackerSelect.value = tracker.id;
  const prefill = [
    [els.trackerFollowers, latest?.followers],
    [els.trackerWorks, latest?.works],
    [els.trackerLikes, latest?.likes],
    [els.trackerComments, latest?.comments],
    [els.trackerShares, latest?.shares],
    [els.trackerSaves, latest?.saves]
  ];
  prefill.forEach(([input, value]) => {
    if (input) input.value = value === undefined || value === null ? "" : String(value);
  });
  if (els.trackerNewWorks) els.trackerNewWorks.value = "";
  if (els.trackerTitle) els.trackerTitle.value = "";
  if (els.trackerWorkUrl) els.trackerWorkUrl.value = "";
  if (els.trackerRecordNote) els.trackerRecordNote.value = "";
}

function openTrackerDetail(id) {
  const tracker = state.trackers.find((item) => item.id === id);
  if (!tracker || !els.trackerDetailModal) return;
  state.activeTrackerId = id;
  renderTrackerDetail(tracker);
  els.trackerDetailModal.hidden = false;
}

function closeTrackerDetail() {
  if (els.trackerDetailModal) els.trackerDetailModal.hidden = true;
  state.activeTrackerId = "";
}

async function loadTrackers() {
  if (!state.user || !els.trackerList) return;
  if (els.trackerHint) els.trackerHint.textContent = "正在读取数据跟踪列表...";
  try {
    const response = await fetch(apiUrl("/api/trackers"), { headers: authHeaders() });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "读取数据跟踪失败");
    state.trackers = Array.isArray(data.trackers) ? data.trackers : [];
    renderTrackers();
    if (els.trackerHint) els.trackerHint.textContent = "";
  } catch (error) {
    const message = userFacingError(error, "暂时无法读取数据，请稍后再试");
    if (els.trackerHint) els.trackerHint.textContent = message;
    if (els.trackerList) els.trackerList.innerHTML = `<div class="tracker-empty">${escapeOptionValue(message)}</div>`;
  }
}

async function addTracker() {
  const url = els.trackerUrl?.value.trim() || "";
  if (!url) {
    showToast("请粘贴抖音主页链接或分享文字");
    els.trackerUrl?.focus();
    return;
  }
  if (els.addTrackerButton) {
    els.addTrackerButton.disabled = true;
    els.addTrackerButton.textContent = "正在识别...";
  }
  try {
    const response = await fetch(apiUrl("/api/trackers"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ url })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "添加博主失败");
    if (els.trackerUrl) els.trackerUrl.value = "";
    await loadTrackers();
    if (els.trackerSelect && data.tracker?.id) els.trackerSelect.value = data.tracker.id;
    closeTrackerAddModal();
    showToast(`已识别并添加：${data.tracker?.name || "抖音账号"}`);
  } catch (error) {
    showToast(userFacingError(error, "未能识别该账号，请检查主页链接后重试"));
  } finally {
    if (els.addTrackerButton) {
      els.addTrackerButton.disabled = false;
      els.addTrackerButton.textContent = "开始识别";
    }
  }
}

function readTrackerNumber(input) {
  const value = Number(input?.value || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function addTrackerRecord() {
  const trackerId = els.trackerSelect?.value || "";
  if (!trackerId) {
    showToast("请先选择一个博主");
    return;
  }
  if (els.addTrackerRecordButton) {
    els.addTrackerRecordButton.disabled = true;
    els.addTrackerRecordButton.textContent = "保存中...";
  }
  try {
    const response = await fetch(apiUrl("/api/trackers/record"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        trackerId,
        followers: readTrackerNumber(els.trackerFollowers),
        works: readTrackerNumber(els.trackerWorks),
        newWorks: readTrackerNumber(els.trackerNewWorks),
        likes: readTrackerNumber(els.trackerLikes),
        comments: readTrackerNumber(els.trackerComments),
        shares: readTrackerNumber(els.trackerShares),
        saves: readTrackerNumber(els.trackerSaves),
        title: els.trackerTitle?.value.trim() || "",
        workUrl: els.trackerWorkUrl?.value.trim() || "",
        note: els.trackerRecordNote?.value.trim() || ""
      })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "保存数据失败");
    [
      els.trackerFollowers,
      els.trackerWorks,
      els.trackerNewWorks,
      els.trackerLikes,
      els.trackerComments,
      els.trackerShares,
      els.trackerSaves,
      els.trackerTitle,
      els.trackerWorkUrl,
      els.trackerRecordNote
    ].forEach((input) => {
      if (input) input.value = "";
    });
    await loadTrackers();
    if (els.trackerSelect && data.tracker?.id) els.trackerSelect.value = data.tracker.id;
    const refreshedTracker = state.trackers.find((item) => item.id === trackerId);
    if (refreshedTracker) {
      state.activeTrackerId = trackerId;
      renderTrackerDetail(refreshedTracker);
    }
    showToast("已保存本次数据");
  } catch (error) {
    showToast(userFacingError(error, "保存失败，请稍后再试"));
  } finally {
    if (els.addTrackerRecordButton) {
      els.addTrackerRecordButton.disabled = false;
      els.addTrackerRecordButton.textContent = "保存本次数据";
    }
  }
}

async function deleteTrackerById(id) {
  if (!id) return;
  if (!window.confirm("确定删除这个博主和它的历史数据吗？")) return;
  try {
    const response = await fetch(apiUrl("/api/trackers/delete"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "删除失败");
    if (state.activeTrackerId === id) closeTrackerDetail();
    await loadTrackers();
    showToast("已删除");
  } catch (error) {
    showToast(userFacingError(error, "删除失败，请稍后再试"));
  }
}

function openExternalLink(url) {
  if (!url) return;
  window.open(url, "_blank", "noopener");
}

async function openAccountHome() {
  if (!state.user || !els.accountDrawer) return;
  renderAccountHome();
  closePasswordEditor();
  els.accountDrawer.hidden = false;
}

function closeAccountHome() {
  if (els.accountDrawer) els.accountDrawer.hidden = true;
}

let adminSecretClickCount = 0;
let adminSecretClickStartedAt = 0;

function openAdminConsole() {
  closeAccountHome();
  state.adminAuthenticated = false;
  state.adminRechargeOrders = [];
  state.adminRechargeFilter = "success";
  state.adminUserFilter = "active";
  state.adminUserSearch = "";
  state.adminUserPage = 1;
  state.adminProviderView = "web";
  if (els.adminUserSearch) els.adminUserSearch.value = "";
  document.querySelectorAll("[data-admin-user-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.adminUserFilter === "active");
  });
  if (els.adminAuthView) els.adminAuthView.hidden = false;
  if (els.adminWorkspace) els.adminWorkspace.hidden = true;
  if (els.adminAuthHint) els.adminAuthHint.textContent = "";
  if (els.adminSecret) els.adminSecret.value = "";
  if (els.adminConsoleModal) els.adminConsoleModal.hidden = false;
  window.setTimeout(() => els.adminSecret?.focus(), 0);
}

function closeAdminConsole() {
  closeAdminManualRecharge();
  if (els.adminConsoleModal) els.adminConsoleModal.hidden = true;
  state.adminAuthenticated = false;
  state.adminRechargeOrders = [];
  if (els.adminSecret) els.adminSecret.value = "";
  if (els.adminAuthView) els.adminAuthView.hidden = false;
  if (els.adminWorkspace) els.adminWorkspace.hidden = true;
  if (els.adminRechargeOrders) els.adminRechargeOrders.innerHTML = "";
  if (els.adminUsers) els.adminUsers.innerHTML = "";
  if (els.adminUsageSummary) els.adminUsageSummary.textContent = "";
  if (els.adminUsageLogBody) els.adminUsageLogBody.innerHTML = `<tr><td colspan="8" class="usage-log-empty">请输入用户账号查询</td></tr>`;
}

function handleAdminSecretClick() {
  const now = Date.now();
  if (!adminSecretClickStartedAt || now - adminSecretClickStartedAt > 4000) {
    adminSecretClickStartedAt = now;
    adminSecretClickCount = 0;
  }
  adminSecretClickCount += 1;
  if (adminSecretClickCount < 7) return;
  adminSecretClickCount = 0;
  adminSecretClickStartedAt = 0;
  openAdminConsole();
}

function openPasswordEditor() {
  if (els.passwordEditor) els.passwordEditor.hidden = false;
  if (els.togglePasswordEditor) els.togglePasswordEditor.hidden = true;
  if (els.securityHint) els.securityHint.textContent = "密码至少8位，并且必须同时包含字母和数字。";
  els.securityPassword?.focus();
}

function closePasswordEditor() {
  if (els.passwordEditor) els.passwordEditor.hidden = true;
  if (els.togglePasswordEditor) els.togglePasswordEditor.hidden = false;
  if (els.securityPassword) els.securityPassword.value = "";
  if (els.securityPasswordConfirm) els.securityPasswordConfirm.value = "";
  if (els.securityHint) els.securityHint.textContent = "";
}

function clearWorkspaceView() {
  if (state.generationController) {
    state.generationController.abort();
    state.generationController = null;
  }
  if (state.pendingGenerationTimer) {
    clearInterval(state.pendingGenerationTimer);
    state.pendingGenerationTimer = null;
  }
  imageSlotIds.forEach(resetReferenceSlot);
  updatePrimaryReferenceVisibility();
  setSceneAnalysis("");
  setPreviewState("empty", "效果预览区");
  if (els.resultHistory) {
    els.resultHistory.hidden = true;
    els.resultHistory.innerHTML = "";
  }
  if (els.serverHint) els.serverHint.textContent = "";
}

async function restoreAccountWorkspace() {
  clearWorkspaceView();
  await loadAccountImageHistory();
  restoreLastImages();
  renderResultHistory();
  const pending = readStoredJson(accountStorageKey(pendingGenerationKey), null);
  if (pending?.expiresAt > Date.now()) renderPendingGenerationState(pending);
  else void recoverActiveWebGeneration();
}

function syncGenerationResolutionForModel() {
  if (els.size && selectedModelOption()?.id === "quality-g2-5") {
    els.size.value = "1k";
  }
}

async function login() {
  if (state.loginMethod === "phone") return phoneAuthenticate();
  const username = els.loginUsername?.value.trim();
  const password = els.loginPassword?.value || "";
  if (!username || !password) {
    els.loginHint.textContent = "请填写手机号或账号以及密码。";
    return;
  }

  els.loginButton.disabled = true;
  els.loginButton.textContent = "登录中...";
  try {
    const response = await fetch(apiUrl("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "登录失败");

    localStorage.setItem(memoryKeys.authToken, data.token);
    saveAuthUser(data.user);
    const verified = await loadCurrentUser({ useCacheOnError: false });
    if (!verified) {
      clearAuthSession();
      throw new Error("登录状态保存失败，请重新登录。若问题持续，请检查服务器登录配置。");
    }
    await initializeMeiqiaCustomer();
    await restoreAccountWorkspace();
    applySiteMode();
    showToast("登录成功");
  } catch (error) {
    els.loginHint.textContent = userFacingError(error, "登录失败，请检查账号和密码");
  } finally {
    els.loginButton.disabled = false;
    els.loginButton.textContent = "登录";
  }
}

function normalizedPhoneInput() {
  return String(els.authPhone?.value || "").replace(/\D/g, "");
}

async function sendSmsCode() {
  const phone = normalizedPhoneInput();
  if (!/^1\d{10}$/.test(phone)) {
    els.loginHint.textContent = "请输入正确的11位手机号。";
    return;
  }
  els.sendSmsCode.disabled = true;
  els.sendSmsCode.textContent = "发送中...";
  try {
    const response = await fetch(apiUrl("/api/sms/send"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, purpose: "auth" })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "验证码发送失败");
    els.loginHint.textContent = "验证码已发送，请注意查收。";
    let remaining = 60;
    clearInterval(state.smsCountdownTimer);
    state.smsCountdownTimer = setInterval(() => {
      remaining -= 1;
      els.sendSmsCode.textContent = remaining > 0 ? `${remaining}秒后重试` : "获取验证码";
      if (remaining <= 0) {
        clearInterval(state.smsCountdownTimer);
        els.sendSmsCode.disabled = false;
      }
    }, 1000);
  } catch (error) {
    els.loginHint.textContent = userFacingError(error, "验证码发送失败，请稍后再试");
    els.sendSmsCode.disabled = false;
    els.sendSmsCode.textContent = "获取验证码";
  }
}

async function phoneAuthenticate() {
  const phone = normalizedPhoneInput();
  const code = String(els.authCode?.value || "").trim();
  if (!/^1\d{10}$/.test(phone) || !/^\d{6}$/.test(code)) {
    els.loginHint.textContent = "请填写正确的手机号和6位验证码。";
    return;
  }
  const button = els.loginButton;
  button.disabled = true;
  button.textContent = "验证中...";
  try {
    const response = await fetch(apiUrl("/api/phone-auth"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, code, consent: true })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "验证失败");
    localStorage.setItem(memoryKeys.authToken, data.token);
    saveAuthUser(data.user);
    const verified = await loadCurrentUser({ useCacheOnError: false });
    if (!verified) {
      clearAuthSession();
      throw new Error("登录状态保存失败，请重新登录。若问题持续，请检查服务器登录配置。");
    }
    await initializeMeiqiaCustomer();
    if (data.created) {
      localStorage.removeItem(accountStorageKey(imageHistoryKey));
      localStorage.removeItem(accountStorageKey(activeReferenceOrderKey));
      localStorage.removeItem(accountStorageKey(resultHistoryKey));
      localStorage.removeItem(accountStorageKey(pendingGenerationKey));
      await historyDatabaseDelete(accountStorageKey(imageHistoryKey));
      await historyDatabaseDelete(accountStorageKey(resultHistoryKey));
    }
    await restoreAccountWorkspace();
    applySiteMode();
    renderAccountHome();
    showToast(data.created ? "注册成功" : "登录成功");
  } catch (error) {
    els.loginHint.textContent = userFacingError(error, "验证失败，请稍后再试");
  } finally {
    button.disabled = false;
    button.textContent = "登录 / 注册";
  }
}

async function saveAccountSecurity() {
  const password = els.securityPassword?.value || "";
  const confirmation = els.securityPasswordConfirm?.value || "";
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    els.securityHint.textContent = "密码至少8位，并且必须同时包含字母和数字。";
    return;
  }
  if (password !== confirmation) {
    els.securityHint.textContent = "两次输入的密码不一致。";
    return;
  }
  els.saveAccountSecurity.disabled = true;
  els.saveAccountSecurity.textContent = "保存中...";
  try {
    const response = await fetch(apiUrl("/api/account/security"), {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ password, confirmation })
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "保存失败");
    closePasswordEditor();
    showToast("密码修改成功");
  } catch (error) {
    els.securityHint.textContent = userFacingError(error, "保存失败，请稍后再试");
  } finally {
    els.saveAccountSecurity.disabled = false;
    els.saveAccountSecurity.textContent = "保存新密码";
  }
}

function logout() {
  clearAuthSession();
  clearWorkspaceView();
  closeAccountHome();
  applySiteMode();
  window.location.reload();
}

function saveConnectionSettings() {
  if (els.modelChoice?.value) {
    localStorage.setItem(memoryKeys.modelChoice, els.modelChoice.value);
  }
  if (els.inviteCode?.value.trim()) {
    localStorage.setItem(memoryKeys.inviteCode, els.inviteCode.value.trim());
  }
}

function loadConnectionSettings() {
  const settings = readStoredJson(memoryKeys.settings, {});
  const savedInvite = localStorage.getItem(memoryKeys.inviteCode);
  if (savedInvite && els.inviteCode) els.inviteCode.value = savedInvite;
  const savedModelChoice = localStorage.getItem(memoryKeys.modelChoice) || settings.modelChoice;
  if (savedModelChoice && els.modelChoice && availableModelOptions().some((option) => option.id === savedModelChoice)) {
    els.modelChoice.value = savedModelChoice;
    updateModelDescription();
  }
}


function render(force = false) {
  if (force) els.output.value = "";
  schedulePromptPreview();
}

function setPromptLocked(locked) {
  state.promptLocked = locked;
  if (els.promptLock) els.promptLock.checked = locked;
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  render();
}

function setDefaults() {
  els.subject.value = defaults.subject;
  els.environment.value = defaults.environment;
  els.negative.value = defaults.negative;
  renderPromptModeOptions("default");
  render(true);
}

function showToast(text, options = {}) {
  if (isFireWorkbench() && window.FireUI?.toast) { window.FireUI.toast(text, options); return; }
  els.toast.textContent = text;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 1800);
}

function selectedGenerationCount() {
  const count = Number(els.count?.value || 1);
  return allowedGenerationCounts().includes(count) ? count : 1;
}

function allowedGenerationCounts() {
  return selectedModelOption()?.id === "fast" ? [1, 2] : [1];
}

function syncGenerationCountOptions() {
  if (!els.count) return;
  const previous = Number(els.count.value || 1);
  const allowed = allowedGenerationCounts();
  els.count.innerHTML = allowed
    .map((count) => `<option value="${count}">${count} 张</option>`)
    .join("");
  els.count.value = String(allowed.includes(previous) ? previous : 1);
}

function selectedOutputSize() {
  const ratio = els.ratio?.value || "竖版 3:4";
  const quality = els.size?.value || "auto";
  const ratioKey = ratio.includes("9:16")
    ? "portrait916"
    : ratio.includes("16:9")
      ? "landscape169"
      : ratio.includes("1:1")
        ? "square"
        : "portrait34";
  const sizeMap = {
    auto: {
      square: "1024x1024",
      portrait34: "768x1024",
      portrait916: "720x1280",
      landscape169: "1280x720"
    },
    "1k": {
      square: "1024x1024",
      portrait34: "768x1024",
      portrait916: "720x1280",
      landscape169: "1280x720"
    },
    "2k": {
      square: "2048x2048",
      portrait34: "1536x2048",
      portrait916: "1152x2048",
      landscape169: "2048x1152"
    },
    "4k": {
      square: "4096x4096",
      portrait34: "3072x4096",
      portrait916: "2304x4096",
      landscape169: "4096x2304"
    }
  };
  return sizeMap[quality]?.[ratioKey] || sizeMap.auto[ratioKey];
}

function updateGenerationCost() {
  if (!els.generationCost) return;
  const count = selectedGenerationCount();
  if (window.FireShowcaseHost) { els.generationCost.textContent = `${count} 张额度`; return; }
  const costPerImage = selectedModelTokenCost();
  els.generationCost.textContent = `⚡${count * costPerImage}`;
}

function resultStatusText(stateName) {
  if (stateName === "loading") return "生成中";
  if (stateName === "timeout") return "结果获取超时";
  if (stateName === "failed") return "生成失败";
  if (stateName === "stopped") return "已停止";
  if (stateName === "done") return "未返回";
  return "待生成";
}

function resultImageFormat(source = "") {
  const value = String(source || "").toLowerCase();
  if (value.startsWith("data:image/jpeg") || /\.jpe?g(?:$|[?#])/.test(value)) return "JPG";
  if (value.startsWith("data:image/webp") || /\.webp(?:$|[?#])/.test(value)) return "WEBP";
  if (value.startsWith("data:image/avif") || /\.avif(?:$|[?#])/.test(value)) return "AVIF";
  return "PNG";
}

function resultImageDetails(item, image) {
  const format = resultImageFormat(item?.image);
  const metaDimensions = String(item?.meta || "").match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
  const width = Number(image?.naturalWidth || metaDimensions?.[1] || 0);
  const height = Number(image?.naturalHeight || metaDimensions?.[2] || 0);
  return width && height ? `${format} · ${width} × ${height}` : `${format} · 原图`;
}

function imageFileExtension(type = "") {
  const mime = String(type || "").toLowerCase();
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("avif")) return "avif";
  return "png";
}

const resultReferenceLoads = new Set();

async function useResultAsReference(item, trigger = null) {
  const source = item?.downloadUrl || item?.image;
  if (!source || resultReferenceLoads.has(source)) return false;
  if (!nextReferenceSlot()) { showToast(referenceAddUnavailableMessage()); return false; }
  resultReferenceLoads.add(source);
  const label = trigger?.querySelector("[data-button-label]");
  const originalLabel = label?.textContent;
  if (trigger) { trigger.disabled = true; trigger.setAttribute("aria-busy", "true"); }
  if (label) label.textContent = "读取原图…";
  referenceFilesReading += 1;
  updateDurableGenerationControls();
  try {
    const url = new URL(source, window.location.href);
    if (!["http:", "https:", "data:"].includes(url.protocol)
        || url.username || url.password
        || window.FireShowcaseHost && url.protocol !== "data:" && url.origin !== window.location.origin
        || url.protocol === "data:" && !url.href.startsWith("data:image/")) throw new Error("Invalid image URL");
    const response = await fetch(url.href, { credentials: "same-origin", cache: "no-store", redirect: "error",
      headers: url.origin === window.location.origin ? authHeaders() : {} });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith("image/")) throw new Error("Invalid image response");
    const file = new File([blob], `history-reference-${Date.now()}.${imageFileExtension(blob.type)}`, { type: blob.type });
    return await appendReferenceFiles([file]) > 0;
  } catch {
    showToast("作品原图暂时无法读取，请重试。", { tone: "error" });
    return false;
  } finally {
    resultReferenceLoads.delete(source);
    referenceFilesReading -= 1;
    updateDurableGenerationControls();
    if (trigger) { trigger.disabled = false; trigger.removeAttribute("aria-busy"); }
    if (label) label.textContent = originalLabel;
  }
}

async function downloadOriginalImage(source, baseName = "alphai-result", trigger = null) {
  if (!source || trigger?.getAttribute("aria-busy") === "true") return;
  const label = trigger?.querySelector("[data-button-label]") || trigger?.querySelector("span");
  const originalLabel = label?.textContent || "下载原图";
  if (trigger) {
    trigger.setAttribute("aria-busy", "true");
    trigger.classList.add("is-downloading");
  }
  if (label) label.textContent = "保存中…";

  let objectUrl = "";
  try {
    const sourceUrl = new URL(source, window.location.href);
    const response = await fetch(sourceUrl.href, {
      credentials: "same-origin",
      headers: sourceUrl.origin === window.location.origin ? authHeaders() : {}
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.size) throw new Error("empty image");
    objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${baseName}.${imageFileExtension(blob.type)}`;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    showToast("已开始保存原图");
  } catch (error) {
    console.error("下载原图失败", error);
    showToast("下载失败，请稍后重试");
  } finally {
    if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    if (trigger) {
      trigger.removeAttribute("aria-busy");
      trigger.classList.remove("is-downloading");
    }
    if (label) label.textContent = originalLabel;
  }
}

async function hydrateGeneratedImages(images, downloads) {
  const resolvedImages = [];
  const blobs = [];
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const downloadUrl = downloads[index] || "";
    if (downloadUrl) {
      try {
        const response = await fetch(apiUrl(downloadUrl), { headers: authHeaders(), cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.size || !String(blob.type || "").startsWith("image/")) throw new Error("invalid image");
        blobs.push(blob);
        resolvedImages.push(URL.createObjectURL(blob));
        continue;
      } catch (error) {
        console.warn("生成图片代理加载失败，回退供应商地址", error);
      }
    }
    blobs.push(null);
    resolvedImages.push(image);
  }
  return { images: resolvedImages, blobs };
}

function renderPreviewGrid(items = [], stateName = "empty", count = selectedGenerationCount()) {
  if (!els.resultView || !els.resultGrid) return;
  const slotCount = Math.max(1, count);
  const doneItems = items.filter((item) => item?.image);

  els.resultView.dataset.count = String(slotCount);
  els.resultView.classList.toggle("is-empty", stateName === "empty");
  els.resultView.classList.toggle("is-loading", stateName === "loading");
  els.resultView.classList.toggle("has-image", doneItems.length > 0);
  els.resultGrid.innerHTML = "";
  for (let index = 0; index < slotCount; index += 1) {
    const item = doneItems[index];
    const card = document.createElement("div");
    card.className = `result-card is-${item ? "done" : stateName}`;

    if (item) {
      card.role = "button";
      card.tabIndex = 0;
      card.title = "点击查看大图";

      const image = document.createElement("img");
      image.alt = item.meta || `第 ${index + 1} 张生成结果`;
      image.src = item.image;
      card.appendChild(image);

      const bar = document.createElement("div");
      bar.className = "result-card-bar";
      const meta = document.createElement("span");
      meta.className = "result-file-details";
      meta.textContent = resultImageDetails(item, image);
      image.addEventListener("load", () => {
        meta.textContent = resultImageDetails(item, image);
      });
      const download = document.createElement("a");
      download.className = "result-download-button";
      download.href = item.image;
      download.setAttribute("aria-label", `下载第 ${index + 1} 张原图`);
      download.title = "下载原图";
      const downloadIcon = document.createElement("img");
      downloadIcon.src = "./assets/icons/download.svg";
      downloadIcon.alt = "";
      downloadIcon.setAttribute("aria-hidden", "true");
      const downloadLabel = document.createElement("span");
      downloadLabel.textContent = "下载原图";
      download.append(downloadIcon, downloadLabel);
      download.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (download.getAttribute("aria-busy") === "true") return;
        downloadOriginalImage(item.downloadUrl || item.image, `alphai-result-${index + 1}`, download);
      });
      bar.append(meta, download);
      card.appendChild(bar);
      card.addEventListener("click", () => openLightbox(item.image, item.meta || `第 ${index + 1} 张生成结果`));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLightbox(item.image, item.meta || `第 ${index + 1} 张生成结果`);
        }
      });
    } else {
      const status = document.createElement("span");
      status.className = "result-card-status";
      status.textContent = resultStatusText(stateName);
      if (stateName === "loading") {
        const desktopEllipsis = document.createElement("span");
        desktopEllipsis.className = "result-card-status-ellipsis";
        desktopEllipsis.textContent = "...";
        const mobileNotice = document.createElement("span");
        mobileNotice.className = "result-card-mobile-notice";
        mobileNotice.textContent = "生成中，约1分钟，请勿切换页面或APP。";
        status.append(desktopEllipsis, mobileNotice);
      }
      card.appendChild(status);
    }

    els.resultGrid.appendChild(card);
  }
}

function setPreviewState(stateName, text = "效果预览区", count = selectedGenerationCount()) {
  renderPreviewGrid([], stateName, count);
  notifyFireWorkbench();
}

function showResultImage(item, items = item ? [item] : [], count = Math.max(items.length, 1)) {
  if (!item?.image) return;
  els.resultImage.src = item.image;
  els.downloadLink.href = item.image;
  els.resultMeta.textContent = item.meta || "生成结果";
  renderPreviewGrid(items, "done", Math.max(count, 1));
  notifyFireWorkbench();
}

let lightboxReturnFocus = null;

function openLightbox(image = els.resultImage?.src, caption = els.resultMeta?.textContent || "生成结果") {
  if (!els.lightbox || !els.lightboxImage || !image) return;
  if (els.lightbox.hidden) lightboxReturnFocus = document.activeElement;
  stopLightboxMaskEditor();
  els.lightboxImage.src = image;
  if (els.lightboxCaption) els.lightboxCaption.textContent = caption;
  els.lightbox.hidden = false;
  els.lightbox.setAttribute("role", "dialog");
  els.lightbox.setAttribute("aria-modal", "true");
  els.lightbox.setAttribute("aria-label", caption || "图片预览");
  els.lightbox.tabIndex = -1;
  document.body.classList.add("lightbox-open");
  els.lightboxClose?.focus?.();
}

function openReferenceLightbox(slotId) {
  const image = state.files[slotId];
  if (!image?.dataUrl) return;
  openLightbox(image.dataUrl, `${slotNames[slotId] || "参考图"} · 原图预览`);
}

function resizeLightboxMaskCanvas() {
  const canvas = els.lightboxMaskCanvas;
  const image = els.lightboxImage;
  if (!canvas || !image || !state.lightboxMask.active) return;
  const rect = image.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(rect.width));
  canvas.height = Math.max(1, Math.round(rect.height));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
}

function stopLightboxMaskEditor() {
  state.lightboxMask.active = false;
  state.lightboxMask.drawing = false;
  state.lightboxMask.lastPoint = null;
  state.lightboxMask.history = [];
  state.lightboxMask.slotId = "";
  els.lightbox?.classList.remove("mask-editor");
  if (els.lightboxMaskToolbar) els.lightboxMaskToolbar.hidden = true;
  const canvas = els.lightboxMaskCanvas;
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function openSceneMaskEditor(slotId = "image-three") {
  const image = state.files[slotId];
  if (!image?.dataUrl || !els.lightbox || !els.lightboxImage || !els.lightboxMaskCanvas) {
    showToast("请先上传参考图片");
    return;
  }
  stopLightboxMaskEditor();
  state.lightboxMask.active = true;
  state.lightboxMask.history = [];
  state.lightboxMask.slotId = slotId;
  els.lightboxImage.src = image.dataUrl;
  if (els.lightboxCaption) els.lightboxCaption.textContent = `${slotNames[slotId] || "参考图"} · 涂鸦编辑`;
  els.lightbox.hidden = false;
  els.lightbox.classList.add("mask-editor");
  if (els.lightboxMaskToolbar) els.lightboxMaskToolbar.hidden = false;
  document.body.classList.add("lightbox-open");

  const setup = () => {
    resizeLightboxMaskCanvas();
    els.lightboxMaskCanvas.getContext("2d").clearRect(0, 0, els.lightboxMaskCanvas.width, els.lightboxMaskCanvas.height);
  };
  if (els.lightboxImage.complete) requestAnimationFrame(setup);
  else els.lightboxImage.onload = setup;
}

function lightboxMaskPoint(event) {
  const rect = els.lightboxMaskCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function pushLightboxMaskHistory() {
  const canvas = els.lightboxMaskCanvas;
  if (!canvas) return;
  state.lightboxMask.history.push(canvas.toDataURL("image/png"));
  state.lightboxMask.history = state.lightboxMask.history.slice(-30);
}

function restoreLightboxMask(dataUrl) {
  const canvas = els.lightboxMaskCanvas;
  if (!canvas || !dataUrl) return;
  const image = new Image();
  image.onload = () => {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  };
  image.src = dataUrl;
}

function startLightboxMaskDrawing(event) {
  if (!state.lightboxMask.active || !els.lightboxMaskCanvas) return;
  event.preventDefault();
  els.lightboxMaskCanvas.setPointerCapture?.(event.pointerId);
  pushLightboxMaskHistory();
  state.lightboxMask.drawing = true;
  state.lightboxMask.lastPoint = lightboxMaskPoint(event);
  drawLightboxMask(event);
}

function drawLightboxMask(event) {
  if (!state.lightboxMask.active || !state.lightboxMask.drawing || !els.lightboxMaskCanvas) return;
  event.preventDefault();
  const point = lightboxMaskPoint(event);
  const ctx = els.lightboxMaskCanvas.getContext("2d");
  strokeLine(
    ctx,
    state.lightboxMask.lastPoint || point,
    point,
    Number(els.lightboxBrushSize?.value || 52)
  );
  state.lightboxMask.lastPoint = point;
}

function stopLightboxMaskDrawing() {
  state.lightboxMask.drawing = false;
  state.lightboxMask.lastPoint = null;
}

function undoLightboxMask() {
  const previous = state.lightboxMask.history.pop();
  if (!previous) {
    showToast("没有可撤回的涂鸦");
    return;
  }
  restoreLightboxMask(previous);
}

function clearLightboxMask() {
  const canvas = els.lightboxMaskCanvas;
  if (!canvas) return;
  pushLightboxMaskHistory();
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

async function applyLightboxMask() {
  const slotId = state.lightboxMask.slotId || "image-three";
  const current = state.files[slotId];
  const maskCanvas = els.lightboxMaskCanvas;
  if (!current?.dataUrl || !maskCanvas) return;

  const image = await imageElementFromDataUrl(current.dataUrl);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = image.naturalWidth;
  outputCanvas.height = image.naturalHeight;
  const ctx = outputCanvas.getContext("2d");
  ctx.drawImage(image, 0, 0, outputCanvas.width, outputCanvas.height);
  ctx.drawImage(maskCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

  const edited = {
    name: `masked-${current.name || `${slotId}.jpg`}`,
    type: "image/jpeg",
    dataUrl: outputCanvas.toDataURL("image/jpeg", 0.9),
    savedAt: Date.now()
  };

  setSlotImage(slotId, edited);
  rememberImage(slotId, state.files[slotId]);
  persistActiveReferenceSequence();
  if (slotId === "image-three") setSceneAnalysis("");
  renderImageHistory();
  closeLightbox();
  showToast(`涂鸦已应用到${slotNames[slotId] || "参考图"}`);
}

function closeLightbox() {
  if (!els.lightbox) return;
  stopLightboxMaskEditor();
  els.lightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
  const trigger = lightboxReturnFocus;
  lightboxReturnFocus = null;
  if (trigger?.isConnected) trigger.focus?.();
  else if (trigger) {
    const image = trigger.querySelector?.("img")?.getAttribute("src");
    const replacement = image && [...document.querySelectorAll(".collection-image-button")].find((button) => button.querySelector("img")?.getAttribute("src") === image && button.getClientRects().length);
    (replacement || document.querySelector('[data-workbench-view][aria-current="page"]'))?.focus?.();
  }
}

function readResultHistory() {
  return (state.resultHistory || []).filter((item) => !item.removedAt);
}

function saveResultHistory(items) {
  state.resultHistory = items;
  void queueHistoryDatabasePut(accountStorageKey(resultHistoryKey), state.resultHistory);
}

function rememberResult(item) {
  rememberResults([item], item.image);
}

function rememberResults(items, activeImage = "") {
  const current = state.resultHistory || [];
  const cleanItems = items.filter((item) => item?.image).map((item) => {
    const saved = current.find((previous) => previous.image === item.image);
    return saved?.removedAt ? { ...item, removedAt: saved.removedAt } : item;
  });
  const currentImages = new Set(cleanItems.map((item) => item.image));
  const next = [
    ...cleanItems,
    ...current.filter((historyItem) => !currentImages.has(historyItem.image))
  ];
  saveResultHistory(next);
  renderResultHistory(activeImage || cleanItems[0]?.image || "");
}

let collectionRemovalPending = false;

function confirmCollectionRemoval(message) {
  if (collectionRemovalPending) return Promise.resolve(false);
  collectionRemovalPending = true;
  const trigger = document.activeElement;
  const action = trigger?.hasAttribute("data-material-remove") ? "data-material-remove" : trigger?.hasAttribute("data-history-remove") ? "data-history-remove" : "";
  const index = action ? trigger.getAttribute(action) : "";
  const dialog = document.createElement("dialog");
  dialog.id = "collection-removal-dialog";
  dialog.className = "fire-dialog collection-removal-dialog";
  dialog.setAttribute("aria-labelledby", "collection-removal-title");
  dialog.setAttribute("aria-describedby", "collection-removal-message");
  dialog.innerHTML = '<div class="fire-dialog-header fire-panel-header"><h2 class="fire-panel-title" id="collection-removal-title">确认移除</h2></div><p class="collection-removal-copy" id="collection-removal-message"></p><div class="fire-dialog-footer"><button class="fire-button" data-variant="secondary" type="button" data-cancel-removal autofocus>取消</button><button class="fire-button" data-variant="primary" type="button" data-confirm-removal>确认移除</button></div>';
  dialog.querySelector("#collection-removal-message").textContent = message;
  document.body.append(dialog);
  return new Promise((resolve) => {
    let finished = false;
    const finish = (accepted) => {
      if (finished) return;
      finished = true;
      collectionRemovalPending = false;
      if (window.FireUI?.closeDialog) window.FireUI.closeDialog(dialog);
      else if (dialog.open) dialog.close();
      dialog.remove();
      resolve(accepted);
      // Removal refreshes the collection. Focus its current button after the
      // awaiting caller has updated the cards, rather than a detached trigger.
      Promise.resolve().then(() => {
        const replacement = action && (document.querySelector(`[${action}="${index}"]`) || document.querySelector(`[${action}]`));
        (trigger?.isConnected ? trigger : replacement || document.querySelector('[data-workbench-view][aria-current="page"]'))?.focus?.();
      });
    };
    dialog.querySelector("[data-cancel-removal]").addEventListener("click", () => finish(false));
    dialog.querySelector("[data-confirm-removal]").addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dialog.addEventListener("close", () => finish(false), { once: true });
    try {
      if (window.FireUI?.openDialog) window.FireUI.openDialog(dialog);
      else dialog.showModal();
      dialog.querySelector("[data-cancel-removal]").focus();
    } catch {
      finish(false);
      showToast("确认窗口暂时无法打开，请刷新重试。");
    }
  });
}

async function removeResultHistory(item) {
  if (!item?.image || !await confirmCollectionRemoval("将这张作品移出本机历史？之后可以恢复，任务记录和原图仍会保留。")) return false;
  saveResultHistory((state.resultHistory || []).map((saved) => saved.image === item.image ? { ...saved, removedAt: Date.now() } : saved));
  renderResultHistory();
  showToast("已移出作品历史，可在历史页恢复");
  return true;
}

function restoreResultHistory() {
  const items = state.resultHistory || [];
  saveResultHistory([...items.filter((item) => item.removedAt), ...items.filter((item) => !item.removedAt)].map(({ removedAt, ...item }) => item));
  renderResultHistory();
  showToast("已恢复作品历史");
}

function renderResultHistory(activeImage = "") {
  notifyFireWorkbench();
  if (!els.resultHistory) return;
  const items = readResultHistory();
  els.resultHistory.hidden = false;
  els.resultHistory.classList.toggle("is-empty", items.length === 0);
  els.resultHistory.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("span");
    empty.className = "result-history-empty";
    empty.textContent = "暂无历史生图记录";
    els.resultHistory.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-thumb";
    button.title = item.meta || "查看这张效果图";
    if (item.image === activeImage) button.classList.add("active");

    const image = document.createElement("img");
    image.alt = "";
    image.src = item.image;
    button.appendChild(image);

    button.addEventListener("click", () => {
      showResultImage(item);
      renderResultHistory(item.image);
    });

    els.resultHistory.appendChild(button);
  });
}

function setSceneAnalysis(text) {
  const clean = String(text || "").trim();
  if (!els.sceneAnalysis || !els.sceneAnalysisText) return;
  state.sceneAnalysisText = clean;
  els.sceneAnalysis.hidden = !clean;
  els.sceneAnalysis.title = clean;
  els.sceneAnalysisText.title = clean;
  els.sceneAnalysisText.dataset.fullText = clean;
  els.sceneAnalysisText.textContent = clean;
}

function fullSceneAnalysisText() {
  return (state.sceneAnalysisText || els.sceneAnalysisText?.dataset.fullText || els.sceneAnalysisText?.textContent || "").trim();
}

async function analyzeReferenceImage(slotId, triggerButton) {
  const image = state.files[slotId];
  const slotName = slotNames[slotId] || "参考图";
  if (!image?.dataUrl) {
    showToast(`请先上传${slotName}`);
    return;
  }

  if (state.siteConfig.publicMode && state.siteConfig.requireLogin && !state.user) {
    showToast("请先登录");
    return;
  }

  if (state.user && Number(state.user.balance || 0) < 0.5) {
    showToast("余额不足，识图需要 ⚡0.5，请先充值余额");
    return;
  }

  const activeButton = triggerButton || els.analyzeScene;
  const analysisBlock = document.querySelector(`#${slotId}`)?.closest(".upload-block");
  if (analysisBlock && els.sceneAnalysis) analysisBlock.appendChild(els.sceneAnalysis);
  state.sceneAnalysisSlotId = slotId;
  activeButton.disabled = true;
  const oldText = activeButton.textContent;
  activeButton.textContent = "…";
  setSceneAnalysis(`正在识别${slotName}的主体、服装、姿态、构图、环境和光线...`);

  try {
    const response = await fetch(apiUrl("/api/analyze-scene"), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        image: {
          name: image.name,
          type: image.type || "image/jpeg",
          dataUrl: image.dataUrl,
          slotId
        }
      })
    });
    const result = await readJsonResponse(response);
    if (!response.ok) {
      if (result.tokenRefunded) {
        await loadCurrentUser();
        applySiteMode();
      }
      throw new Error(result.error || "读图失败");
    }
    setSceneAnalysis(result.analysis);
    if (result.tokenUsage && state.user) {
      const remaining = Number(result.tokenUsage.remaining);
      const spent = Number(result.tokenUsage.spent || 0);
      if (Number.isFinite(remaining)) state.user.balance = remaining;
      state.user.historicalSpent = Number(state.user.historicalSpent || 0) + spent;
      saveAuthUser(state.user);
      renderAccountHome();
    }
    showToast(`${slotName}识别完成，消耗 ⚡0.5`);
  } catch (error) {
    setSceneAnalysis("");
    els.serverHint.textContent = userFacingError(error, "识别失败，请稍后再试");
    showToast("读图失败");
  } finally {
    activeButton.disabled = false;
    activeButton.textContent = oldText || "✦";
  }
}

async function copySceneAnalysis() {
  const text = fullSceneAnalysisText();
  if (!text) {
    showToast("还没有读图结果");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(`已复制${slotNames[state.sceneAnalysisSlotId] || "参考图"}要素`);
  } catch {
    showToast("复制失败");
  }
}

function applySceneAnalysis() {
  const text = fullSceneAnalysisText();
  if (!text) {
    showToast("还没有读图结果");
    return;
  }
  const slotName = slotNames[state.sceneAnalysisSlotId] || "参考图";
  const block = `${slotName}识图要素：\n${text}`;
  const current = els.output.value.trim();
  els.output.value = current ? `${current}\n\n${block}` : block;
  setPromptLocked(true);
  showToast("已应用到自定义提示词");
}

function scenePreviewImage() {
  return document.querySelector('[data-preview="image-three"]');
}

function sceneDropzone() {
  return document.querySelector("#image-three")?.closest(".dropzone");
}

function objectFitCover(displayWidth, displayHeight, sourceWidth, sourceHeight) {
  const scale = Math.max(displayWidth / sourceWidth, displayHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    scale,
    drawWidth,
    drawHeight,
    offsetX: (displayWidth - drawWidth) / 2,
    offsetY: (displayHeight - drawHeight) / 2
  };
}

function ensureSceneMaskCanvases() {
  const preview = scenePreviewImage();
  const canvas = els.sceneMaskCanvas;
  if (!preview || !canvas || !state.files["image-three"]?.dataUrl) return false;

  const rect = canvas.getBoundingClientRect();
  const displayWidth = Math.max(1, Math.round(rect.width));
  const displayHeight = Math.max(1, Math.round(rect.height));
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }

  const sourceWidth = preview.naturalWidth || displayWidth;
  const sourceHeight = preview.naturalHeight || displayHeight;
  const sourceCanvas = state.sceneMask.sourceCanvas;
  if (!sourceCanvas || sourceCanvas.width !== sourceWidth || sourceCanvas.height !== sourceHeight) {
    state.sceneMask.sourceCanvas = document.createElement("canvas");
    state.sceneMask.sourceCanvas.width = sourceWidth;
    state.sceneMask.sourceCanvas.height = sourceHeight;
  }
  redrawSceneMaskDisplay();
  return true;
}

function redrawSceneMaskDisplay() {
  const canvas = els.sceneMaskCanvas;
  const sourceCanvas = state.sceneMask.sourceCanvas;
  if (!canvas || !sourceCanvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fit = objectFitCover(canvas.width, canvas.height, sourceCanvas.width, sourceCanvas.height);
  ctx.drawImage(sourceCanvas, fit.offsetX, fit.offsetY, fit.drawWidth, fit.drawHeight);
}

function clearSceneMask() {
  const sourceCanvas = state.sceneMask.sourceCanvas;
  if (sourceCanvas) {
    sourceCanvas.getContext("2d").clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  }
  const canvas = els.sceneMaskCanvas;
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function displayPointToSource(point) {
  const sourceCanvas = state.sceneMask.sourceCanvas;
  const canvas = els.sceneMaskCanvas;
  if (!sourceCanvas || !canvas) return point;
  const fit = objectFitCover(canvas.width, canvas.height, sourceCanvas.width, sourceCanvas.height);
  return {
    x: Math.max(0, Math.min(sourceCanvas.width, (point.x - fit.offsetX) / fit.scale)),
    y: Math.max(0, Math.min(sourceCanvas.height, (point.y - fit.offsetY) / fit.scale)),
    scale: fit.scale
  };
}

function pointerDisplayPoint(event) {
  const rect = els.sceneMaskCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function strokeLine(ctx, from, to, width) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function drawSceneMask(event) {
  if (!state.sceneMask.drawing || !ensureSceneMaskCanvases()) return;
  const displayPoint = pointerDisplayPoint(event);
  const sourcePoint = displayPointToSource(displayPoint);
  const displayWidth = Number(els.sceneBrushSize?.value || 42);
  const sourceWidth = Math.max(4, displayWidth / (sourcePoint.scale || 1));

  strokeLine(
    els.sceneMaskCanvas.getContext("2d"),
    state.sceneMask.lastDisplayPoint || displayPoint,
    displayPoint,
    displayWidth
  );
  strokeLine(
    state.sceneMask.sourceCanvas.getContext("2d"),
    state.sceneMask.lastSourcePoint || sourcePoint,
    sourcePoint,
    sourceWidth
  );

  state.sceneMask.lastDisplayPoint = displayPoint;
  state.sceneMask.lastSourcePoint = sourcePoint;
}

function startSceneMaskDrawing(event) {
  if (!state.sceneMask.active || !ensureSceneMaskCanvases()) return;
  event.preventDefault();
  els.sceneMaskCanvas.setPointerCapture?.(event.pointerId);
  state.sceneMask.drawing = true;
  const displayPoint = pointerDisplayPoint(event);
  state.sceneMask.lastDisplayPoint = displayPoint;
  state.sceneMask.lastSourcePoint = displayPointToSource(displayPoint);
  drawSceneMask(event);
}

function stopSceneMaskDrawing() {
  state.sceneMask.drawing = false;
  state.sceneMask.lastDisplayPoint = null;
  state.sceneMask.lastSourcePoint = null;
}

function setSceneMaskMode(active) {
  if (active && !state.files["image-three"]?.dataUrl) {
    showToast("请先上传图3");
    return;
  }
  state.sceneMask.active = active;
  sceneDropzone()?.classList.toggle("masking", active);
  els.maskScene?.classList.toggle("active", active);
  if (els.sceneMaskToolbar) els.sceneMaskToolbar.hidden = !active;
  if (active) {
    ensureSceneMaskCanvases();
    showToast("现在可以在图3上涂掉人脸");
  } else {
    stopSceneMaskDrawing();
  }
}

async function saveSceneMask() {
  const current = state.files["image-three"];
  const sourceCanvas = state.sceneMask.sourceCanvas;
  if (!current?.dataUrl || !sourceCanvas) {
    showToast("还没有可保存的涂鸦");
    return;
  }

  const image = await imageElementFromDataUrl(current.dataUrl);
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = image.naturalWidth;
  outputCanvas.height = image.naturalHeight;
  const ctx = outputCanvas.getContext("2d");
  ctx.drawImage(image, 0, 0, outputCanvas.width, outputCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

  const edited = {
    name: `masked-${current.name || "image-three.jpg"}`,
    type: "image/jpeg",
    dataUrl: outputCanvas.toDataURL("image/jpeg", 0.9),
    savedAt: Date.now()
  };

  setSlotImage("image-three", edited);
  rememberImage("image-three", state.files["image-three"]);
  persistActiveReferenceSequence();
  setSceneAnalysis("");
  clearSceneMask();
  setSceneMaskMode(false);
  showToast("已保存遮脸后的图3");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const original = String(reader.result || "");
      const encoded = original.split(",")[1] || "";
      const header = atob(encoded.slice(0, 32));
      const mime = header.startsWith("\xff\xd8\xff") ? "image/jpeg"
        : header.startsWith("\x89PNG\r\n\x1a\n") ? "image/png"
        : header.startsWith("RIFF") && header.slice(8, 12) === "WEBP" ? "image/webp"
        : header.startsWith("GIF8") ? "image/gif"
        : header.startsWith("BM") ? "image/bmp"
        : header.slice(4, 8) === "ftyp" && /avif|avis/.test(header.slice(8)) ? "image/avif"
        : header.slice(4, 8) === "ftyp" && /heic|heix|hevc|hevx|heif/.test(header.slice(8)) ? "image/heic"
        : header.startsWith("II*\x00") || header.startsWith("MM\x00*") ? "image/tiff" : "";
      resolve(mime ? `data:${mime};base64,${encoded}` : original);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function imageElementFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function compressImageDataUrl(dataUrl, options = {}) {
  try {
    const image = await imageElementFromDataUrl(dataUrl);
    const maxSide = Number(options.maxSide || 1200);
    const quality = Number(options.quality || 0.8);
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    const format = options.format || "image/jpeg";
    if (format === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(format, quality);
  } catch {
    return dataUrl;
  }
}

async function fileToStoredImage(file) {
  let original = await fileToDataUrl(file);
  const sourceMime = String(original.match(/^data:([^;,]+)/)?.[1] || file.type || "").toLowerCase();
  if (durableGenerationEnabled() && (["image/heic", "image/heif", "image/tiff"].includes(sourceMime)
      || !["image/jpeg", "image/png", "image/webp"].includes(sourceMime) && /\.(?:heic|heif|tiff?)$/i.test(file.name || ""))) {
    initializeDurableGeneration();
    const converted = await durableClient.uploadConvertedImage({ dataUrl: original, name: file.name });
    original = converted.normalizedDataUrl;
  }
  let element;
  try { element = await imageElementFromDataUrl(original); }
  catch { throw new Error("图片无法读取，请选择 JPG、PNG、WebP，或先转换图片格式。"); }
  let mime = String(original.match(/^data:([^;,]+)/)?.[1] || file.type || "image/jpeg").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    if (!["image/gif", "image/bmp", "image/avif"].includes(mime)) throw new Error("暂不支持此格式，请先转换为 JPG、PNG 或 WebP。");
    const canvas = document.createElement("canvas");
    canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
    canvas.getContext("2d").drawImage(element, 0, 0);
    original = canvas.toDataURL("image/png");
    mime = "image/png";
  }
  return {
    name: String(file.name || "reference-image"),
    type: mime,
    dataUrl: original,
    previewDataUrl: original,
    uploadDataUrl: original,
    savedAt: Date.now()
  };
}

async function optimizeReferenceForGeneration(image, options = {}) {
  const optimizedDataUrl = await compressImageDataUrl(image.dataUrl, options);
  const dimensions = await imageElementFromDataUrl(optimizedDataUrl)
    .then((element) => ({ width: element.naturalWidth, height: element.naturalHeight }));
  return {
    name: String(image.name || "reference-image.jpg").replace(/\.[^.]+$/, ".jpg"),
    type: optimizedDataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : (image.type || "image/jpeg"),
    dataUrl: optimizedDataUrl,
    ...dimensions
  };
}

function updatePrimaryReferenceVisibility() {
  imageSlotIds.forEach((slotId) => {
    const block = document.querySelector(`#${slotId}`)?.closest(".upload-block");
    if (block) block.hidden = !state.files[slotId];
  });
  if (els.referenceMobileCount) {
    const count = currentReferenceSequence().length;
    els.referenceMobileCount.textContent = `${count} 张${selectedPromptMode() === "custom" ? " · 可选" : " · 至少 2 张"}`;
  }
  updateReferenceRoleUi();
}

function setSlotImage(slotId, image, { preserveRoles = true } = {}) {
  const preview = document.querySelector(`[data-preview="${slotId}"]`);
  const zone = document.querySelector(`#${slotId}`)?.closest(".dropzone");
  const block = zone?.closest(".upload-block");
  if (!preview || !zone || !image?.dataUrl) return;

  const roles = preserveRoles && state.files[slotId] ? state.files[slotId].roles || [] : image.roles || [];
  state.files[slotId] = { ...image, roles: [...new Set(roles)] };
  if (durableGenerationEnabled()) { delete state.files[slotId].assetId; queueReferenceUpload(slotId, state.files[slotId]); }
  preview.src = image.previewDataUrl || image.dataUrl;
  zone.classList.add("has-image");
  zone.querySelector("span").textContent = "替换";
  const deleteButton = zone.querySelector(".delete-slot-button");
  if (deleteButton) deleteButton.hidden = false;
  if (block) block.draggable = true;
  if (slotId === "image-three") {
    setSceneMaskMode(false);
    clearSceneMask();
    setSceneAnalysis("");
  }
  updatePrimaryReferenceVisibility();
  schedulePromptPreview();
}

function currentReferenceSequence(excludedSlotId = "") {
  return imageSlotIds
    .filter((slotId) => slotId !== excludedSlotId)
    .map((slotId) => state.files[slotId])
    .filter(Boolean);
}

function persistActiveReferenceSequence(images = currentReferenceSequence()) {
  const markers = images.map((image) => ({ savedAt: Number(image.savedAt || 0), name: image.name || "", roles: [...(image.roles || [])] }));
  localStorage.setItem(accountStorageKey(activeReferenceOrderKey), JSON.stringify(markers));
}

function resetReferenceSlot(slotId) {
  const preview = document.querySelector(`[data-preview="${slotId}"]`);
  const input = document.querySelector(`#${slotId}`);
  const zone = input?.closest(".dropzone");
  const block = zone?.closest(".upload-block");
  delete state.files[slotId];
  preview?.removeAttribute("src");
  zone?.classList.remove("has-image", "masking", "is-drag-target");
  const label = zone?.querySelector("span");
  if (label) label.textContent = slotUploadLabels[slotId] || "上传参考图";
  const deleteButton = zone?.querySelector(".delete-slot-button");
  if (deleteButton) deleteButton.hidden = true;
  if (input) input.value = "";
  if (block) block.draggable = false;
}

function applyReferenceSequence(images) {
  setSceneMaskMode(false);
  clearSceneMask();
  setSceneAnalysis("");
  if (images.length) ensureReferenceSlot(images.length - 1);
  imageSlotIds.forEach(resetReferenceSlot);
  images.forEach((image, index) => setSlotImage(imageSlotIds[index], image, { preserveRoles: false }));
  updatePrimaryReferenceVisibility();
  renderImageHistory();
  persistActiveReferenceSequence(images);
  schedulePromptPreview();
}

function reorderReferenceSlots(sourceSlotId, targetSlotId = "") {
  const sourceIndex = imageSlotIds.indexOf(sourceSlotId);
  if (sourceIndex < 0 || !state.files[sourceSlotId]) return;
  const images = currentReferenceSequence();
  const [moved] = images.splice(sourceIndex, 1);
  const requestedTarget = targetSlotId ? imageSlotIds.indexOf(targetSlotId) : images.length;
  const targetIndex = Math.max(0, Math.min(requestedTarget, images.length));
  images.splice(targetIndex, 0, moved);
  applyReferenceSequence(images);
  showToast("参考图顺序已更新");
}

function clearSlotImage(slotId, { showMessage = true } = {}) {
  const remaining = currentReferenceSequence(slotId);
  applyReferenceSequence(remaining);
  if (showMessage) showToast(`已删除${slotNames[slotId]}当前图片`);
}

function revealReferenceSlot(slotId) {
  const block = document.querySelector(`[data-extra-reference="${slotId}"]`);
  if (block) block.hidden = false;
  updateAddReferenceButton();
}

function updateAddReferenceButton() {
  if (!els.addReference) return;
  const custom = selectedPromptMode() === "custom";
  const roles = referenceRoles();
  const images = currentReferenceSequence();
  const occupied = new Set(images.flatMap((image) => image.roles || []));
  const canAdd = canAddReferenceImage(images, roles, custom);
  const allAssigned = roles.length > 0 && roles.every((role) => occupied.has(role.id));
  const sharedLabels = roles.filter((role) => role.allowMultipleSources).map((role) => role.label);
  els.addReference.hidden = false;
  els.addReference.disabled = !canAdd;
  const small = els.addReference.querySelector("small");
  if (small) small.textContent = custom ? "图片可选，支持拖拽或多选上传" : !canAdd ? referenceAddUnavailableMessage() : allAssigned && sharedLabels.length ? `可继续补充${sharedLabels.join("、")}联合参考` : "至少 2 张；上传后选择每张图提供的内容";
}

function addExtraReferenceSlot() {
  if (els.addReference?.disabled) return;
  document.querySelector("#reference-batch-input")?.click();
}

let clipboardReferenceTarget = null;

function isEditablePasteTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('textarea, input:not([type="file"]), [contenteditable="true"]'));
}

function clipboardImageFiles(clipboardData) {
  const files = [...(clipboardData?.files || [])].filter(isReferenceImageFile);
  if (files.length) return files;
  return [...(clipboardData?.items || [])].filter((item) => item.kind === "file").map((item) => item.getAsFile?.()).filter((file) => file && isReferenceImageFile(file));
}

function setClipboardReferenceTarget(target) {
  if (clipboardReferenceTarget === target) return;
  clipboardReferenceTarget?.classList.remove("is-paste-target");
  clipboardReferenceTarget = target;
  clipboardReferenceTarget?.classList.add("is-paste-target");
}

function setupClipboardReferencePaste() {
  const targets = [els.addReference].filter(Boolean);
  targets.forEach((target) => {
    target.addEventListener("pointerenter", () => setClipboardReferenceTarget(target));
    target.addEventListener("pointerleave", () => {
      if (clipboardReferenceTarget === target) setClipboardReferenceTarget(null);
    });
  });

  document.addEventListener("paste", async (event) => {
    if (isEditablePasteTarget(event.target) || isEditablePasteTarget(document.activeElement)) return;
    const focusedTarget = document.activeElement?.closest?.("#add-reference-button, #upload-references-button, [data-upload-references], .dropzone");
    const target = clipboardReferenceTarget || focusedTarget;
    if (!target) return;
    const files = clipboardImageFiles(event.clipboardData);
    if (!files.length) {
      showToast("剪贴板中没有可用图片");
      return;
    }

    const slotId = target.classList.contains("dropzone")
      ? target.querySelector("input[type='file']")?.id
      : nextReferenceSlot();
    if (!slotId) {
      showToast(referenceAddUnavailableMessage());
      return;
    }

    event.preventDefault();
    setClipboardReferenceTarget(null);
    if (target.classList.contains("dropzone")) { await uploadReferenceFile(slotId, files[0]); if (files.length > 1) await appendReferenceFiles(files.slice(1)); }
    else await appendReferenceFiles(files);
  });
}

async function uploadReferenceFile(slotId, file) {
  if (!slotId || !file) return false;
  referenceFilesReading += 1;
  updateDurableGenerationControls();
  try {
    if (!(await requestSensitiveImageConsent())) return false;
    if (!isReferenceImageFile(file)) { showToast("请选择图片文件"); return false; }
    const image = await fileToStoredImage(file);
    setSlotImage(slotId, image);
    if (slotId === "image-three") setSceneAnalysis("");
    rememberImage(slotId, state.files[slotId]);
    persistActiveReferenceSequence();
    showToast(durableGenerationEnabled() ? `${slotNames[slotId]}已添加，正在保存素材` : `${slotNames[slotId]}上传成功`);
    return true;
  } catch (error) {
    showToast(error.message || "图片读取失败");
    return false;
  } finally {
    referenceFilesReading -= 1;
    updateDurableGenerationControls();
  }
}

function applyLegalPreviewMode() {
  document.body.classList.toggle("legal-preview-mode", legalPreviewMode);
}

function requestSensitiveImageConsent() {
  if (!legalPreviewMode || localStorage.getItem(sensitiveConsentStorageKey) === "accepted") return Promise.resolve(true);
  if (!els.sensitiveConsentModal || sensitiveConsentResolver) return Promise.resolve(false);
  if (els.sensitiveConsentCheckbox) els.sensitiveConsentCheckbox.checked = false;
  if (els.sensitiveConsentHint) els.sensitiveConsentHint.textContent = "";
  els.sensitiveConsentModal.hidden = false;
  return new Promise((resolve) => { sensitiveConsentResolver = resolve; });
}

function resolveSensitiveImageConsent(accepted) {
  if (accepted && !els.sensitiveConsentCheckbox?.checked) {
    if (els.sensitiveConsentHint) els.sensitiveConsentHint.textContent = "请勾选单独同意后继续。";
    return;
  }
  if (accepted) localStorage.setItem(sensitiveConsentStorageKey, "accepted");
  if (els.sensitiveConsentModal) els.sensitiveConsentModal.hidden = true;
  const resolve = sensitiveConsentResolver;
  sensitiveConsentResolver = null;
  resolve?.(accepted);
}

function readImageHistory() {
  return state.imageHistory || {};
}

function saveImageHistory(history) {
  state.imageHistory = history;
  void queueHistoryDatabasePut(accountStorageKey(imageHistoryKey), history);
}

function materialHistoryItems() {
  const saved = Object.values(readImageHistory()).flat();
  const removed = new Set(saved.filter((item) => item.removedAt).map((item) => item.dataUrl));
  return [...new Map([...saved, ...currentReferenceSequence()].filter((item) => item?.dataUrl && !removed.has(item.dataUrl)).map((item) => [item.dataUrl, item])).values()];
}

function rememberImage(slotId, image) {
  const history = readImageHistory();
  const current = history[slotId] || [];
  const removed = Object.values(history).flat().find((item) => item.dataUrl === image.dataUrl && item.removedAt);
  const { removedAt, ...cleanImage } = image;
  history[slotId] = [
    removed ? { ...cleanImage, removedAt: removed.removedAt } : cleanImage,
    ...current.filter((item) => item.dataUrl !== image.dataUrl)
  ];
  saveImageHistory(history);
  renderImageHistory();
}

async function deleteHistoryImage(slotId, image) {
  if (!image?.dataUrl || !await confirmCollectionRemoval("将这张素材移出本机素材库？之后可以恢复，当前创作中的参考图会保留。")) return false;
  const history = readImageHistory();
  const removedAt = Date.now();
  for (const key of Object.keys(history)) history[key] = history[key].map((item) => item.dataUrl === image.dataUrl ? { ...item, removedAt } : item);
  if (!Object.values(history).flat().some((item) => item.dataUrl === image.dataUrl)) {
    const key = slotId || "image-one";
    history[key] = [{ ...image, removedAt }, ...(history[key] || [])];
  }
  saveImageHistory(history);
  renderImageHistory();
  showToast("已移出素材库，可在素材库恢复");
  return true;
}

function restoreMaterialHistory() {
  const history = readImageHistory();
  for (const key of Object.keys(history)) history[key] = history[key].map(({ removedAt, ...item }) => item);
  saveImageHistory(history);
  renderImageHistory();
  showToast("已恢复历史素材");
}

function renderImageHistory() {
  const history = readImageHistory();
  const library = document.querySelector("#reference-library-items");
  if (library) {
    library.innerHTML = "";
    const unique = materialHistoryItems();
    const libraryPanel = library.closest("details");
    if (libraryPanel) libraryPanel.hidden = unique.length === 0;
    unique.slice(0, 20).forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-thumb";
      button.title = `添加历史图片：${item.name || "参考图"}`;
      const image = document.createElement("img"); image.alt = item.name || "历史参考图"; image.src = item.previewDataUrl || item.dataUrl;
      button.append(image);
      button.addEventListener("click", () => {
        const slotId = nextReferenceSlot();
        if (!slotId) { showToast(referenceAddUnavailableMessage()); return; }
        const roles = rolesForReusedImage(item, currentReferenceSequence(), referenceRoles());
        setSlotImage(slotId, { ...item, roles }, { preserveRoles: false });
        rememberImage(slotId, state.files[slotId]); persistActiveReferenceSequence();
        showToast("已添加历史图片，请确认要参考的内容");
      });
      library.append(button);
    });
    if (unique.length > 20) {
      const more = document.createElement("button"); more.type = "button"; more.textContent = `查看全部 ${unique.length} 张素材`;
      more.addEventListener("click", () => window.fireWorkbench?.navigate("materials")); library.append(more);
    }
  }
  imageSlotIds.forEach((slotId) => {
    const holder = document.querySelector(`[data-history="${slotId}"]`);
    if (!holder) return;
    if (isFireWorkbench()) { holder.replaceChildren(); holder.hidden = true; return; }
    const items = (history[slotId] || []).filter((item) => !item.removedAt);
    holder.innerHTML = "";
    holder.hidden = items.length === 0;

    items.forEach((item, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "history-thumb-wrap";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-thumb";
      button.title = `使用上次保存的${slotNames[slotId]}图片`;
      if (state.files[slotId]?.dataUrl === item.dataUrl) button.classList.add("active");

      const image = document.createElement("img");
      image.alt = "";
      image.src = item.previewDataUrl || item.dataUrl;
      button.appendChild(image);

      if (index === 0) {
        const badge = document.createElement("span");
        badge.textContent = "最近";
        button.appendChild(badge);
      }

      button.addEventListener("click", () => {
        const current = state.files[slotId];
        const roles = current?.roles || rolesForReusedImage(item, currentReferenceSequence(slotId), referenceRoles());
        setSlotImage(slotId, { ...item, roles }, { preserveRoles: false });
        persistActiveReferenceSequence();
        renderImageHistory();
        showToast(`已套用${slotNames[slotId]}历史图片`);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "history-delete-button";
      deleteButton.title = `删除这张${slotNames[slotId]}缩略图`;
      deleteButton.setAttribute("aria-label", `删除这张${slotNames[slotId]}缩略图`);
      deleteButton.textContent = "🗑";
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteHistoryImage(slotId, item);
      });

      wrapper.append(button, deleteButton);
      holder.appendChild(wrapper);
    });
  });
  notifyFireWorkbench();
}

function restoreLastImages() {
  const history = readImageHistory();
  const allSavedImages = Object.values(history).flat();
  const savedOrder = readStoredJson(accountStorageKey(activeReferenceOrderKey), null);
  const images = Array.isArray(savedOrder)
    ? savedOrder.map((marker) => {
        const image = allSavedImages.find((item) => Number(item.savedAt || 0) === Number(marker.savedAt || 0) && (!marker.name || item.name === marker.name));
        return image ? { ...image, roles: Array.isArray(marker.roles) ? marker.roles : [] } : null;
      }).filter(Boolean)
    : Object.values(history).map((items) => items?.find((item) => !item.removedAt)).filter(Boolean).map((image) => ({ ...image, roles: [] }));
  applyReferenceSequence(images);
}

function setupReferenceDeleteButtons() {
  imageSlotIds.forEach((slotId) => {
    const zone = document.querySelector(`#${slotId}`)?.closest(".dropzone");
    const block = zone?.closest(".upload-block");
    if (!zone || zone.querySelector(".delete-slot-button")) return;
    let tools = zone.querySelector(".reference-image-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "reference-image-tools";
      tools.setAttribute("aria-label", `${slotNames[slotId]}工具`);
      zone.appendChild(tools);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reference-tool-button delete-slot-button";
    button.title = `删除当前${slotNames[slotId]}图片`;
    button.setAttribute("aria-label", `删除当前${slotNames[slotId]}图片`);
    button.textContent = "×";
    button.hidden = !state.files[slotId];
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearSlotImage(slotId);
    });
    tools.prepend(button);
    if (isFireWorkbench()) {
      button.innerHTML = window.FireUI?.icon("x", { size: 16 }) || "×";
      const header = block?.querySelector(".upload-head");
      if (header && !header.querySelector(".reference-sort-controls")) {
        const sort = document.createElement("div");
        sort.className = "reference-sort-controls";
        [-1, 1].forEach((direction) => {
          const move = document.createElement("button");
          move.type = "button";
          move.className = "fire-icon-button";
          move.dataset.moveReference = slotId;
          move.dataset.direction = String(direction);
          move.title = direction < 0 ? "向前移动参考图" : "向后移动参考图";
          move.setAttribute("aria-label", move.title);
          move.innerHTML = window.FireUI?.icon(direction < 0 ? "arrow-left" : "arrow-right", { size: 14 }) || (direction < 0 ? "←" : "→");
          sort.append(move);
        });
        header.append(sort);
      }
    }

    if (slotId !== "image-three" && !zone.querySelector(".slot-mask-button")) {
      const maskButton = document.createElement("button");
      maskButton.type = "button";
      maskButton.className = "magic-button reference-tool-button slot-mask-button";
      maskButton.title = `在${slotNames[slotId]}上涂掉不想参考的内容`;
      maskButton.setAttribute("aria-label", `编辑${slotNames[slotId]}涂鸦`);
      maskButton.textContent = "✎";
      maskButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSceneMaskEditor(slotId);
      });
      tools.appendChild(maskButton);
    }

    if (!isFireWorkbench() && !zone.querySelector(".slot-analyze-button") && slotId !== "image-three") {
      const analyzeButton = document.createElement("button");
      analyzeButton.type = "button";
      analyzeButton.className = "magic-button reference-tool-button slot-analyze-button";
      analyzeButton.title = `识别${slotNames[slotId]}内容`;
      analyzeButton.setAttribute("aria-label", `识别${slotNames[slotId]}内容`);
      analyzeButton.textContent = "✦";
      analyzeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        analyzeReferenceImage(slotId, analyzeButton);
      });
      tools.appendChild(analyzeButton);
    }

    block?.addEventListener("dragstart", (event) => {
      if (!state.files[slotId] || event.target.closest(".reference-role-picker, .image-history, .reference-image-tools, .reference-sort-controls")) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", slotId);
      block.classList.add("is-dragging");
    });
    block?.addEventListener("dragend", () => {
      block.classList.remove("is-dragging");
      document.querySelectorAll(".upload-block.is-drag-target").forEach((item) => item.classList.remove("is-drag-target"));
    });
    block?.addEventListener("dragover", (event) => {
      if (![...(event.dataTransfer?.types || [])].includes("text/plain")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      block.classList.add("is-drag-target");
    });
    block?.addEventListener("dragleave", () => block.classList.remove("is-drag-target"));
    block?.addEventListener("drop", (event) => {
      const sourceSlotId = event.dataTransfer?.getData("text/plain") || "";
      if (!sourceSlotId) return;
      event.preventDefault();
      block.classList.remove("is-drag-target");
      if (sourceSlotId !== slotId) reorderReferenceSlots(sourceSlotId, slotId);
    });
  });
}

function assertWorkflowRevision(revision) {
  if (revision !== promptPreviewRevision) throw new Error("准备期间参考图或出图设置已变化，尚未提交。请确认最新设置后重新点击生成。");
}

function assertPreparedPayloadCurrent(payload) {
  assertWorkflowRevision(preparedPayloadRevisions.get(payload));
}

function generationRequestBytes(payload, compiledPrompt) {
  // Include the expanded system/reference rules, not only the short draft.
  return new TextEncoder().encode(JSON.stringify({ ...payload, prompt: compiledPrompt })).byteLength;
}

async function buildImagePayload() {
  const draft = promptDraft();
  const custom = draft.promptMode === "custom";
  if (custom && !draft.prompt) throw new Error(isFireWorkbench() ? "请先描述你想生成的画面。" : "请先填写自定义提示词。");
  const sourceImages = imageSlotIds.filter((id) => state.files[id]).map((id) => ({ ...state.files[id], id, roles: [...(state.files[id].roles || [])] }));
  const errors = referenceSelectionErrors(sourceImages, referenceRoles(), custom);
  if (errors.length) throw new Error(errors.join(" "));
  if (durableGenerationEnabled() && sourceImages.some((image) => durableClient?.assetState(image).status !== "uploaded")) throw new Error("还有参考图片未保存完成，请等待上传，失败的图片可单独重试。");
  clearTimeout(promptPreviewTimer);
  promptPreviewRevision += 1;
  const preparationRevision = promptPreviewRevision;
  const preview = await refreshPromptPreview(draft);
  assertWorkflowRevision(preparationRevision);
  if (!preview?.valid) throw new Error((preview?.errors || ["请等待提示词预览同步后重试。"]).join(" "));
  const payload = {
    ...draft,
    modelChoice: els.modelChoice?.value || "quality",
    size: selectedOutputSize(),
    count: selectedGenerationCount(),
    mode: "image",
    inviteCode: els.inviteCode?.value.trim() || "",
    images: []
  };
  if (durableGenerationEnabled()) {
    payload.images = sourceImages.map((image) => ({ id: image.id, assetId: durableClient.assetState(image).asset.id, roles: image.roles }));
    assertWorkflowRevision(preparationRevision);
    preparedPayloadRevisions.set(payload, preparationRevision);
    return payload;
  }
  // The gateway has rejected larger JSON requests. Use the highest-detail
  // candidate that fits the whole request, with a little room for metrics.
  const targetBytes = Number(state.siteConfig.referenceWorkflow?.requestTargetBytes || 60000) - 512;
  const tiers = [
    { maxSide: 1200, quality: 0.86 }, { maxSide: 1024, quality: 0.8 },
    { maxSide: 900, quality: 0.74 }, { maxSide: 768, quality: 0.7 },
    { maxSide: 640, quality: 0.65 }, { maxSide: 512, quality: 0.6 },
    { maxSide: 448, quality: 0.55 }, { maxSide: 384, quality: 0.5 },
    { maxSide: 320, quality: 0.46 }, { maxSide: 256, quality: 0.4 },
    { maxSide: 224, quality: 0.35 }, { maxSide: 192, quality: 0.3 }
  ];
  if (!sourceImages.length) {
    if (generationRequestBytes(payload, preview.prompt) > targetBytes) throw new Error("当前提示词超过接口请求大小限制，请精简后重试。");
    assertWorkflowRevision(preparationRevision);
    preparedPayloadRevisions.set(payload, preparationRevision);
    return payload;
  }
  for (const tier of tiers) {
    payload.images = await Promise.all(sourceImages.map(async (image) => {
      const face = image.roles.includes("face");
      const optimized = await optimizeReferenceForGeneration(image, { maxSide: Math.round(tier.maxSide * (face ? 1.15 : 1)), quality: Math.min(0.9, tier.quality + (face ? 0.05 : 0)) });
      return { id: image.id, ...optimized, roles: image.roles };
    }));
    assertWorkflowRevision(preparationRevision);
    if (generationRequestBytes(payload, preview.prompt) <= targetBytes) {
      preparedPayloadRevisions.set(payload, preparationRevision);
      return payload;
    }
  }
  throw new Error("这些参考图和提示词仍超过当前接口请求大小限制，已保留全部图片，尚未调用付费模型。请减少参考图或精简提示词后重试。");
}

function renderPendingGenerationState(pendingGeneration) {
  if (state.pendingGenerationTimer) {
    clearInterval(state.pendingGenerationTimer);
    state.pendingGenerationTimer = null;
  }
  const refresh = () => {
    const pending = readStoredJson(accountStorageKey(pendingGenerationKey), pendingGeneration);
    const remainingMs = Number(pending?.expiresAt || 0) - Date.now();
    if (remainingMs <= 0) {
      localStorage.removeItem(accountStorageKey(pendingGenerationKey));
      if (state.pendingGenerationTimer) clearInterval(state.pendingGenerationTimer);
      state.pendingGenerationTimer = null;
      els.generate.disabled = false;
      els.generateLabel.textContent = "开始生成";
      els.serverHint.textContent = "上一次未收到图片，相关消耗已退回，现在可以重新生成。";
      return;
    }
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    els.generate.disabled = true;
    els.generateLabel.textContent = `${remainingMinutes} 分钟后可重试`;
    els.serverHint.textContent = pending?.tokenRefunded
      ? `本次未收到图片，消耗已退回。云雾可能仍在处理，为避免重复生成，请 ${remainingMinutes} 分钟后再试。`
      : `本次未收到图片。云雾可能仍在处理，为避免重复生成，请 ${remainingMinutes} 分钟后再试。`;
    setPreviewState("timeout", "结果获取超时，状态待确认", Number(pending?.count || selectedGenerationCount()));
  };
  refresh();
  if (Number(pendingGeneration?.expiresAt || 0) > Date.now()) {
    state.pendingGenerationTimer = setInterval(refresh, 15000);
  }
}

function asyncGenerationRatio(label) {
  const value = String(label || "");
  if (value.includes("9:16")) return "9:16";
  if (value.includes("16:9")) return "16:9";
  if (value.includes("1:1")) return "1:1";
  return "3:4";
}

async function generationApiRequest(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    const error = new Error(data.error || "异步生成请求失败");
    error.status = response.status;
    if (Number.isFinite(Number(data.currentBalance))) error.currentBalance = Number(data.currentBalance);
    throw error;
  }
  return data;
}

function waitForGenerationPoll(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("已停止生成", "AbortError"));
    }, { once: true });
  });
}

function savedActiveWebGeneration() {
  return readStoredJson(accountStorageKey(activeWebGenerationKey), null);
}

function saveActiveWebGeneration(job, metadata = {}) {
  if (!job?.id) return;
  const previous = savedActiveWebGeneration();
  writeStoredJson(accountStorageKey(activeWebGenerationKey), {
    ...(previous?.jobId === job.id ? previous : {}),
    ...metadata,
    jobId: job.id,
    status: job.status || previous?.status || "queued",
    modelId: job.modelId || metadata.modelId || previous?.modelId || "",
    model: job.model || metadata.model || previous?.model || "",
    count: Number(job.imageCount || metadata.count || previous?.count || 1),
    tokenCost: Number(job.tokenCost || metadata.tokenCost || previous?.tokenCost || 0),
    createdAt: job.createdAt || metadata.createdAt || previous?.createdAt || new Date().toISOString(),
    updatedAt: job.updatedAt || new Date().toISOString()
  });
}

function clearActiveWebGeneration(jobId = "") {
  const saved = savedActiveWebGeneration();
  if (!jobId || !saved?.jobId || saved.jobId === jobId) {
    localStorage.removeItem(accountStorageKey(activeWebGenerationKey));
  }
}

function asyncGenerationStatusText(job) {
  if (job?.error && ["processing", "retry_wait", "timeout_unknown"].includes(job.status)) {
    return job.error;
  }
  if (["queued", "dispatching"].includes(job?.status)) return "任务排队中…";
  return `后台生成中${Number(job?.progress || 0) > 0 ? ` · ${job.progress}%` : ""}…`;
}

async function pollAsyncGenerationJob(initialJob, controller) {
  let job = initialJob;
  let attempt = 0;
  while (!controller.signal.aborted) {
    saveActiveWebGeneration(job);
    if (job.status === "succeeded") break;
    if (["failed", "cancelled"].includes(job.status)) {
      const error = new Error(job.error || "图片生成失败，本次积分已退回。");
      error.definitive = true;
      error.jobId = job.id;
      throw error;
    }

    els.serverHint.textContent = `${asyncGenerationStatusText(job)} 可以保持此页面打开，无需重复提交。`;
    attempt += 1;
    await waitForGenerationPoll(attempt <= 3 ? 2000 : attempt <= 10 ? 4000 : 8000, controller.signal);
    try {
      job = (await generationApiRequest(`/api/generation-jobs/${encodeURIComponent(job.id)}`, {
        signal: controller.signal
      })).job;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      if ([401, 403, 404].includes(Number(error?.status))) {
        error.definitive = true;
        error.jobId = job.id;
        throw error;
      }
      els.serverHint.textContent = "网络暂时中断，生成任务仍在后台进行，正在重新获取结果，请勿重复生成。";
    }
  }
  if (controller.signal.aborted) throw new DOMException("已停止生成", "AbortError");

  const imageUrls = Array.isArray(job.images) ? job.images : [];
  if (!imageUrls.length) {
    const error = new Error("任务已完成，但没有找到生成图片。");
    error.jobId = job.id;
    throw error;
  }
  const images = [];
  for (const source of imageUrls) {
    while (!controller.signal.aborted) {
      try {
        const response = await fetch(source, { headers: authHeaders(), signal: controller.signal });
        if ([401, 403, 404].includes(response.status)) {
          const error = new Error("生成图片暂时无法读取，请重新登录后刷新页面。");
          error.status = response.status;
          error.definitive = true;
          error.jobId = job.id;
          throw error;
        }
        if (!response.ok) throw new Error("生成图片下载失败");
        images.push(URL.createObjectURL(await response.blob()));
        break;
      } catch (error) {
        if (controller.signal.aborted || error?.definitive) throw error;
        els.serverHint.textContent = "图片已经生成，正在重新获取结果，请勿重复生成。";
        await waitForGenerationPoll(4000, controller.signal);
      }
    }
  }
  return {
    jobId: job.id,
    status: "succeeded",
    image: images[0],
    images,
    tokenUsage: {
      spent: Number(job.tokenCost || 0),
      remaining: null,
      imageCount: Number(job.imageCount || images.length),
      modelId: job.modelId,
      model: job.model
    },
    performance: {
      providerMs: Math.max(0, Date.parse(job.completedAt || job.updatedAt) - Date.parse(job.startedAt || job.createdAt))
    }
  };
}

async function requestAsyncGeneration(payload, controller) {
  assertPreparedPayloadCurrent(payload);
  const input = await generationApiRequest("/api/generation-inputs", {
    method: "POST",
    body: JSON.stringify({
      prompt: payload.prompt,
      promptMode: payload.promptMode,
      poseStrict: payload.poseStrict,
      ratio: asyncGenerationRatio(payload.layoutHints?.ratio),
      size: payload.size,
      modelChoice: payload.modelChoice,
      count: payload.count,
      references: payload.images
    }),
    signal: controller.signal
  });
  if (!input.manifestKey) throw new Error("参考图上传未完成，请重试。");
  assertPreparedPayloadCurrent(payload);

  const idempotencyKey = `web_${Date.now()}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const created = await generationApiRequest("/api/generation-jobs", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      inputManifestKey: input.manifestKey,
      modelChoice: payload.modelChoice,
      size: payload.size,
      count: payload.count,
      channel: "web"
    }),
    signal: controller.signal
  });
  let job = created.job;
  if (!job?.id) throw new Error("生成任务创建失败，请重试。");
  saveActiveWebGeneration(job, {
    size: payload.size,
    modelLabel: selectedModelOption()?.label || "高质量模式",
    count: payload.count
  });
  return pollAsyncGenerationJob(job, controller);
}

async function presentGenerationResult(result, {
  modelLabel = "高质量模式",
  size = "",
  count = 1,
  requestMs = 0
} = {}) {
  const images = Array.isArray(result.images) && result.images.length
    ? result.images
    : [result.image].filter(Boolean);
  if (!images.length) throw new Error("接口没有返回图片数据。");

  const generatedAt = Date.now();
  const downloads = Array.isArray(result.downloads) ? result.downloads : [];
  const hydrated = downloads.some(Boolean)
    ? await hydrateGeneratedImages(images, downloads)
    : { images, blobs: [] };
  const resultItems = hydrated.images.map((image, index) => ({
    image,
    blob: hydrated.blobs[index] || null,
    downloadUrl: downloads[index] || "",
    meta: images.length > 1
      ? `${modelLabel}${size ? ` · ${size}` : ""} · ${index + 1}/${images.length}`
      : `${modelLabel}${size ? ` · ${size}` : ""}`,
    savedAt: generatedAt + index
  }));

  showResultImage(resultItems[0], resultItems, count);
  rememberResults(resultItems, resultItems[0].image);
  if (result.tokenUsage) {
    const remainingBalance = Number(result.tokenUsage.remaining);
    const spentTokens = Number(result.tokenUsage.spent || 0);
    const hasExactBalance = result.tokenUsage.remaining !== null && Number.isFinite(remainingBalance);
    if (state.user && hasExactBalance) {
      state.user.balance = remainingBalance;
      state.user.historicalSpent = Number(state.user.historicalSpent || 0) + spentTokens;
      renderAccountHome();
    }
    const remainingText = hasExactBalance ? `，剩余 ⚡${remainingBalance}` : "";
    const providerSeconds = Number(result.performance?.providerMs || 0) / 1000;
    const elapsedSeconds = Number(requestMs || 0) / 1000;
    const timingText = providerSeconds > 0
      ? `，用时 ${elapsedSeconds.toFixed(1)} 秒（模型 ${providerSeconds.toFixed(1)} 秒）`
      : elapsedSeconds > 0 ? `，用时 ${elapsedSeconds.toFixed(1)} 秒` : "";
    els.serverHint.textContent = `生成完成，共 ${images.length} 张，消耗 ⚡${spentTokens}${remainingText}${timingText}。`;
    await loadCurrentUser();
    applySiteMode();
  } else {
    els.serverHint.textContent = `生成完成，共 ${images.length} 张，可预览或下载。`;
  }
  showToast("生成完成");
}

async function recoverActiveWebGeneration() {
  if (!state.siteConfig.asyncGenerationEnabled || !state.user || state.generationController) return;

  let saved = savedActiveWebGeneration();
  let job = null;
  if (saved?.jobId) {
    try {
      job = (await generationApiRequest(`/api/generation-jobs/${encodeURIComponent(saved.jobId)}`)).job;
    } catch (error) {
      if ([401, 403, 404].includes(Number(error?.status))) clearActiveWebGeneration(saved.jobId);
      else return;
    }
  }
  if (!job) {
    try {
      const active = await generationApiRequest("/api/generation-jobs?status=active");
      job = Array.isArray(active.jobs) ? active.jobs[0] : null;
    } catch {
      return;
    }
  }
  if (!job?.id) return;

  saveActiveWebGeneration(job, saved || {});
  saved = savedActiveWebGeneration();
  const controller = new AbortController();
  state.generationController = controller;
  setPreviewState("loading", "生成结果正在获取...", Number(saved?.count || job.imageCount || 1));
  els.generate.disabled = true;
  els.generateLabel.textContent = "生成结果正在获取";
  els.serverHint.textContent = "生成结果正在获取，请勿重复生成。";
  try {
    const result = await pollAsyncGenerationJob(job, controller);
    await presentGenerationResult(result, {
      modelLabel: saved?.modelLabel || job.modelId || "高质量模式",
      size: saved?.size || "",
      count: Number(saved?.count || job.imageCount || 1)
    });
    clearActiveWebGeneration(job.id);
  } catch (error) {
    if (error?.name === "AbortError") return;
    if (error?.definitive) clearActiveWebGeneration(error.jobId || job.id);
    els.serverHint.textContent = userFacingError(error, "生成结果暂时无法获取，请刷新页面重试");
    setPreviewState(error?.definitive ? "failed" : "loading", error?.definitive ? "生成失败" : "生成结果正在获取...", Number(saved?.count || 1));
    if (error?.definitive) showToast("生成失败");
  } finally {
    if (state.generationController === controller) state.generationController = null;
    if (!savedActiveWebGeneration()) {
      await loadSiteConfig();
      applySiteMode();
    }
  }
}

async function generateImage() {
  if (durableGenerationEnabled()) return submitDurableGeneration();
  if (state.generationController) return;

  const pendingGeneration = readStoredJson(accountStorageKey(pendingGenerationKey), null);
  if (pendingGeneration?.expiresAt > Date.now()) {
    renderPendingGenerationState(pendingGeneration);
    showToast(pendingGeneration.tokenRefunded ? "本次未收到图片，消耗已退回" : "本次未收到图片");
    return;
  }
  if (pendingGeneration) localStorage.removeItem(accountStorageKey(pendingGenerationKey));

  if (!location.protocol.startsWith("http")) {
    showToast("请先通过 start.bat 打开工具");
    return;
  }

  if (state.siteConfig.publicMode && state.siteConfig.requireLogin && !state.user) {
    els.serverHint.textContent = "请先登录账号，然后再生成图片。";
    showToast("请先登录");
    els.loginUsername?.focus();
    return;
  }

  if (state.siteConfig.publicMode && state.siteConfig.requireInvite && !state.siteConfig.requireLogin && !els.inviteCode?.value.trim()) {
    els.serverHint.textContent = "请先输入邀请码。";
    showToast("需要邀请码");
    els.inviteCode?.focus();
    return;
  }

  // The header balance may be stale after another tab/device uses the account,
  // or after a previous request ends in an error. Refresh before client-side
  // affordability checks; the server remains the final atomic authority.
  if (state.siteConfig.publicMode && state.siteConfig.requireLogin) {
    const verified = await loadCurrentUser({ useCacheOnError: true });
    if (!verified || !state.user) {
      applySiteMode();
      els.serverHint.textContent = "登录状态已失效，请重新登录后再生成图片。";
      showToast("请重新登录");
      return;
    }
    renderAccountHome();
  }

  const requestedCount = selectedGenerationCount();
  const tokenCostPerImage = selectedModelTokenCost();
  const requiredTokens = requestedCount * tokenCostPerImage;
  if (state.user && Number(state.user.balance || 0) <= 0) {
    els.serverHint.textContent = "当前余额为 0，无法生成图片，请先充值余额。";
    showToast("无法生成，请充值余额");
    return;
  }
  if (state.user && Number(state.user.balance || 0) < requiredTokens) {
    els.serverHint.textContent = `余额不足：生成 ${requestedCount} 张需要 ⚡${requiredTokens}，请先充值。`;
    showToast("余额不足，请先充值");
    return;
  }

  const controller = new AbortController();
  state.generationController = controller;
  setPreviewState("loading", "生成中...", selectedGenerationCount());
  els.generate.disabled = true;
  els.generateLabel.textContent = "生成中，请稍候";
  saveConnectionSettings();
  const modelLabel = selectedModelOption()?.label || "高质量模式";

  try {
    const preparationStartedAt = performance.now();
    const payload = await buildImagePayload();
    payload.clientMetrics = {
      preparationMs: Math.max(0, Math.round(performance.now() - preparationStartedAt))
    };
    els.serverHint.textContent = `正在使用「${modelLabel}」生成 ${payload.count} 张图片，请稍等。`;
    const requestStartedAt = performance.now();
    const useAsyncGeneration = Boolean(state.siteConfig.asyncGenerationEnabled);
    assertPreparedPayloadCurrent(payload);
    const response = useAsyncGeneration ? null : await fetch(apiUrl("/api/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    const result = useAsyncGeneration
      ? await requestAsyncGeneration(payload, controller)
      : await readJsonResponse(response);
    const requestMs = Math.max(0, Math.round(performance.now() - requestStartedAt));

    if (response && !response.ok) {
      const providerFailure = result.providerError?.status
        ? `中转站拒绝请求（状态码 ${result.providerError.status}）。`
        : result.error || "生成失败";
      const requestError = new Error(providerFailure);
      if (Number.isFinite(Number(result.currentBalance))) {
        requestError.currentBalance = Number(result.currentBalance);
      }
      throw requestError;
    }

    if (result.status === "processing_unconfirmed") {
      const expiresAt = Date.now() + pendingGenerationHoldMs;
      writeStoredJson(accountStorageKey(pendingGenerationKey), {
        jobId: result.jobId || "",
        createdAt: Date.now(),
        expiresAt,
        count: payload.count,
        tokenRefunded: Boolean(result.tokenRefunded)
      });
      if (result.tokenRefunded) {
        await loadCurrentUser();
        applySiteMode();
      }
      renderPendingGenerationState(readStoredJson(accountStorageKey(pendingGenerationKey), null));
      showToast(result.tokenRefunded ? "未收到图片，消耗已退回" : "未收到图片");
      return;
    }

    await presentGenerationResult(result, {
      modelLabel,
      size: payload.size,
      count: payload.count,
      requestMs
    });
    if (useAsyncGeneration) clearActiveWebGeneration(result.jobId);
  } catch (error) {
    if (state.user && Number.isFinite(error.currentBalance)) {
      state.user.balance = Number(error.currentBalance);
      saveAuthUser(state.user);
      renderAccountHome();
    } else if (state.siteConfig.requireLogin) {
      await loadCurrentUser({ useCacheOnError: true });
      renderAccountHome();
    }
    if (error?.definitive) clearActiveWebGeneration(error.jobId);
    const recovering = Boolean(state.siteConfig.asyncGenerationEnabled && savedActiveWebGeneration() && !error?.definitive);
    els.serverHint.textContent = recovering
      ? "生成任务仍在后台进行，正在重新获取结果，请勿重复生成。"
      : userFacingError(error, "生成失败，请稍后再试");
    setPreviewState(recovering ? "loading" : "failed", recovering ? "生成结果正在获取..." : "生成失败", selectedGenerationCount());
    showToast(recovering ? "生成任务仍在后台进行" : "生成失败");
  } finally {
    if (state.generationController === controller) state.generationController = null;
    const pending = readStoredJson(accountStorageKey(pendingGenerationKey), null);
    if (pending?.expiresAt > Date.now()) renderPendingGenerationState(pending);
    else if (!savedActiveWebGeneration()) {
      await loadSiteConfig();
      applySiteMode();
    }
  }
}

function setupReferenceInputEvents(slotId) {
  const input = document.querySelector(`#${slotId}`);
  const zone = input?.closest(".dropzone");
  if (!input || !zone || zone.dataset.workflowBound) return;
  zone.dataset.workflowBound = "true";
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (file && !(await uploadReferenceFile(slotId, file))) input.value = "";
  });
  zone.addEventListener("click", (event) => {
    if (!zone.classList.contains("has-image") || event.target === input || event.target === zone.querySelector("span") || event.target.closest(".reference-image-tools")) return;
    event.preventDefault();
    openReferenceLightbox(slotId);
  });
  zone.addEventListener("pointerenter", () => setClipboardReferenceTarget(zone));
  zone.addEventListener("pointerleave", () => { if (clipboardReferenceTarget === zone) setClipboardReferenceTarget(null); });
  zone.addEventListener("dragover", (event) => {
    if (![...(event.dataTransfer?.types || [])].includes("Files")) return;
    event.preventDefault(); zone.classList.add("is-dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-dragover"));
  zone.addEventListener("drop", async (event) => {
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    event.preventDefault(); event.stopPropagation(); zone.classList.remove("is-dragover");
    const first = files.shift();
    await uploadReferenceFile(slotId, first);
    if (files.length) await appendReferenceFiles(files);
  });
}
imageSlotIds.forEach(setupReferenceInputEvents);

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

document.querySelectorAll("#ratio, #size, #count").forEach((input) => {
  input.addEventListener("input", () => render());
  input.addEventListener("change", () => {
    render();
    updateGenerationCost();
    if (input.id === "count" && !state.generationController) {
      setPreviewState("empty", "效果预览区", selectedGenerationCount());
      updateGenerationCost();
    }
  });
});

[els.inviteCode, els.modelChoice].forEach((input) => {
  input?.addEventListener("change", saveConnectionSettings);
});

els.modelChoice?.addEventListener("change", () => {
  syncGenerationResolutionForModel();
  syncGenerationCountOptions();
  updateModelDescription();
  updateGenerationCost();
  schedulePromptPreview();
  if (!state.generationController) {
    setPreviewState("empty", "效果预览区", selectedGenerationCount());
  }
});

els.modelChoice?.addEventListener("input", () => {
  syncGenerationResolutionForModel();
  syncGenerationCountOptions();
  updateGenerationCost();
  schedulePromptPreview();
});

els.clearHistory?.addEventListener("click", () => {
  Object.values(memoryKeys).forEach((key) => localStorage.removeItem(key));
  if (els.rememberKey) els.rememberKey.checked = false;
  if (els.apiKey) els.apiKey.value = "";
  refreshConnectionHistory();
  showToast("已清除接口记录");
});

els.analyzeScene?.addEventListener("click", () => analyzeReferenceImage("image-three", els.analyzeScene));
els.copySceneAnalysis?.addEventListener("click", copySceneAnalysis);
els.applySceneAnalysis?.addEventListener("click", applySceneAnalysis);
els.maskScene?.addEventListener("click", () => openSceneMaskEditor("image-three"));
els.clearSceneMask?.addEventListener("click", () => {
  clearSceneMask();
  showToast("已清除涂鸦");
});
els.saveSceneMask?.addEventListener("click", saveSceneMask);
els.lightboxMaskCanvas?.addEventListener("pointerdown", startLightboxMaskDrawing);
els.lightboxMaskCanvas?.addEventListener("pointermove", drawLightboxMask);
els.lightboxMaskCanvas?.addEventListener("pointerup", stopLightboxMaskDrawing);
els.lightboxMaskCanvas?.addEventListener("pointercancel", stopLightboxMaskDrawing);
els.undoLightboxMask?.addEventListener("click", undoLightboxMask);
els.clearLightboxMask?.addEventListener("click", clearLightboxMask);
els.applyLightboxMask?.addEventListener("click", applyLightboxMask);
els.addReference?.addEventListener("click", addExtraReferenceSlot);
function isReferenceImageFile(file) {
  return String(file.type || "").startsWith("image/") || /\.(?:jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i.test(String(file.name || ""));
}

let referenceAppendQueue = Promise.resolve();

function appendReferenceFiles(files) {
  const images = [...files].filter(isReferenceImageFile);
  const append = async () => {
    if (!images.length) { showToast("请选择图片文件"); return 0; }
    let added = 0;
    for (const file of images) {
      const nextSlot = nextReferenceSlot();
      if (!nextSlot) { showToast(referenceAddUnavailableMessage()); break; }
      if (await uploadReferenceFile(nextSlot, file)) added += 1;
    }
    return added;
  };
  const result = referenceAppendQueue.then(append);
  referenceAppendQueue = result.catch(() => {});
  return result;
}
document.querySelector("#reference-batch-input")?.addEventListener("change", async (event) => {
  await appendReferenceFiles(event.target.files || []);
  event.target.value = "";
});
els.addReference?.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  els.addReference.classList.add("is-dragover");
});
els.addReference?.addEventListener("dragleave", () => {
  els.addReference.classList.remove("is-dragover");
});
els.addReference?.addEventListener("drop", async (event) => {
  event.preventDefault();
  els.addReference.classList.remove("is-dragover");
  const draggedSlotId = event.dataTransfer?.getData("text/plain") || "";
  if (draggedSlotId && state.files[draggedSlotId]) {
    reorderReferenceSlots(draggedSlotId);
    return;
  }
  await appendReferenceFiles(event.dataTransfer?.files || []);
});
els.sceneMaskCanvas?.addEventListener("pointerdown", startSceneMaskDrawing);
els.sceneMaskCanvas?.addEventListener("pointermove", drawSceneMask);
els.sceneMaskCanvas?.addEventListener("pointerup", stopSceneMaskDrawing);
els.sceneMaskCanvas?.addEventListener("pointercancel", stopSceneMaskDrawing);
window.addEventListener("resize", () => {
  updatePrimaryReferenceVisibility();
  if (state.sceneMask.active) ensureSceneMaskCanvases();
  if (state.lightboxMask.active) resizeLightboxMaskCanvas();
});

els.output.addEventListener("input", () => {
  setPromptLocked(true);
  updatePromptCharacterCount();
  schedulePromptPreview();
});

document.querySelectorAll('input[name="pose-fidelity"]').forEach((input) => {
  input.addEventListener("change", () => { state.poseStrict = input.value === "strict"; schedulePromptPreview(); });
});

setupClipboardReferencePaste();

els.savePrompt?.addEventListener("click", saveCurrentPrompt);

els.promptLock?.addEventListener("change", () => {
  setPromptLocked(els.promptLock.checked);
});

els.promptMode?.addEventListener("change", () => {
  syncPromptModeUi();
  if (els.promptMode.value === "default") {
    setPromptLocked(true);
    return;
  }
});

els.promptModeButtons?.forEach((button) => {
  button.addEventListener("click", () => {
    if (!els.promptMode) return;
    els.promptMode.value = button.dataset.promptMode || "default";
    els.promptMode.dispatchEvent(new Event("change", { bubbles: true }));
    if (els.promptMode.value === "custom") els.output?.focus({ preventScroll: true });
  });
});

els.savedPromptSelect?.addEventListener("change", () => {
  const saved = selectedSavedPrompt();
  if (!saved) return;
  els.promptMode.value = "custom";
  els.output.value = saved.text;
  setPromptLocked(true);
  syncPromptModeUi();
  showToast(saved.note ? `已填入：${saved.name} - ${saved.note}` : `已填入：${saved.name}`);
});

document.querySelector("#image-template")?.addEventListener("click", () => {
  setPromptLocked(false);
  setMode("image");
  render(true);
  setPromptLocked(true);
});
document.querySelector("#live-template")?.addEventListener("click", () => {
  setPromptLocked(false);
  setMode("live");
  render(true);
  setPromptLocked(true);
});

els.generate.addEventListener("click", generateImage);
els.resultImage?.addEventListener("click", () => {
  if (!els.resultView?.classList.contains("has-image")) return;
  openLightbox();
});
els.lightboxClose?.addEventListener("click", closeLightbox);
els.lightbox?.addEventListener("click", (event) => {
  if (event.target === els.lightbox) closeLightbox();
});
window.addEventListener("keydown", (event) => {
  if (els.lightbox && !els.lightbox.hidden && ["Tab", "Escape"].includes(event.key)) {
    if (event.key === "Escape") { event.preventDefault(); closeLightbox(); return; }
    const controls = [...els.lightbox.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter((item) => item.getClientRects().length);
    const first = controls[0], last = controls.at(-1), focused = document.activeElement;
    if (!first) { event.preventDefault(); els.lightbox.focus(); }
    else if (event.shiftKey && (focused === first || !els.lightbox.contains(focused))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (focused === last || !els.lightbox.contains(focused))) { event.preventDefault(); first.focus(); }
    return;
  }
  if (event.key === "Escape" && !els.adminManualRechargeModal?.hidden) {
    closeAdminManualRecharge();
    return;
  }
  if (event.key === "Escape" && !els.lightbox?.hidden) closeLightbox();
  if (event.key === "Escape" && !els.accountDrawer?.hidden) closeAccountHome();
  if (event.key === "Escape" && !els.adminConsoleModal?.hidden) closeAdminConsole();
  if (event.key === "Escape" && !els.payModal?.hidden) closeRechargePaymentModal();
  if (event.key === "Escape" && !els.trackerAddModal?.hidden) closeTrackerAddModal();
  if (event.key === "Escape" && !els.trackerDetailModal?.hidden) closeTrackerDetail();
  if (event.key === "Escape") toggleLanguageMenu(false);
});
els.loginButton?.addEventListener("click", login);
els.passwordLoginMethod?.addEventListener("click", () => setLoginMethod(state.loginMethod === "password" ? "phone" : "password"));
els.sendSmsCode?.addEventListener("click", sendSmsCode);
els.saveAccountSecurity?.addEventListener("click", saveAccountSecurity);
els.togglePasswordEditor?.addEventListener("click", openPasswordEditor);
els.cancelPasswordEditor?.addEventListener("click", closePasswordEditor);
els.userPill?.addEventListener("click", openAccountHome);
els.loginAdminSecretTrigger?.addEventListener("click", handleAdminSecretClick);
els.adminSecretTrigger?.addEventListener("click", handleAdminSecretClick);
els.languageButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleLanguageMenu();
});
els.languageMenu?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-locale]");
  if (!button) return;
  applyLocale(button.dataset.locale);
  toggleLanguageMenu(false);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".language-switcher")) toggleLanguageMenu(false);
});
els.navStudio?.addEventListener("click", () => showAppPage("studio"));
els.navMetadataCleaner?.addEventListener("click", () => showAppPage("metadata-cleaner"));
els.navWallet?.addEventListener("click", () => showAppPage("wallet"));
els.accountRechargeButton?.addEventListener("click", () => {
  closeAccountHome();
  showAppPage("wallet");
});
els.logoutButton?.addEventListener("click", logout);
els.accountClose?.addEventListener("click", closeAccountHome);
els.accountDrawer?.addEventListener("click", (event) => {
  if (event.target === els.accountDrawer) closeAccountHome();
});
els.adminConsoleClose?.addEventListener("click", closeAdminConsole);
els.adminConsoleModal?.addEventListener("click", (event) => {
  if (event.target === els.adminConsoleModal) closeAdminConsole();
});
els.rechargeAmountOptions?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-recharge-amount]");
  if (!button) return;
  selectRechargeAmount(button.dataset.rechargeAmount);
});
els.rechargeMethodOptions?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pay-method]");
  if (!button) return;
  selectRechargeMethod(button.dataset.payMethod);
});
els.openRechargeQr?.addEventListener("click", openRechargePaymentModal);
els.payConfirmButton?.addEventListener("click", submitRechargeOrder);
els.payCancelButton?.addEventListener("click", closeRechargePaymentModal);
els.payModalClose?.addEventListener("click", closeRechargePaymentModal);
els.payModal?.addEventListener("click", (event) => {
  if (event.target === els.payModal) closeRechargePaymentModal();
});
els.sensitiveConsentCancel?.addEventListener("click", () => resolveSensitiveImageConsent(false));
els.sensitiveConsentConfirm?.addEventListener("click", () => resolveSensitiveImageConsent(true));
els.sensitiveConsentModal?.addEventListener("click", (event) => {
  if (event.target === els.sensitiveConsentModal) resolveSensitiveImageConsent(false);
});
els.submitRecharge?.addEventListener("click", submitRechargeOrder);
els.adminConfirm?.addEventListener("click", authenticateAdmin);
els.adminSecret?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") authenticateAdmin();
});
els.adminUsers?.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-admin-delete-user]");
  if (deleteButton) {
    deleteAdminUser(deleteButton.dataset.adminDeleteUser, deleteButton.dataset.adminDeleteUserLabel);
    return;
  }
  const statusButton = event.target.closest("[data-admin-user-status]");
  if (statusButton) {
    updateAdminUserStatus(statusButton.dataset.adminUserStatus, statusButton.dataset.adminUserNextStatus);
    return;
  }
  const button = event.target.closest("[data-admin-manual-recharge]");
  if (!button) return;
  openAdminManualRecharge(button.dataset.adminManualRecharge, button.dataset.adminManualRechargeLabel);
});
els.adminManualRechargeClose?.addEventListener("click", closeAdminManualRecharge);
els.adminManualRechargeCancel?.addEventListener("click", closeAdminManualRecharge);
els.adminManualRechargeConfirm?.addEventListener("click", submitAdminManualRecharge);
els.adminManualRechargeCredits?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitAdminManualRecharge();
});
els.adminManualRechargeModal?.addEventListener("click", (event) => {
  if (event.target === els.adminManualRechargeModal) closeAdminManualRecharge();
});
els.loadAdminUsage?.addEventListener("click", loadAdminUsage);
els.adminUserSearchButton?.addEventListener("click", searchAdminUsers);
els.adminUserSearch?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchAdminUsers();
});
els.loadAdminReconciliation?.addEventListener("click", loadAdminReconciliation);
els.adminUsageAccount?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadAdminUsage();
});
els.adminWorkspace?.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-admin-tab]");
  if (tab) setAdminTab(tab.dataset.adminTab);
  const filter = event.target.closest("[data-admin-recharge-filter]");
  if (filter) setAdminRechargeFilter(filter.dataset.adminRechargeFilter);
  const userFilter = event.target.closest("[data-admin-user-filter]");
  if (userFilter) setAdminUserFilter(userFilter.dataset.adminUserFilter);
  const userPage = event.target.closest("[data-admin-user-page]");
  if (userPage && !userPage.disabled) changeAdminUserPage(userPage.dataset.adminUserPage);
  const providerButton = event.target.closest("[data-save-provider]");
  if (providerButton) saveAdminProvider(providerButton.dataset.saveProvider, providerButton);
  const providerNoteButton = event.target.closest("[data-save-provider-note]");
  if (providerNoteButton) saveAdminProviderNote(providerNoteButton.dataset.saveProviderNote, providerNoteButton);
  const providerView = event.target.closest("[data-admin-provider-view]");
  if (providerView) setAdminProviderView(providerView.dataset.adminProviderView);
  const reconciliationButton = event.target.closest("[data-reconcile-job]");
  if (reconciliationButton) {
    resolveAdminReconciliation(
      reconciliationButton.dataset.reconcileJob,
      reconciliationButton.dataset.reconcileAction,
      reconciliationButton
    );
  }
});
els.adminRechargeOrders?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-review]");
  if (!button) return;
  reviewRechargeOrder(button.dataset.orderId, button.dataset.review);
});
document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => togglePasswordVisibility(button));
});
els.refreshTrackers?.addEventListener("click", loadTrackers);
els.openTrackerAdd?.addEventListener("click", openTrackerAddModal);
els.trackerAddClose?.addEventListener("click", closeTrackerAddModal);
els.trackerAddCancel?.addEventListener("click", closeTrackerAddModal);
els.trackerDetailClose?.addEventListener("click", closeTrackerDetail);
els.trackerAddModal?.addEventListener("click", (event) => {
  if (event.target === els.trackerAddModal) closeTrackerAddModal();
});
els.trackerDetailModal?.addEventListener("click", (event) => {
  if (event.target === els.trackerDetailModal) closeTrackerDetail();
  const profileButton = event.target.closest("[data-open-tracker]");
  if (profileButton) openExternalLink(profileButton.dataset.openTracker);
  const deleteButton = event.target.closest("[data-delete-tracker]");
  if (deleteButton) deleteTrackerById(deleteButton.dataset.deleteTracker);
});
els.addTrackerButton?.addEventListener("click", addTracker);
els.addTrackerRecordButton?.addEventListener("click", addTrackerRecord);
els.trackerList?.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-open-tracker-add]");
  if (addButton) {
    openTrackerAddModal();
    return;
  }
  const deleteButton = event.target.closest("[data-delete-tracker]");
  if (deleteButton) {
    deleteTrackerById(deleteButton.dataset.deleteTracker);
    return;
  }
  const profileButton = event.target.closest("[data-open-tracker]");
  if (profileButton) {
    openExternalLink(profileButton.dataset.openTracker);
    return;
  }
  const workButton = event.target.closest("[data-open-work]");
  if (workButton) {
    openExternalLink(workButton.dataset.openWork);
    return;
  }
  const viewButton = event.target.closest("[data-view-tracker]");
  if (viewButton) openTrackerDetail(viewButton.dataset.viewTracker);
});

[els.loginUsername, els.loginPassword, els.authPhone, els.authCode].forEach((input) => {
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      login();
    }
  });
});

async function init() {
  try {
    applyLegalPreviewMode();
    applyLocale(state.locale);
    await loadSiteConfig();
    await loadCurrentUser();
    if (localLoginPreviewMode) {
      state.siteConfig = { ...state.siteConfig, requireLogin: true };
      state.user = null;
    }
    await initializeMeiqiaCustomer();
    setAuthMode("login");
    renderPromptModeOptions();
    loadConnectionSettings();
    applySiteMode();
    setupReferenceDeleteButtons();
    setDefaults();
    setPreviewState("empty", "效果预览区");
    await loadAccountImageHistory();
    restoreLastImages();
    renderResultHistory();
    connectFireWorkbench();
    if (durableGenerationEnabled()) {
      window.FireShowcaseHost?.onActivity(active => {
        if (active) void durableClient.start().catch(() => notifyFireWorkbench());
        else durableClient.stop();
      });
      if (window.FireShowcaseHost?.isActive() !== false) void durableClient.start().catch(() => notifyFireWorkbench());
    }
    setPromptLocked(true);
    const pending = readStoredJson(accountStorageKey(pendingGenerationKey), null);
    if (!durableGenerationEnabled()) {
      if (pending?.expiresAt > Date.now()) renderPendingGenerationState(pending);
      else void recoverActiveWebGeneration();
    }
  } catch (error) {
    console.error("应用初始化失败", error);
    if (window.FireShowcaseHost) document.body.dataset.fireHostState = "failed";
    state.user = null;
    state.siteConfig = { ...state.siteConfig, publicMode: true, requireLogin: true };
    setAuthMode("login");
    applySiteMode();
  } finally {
    // Do not reveal either the workbench or login form until authentication
    // has been resolved, preventing a logged-out refresh from flashing the app.
    document.body.classList.remove("auth-pending");
  }
}

init();
