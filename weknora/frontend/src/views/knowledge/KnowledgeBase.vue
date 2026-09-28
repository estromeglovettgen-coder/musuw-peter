<script lang="ts">
import { computed, defineComponent, onMounted, onUnmounted, ref, type SetupContext } from 'vue'
import { useI18n } from 'vue-i18n'
import LegacyKnowledgeBaseBusiness from '@/assets/business-baselines/KnowledgeBase.pre-view.vue'
import type { ConsumerEntitlement } from '@/api/entitlement'
import { listKnowledgeFolders, type KnowledgeFolderTree } from '@/api/knowledge-base'
import { useConsumerUpgradePrompt } from '@/hooks/useConsumerUpgradePrompt'
import { useAuthStore } from '@/stores/auth'
import { useCurrentEntitlementStore } from '@/stores/entitlement'
import {
  exceedsConsumerDocumentLimit,
  exceedsConsumerStorageQuota,
} from '@/utils/consumerUploadLimits'
import DocContent from '@/components/doc-content.vue'
import EmptyKnowledge from '@/components/empty-knowledge.vue'
import ContextualGuide from '@/components/ContextualGuide.vue'
import KBSwitcherDropdown from '@/components/KBSwitcherDropdown.vue'
import KnowledgeBaseEditorModal from './KnowledgeBaseEditorModal.vue'
import FAQEntryManager from './components/FAQEntryManager.vue'
import DocumentListView from './components/DocumentListView.vue'
import DocumentCardView from './components/DocumentCardView.vue'
import DocumentBatchBar from './components/DocumentBatchBar.vue'
import KbUploadSourceDropdown from './components/KbUploadSourceDropdown.vue'
import KbFolderTree from './components/KbFolderTree.vue'
import KnowledgeUploadProgress from './components/KnowledgeUploadProgress.vue'
import TagEditDialog from './components/TagEditDialog.vue'
import BatchTagDialog from './components/BatchTagDialog.vue'
import KbTagManageDrawer from './components/KbTagManageDrawer.vue'
import WikiBrowser from './wiki/WikiBrowser.vue'

const legacy = LegacyKnowledgeBaseBusiness as any
const legacySetup = legacy.setup
const KNOWLEDGE_FILE_DROP_EVENT = 'weknora:knowledge-file-drop'
const KNOWLEDGE_FILE_UPLOADED_EVENT = 'knowledgeFileUploaded'

const readStateValue = <T,>(value: T | { value: T }): T => {
  if (value && typeof value === 'object' && 'value' in value) return value.value
  return value as T
}

export default defineComponent({
  ...legacy,
  name: 'KnowledgeBase',
  components: {
    ...(legacy.components || {}),
    DocContent, EmptyKnowledge, ContextualGuide, KBSwitcherDropdown, KnowledgeBaseEditorModal, FAQEntryManager,
    DocumentListView, DocumentCardView, DocumentBatchBar, KbUploadSourceDropdown, KbFolderTree, KnowledgeUploadProgress,
    TagEditDialog, BatchTagDialog, KbTagManageDrawer, WikiBrowser,
  },
  setup(props: Record<string, unknown>, context: SetupContext) {
    const state = legacySetup?.(props, context)
    const authStore = useAuthStore()
    const entitlementStore = useCurrentEntitlementStore()
    const { t } = useI18n()
    const showConsumerUpgradePrompt = useConsumerUpgradePrompt()
    const fileTypeFilterPanelVisible = ref(false)
    const parseStatusFilterPanelVisible = ref(false)
    const fileTypeFilterHover = ref(false)
    const parseStatusFilterHover = ref(false)

    const getFilterOptionLabel = (options: unknown, value: string): string => {
      const list = Array.isArray(options) ? options : (options as { value?: unknown } | null)?.value
      if (!Array.isArray(list)) return ''
      return list.find((option: any) => option?.value === value)?.label || list[0]?.label || ''
    }

    const selectFileType = (value: string): void => {
      if (state?.selectedFileType && typeof state.selectedFileType === 'object') {
        state.selectedFileType.value = value
      }
      fileTypeFilterPanelVisible.value = false
    }

    const selectParseStatus = (value: string): void => {
      if (state?.selectedParseStatus && typeof state.selectedParseStatus === 'object') {
        state.selectedParseStatus.value = value
      }
      parseStatusFilterPanelVisible.value = false
    }

    if (state && typeof state === 'object' && typeof state.then !== 'function') {
      // Phone disclosure state is local to this view; desktop preferences keep
      // using the existing controller, including after a viewport change.
      const mobileViewport = window.matchMedia('(max-width: 760px)')
      const isMobile = ref(mobileViewport.matches)
      const mobileFolderCollapsed = ref(true)
      const syncViewport = () => { isMobile.value = mobileViewport.matches }
      onMounted(() => mobileViewport.addEventListener('change', syncViewport))
      onUnmounted(() => mobileViewport.removeEventListener('change', syncViewport))
      const folderTreeCollapsed = computed(() => isMobile.value
        ? mobileFolderCollapsed.value : readStateValue<boolean>(state.folderTreeCollapsed))
      const handleFolderTreeCollapsedChange = (value: boolean) => {
        if (isMobile.value) mobileFolderCollapsed.value = value
        else state.handleFolderTreeCollapsedChange(value)
      }
      const legacyHandleUploadSourceFiles = (state as any).handleUploadSourceFiles as ((files: File[]) => void) | undefined
      const legacyHandleManualCreate = (state as any).handleManualCreate as (() => void) | undefined

      const currentDocumentCount = async (kbId: string): Promise<number | null> => {
        const cached = readStateValue<KnowledgeFolderTree | null>((state as any).folderTree)
        if (Number.isFinite(Number(cached?.total_document_count))) {
          return Number(cached?.total_document_count)
        }
        try {
          const response: any = await listKnowledgeFolders(kbId)
          const count = response?.data?.total_document_count ?? response?.total_document_count
          return Number.isFinite(Number(count)) ? Number(count) : null
        } catch {
          return null
        }
      }

      const resolveEntitlement = async (): Promise<ConsumerEntitlement | null> => {
        if (!authStore.isLiteMode) return null
        await entitlementStore.ensureFresh()
        return entitlementStore.entitlement
      }

      const canAddDocuments = async (files: File[], incomingDocuments: number): Promise<boolean> => {
        const entitlement = await resolveEntitlement()
        if (!entitlement) return true
        if (files.length > 0 && exceedsConsumerStorageQuota(entitlement, files)) {
          showConsumerUpgradePrompt(String(t('entitlement.storageQuotaUpgradeBody')))
          return false
        }
        const kbId = String(readStateValue<unknown>((state as any).kbId) || '')
        if (!kbId || entitlement.max_documents_per_kb <= 0) return true
        const count = await currentDocumentCount(kbId)
        if (exceedsConsumerDocumentLimit(entitlement, count, incomingDocuments)) {
          showConsumerUpgradePrompt(String(t('entitlement.freeDocumentLimit')))
          return false
        }
        return true
      }

      const handleUploadSourceFiles = async (files: File[]) => {
        if (files.length === 0 || !(await canAddDocuments(files, files.length))) return
        legacyHandleUploadSourceFiles?.(files)
      }

      const handleManualCreate = async () => {
        if (!(await canAddDocuments([], 1))) return
        legacyHandleManualCreate?.()
      }

      const handleKnowledgeFileDrop = (event: Event) => {
        const detail = (event as CustomEvent).detail
        const kbId = String(readStateValue<unknown>((state as any).kbId) || '')
        const isFAQ = Boolean(readStateValue<boolean>((state as any).isFAQ))
        const files = Array.isArray(detail?.files) ? detail.files as File[] : []
        if (!kbId || detail?.kbId !== kbId || isFAQ || files.length === 0) return
        event.stopImmediatePropagation()
        void handleUploadSourceFiles(files)
      }

      const handleKnowledgeFileUploaded = (event: Event) => {
        const detail = (event as CustomEvent).detail
        const kbId = String(readStateValue<unknown>((state as any).kbId) || '')
        if (!kbId || detail?.kbId !== kbId) return
        void entitlementStore.refresh()
      }

      onMounted(() => window.addEventListener(KNOWLEDGE_FILE_DROP_EVENT, handleKnowledgeFileDrop, true))
      onUnmounted(() => window.removeEventListener(KNOWLEDGE_FILE_DROP_EVENT, handleKnowledgeFileDrop, true))
      onMounted(() => window.addEventListener(KNOWLEDGE_FILE_UPLOADED_EVENT, handleKnowledgeFileUploaded))
      onUnmounted(() => window.removeEventListener(KNOWLEDGE_FILE_UPLOADED_EVENT, handleKnowledgeFileUploaded))

      return {
        ...state,
        folderTreeCollapsed,
        handleFolderTreeCollapsedChange,
        handleUploadSourceFiles,
        handleManualCreate,
        fileTypeFilterPanelVisible,
        parseStatusFilterPanelVisible,
        fileTypeFilterHover,
        parseStatusFilterHover,
        getFilterOptionLabel,
        selectFileType,
        selectParseStatus,
      }
    }
    return state
  },
})
</script>

<template>
  <template v-if="!isFAQ">
    <main class="visual-knowledge-page" :class="{ 'is-graph-tab': activeKbTab === 'graph' }">
      <header class="visual-knowledge-header">
        <div class="visual-knowledge-header__copy">
          <nav class="visual-knowledge-breadcrumb" :aria-label="$t('menu.knowledgeBase')">
            <button type="button" class="visual-knowledge-breadcrumb__back" @click="handleNavigateToKbList">
              <t-icon name="chevron-left" /><span>{{ $t('menu.knowledgeBase') }}</span>
            </button>
            <span class="visual-knowledge-breadcrumb__sep">/</span>
            <KBSwitcherDropdown v-if="knowledgeList.length" :kb-list="knowledgeList" :current-kb-id="kbId" @select="(id: string) => handleKnowledgeDropdownSelect({ value: id })">
              <button type="button" class="visual-knowledge-breadcrumb__current" :disabled="!kbId">
                <template v-if="!kbInfo"><t-skeleton animation="gradient" :row-col="[{ width: '112px', height: '16px' }]" /></template>
                <template v-else><span>{{ kbInfo.name }}</span><t-icon name="chevron-down" /></template>
              </button>
            </KBSwitcherDropdown>
            <button v-else type="button" class="visual-knowledge-breadcrumb__current" :disabled="!kbId" @click="handleNavigateToCurrentKB">
              <template v-if="!kbInfo"><t-skeleton animation="gradient" :row-col="[{ width: '112px', height: '16px' }]" /></template>
              <template v-else>{{ kbInfo.name }}</template>
            </button>
            <span class="visual-knowledge-breadcrumb__sep">/</span>
            <span class="visual-knowledge-breadcrumb__section">{{ activeKbTab === 'documents' ? $t('knowledgeEditor.wikiBrowser.tabDocuments') : activeKbTab === 'wiki' ? 'Wiki' : $t('knowledgeEditor.wikiBrowser.tabGraph') }}</span>
          </nav>
          <p class="visual-knowledge-header__subtitle">{{ kbInfo?.description || $t('knowledgeEditor.document.subtitle') }}</p>
        </div>

        <div class="visual-knowledge-header__actions">
          <div v-if="isWiki" class="visual-knowledge-tabs" role="tablist">
            <button type="button" :class="{ 'is-active': activeKbTab === 'documents' }" role="tab" :aria-selected="activeKbTab === 'documents'" @click="activeKbTab = 'documents'">
              <t-icon name="file" /><span>{{ $t('knowledgeEditor.wikiBrowser.tabDocuments') }}<template v-if="typeof total === 'number'"> ({{ total }})</template></span>
            </button>
            <button type="button" :class="{ 'is-active': activeKbTab === 'wiki' }" role="tab" :aria-selected="activeKbTab === 'wiki'" @click="activeKbTab = 'wiki'">
              <t-icon name="book" /><span>Wiki</span><t-tooltip v-if="wikiIsIndexing" :content="wikiIndexingTip" placement="bottom"><t-loading size="small" /></t-tooltip>
            </button>
            <t-tooltip :content="$t('knowledgeEditor.wikiBrowser.tabGraphTip')" placement="bottom">
              <button type="button" :class="{ 'is-active': activeKbTab === 'graph' }" role="tab" :aria-selected="activeKbTab === 'graph'" @click="activeKbTab = 'graph'">
                <t-icon name="chart-bubble" /><span>{{ $t('knowledgeEditor.wikiBrowser.tabGraph') }}</span><t-tooltip v-if="wikiIsIndexing" :content="wikiIndexingTip" placement="bottom"><t-loading size="small" /></t-tooltip>
              </button>
            </t-tooltip>
          </div>
          <span v-else class="visual-knowledge-header__plain-tab">{{ $t('knowledgeEditor.document.title') }}</span>
        </div>
      </header>

      <div v-if="unsupportedFileTypes.length || missingStorageEngine" class="visual-knowledge-alerts">
        <button v-if="unsupportedFileTypes.length" type="button" :disabled="authStore.isLiteMode" @click="goToParserSettings"><t-icon name="info-circle" /><span>{{ $t('knowledgeBase.unsupportedTypesHint', { types: unsupportedFileTypes.map((t: string) => '.' + t).join('、') }) }}</span><strong v-if="!authStore.isLiteMode">{{ $t('knowledgeBase.goToParserSettings') }} →</strong></button>
        <button v-if="missingStorageEngine" type="button" :disabled="authStore.isLiteMode" @click="handleOpenKBSettings"><t-icon name="info-circle" /><span>{{ $t('knowledgeBase.missingStorageEngine') }}</span><strong v-if="!authStore.isLiteMode">{{ $t('knowledgeBase.goToStorageSettings') }} →</strong></button>
      </div>

      <section v-if="isWiki && (activeKbTab === 'wiki' || activeKbTab === 'graph')" class="visual-knowledge-wiki-host">
        <WikiBrowser v-if="kbId" :knowledge-base-id="kbId" :view="activeKbTab === 'graph' ? 'graph' : 'browser'" :can-edit="canEdit" @open-source-doc="openSourceDoc" @status-change="onWikiStatusChange" @view-graph="onViewWikiInGraph" />
      </section>

      <section v-if="activeKbTab === 'documents' || !isWiki" class="visual-knowledge-documents">
        <KbFolderTree v-if="showFolderTree" class="visual-knowledge-documents__tree" :kb-id="kbId" :tree="folderTree" :selected-path="selectedFolderPath" :loading="folderTreeLoading" :collapsed="folderTreeCollapsed" :can-edit="canEdit" :can-delete="canMutateKnowledge" @open-document="openKnowledgeItem" @delete-folder="handleFolderDelete" @select="handleFolderSelect" @update:collapsed="handleFolderTreeCollapsedChange" @rename="handleFolderRename" />

        <div class="visual-knowledge-content">
          <div class="visual-knowledge-toolbar">
            <div class="visual-knowledge-toolbar__left">
              <div class="visual-knowledge-path-pill" :aria-label="$t('knowledgeBase.folderTree.rootRow')">
                <t-icon name="folder" />
                <button type="button" class="visual-knowledge-path-pill__segment is-root" @click="handleFolderSelect('')">{{ $t('knowledgeBase.folderTree.rootRow') }}</button>
                <template v-for="(crumb, index) in folderBreadcrumbs" :key="crumb.path">
                  <t-icon name="chevron-right" />
                  <button
                    v-if="Number(index) < folderBreadcrumbs.length - 1"
                    type="button"
                    class="visual-knowledge-path-pill__segment"
                    @click="handleFolderSelect(crumb.path)"
                  >
                    {{ crumb.name }}
                  </button>
                  <span v-else class="visual-knowledge-path-pill__segment is-current">{{ crumb.name }}</span>
                </template>
              </div>

              <t-input v-model.trim="docSearchKeyword" :placeholder="$t('knowledgeBase.docSearchPlaceholder')" clearable class="visual-knowledge-search" @clear="loadKnowledgeFiles(kbId)" @enter="loadKnowledgeFiles(kbId)">
                <template #prefix-icon><t-icon name="search" /></template>
              </t-input>

              <div class="visual-knowledge-filters">
                <t-popup v-model:visible="tagFilterPanelVisible" trigger="click" placement="bottom-left" overlay-class-name="visual-tag-filter-popup" :overlay-inner-style="{ padding: 0 }">
                  <template #content>
                    <section class="visual-tag-filter" @click.stop>
                      <header><strong>{{ $t('knowledgeBase.tagFilterTitle') }}</strong><span>{{ sidebarCategoryCount }}</span></header>
                      <t-input v-model.trim="tagSearchQuery" size="small" :placeholder="$t('knowledgeBase.tagSearchPlaceholder')" clearable><template #prefix-icon><t-icon name="search" /></template></t-input>
                      <div class="visual-tag-filter__body">
                        <template v-if="tagLoading && !sidebarTags.length"><t-skeleton v-for="n in 6" :key="n" animation="gradient" :row-col="[{ width: '72px', height: '26px', type: 'rect' }]" /></template>
                        <template v-else>
                          <button v-for="tag in sidebarTags" :key="tag.id" type="button" class="visual-tag-filter__chip" :class="{ 'is-active': isTagFilterActive(tag.id) }" @click="handleTagRowClick(tag.id)"><span>{{ tag.name }}</span><small>{{ tag.knowledge_count || 0 }}</small></button>
                          <p v-if="!sidebarTags.length">{{ $t('knowledgeBase.tagEmptyResult') }}</p>
                        </template>
                      </div>
                      <footer v-if="tagHasMore || canEdit"><button v-if="tagHasMore" type="button" :disabled="tagLoadingMore" @click.stop="kbId && loadTags(kbId)"><t-loading v-if="tagLoadingMore" size="small" /><span>{{ $t('tenant.loadMore') }}</span></button><button v-if="canEdit" type="button" @click="openTagManageDrawer">{{ $t('knowledgeBase.tagManageLink') }}</button></footer>
                    </section>
                  </template>
                  <button type="button" class="visual-knowledge-filter-button" :class="{ 'is-active': !isTagFilterPlaceholder }" :title="activeTagFilterTitle" @mouseenter="tagFilterTriggerHover = true" @mouseleave="tagFilterTriggerHover = false">
                    <t-icon name="tag" /><span>{{ activeTagFilterLabel }}</span><span v-if="showTagFilterClear" class="visual-knowledge-filter-button__clear" role="button" tabindex="0" @click.stop="clearTagFilter" @keydown.enter.stop.prevent="clearTagFilter"><t-icon name="close" /></span><t-icon v-else name="chevron-down" />
                  </button>
                </t-popup>

                <t-popup
                  v-model:visible="fileTypeFilterPanelVisible"
                  trigger="click"
                  placement="bottom-left"
                  overlay-class-name="visual-tag-filter-popup"
                  :overlay-inner-style="{ padding: 0 }"
                >
                  <template #content>
                    <section class="visual-tag-filter visual-knowledge-filter-options" role="listbox" @click.stop>
                      <button
                        v-for="option in fileTypeOptions"
                        :key="option.value"
                        type="button"
                        class="visual-tag-filter__chip visual-knowledge-filter-option"
                        :class="{ 'is-active': option.value === selectedFileType }"
                        role="option"
                        :aria-selected="option.value === selectedFileType"
                        @click="selectFileType(option.value)"
                      >
                        <span>{{ option.label }}</span><t-icon v-if="option.value === selectedFileType" name="check" />
                      </button>
                    </section>
                  </template>
                  <button
                    type="button"
                    class="visual-knowledge-filter-button"
                    :class="{ 'is-active': Boolean(selectedFileType) }"
                    :aria-expanded="fileTypeFilterPanelVisible"
                    aria-haspopup="listbox"
                    @mouseenter="fileTypeFilterHover = true"
                    @mouseleave="fileTypeFilterHover = false"
                  >
                    <t-icon name="file-1" /><span>{{ getFilterOptionLabel(fileTypeOptions, selectedFileType) }}</span>
                    <span v-if="selectedFileType && fileTypeFilterHover" class="visual-knowledge-filter-button__clear" role="button" tabindex="0" :aria-label="$t('common.clear')" @click.stop="selectFileType('')" @keydown.enter.stop.prevent="selectFileType('')" @keydown.space.stop.prevent="selectFileType('')"><t-icon name="close" /></span>
                    <t-icon v-else name="chevron-down" />
                  </button>
                </t-popup>

                <t-popup
                  v-model:visible="parseStatusFilterPanelVisible"
                  trigger="click"
                  placement="bottom-left"
                  overlay-class-name="visual-tag-filter-popup"
                  :overlay-inner-style="{ padding: 0 }"
                >
                  <template #content>
                    <section class="visual-tag-filter visual-knowledge-filter-options" role="listbox" @click.stop>
                      <button
                        v-for="option in parseStatusOptions"
                        :key="option.value"
                        type="button"
                        class="visual-tag-filter__chip visual-knowledge-filter-option"
                        :class="{ 'is-active': option.value === selectedParseStatus }"
                        role="option"
                        :aria-selected="option.value === selectedParseStatus"
                        @click="selectParseStatus(option.value)"
                      >
                        <span>{{ option.label }}</span><t-icon v-if="option.value === selectedParseStatus" name="check" />
                      </button>
                    </section>
                  </template>
                  <button
                    type="button"
                    class="visual-knowledge-filter-button"
                    :class="{ 'is-active': Boolean(selectedParseStatus) }"
                    :aria-expanded="parseStatusFilterPanelVisible"
                    aria-haspopup="listbox"
                    @mouseenter="parseStatusFilterHover = true"
                    @mouseleave="parseStatusFilterHover = false"
                  >
                    <t-icon name="check-circle" /><span>{{ getFilterOptionLabel(parseStatusOptions, selectedParseStatus) }}</span>
                    <span v-if="selectedParseStatus && parseStatusFilterHover" class="visual-knowledge-filter-button__clear" role="button" tabindex="0" :aria-label="$t('common.clear')" @click.stop="selectParseStatus('')" @keydown.enter.stop.prevent="selectParseStatus('')" @keydown.space.stop.prevent="selectParseStatus('')"><t-icon name="close" /></span>
                    <t-icon v-else name="chevron-down" />
                  </button>
                </t-popup>
              </div>
            </div>

            <div class="visual-knowledge-toolbar__right">
              <span v-if="docListLoading" class="visual-knowledge-loading" role="status" aria-live="polite">{{ $t('common.loading') }}</span>
              <div class="visual-knowledge-view-toggle" role="group" :aria-label="$t('knowledgeBase.viewModeToggle')">
                <button type="button" :class="{ 'is-active': viewMode === 'grid' }" :aria-pressed="viewMode === 'grid'" @click="viewMode = 'grid'"><t-icon name="view-module" /></button>
                <button type="button" :class="{ 'is-active': viewMode === 'list' }" :aria-pressed="viewMode === 'list'" @click="viewMode = 'list'"><t-icon name="view-list" /></button>
              </div>
              <KbUploadSourceDropdown v-if="canEdit" ref="uploadSourceRef" :accept-file-types="acceptFileTypes" :supported-file-types="[...supportedFileTypes]" include-manual trigger-icon="add" data-guide="kb-detail-add-doc" :tooltip="t('knowledgeBase.addDocument')" placement="bottom-right" @files="handleUploadSourceFiles" @url="handleUploadSourceUrl" @manual="handleManualCreate" />
            </div>
          </div>

          <KnowledgeUploadProgress :tasks="currentUploadTasks" @dismiss="dismissUploadResults" />

          <div v-if="knowledgeListError" class="visual-knowledge-load-error" role="alert">
            <span>{{ knowledgeListError }}</span>
            <t-button size="small" variant="outline" @click="resetPage(); loadKnowledgeFiles(kbId)">{{ $t('common.retry') }}</t-button>
          </div>

          <div ref="knowledgeScroll" class="visual-knowledge-scroll" :inert="isFolderNavigationPending" :aria-busy="docListLoading" :class="{ 'is-empty': !cardList.length && !currentChildFolders.length && !docListLoading, 'is-marquee-active': docMarqueeVisible }" @scroll="handleScroll" @mousedown="onDocMarqueeMouseDown">
            <div v-if="docMarqueeVisible" class="visual-knowledge-marquee" :class="{ 'is-add': docMarqueeMode === 'add', 'is-subtract': docMarqueeMode === 'subtract' }" :style="docMarqueeBoxStyle" aria-hidden="true" />
            <div v-if="docListLoading && cardList.length === 0 && !currentChildFolders.length" class="visual-knowledge-skeleton-grid" aria-hidden="true">
              <div v-for="n in 8" :key="n" class="visual-knowledge-skeleton-card"><t-skeleton animation="gradient" :row-col="[{ width: '68%', height: '15px' },{ width: '100%', height: '12px' },{ width: '52%', height: '12px' }]" /></div>
            </div>

            <DocumentCardView v-else-if="(cardList.length || currentChildFolders.length) && viewMode === 'grid'" :items="cardList" :folders="currentChildFolders" :folder-options="folderOptions" :selected-ids="selectedIds" :batch-mode="batchMode" :can-edit="canEdit" :can-download="canDownloadKnowledge" :can-mutate-knowledge="canMutateKnowledge" :trace-available-by-id="traceAvailableById" :tag-list="tagList" :move-menu-mode="moveMenuMode" :move-target-kbs="moveTargetKbs" :move-targets-loading="moveTargetsLoading" :move-selected-target-name="moveSelectedTargetName" :move-mode="moveMode" :move-submitting="moveSubmitting" :show-folder-path="showDocumentFolderPath" @open="(item: any) => openKnowledgeItem(item)" @open-folder="handleFolderSelect" @delete-folder="handleFolderDelete" @move-to-folder="(item: any, path: string) => moveKnowledgeIntoFolder([item.id], path)" @toggle-checkbox="onCardGridCheckboxChange" @menu-visible-change="(visible: boolean, item: any) => onCardMoreVisibleChange(visible, item)" @action="(action: string, item: any) => handleCardAction(action, item)" @tag-edit="(item: any) => openTagEditDialog(item)" @move-select-target="(kb: any) => handleMoveSelectTarget(kb)" @move-back="handleMoveBack" @move-confirm="handleMoveConfirm" @update:move-mode="(mode: any) => moveMode = mode" />

            <DocumentListView v-else-if="(cardList.length || currentChildFolders.length) && viewMode === 'list'" :items="cardList" :folders="currentChildFolders" :folder-options="folderOptions" :selected-ids="selectedIds" :tag-list="tagList" :can-edit="canEdit" :can-download="canDownloadKnowledge" :can-mutate-knowledge="canMutateKnowledge" :trace-visible-ids="traceAvailableById" :move-menu-mode="moveMenuMode" :move-target-kbs="moveTargetKbs" :move-targets-loading="moveTargetsLoading" :move-selected-target-name="moveSelectedTargetName" :move-mode="moveMode" :move-submitting="moveSubmitting" :show-folder-path="showDocumentFolderPath" @open-folder="handleFolderSelect" @delete-folder="handleFolderDelete" @move-to-folder="(item: any, path: string) => moveKnowledgeIntoFolder([item.id], path)" @open="(item: any) => openKnowledgeItem(item)" @toggle-row="toggleSelectRow" @toggle-all="toggleSelectAll" @action="(action: string, item: any) => handleListAction(action, item)" @probe-trace="(item: any) => probeTraceAvailable(item)" @tag-edit="(item: any) => openTagEditDialog(item)" @move-select-target="(kb: any) => handleMoveSelectTarget(kb)" @move-back="handleMoveBack" @move-confirm="handleMoveConfirm" @update:move-mode="(mode: any) => moveMode = mode" @reset-move-state="moveMenuMode = 'normal'" />

            <div v-else-if="!docListLoading && !knowledgeListError" class="visual-knowledge-empty"><p v-if="selectedFolderPath || isFiltering">{{ isFiltering ? $t('knowledgeBase.folderTree.emptySearch') : $t('knowledgeBase.folderTree.emptyFolder') }}</p><EmptyKnowledge v-else @upload="uploadSourceRef?.openFileDialog()" /></div>
          </div>

          <div v-show="batchMode || selectedIds.size > 0" class="visual-knowledge-batch-anchor"><DocumentBatchBar :count="selectedIds.size" :delete-loading="batchDeleting" :reparse-loading="batchReparsing" :tag-loading="batchTagging" :cancel-parse-loading="batchCancelling" :cancel-parse-count="selectedParsingIds.length" :visible="batchMode || selectedIds.size > 0" :show-move-to-folder="canEdit" :folder-options="folderOptions" @cancel="handleBatchCancel" @delete="confirmBatchDelete" @reparse="confirmBatchReparse" @cancel-parse="confirmBatchCancelParse" @batch-tag="handleBatchTag" @move-to-folder="(path: string) => moveKnowledgeIntoFolder(Array.from(selectedIds), path)" /></div>
        </div>
      </section>

      <DocContent ref="docContentRef" :visible="isCardDetails" :details="details" :canEditKB="canEdit" :canDownloadKB="canDownloadKnowledge" :kbId="kbId" @closeDoc="closeDoc" @getDoc="getDoc" @retryDoc="getCardDetails()" @summaryStateChange="syncDocumentSummaryState" />
    </main>
  </template>

  <section v-else-if="!authStore.isLiteMode" class="visual-faq-manager"><FAQEntryManager v-if="kbId" :kb-id="kbId" /></section>
  <KnowledgeBaseEditorModal :visible="uiStore.showKBEditorModal" :mode="uiStore.kbEditorMode" :kb-id="uiStore.currentKBId || undefined" :initial-type="uiStore.kbEditorType" @update:visible="(val: boolean) => val ? null : uiStore.closeKBEditor()" @success="handleKBEditorSuccess" />
  <TagEditDialog :visible="tagEditDialogVisible" :knowledge-name="tagEditTarget?.display_name || tagEditTarget?.file_name || tagEditTarget?.title || ''" :kb-id="kbId" :tag-list="tagList" :selected-tags="tagEditTarget?.tags || []" :can-manage="canEdit" @update:visible="tagEditDialogVisible = $event" @confirm="onTagEditConfirm" @tag-created="loadTags(kbId, true)" @open-manage="openTagManageFromEditDialog" />
  <BatchTagDialog :visible="batchTagDialogVisible" :count="selectedIds.size" :kb-id="kbId" :tag-list="tagList" :pre-selected-tag-ids="batchTagPreSelectedIds" :can-manage="canEdit" :confirm-loading="batchTagging" @update:visible="batchTagDialogVisible = $event" @confirm="onBatchTagConfirm" @tag-created="loadTags(kbId, true)" @open-manage="openTagManageFromBatchDialog" />
  <KbTagManageDrawer v-if="!isFAQ" v-model:visible="tagManageDrawerVisible" :kb-id="kbId" :is-faq="isFAQ" @changed="onTagManageChanged" />
  <ContextualGuide
    tour="kbDetail"
    :when="authStore.isLiteMode && !isFAQ && canEdit && activeKbTab === 'documents' && !docListLoading && !knowledgeListError && !cardList.length && !currentChildFolders.length && !selectedFolderPath && !isFiltering"
  />
</template>

<style scoped lang="less">
@import './components/knowledge-base-layout.less';
.visual-knowledge-loading { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.visual-knowledge-load-error { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--td-text-color-secondary); }
.visual-knowledge-load-error { flex-shrink: 0; justify-content: space-between; color: var(--td-error-color); }
.visual-knowledge-alerts { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 8px; }
.visual-knowledge-alerts button { min-height: 30px; padding: 6px 10px; border: 1px solid #e5e7eb; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; background: #fff; color: #6b7280; font: inherit; font-size: 11px; cursor: pointer; }
.visual-knowledge-alerts button:disabled { cursor: default; }
.visual-knowledge-alerts strong { color: #374151; }
:global(:root[theme-mode="dark"] .visual-knowledge-alerts button) { border-color: var(--mvc-line); background: var(--mvc-surface-raised); color: var(--mvc-text); }
:global(:root[theme-mode="dark"] .visual-knowledge-alerts strong) { color: var(--mvc-text-strong); }
.visual-knowledge-documents { min-height: 0; flex: 1 1 auto; display: flex; gap: 12px; }
.visual-knowledge-documents__tree { flex: 0 0 auto; }
.visual-knowledge-content { position: relative; min-width: 0; min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: 12px; container: knowledge-content / inline-size; }

.visual-knowledge-toolbar { flex: 0 0 auto; padding: 10px; border: 1px solid rgb(229 231 235 / 90%); border-radius: 16px; display: flex; flex-wrap: nowrap; align-items: center; justify-content: space-between; gap: 10px; overflow-x: auto; scrollbar-width: thin; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
// Keep enough room for usable navigation; narrow screens scroll this whole row.
.visual-knowledge-toolbar__left { min-width: min-content; flex: 1 0 480px; display: flex; flex-wrap: nowrap; align-items: center; gap: 8px; }
.visual-knowledge-toolbar__right { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
.visual-knowledge-path-pill { min-width: 0; max-width: 220px; min-height: 28px; flex: 1 1 120px; padding: 4px 10px; border: 0; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; overflow: hidden; background: rgb(243 244 246 / 90%); color: #374151; font: inherit; font-size: 12px; line-height: 18px; font-weight: 600; }
.visual-knowledge-path-pill > :deep(.t-icon) { flex: 0 0 auto; font-size: 14px; color: #6b7280; }
.visual-knowledge-path-pill__segment { min-width: 0; max-width: 160px; padding: 0; border: 0; border-radius: 5px; overflow: hidden; background: transparent; color: #4b5563; font: inherit; font-size: inherit; line-height: inherit; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
button.visual-knowledge-path-pill__segment { cursor: pointer; }
button.visual-knowledge-path-pill__segment:hover { color: #111827; text-decoration: underline; text-underline-offset: 2px; }
.visual-knowledge-path-pill__segment.is-root { flex: 0 0 auto; color: #111827; font-weight: 700; }
.visual-knowledge-path-pill__segment.is-current { color: #6b7280; cursor: default; }
.visual-knowledge-search { min-width: 90px; max-width: 220px; flex: 1 1 140px; contain: inline-size; }
.visual-knowledge-filters { min-width: 0; flex: 0 0 auto; display: flex; align-items: center; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.visual-knowledge-filters::-webkit-scrollbar { display: none; }
.visual-knowledge-toolbar :deep(.t-input),.visual-knowledge-toolbar :deep(.t-date-range-picker) { min-height: 30px; border: 1px solid #e5e7eb; border-radius: 12px; background: rgb(249 250 251 / 80%); box-shadow: none !important; color: #374151; font-size: 12px; }
.visual-knowledge-toolbar :deep(.t-input:hover),.visual-knowledge-toolbar :deep(.t-input.t-is-focused) { border-color: #9ca3af; background: #fff; }
.visual-knowledge-filter-button { width: auto; min-width: 128px; height: 36px; min-height: 36px; box-sizing: border-box; padding: 8px 14px; border: 1px solid #e5e7eb; border-radius: 12px; display: inline-flex; align-items: center; gap: 8px; background: #fff; color: #374151; font: inherit; font-size: 12px; line-height: 16px; font-weight: 500; cursor: pointer; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-knowledge-filter-button:hover { border-color: #d1d5db; background: #fff; }
.visual-knowledge-filter-button:focus-visible { outline: none; border-color: #d1d5db; box-shadow: 0 0 0 2px rgb(17 24 39 / 8%); }
.visual-knowledge-filter-button.is-active { border-color: #d1d5db; background: #fff; color: #111827; font-weight: 700; }
.visual-knowledge-filter-button > span:not(.visual-knowledge-filter-button__clear) { min-width: max-content; flex: 0 0 auto; overflow: visible; text-overflow: clip; white-space: nowrap; }
.visual-knowledge-filter-button :deep(.t-icon) { font-size: 14px; color: #9ca3af; }
.visual-knowledge-filter-button__clear { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; }
.visual-knowledge-filter-options { width: 288px; max-width: min(288px, calc(100vw - 32px)); max-height: 256px; box-sizing: border-box; overflow-y: auto; flex-wrap: nowrap; gap: 2px; padding: 6px; }
.visual-knowledge-filter-option { width: 100%; min-height: 36px; padding: 8px 12px; border: 0; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff; color: #4b5563; font: inherit; font-size: 12px; line-height: 16px; text-align: left; cursor: pointer; }
.visual-knowledge-filter-option:hover,.visual-knowledge-filter-option.is-active { background: #f3f4f6; color: #111827; }
.visual-knowledge-filter-option > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-knowledge-filter-option > :deep(.t-icon) { flex: 0 0 auto; font-size: 14px; }
.visual-knowledge-view-toggle { padding: 2px; border: 1px solid #e5e7eb; border-radius: 12px; display: flex; background: #f3f4f6; }
.visual-knowledge-view-toggle button { width: 28px; height: 28px; padding: 6px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-knowledge-view-toggle button:hover { color: #374151; }
.visual-knowledge-view-toggle button.is-active { background: #fff; color: #111827; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-knowledge-view-toggle :deep(.t-icon) { font-size: 14px; }
.visual-knowledge-scroll { position: relative; min-height: 0; flex: 1 1 auto; overflow: auto; }
.visual-knowledge-scroll.is-marquee-active { user-select: none; cursor: crosshair; }
.visual-knowledge-marquee { position: absolute; z-index: 50; border: 1px solid #9ca3af; background: rgb(156 163 175 / 10%); pointer-events: none; }
.visual-knowledge-marquee.is-subtract { border-style: dashed; }
.visual-knowledge-skeleton-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); gap: 16px; }
.visual-knowledge-skeleton-card { min-height: 192px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; }
.visual-knowledge-empty { min-height: 260px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 12px; text-align: center; }
.visual-knowledge-batch-anchor { position: absolute; left: 50%; bottom: 12px; z-index: 100; width: min(760px,calc(100% - 24px)); max-width: calc(100vw - 24px); box-sizing: border-box; transform: translateX(-50%); }
.visual-faq-manager { width: 100%; height: 100%; min-height: 0; overflow: auto; background: #fff; }

.visual-tag-filter { width: 288px; max-width: min(288px, calc(100vw - 32px)); max-height: 256px; box-sizing: border-box; padding: 6px; display: flex; flex-direction: column; gap: 6px; color: #374151; }
.visual-tag-filter > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 4px; }
.visual-tag-filter > header strong { font-size: 11px; font-weight: 700; }
.visual-tag-filter > header span { color: #9ca3af; font-size: 10px; }
.visual-tag-filter :deep(.t-input) { min-height: 36px; border-radius: 12px; font-size: 12px; line-height: 16px; }
.visual-tag-filter__body { min-height: 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; flex-wrap: nowrap; gap: 2px; }
.visual-tag-filter__chip { width: 100%; min-height: 36px; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff; color: #4b5563; font: inherit; font-size: 12px; line-height: 16px; text-align: left; cursor: pointer; }
.visual-tag-filter__chip:hover,.visual-tag-filter__chip.is-active { background: #f3f4f6; color: #111827; }
.visual-tag-filter__chip > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-tag-filter__chip small { flex: 0 0 auto; color: #9ca3af; font-size: 10px; }
.visual-tag-filter__body p { width: 100%; margin: 16px 0; color: #9ca3af; font-size: 11px; text-align: center; }
.visual-tag-filter > footer { padding-top: 6px; border-top: 1px solid #f3f4f6; display: flex; justify-content: space-between; gap: 6px; }
.visual-tag-filter > footer button { min-height: 36px; padding: 8px 12px; border: 0; border-radius: 12px; background: transparent; color: #4b5563; font: inherit; font-size: 12px; line-height: 16px; cursor: pointer; }
.visual-tag-filter > footer button:hover { background: #f3f4f6; }

@media (min-width: 640px) {
  .visual-knowledge-filter-button,
  .visual-knowledge-filter-option,
  .visual-tag-filter__chip,
  .visual-tag-filter > footer button,
  .visual-tag-filter :deep(.t-input) { font-size: 14px; line-height: 20px; }
}
@media (max-width: 760px) { .visual-knowledge-documents { gap: 8px; } }
</style>
<style>
.visual-tag-filter-popup .t-popup__content { padding: 0 !important; overflow: hidden; border: 1px solid #e5e7eb !important; border-radius: 16px !important; background: #fff !important; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%),0 8px 10px -6px rgb(0 0 0 / 10%) !important; }
body .visual-tag-filter-popup .visual-knowledge-filter-options::-webkit-scrollbar { width: 6px; }
body .visual-tag-filter-popup .visual-knowledge-filter-options::-webkit-scrollbar-track { background: transparent; }
body .visual-tag-filter-popup .visual-knowledge-filter-options::-webkit-scrollbar-thumb { border-radius: 10px; background: rgb(0 0 0 / 10%); }
body .visual-tag-filter-popup .visual-knowledge-filter-options::-webkit-scrollbar-thumb:hover { background: rgb(0 0 0 / 20%); }
</style>
