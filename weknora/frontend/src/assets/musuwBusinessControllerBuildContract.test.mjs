import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

const controllers = [
  {
    baseline: './business-baselines/Input-field.pre-view.vue',
    active: '../components/Input-field.vue',
    viteMapping: "['Input-field.pre-view.vue', resolve(__dirname, 'src/components/Input-field.vue')]",
    bindings: [
      'uploadedImages', 'handleImageSelect', 'removeImage', 'uploadedAttachments', 'allSelectedItems',
      'removeSelectedItem', 'inputPlaceholder', 'onKeydown', 'onInput', 'showImageUploadButton',
      'triggerImageUpload', 'triggerMention', 'showWebSearchButton', 'isWebSearchEnabled',
      'toggleWebSearch', 'reasoningEffort', 'selectedReasoningLabel', 'reasoningOptions',
      'selectedModelDisplayName', 'showModelSelector', 'availableModels', 'handleModelChange',
      'closeModelSelector', 'createSession', 'handleStop',
      'showMention', 'mentionStyle', 'mentionItems', 'showKbSelector',
    ],
  },
  {
    baseline: './business-baselines/KnowledgeBase.pre-view.vue',
    active: '../views/knowledge/KnowledgeBase.vue',
    viteMapping: "['KnowledgeBase.pre-view.vue', resolve(__dirname, 'src/views/knowledge/KnowledgeBase.vue')]",
    bindings: [
      'activeKbTab', 'isWiki', 'knowledgeList', 'kbId', 'handleKnowledgeDropdownSelect', 'kbInfo',
      'wikiIsIndexing', 'wikiIndexingTip', 'unsupportedFileTypes', 'missingStorageEngine',
      'goToParserSettings', 'handleOpenKBSettings', 'openSourceDoc', 'onWikiStatusChange',
      'onViewWikiInGraph', 'showFolderTree', 'folderTreeCollapsed', 'folderTree',
      'selectedFolderPath', 'handleFolderSelect', 'docSearchKeyword', 'loadKnowledgeFiles',
      'tagFilterPanelVisible', 'sidebarTags', 'fileTypeOptions', 'selectedParseStatus',
      'viewMode', 'acceptFileTypes',
      'supportedFileTypes', 'handleUploadSourceFiles', 'handleUploadSourceUrl', 'handleManualCreate',
    ],
  },
  {
    baseline: './business-baselines/KnowledgeBaseList.pre-view.vue',
    active: '../views/knowledge/KnowledgeBaseList.vue',
    viteMapping: "['KnowledgeBaseList.pre-view.vue', resolve(__dirname, 'src/views/knowledge/KnowledgeBaseList.vue')]",
    bindings: [
      'authStore', 'handleCreateKnowledgeBase', 'uploadSummaries', 'loading', 'kbs', 'filteredKnowledgeBases',
      'sortedMineKbs', 'spaceSelection', 'spaceSelectionOrgId', 'sortedSpaceKbsList', 'spaceKbsLoading',
      'toggleKbSection', 'mineKbSectionCounts', 'filteredKbSectionCounts', 'spaceKbSectionCounts',
      'isKbSectionCollapsed', 'isMyKb', 'showShareGroupHeaders', 'kbSectionOf', 'highlightedKbId',
      'highlightedCardRef', 'handleCardClick', 'isKbFavorited', 'toggleFavoriteKb',
      'handleTogglePin', 'handleTogglePinById', 'canDuplicateKBCard', 'handleDuplicate', 'handleDuplicateById',
      'canManageKBCard', 'handleDelete', 'handleDeleteById', 'handleSharedKbClickFromAll',
      'openSharedDetailFromAll', 'handleSharedKbClick', 'openSharedDetail', 'isSpaceKbCollapsed',
    ],
  },
  {
    baseline: './business-baselines/ChatIndex.pre-view.vue',
    active: '../views/chat/index.vue',
    viteMapping: "['ChatIndex.pre-view.vue', resolve(__dirname, 'src/views/chat/index.vue')]",
    bindings: [
      'embeddedMode', 'uiStore', 'referencesDrawerVisible', 'currentSession', 'scrollContainer',
      'handleScroll', 'historyLoading', 'messagesList', 'loading', 'suggestedQuestions',
      'suggestedQuestionsLoading', 'fetchSuggestedQuestions', 'handleSuggestedQuestionClick',
      'shouldRenderAssistantMessage', 'getUserQuery', 'isFirstEnter', 'scrollToBottom',
      'handleAnswerRenderComplete', 'handleFollowUpSelect', 'loadFollowUpSuggestions',
      'showGlobalTypingIndicator', 'inputFieldRef',
      'sendMsg', 'handleStopGeneration', 'session_id', 'currentAssistantMessageId',
    ],
  },
  {
    baseline: './business-baselines/manual-knowledge-editor.pre-view.vue',
    active: '../components/manual-knowledge-editor.vue',
    viteMapping: "['manual-knowledge-editor.pre-view.vue', resolve(__dirname, 'src/components/manual-knowledge-editor.vue')]",
    bindings: [
      'visible', 'handleClose', 'dialogTitle', 'initialLoaded', 'form', 'kbDisabled', 'kbLoading',
      'kbOptions', 'mode', 'lastUpdatedText', 'toolbarGroups', 'handleToolbarAction', 'saving',
      'toggleEditorView', 'viewToggleIcon', 'viewToggleLabel', 'activeTab', 'contentLoading',
      'textareaComponent', 'previewHTML', 'savingAction', 'handleSave',
    ],
  },
  {
    baseline: './business-baselines/menu.pre-view.vue',
    active: '../components/menu.vue',
    viteMapping: "['menu.pre-view.vue', resolve(__dirname, 'src/components/menu.vue')]",
    bindings: [
      'uiStore', 'toggleSidebar', 'handleMenuClick', 'isMenuItemActive', 'commandPaletteStore',
      'chatResources', 'showSessionSourceFilter', 'batchMode', 'sessionScopeFilterPinned',
      'sessionSourceOptions', 'activeSessionBucketKey', 'switchSessionBucket', 'scrollContainer',
      'handleScroll', 'sessionListBooting', 'hasAnySession', 'activeBucket', 'filteredGroupedSessions',
      'buildSessionMenuOptions', 'gotopage', 'toggleBatchSelect', 'handleSessionMenuClick',
      'renameSessionTitle', 'batchSelectedIds', 'isAllBatchSelected', 'isBatchIndeterminate',
      'batchDeleting', 'toggleBatchSelectAll', 'handleInlineBatchDelete', 'exitBatchMode',
    ],
  },
]

test('vue-tsc never type-checks archived full SFC baselines as live application views', () => {
  const tsconfig = read('../../tsconfig.app.json')
  assert.ok(tsconfig.includes('"src/assets/business-baselines/**"'))
  assert.ok(tsconfig.includes('"@/assets/business-baselines/*": ["./src/types/business-controller-shim.d.ts"]'))
})

test('Vite compiles every frozen controller from its original source directory', () => {
  const vite = read('../../vite.config.ts')
  assert.ok(vite.includes("const virtualId = `${originalSource}${virtualSuffix}`"))
  assert.ok(vite.includes("parse(source, { filename: originalFilename })"))
  for (const item of controllers) assert.ok(vite.includes(item.viteMapping), `missing Vite mapping: ${item.viteMapping}`)
})

test('rebuilt adapter templates only consume load-bearing bindings that exist in frozen business controllers', () => {
  for (const item of controllers) {
    const baseline = read(item.baseline)
    const active = read(item.active)
    for (const binding of item.bindings) {
      assert.ok(active.includes(binding), `${item.active} no longer uses expected binding ${binding}`)
      assert.ok(baseline.includes(binding), `${item.baseline} does not define preserved binding ${binding}`)
    }
  }
})
