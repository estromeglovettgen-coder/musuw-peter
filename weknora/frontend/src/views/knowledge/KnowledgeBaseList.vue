<script lang="ts">
import { computed, defineComponent, onUnmounted, ref, type SetupContext } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useI18n } from 'vue-i18n'
import LegacyKnowledgeBaseListBusiness from '@/assets/business-baselines/KnowledgeBaseList.pre-view.vue'
import { duplicateKnowledgeBase, getKnowledgeBaseCopyProgress } from '@/api/knowledge-base'
import { useAuthStore } from '@/stores/auth'
import { useMarketplaceLibrary } from '@/composables/useMarketplaceLibrary'
import KnowledgeBaseEditorModal from './KnowledgeBaseEditorModal.vue'
import ShareKnowledgeBaseDialog from '@/components/ShareKnowledgeBaseDialog.vue'
import KnowledgeBaseListReferenceCard from './components/KnowledgeBaseListReferenceCard.vue'
import ListSpaceSidebar from '@/components/ListSpaceSidebar.vue'
import MarketplaceLibraryCards from '@/views/marketplace/MarketplaceLibraryCards.vue'
import ContextualGuide from '@/components/ContextualGuide.vue'

const legacy = LegacyKnowledgeBaseListBusiness as any
const legacySetup = legacy.setup

export default defineComponent({
  ...legacy,
  name: 'KnowledgeBaseList',
  components: {
    ...(legacy.components || {}),
    KnowledgeBaseEditorModal,
    ShareKnowledgeBaseDialog,
    KnowledgeBaseListReferenceCard,
    ListSpaceSidebar,
    ContextualGuide,
    MarketplaceLibraryCards,
  },
  setup(props: Record<string, unknown>, context: SetupContext) {
    const authStore = useAuthStore()
    const libraryFilter = ref<'all' | 'mine' | 'subscribed'>('all')
    const { entries: marketLibraryEntries, loading: marketLibraryLoading, failed: marketLibraryFailed, load: loadMarketLibrary } = useMarketplaceLibrary()
    const marketLibraryCount = computed(() => marketLibraryLoading.value ? -1 : marketLibraryEntries.value.length)
    const state = legacySetup?.(props, context)
    if (state && typeof state === 'object' && typeof state.then !== 'function') {
      const legacyState = state as Record<string, any>
      const readRef = (source: any) =>
        source && typeof source === 'object' && 'value' in source ? source.value : source

      // The business baseline remains byte-for-byte intact. Lite presentation
      // is narrowed here so stale Standard shared data cannot render in the
      // consumer list, while Standard keeps the original state unchanged.
      const baseSharedKbs = legacyState.sharedKbs
      const baseAllKnowledgeBases = legacyState.allKnowledgeBases
      const baseSpaceSelectionOrgId = legacyState.spaceSelectionOrgId
      const baseShowShareGroupHeaders = legacyState.showShareGroupHeaders
      const baseFilteredKnowledgeBases = legacyState.filteredKnowledgeBases
      const mineLibraryCount = computed(() =>
        (readRef(legacyState.sortedMineKbs) || []).filter((kb: any) => kb.type !== 'faq').length,
      )

      legacyState.sharedKbs = computed(() =>
        authStore.isLiteMode ? [] : readRef(baseSharedKbs),
      )
      legacyState.allKnowledgeBases = computed(() =>
        authStore.isLiteMode
          ? (readRef(legacyState.kbs) || []).length
          : readRef(baseAllKnowledgeBases) + Math.max(0, marketLibraryCount.value),
      )
      legacyState.spaceSelectionOrgId = computed(() =>
        authStore.isLiteMode ? false : readRef(baseSpaceSelectionOrgId),
      )
      legacyState.showShareGroupHeaders = computed(() =>
        authStore.isLiteMode ? false : readRef(baseShowShareGroupHeaders),
      )
      legacyState.filteredKnowledgeBases = computed(() => {
        const list = readRef(baseFilteredKnowledgeBases) || []
        if (!authStore.isLiteMode) return list
        return list.filter((kb: any) => kb?.isMine !== false)
      })

      const { t } = useI18n()
      let disposed = false

      onUnmounted(() => {
        disposed = true
      })

      const pollCopy = async (taskId: string, targetId?: string) => {
        while (!disposed) {
          try {
            const response: any = await getKnowledgeBaseCopyProgress(taskId)
            if (disposed) return
            const progress = response?.data
            if (progress?.status === 'completed') {
              MessagePlugin.success(t('knowledgeList.messages.duplicateSuccess'))
              await state.fetchList(true).catch(() => undefined)
              if (targetId) state.triggerHighlightFlash(targetId)
              return
            }
            if (progress?.status === 'failed') {
              MessagePlugin.error(progress.error || progress.message || t('knowledgeList.messages.duplicateFailed'))
              return
            }
          } catch {
            // The copy task remains authoritative; retry transient progress reads.
          }
          await new Promise(resolve => setTimeout(resolve, 2000))
        }
      }

      const copyById = async (id: string) => {
        try {
          const response: any = await duplicateKnowledgeBase(id)
          if (!response?.success) {
            MessagePlugin.error(response?.message || t('knowledgeList.messages.duplicateFailed'))
            return
          }
          const targetId = response.data?.target_id || response.data?.knowledge_base?.id
          const taskId = response.data?.task_id
          if (!taskId) {
            MessagePlugin.error(t('knowledgeList.messages.duplicateFailed'))
            return
          }
          MessagePlugin.info(t('knowledgeList.messages.duplicateStarted'))
          await state.fetchList(true).catch(() => undefined)
          if (targetId) state.triggerHighlightFlash(targetId)
          void pollCopy(taskId, targetId)
        } catch (error: any) {
          MessagePlugin.error(error?.message || t('knowledgeList.messages.duplicateFailed'))
        }
      }

      state.handleDuplicate = async (kb: { id: string; showMore?: boolean }) => {
        kb.showMore = false
        await copyById(kb.id)
      }
      state.handleDuplicateById = copyById
      return { ...state, libraryFilter, mineLibraryCount, marketLibraryCount, marketLibraryEntries, marketLibraryLoading, marketLibraryFailed, loadMarketLibrary }
    }
    return state
  },
})
</script>

<template>
  <div class="visual-kb-workspace">
    <ListSpaceSidebar
      v-if="!authStore.isLiteMode"
      v-model="spaceSelection"
      :count-all="allKnowledgeBases"
      :count-mine="kbs.length"
      :count-by-org="effectiveSharedCountByOrg"
      :count-favorites="kbFavoritesCount"
      :count-recents="kbRecentsCount"
      collapsed-key="visual-kb-list-scope"
    />

    <main class="visual-kb-list">
      <header class="visual-kb-list__header" style="--wails-draggable: drag">
        <div class="visual-kb-list__heading">
          <div class="visual-kb-list__title-row"><t-icon name="folder" /><h1>{{ $t('knowledgeBase.title') }}</h1></div>
          <p>{{ $t(authStore.isLiteMode ? 'knowledgeList.liteSubtitle' : 'knowledgeList.subtitle') }}</p>
        </div>
        <button v-if="authStore.hasRole('contributor')" type="button" class="visual-kb-list__create" data-guide="kb-list-create" @click="handleCreateKnowledgeBase"><t-icon name="folder-add" size="16px" aria-hidden="true" /><span>{{ $t('knowledgeList.create') }}</span></button>
      </header>

      <div v-if="authStore.isLiteMode" class="visual-knowledge-tabs" role="tablist" :aria-label="$t('creatorMarketplace.libraryFilterLabel')">
        <button type="button" role="tab" :class="{ 'is-active': libraryFilter === 'all' }" :aria-selected="libraryFilter === 'all'" @click="libraryFilter = 'all'">{{ $t('creatorMarketplace.libraryFilterAll') }}</button>
        <button type="button" role="tab" :class="{ 'is-active': libraryFilter === 'mine' }" :aria-selected="libraryFilter === 'mine'" @click="libraryFilter = 'mine'">{{ $t('creatorMarketplace.libraryFilterMine') }}</button>
        <button type="button" role="tab" :class="{ 'is-active': libraryFilter === 'subscribed' }" :aria-selected="libraryFilter === 'subscribed'" @click="libraryFilter = 'subscribed'">{{ $t('creatorMarketplace.libraryFilterSubscribed') }}</button>
      </div>

      <section v-if="uploadSummaries.length" class="visual-kb-upload-status" aria-live="polite">
        <article v-for="summary in uploadSummaries" :key="summary.kbId">
          <span class="visual-kb-upload-status__icon" :class="{ 'is-done': summary.completed === summary.total }"><t-icon :name="summary.completed === summary.total ? 'check-circle-filled' : 'upload'" /></span>
          <div class="visual-kb-upload-status__copy">
            <strong>{{ summary.completed === summary.total ? $t('knowledgeList.uploadProgress.completedTitle', { name: summary.kbName }) : $t('knowledgeList.uploadProgress.uploadingTitle', { name: summary.kbName }) }}</strong>
            <span>{{ summary.completed === summary.total ? $t('knowledgeList.uploadProgress.completedDetail', { total: summary.total }) : $t('knowledgeList.uploadProgress.detail', { completed: summary.completed, total: summary.total }) }}</span>
            <span class="is-muted">{{ summary.completed === summary.total ? $t('knowledgeList.uploadProgress.refreshing') : $t('knowledgeList.uploadProgress.keepPageOpen') }}</span>
            <span v-if="summary.hasError" class="is-error">{{ $t('knowledgeList.uploadProgress.errorTip') }}</span>
            <span class="visual-kb-upload-status__bar"><span :style="{ width: summary.progress + '%' }" /></span>
          </div>
        </article>
      </section>

      <section class="visual-kb-list__content">
        <MarketplaceLibraryCards v-if="!authStore.isLiteMode && spaceSelection === 'all'"
          :entries="marketLibraryEntries" :loading="marketLibraryLoading" :failed="marketLibraryFailed" @retry="loadMarketLibrary" />

        <section v-if="!authStore.isLiteMode || libraryFilter !== 'subscribed'" :class="{ 'visual-kb-source-group': authStore.isLiteMode }" :aria-label="authStore.isLiteMode ? $t('creatorMarketplace.libraryMineTitle') : undefined">
          <h2 v-if="authStore.isLiteMode">{{ $t('creatorMarketplace.libraryMineTitle') }} <small v-if="!loading">{{ mineLibraryCount }}</small></h2>

        <div v-if="loading && kbs.length === 0 && !spaceSelectionOrgId" class="visual-kb-grid" aria-hidden="true">
          <article v-for="n in 6" :key="n" class="visual-kb-list__skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '62%', height: '16px' },{ width: '100%', height: '12px' },{ width: '76%', height: '12px' }]" /></article>
        </div>

        <div v-else-if="!authStore.isLiteMode && (spaceSelection === 'all' || spaceSelection === 'favorites' || spaceSelection === 'recents') && filteredKnowledgeBases.length > 0 && filteredKnowledgeBases.some((kb: { type?: string }) => !authStore.isLiteMode || kb.type !== 'faq')" class="visual-kb-grid">
          <button v-if="!authStore.isLiteMode && filteredKnowledgeBases[0]?.isMine && filteredKnowledgeBases[0]?.is_pinned" type="button" class="visual-kb-section" @click="toggleKbSection('pinned')"><t-icon name="pin-filled" /><span>{{ $t('knowledgeList.sections.pinned') }}</span><small>{{ filteredKbSectionCounts.pinned }}</small><t-icon :name="isKbSectionCollapsed('pinned') ? 'chevron-right' : 'chevron-down'" /></button>

          <template v-for="(kb, index) in filteredKnowledgeBases" :key="`${kb.isMine ? 'mine' : 'shared'}-${kb.id}`">
            <template v-if="!authStore.isLiteMode || kb.type !== 'faq'">
            <button v-if="showShareGroupHeaders && kb.isMine && !isMyKb(kb) && !kb.is_pinned && (index === 0 || !filteredKnowledgeBases[Number(index) - 1].isMine || isMyKb(filteredKnowledgeBases[Number(index) - 1]) || filteredKnowledgeBases[Number(index) - 1].is_pinned)" type="button" class="visual-kb-section" @click="toggleKbSection('tenantOthers')"><t-icon :name="tenantSectionIconName" /><span>{{ $t(tenantSectionLabelKey) }}</span><small>{{ filteredKbSectionCounts.tenantOthers }}</small><t-icon :name="isKbSectionCollapsed('tenantOthers') ? 'chevron-right' : 'chevron-down'" /></button>
            <button v-if="showShareGroupHeaders && !kb.isMine && isSharedKbEditable(kb.permission) && (index === 0 || filteredKnowledgeBases[Number(index) - 1].isMine)" type="button" class="visual-kb-section" @click="toggleKbSection('sharedEditable')"><t-icon name="usergroup-add" /><span>{{ $t('knowledgeList.sections.sharedEditable') }}</span><small>{{ filteredKbSectionCounts.sharedEditable }}</small><t-icon :name="isKbSectionCollapsed('sharedEditable') ? 'chevron-right' : 'chevron-down'" /></button>
            <button v-if="showShareGroupHeaders && !kb.isMine && !isSharedKbEditable(kb.permission) && (index === 0 || filteredKnowledgeBases[Number(index) - 1].isMine || isSharedKbEditable(filteredKnowledgeBases[Number(index) - 1].permission))" type="button" class="visual-kb-section" @click="toggleKbSection('sharedReadonly')"><t-icon name="browse" /><span>{{ $t('knowledgeList.sections.sharedReadonly') }}</span><small>{{ filteredKbSectionCounts.sharedReadonly }}</small><t-icon :name="isKbSectionCollapsed('sharedReadonly') ? 'chevron-right' : 'chevron-down'" /></button>

            <div v-if="kb.isMine" v-show="authStore.isLiteMode || !isKbSectionCollapsed(kbSectionOf(kb))" class="visual-reference-kb-card-host" :ref="(el) => { if (highlightedKbId !== null && highlightedKbId === kb.id && el) highlightedCardRef = el as HTMLElement }">
              <KnowledgeBaseListReferenceCard
                :kb="kb"
                :favorited="isKbFavorited(kb.id)"
                :can-duplicate="canDuplicateKBCard(kb)"
                :can-manage="canManageKBCard(kb)"
                :show-origin-badge="!authStore.isLiteMode && showKbOriginBadge(kb)"
                :origin-variant="kbOriginVariant(kb)"
                :creator-name="kb.creator_name"
                :highlighted="highlightedKbId !== null && highlightedKbId === kb.id"
                @open="handleCardClick(kb)"
                @favorite="toggleFavoriteKb(kb.id, $event)"
                @pin="handleTogglePinById(kb.id)"
                @edit="uiStore.openEditKB(kb.id)"
                @duplicate="handleDuplicateById(kb.id)"
                @delete="handleDeleteById(kb.id)"
              />
            </div>

            <KnowledgeBaseListReferenceCard
              v-else
              v-show="!isKbSectionCollapsed(kbSectionOf(kb))"
              :kb="kb"
              shared
              :favorited="isKbFavorited(kb.id)"
              :org-name="kb.org_name"
              show-details-only
              @open="handleSharedKbClickFromAll(kb)"
              @favorite="toggleFavoriteKb(kb.id, $event)"
              @details="openSharedDetailFromAll(kb)"
            />
            </template>
          </template>

        </div>

        <div v-else-if="(authStore.isLiteMode || spaceSelection === 'mine') && sortedMineKbs.length > 0 && sortedMineKbs.some((kb: { type?: string }) => !authStore.isLiteMode || kb.type !== 'faq')" class="visual-kb-grid">
          <button v-if="!authStore.isLiteMode && sortedMineKbs[0]?.is_pinned" type="button" class="visual-kb-section" @click="toggleKbSection('pinned')"><t-icon name="pin-filled" /><span>{{ $t('knowledgeList.sections.pinned') }}</span><small>{{ mineKbSectionCounts.pinned }}</small><t-icon :name="isKbSectionCollapsed('pinned') ? 'chevron-right' : 'chevron-down'" /></button>
          <template v-for="(kb, index) in sortedMineKbs" :key="kb.id">
            <template v-if="!authStore.isLiteMode || kb.type !== 'faq'">
            <button v-if="showShareGroupHeaders && !isMyKb(kb) && !kb.is_pinned && (index === 0 || isMyKb(sortedMineKbs[Number(index) - 1]) || sortedMineKbs[Number(index) - 1].is_pinned)" type="button" class="visual-kb-section" @click="toggleKbSection('tenantOthers')"><t-icon :name="tenantSectionIconName" /><span>{{ $t(tenantSectionLabelKey) }}</span><small>{{ mineKbSectionCounts.tenantOthers }}</small><t-icon :name="isKbSectionCollapsed('tenantOthers') ? 'chevron-right' : 'chevron-down'" /></button>
            <div v-show="authStore.isLiteMode || !isKbSectionCollapsed(kbSectionOf(kb))" class="visual-reference-kb-card-host" :ref="(el) => { if (highlightedKbId !== null && highlightedKbId === kb.id && el) highlightedCardRef = el as HTMLElement }">
              <KnowledgeBaseListReferenceCard
                :kb="kb"
                :favorited="isKbFavorited(kb.id)"
                :can-duplicate="canDuplicateKBCard(kb)"
                :can-manage="canManageKBCard(kb)"
                :show-origin-badge="!authStore.isLiteMode && showKbOriginBadge(kb)"
                :origin-variant="kbOriginVariant(kb)"
                :creator-name="kb.creator_name"
                :highlighted="highlightedKbId !== null && highlightedKbId === kb.id"
                @open="handleCardClick(kb)"
                @favorite="toggleFavoriteKb(kb.id, $event)"
                @pin="handleTogglePin(kb)"
                @edit="uiStore.openEditKB(kb.id)"
                @duplicate="handleDuplicate(kb)"
                @delete="handleDelete(kb)"
              />
            </div>
            </template>
          </template>
        </div>

        <div v-else-if="spaceSelectionOrgId && spaceKbsLoading" class="visual-kb-loading"><t-loading size="medium" /></div>

        <div v-else-if="spaceSelectionOrgId && sortedSpaceKbsList.length > 0 && sortedSpaceKbsList.some((shared: { knowledge_base?: { type?: string } }) => !authStore.isLiteMode || shared.knowledge_base?.type !== 'faq')" class="visual-kb-grid">
          <template v-for="(shared, index) in sortedSpaceKbsList" :key="'shared-' + (shared.share_id || `agent-${shared.knowledge_base?.id}-${shared.source_from_agent?.agent_id || ''}`)">
            <template v-if="!authStore.isLiteMode || shared.knowledge_base?.type !== 'faq'">
            <button v-if="showShareGroupHeaders && shared.is_mine && index === 0" type="button" class="visual-kb-section" @click="toggleKbSection('sharedByMe')"><t-icon name="share" /><span>{{ $t('knowledgeList.sections.sharedByMe') }}</span><small>{{ spaceKbSectionCounts.sharedByMe }}</small><t-icon :name="isKbSectionCollapsed('sharedByMe') ? 'chevron-right' : 'chevron-down'" /></button>
            <button v-if="showShareGroupHeaders && !shared.is_mine && isSharedKbEditable(shared.permission) && (index === 0 || sortedSpaceKbsList[Number(index) - 1].is_mine)" type="button" class="visual-kb-section" @click="toggleKbSection('sharedEditable')"><t-icon name="edit-1" /><span>{{ $t('knowledgeList.sections.sharedEditable') }}</span><small>{{ spaceKbSectionCounts.sharedEditable }}</small><t-icon :name="isKbSectionCollapsed('sharedEditable') ? 'chevron-right' : 'chevron-down'" /></button>
            <button v-if="showShareGroupHeaders && !shared.is_mine && !isSharedKbEditable(shared.permission) && (index === 0 || sortedSpaceKbsList[Number(index) - 1].is_mine || isSharedKbEditable(sortedSpaceKbsList[Number(index) - 1].permission))" type="button" class="visual-kb-section" @click="toggleKbSection('sharedReadonly')"><t-icon name="browse" /><span>{{ $t('knowledgeList.sections.sharedReadonly') }}</span><small>{{ spaceKbSectionCounts.sharedReadonly }}</small><t-icon :name="isKbSectionCollapsed('sharedReadonly') ? 'chevron-right' : 'chevron-down'" /></button>
            <KnowledgeBaseListReferenceCard
              v-show="!isSpaceKbCollapsed(shared)"
              :kb="shared.knowledge_base"
              shared
              :can-favorite="false"
              :org-name="shared.org_name"
              :show-details-only="!shared.is_mine"
              @open="handleSharedKbClick(shared)"
              @details="openSharedDetail(shared)"
            />
            </template>
          </template>
        </div>

        <p v-else-if="authStore.isLiteMode && !loading" class="visual-kb-source-empty" role="status">{{ $t('creatorMarketplace.libraryEmptyMine') }}</p>
        <section v-else-if="marketLibraryCount === 0 && spaceSelection === 'all' && !filteredKnowledgeBases.some((kb: { type?: string }) => !authStore.isLiteMode || kb.type !== 'faq') && !loading" class="visual-kb-empty"><t-icon name="folder" /><strong>{{ $t('knowledgeList.empty.title') }}</strong><p>{{ $t('knowledgeList.empty.description') }}</p><button v-if="authStore.hasRole('contributor')" type="button" class="empty-state-btn" data-guide="kb-list-create" @click="handleCreateKnowledgeBase"><t-icon name="folder-add" /><span>{{ $t('knowledgeList.create') }}</span></button></section>
        <section v-else-if="spaceSelection === 'favorites' && !filteredKnowledgeBases.some((kb: { type?: string }) => !authStore.isLiteMode || kb.type !== 'faq') && !loading" class="visual-kb-empty"><t-icon name="star" /><strong>{{ $t('knowledgeList.empty.favoritesTitle') }}</strong><p>{{ $t('knowledgeList.empty.favoritesDescription') }}</p></section>
        <section v-else-if="spaceSelection === 'recents' && !filteredKnowledgeBases.some((kb: { type?: string }) => !authStore.isLiteMode || kb.type !== 'faq') && !loading" class="visual-kb-empty"><t-icon name="history" /><strong>{{ $t('knowledgeList.empty.recentsTitle') }}</strong><p>{{ $t('knowledgeList.empty.recentsDescription') }}</p></section>
        <section v-else-if="(!authStore.isLiteMode || marketLibraryCount === 0) && spaceSelection === 'mine' && !sortedMineKbs.some((kb: { type?: string }) => !authStore.isLiteMode || kb.type !== 'faq') && !loading" class="visual-kb-empty"><t-icon name="folder" /><strong>{{ $t('knowledgeList.empty.title') }}</strong><p>{{ $t('knowledgeList.empty.description') }}</p><button v-if="authStore.hasRole('contributor')" type="button" class="empty-state-btn" data-guide="kb-list-create" @click="handleCreateKnowledgeBase"><t-icon name="folder-add" /><span>{{ $t('knowledgeList.create') }}</span></button></section>
        <section v-else-if="spaceSelectionOrgId && !spaceKbsLoading && !spaceKbsList.some((shared: { knowledge_base?: { type?: string } }) => !authStore.isLiteMode || shared.knowledge_base?.type !== 'faq')" class="visual-kb-empty"><t-icon name="usergroup" /><strong>{{ $t('knowledgeList.empty.sharedTitle') }}</strong><p>{{ $t('knowledgeList.empty.sharedDescription') }}</p></section>
        </section>

        <MarketplaceLibraryCards v-if="authStore.isLiteMode && libraryFilter !== 'mine'" show-empty
          :entries="marketLibraryEntries" :loading="marketLibraryLoading" :failed="marketLibraryFailed" @retry="loadMarketLibrary" />
      </section>

      <t-dialog v-model:visible="deleteVisible" :close-btn="false" :cancel-btn="null" :confirm-btn="null" dialog-class-name="visual-kb-delete-dialog">
        <div class="visual-kb-delete"><t-icon name="error-circle" /><div><strong>{{ $t('knowledgeList.delete.confirmTitle') }}</strong><p>{{ $t('knowledgeList.delete.confirmMessage', { name: deletingKb?.name ?? '' }) }}</p></div><footer><button type="button" @click="deleteVisible = false">{{ $t('common.cancel') }}</button><button type="button" class="is-danger" @click="confirmDelete">{{ $t('knowledgeList.delete.confirmButton') }}</button></footer></div>
      </t-dialog>

      <KnowledgeBaseEditorModal :visible="uiStore.showKBEditorModal" :mode="uiStore.kbEditorMode" :kb-id="uiStore.currentKBId || undefined" :initial-type="uiStore.kbEditorType" @update:visible="(val: boolean) => (val ? null : uiStore.closeKBEditor())" @success="handleKBEditorSuccess" />
      <ShareKnowledgeBaseDialog v-model:visible="shareDialogVisible" :knowledge-base-id="sharingKbId" :knowledge-base-name="sharingKbName" @shared="handleShareSuccess" />

      <Teleport to="body">
        <Transition name="visual-shared-detail">
          <div v-if="sharedDetailPanelVisible && currentSharedKbForDetail" class="visual-shared-detail__overlay" @click.self="closeSharedDetailPanel">
            <aside class="visual-shared-detail">
              <header><h3>{{ $t('knowledgeList.detail.title') }}</h3><button type="button" :aria-label="$t('general.close')" @click="closeSharedDetailPanel"><t-icon name="close" /></button></header>
              <div class="visual-shared-detail__body"><dl>
                <div><dt>{{ $t('knowledgeBase.name') }}</dt><dd>{{ currentSharedKbForDetail.knowledge_base.name }}</dd></div>
                <div><dt>{{ $t('knowledgeList.detail.sourceType') }}</dt><dd>{{ currentSharedKbForDetail.source_from_agent ? $t('knowledgeList.detail.sourceTypeAgent') : $t('knowledgeList.detail.sourceTypeKbShare') }}</dd></div>
                <div><dt>{{ currentSharedKbForDetail.source_from_agent ? $t('knowledgeList.detail.sourceFromAgent') : $t('knowledgeList.detail.sourceOrg') }}</dt><dd>{{ currentSharedKbForDetail.source_from_agent ? currentSharedKbForDetail.source_from_agent.agent_name : currentSharedKbForDetail.org_name }}</dd></div>
                <div v-if="currentSharedKbForDetail.source_from_agent"><dt>{{ $t('knowledgeList.detail.agentKbStrategy') }}</dt><dd>{{ agentKbStrategyText(currentSharedKbForDetail.source_from_agent?.kb_selection_mode ?? '') }}</dd></div>
                <div><dt>{{ $t('knowledgeList.detail.sharedAt') }}</dt><dd>{{ formatStringDate(new Date(currentSharedKbForDetail.shared_at)) }}</dd></div>
                <div><dt>{{ $t('knowledgeList.detail.myPermission') }}</dt><dd>{{ $t(`organization.role.${currentSharedKbForDetail.permission}`) }}</dd></div>
              </dl></div>
              <footer><button type="button" @click="closeSharedDetailPanel">{{ $t('common.close') }}</button><button type="button" class="is-primary" @click="goToSharedKbFromPanel">{{ $t('knowledgeList.detail.goToKb') }}</button></footer>
            </aside>
          </div>
        </Transition>
      </Teleport>

      <ContextualGuide tour="kbList" :when="showKbListContextualGuide" />
    </main>
  </div>
</template>

<style scoped lang="less">
@import './components/knowledge-base-layout.less';
.visual-kb-workspace { width: 100%; height: 100%; min-width: 0; min-height: 0; flex: 1 1 auto; display: flex; overflow: hidden; background: rgb(249 250 251 / 30%); }
.visual-kb-workspace > :deep(.list-space-sidebar) { flex: 0 0 auto; }
.visual-kb-list { width: auto; height: 100%; min-width: 0; min-height: 0; flex: 1 1 auto; padding: 24px; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px; overflow: hidden; background: rgb(249 250 251 / 30%); color: #374151; }
.visual-kb-list > .visual-knowledge-tabs { align-self: flex-start; }
.visual-kb-list__header { flex: 0 0 auto; padding-bottom: 20px; border-bottom: 1px solid rgb(229 231 235 / 80%); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.visual-kb-list__heading { min-width: 0; }
.visual-kb-list__title-row { display: flex; align-items: center; gap: 8px; }
.visual-kb-list__title-row :deep(.t-icon) { width: 20px; height: 20px; font-size: 20px; color: #374151; }
.visual-kb-list__header h1 { margin: 0; color: #111827; font-size: 20px; line-height: 28px; font-weight: 700; }
.visual-kb-list__header p { margin: 4px 0 0; color: #6b7280; font-size: 12px; line-height: 18px; }
.visual-kb-list__create { height: 34px !important; min-height: 34px; padding: 0 14px !important; border-width: 1px; border-style: solid; border-color: #111827 !important; border-radius: 12px !important; display: inline-flex; align-items: center; gap: 6px; background: #111827 !important; color: #fff !important; font: inherit; font-size: 12px; line-height: 16px; font-weight: 700; white-space: nowrap; cursor: pointer; box-shadow: 0 1px 2px rgb(0 0 0 / 8%); transition: background-color 150ms ease, border-color 150ms ease; }
.visual-kb-list__create:hover,
.visual-kb-list__create:focus-visible,
.visual-kb-list__create:active { border-color: #000 !important; background: #000 !important; color: #fff !important; }
.visual-kb-list__create :deep(.t-icon) { display: inline-flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1; }
.visual-kb-warning { flex: 0 0 auto; min-height: 38px; padding: 8px 12px; box-sizing: border-box; border: 1px solid #e5e7eb; border-radius: 12px; display: flex; align-items: center; gap: 8px; background: #fff; color: #6b7280; font-size: 11px; line-height: 18px; box-shadow: 0 1px 2px rgb(0 0 0 / 4%); }
.visual-kb-warning :deep(.t-icon) { flex: 0 0 16px; font-size: 16px; color: #9ca3af; }
.visual-kb-upload-status { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; }
.visual-kb-upload-status article { min-height: 56px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 12px; display: flex; gap: 10px; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-kb-upload-status__icon { flex: 0 0 30px; width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #6b7280; }
.visual-kb-upload-status__icon.is-done { color: #047857; }
.visual-kb-upload-status__copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; color: #6b7280; font-size: 10px; line-height: 14px; }
.visual-kb-upload-status__copy strong { color: #374151; font-size: 11px; line-height: 16px; }
.visual-kb-upload-status__copy .is-muted { color: #9ca3af; }
.visual-kb-upload-status__copy .is-error { color: #dc2626; }
.visual-kb-upload-status__bar { height: 2px; margin-top: 4px; overflow: hidden; border-radius: 999px; background: #e5e7eb; }
.visual-kb-upload-status__bar span { display: block; height: 100%; background: #6b7280; transition: width 140ms linear; }
.visual-kb-list__content { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 24px 4px 12px 2px; scrollbar-width: thin; }
:deep(.visual-kb-source-group) { min-width: 0; margin-bottom: 24px; }
:deep(.visual-kb-source-group > h2) { margin: 0 0 12px; font-size: 15px; }
:deep(.visual-kb-source-empty) { margin: 0; padding: 12px 0; color: #6b7280; font-size: 12px; }
:deep(.visual-kb-grid) { display: grid; grid-template-columns: 1fr; gap: 18px; }
.visual-reference-kb-card-host { min-width: 0; }
.visual-kb-section { grid-column: 1 / -1; min-height: 28px; margin-top: 4px; padding: 4px 2px; border: 0; display: flex; align-items: center; gap: 6px; background: transparent; color: #9ca3af; font: inherit; font-size: 11px; font-weight: 600; text-align: left; cursor: pointer; }
.visual-kb-section:hover { color: #374151; }
.visual-kb-section small { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #9ca3af; font-size: 9px; }
.visual-kb-section :deep(.t-icon:last-child) { margin-left: 2px; }
.visual-kb-list__skeleton { min-height: 154px; padding: 18px; border: 1px solid rgb(229 231 235 / 90%); border-radius: 12px; background: #fff; }
.visual-kb-loading { min-height: 220px; display: flex; align-items: center; justify-content: center; }
.visual-kb-empty { min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #9ca3af; text-align: center; }
.visual-kb-empty > :deep(.t-icon) { font-size: 30px; color: #d1d5db; }
.visual-kb-empty strong { color: #374151; font-size: 13px; }
.visual-kb-empty p { max-width: 360px; margin: 0; font-size: 11px; line-height: 17px; }
.visual-kb-empty button { margin-top: 8px; min-height: 32px; padding: 8px 14px; border: 0; border-radius: 12px; display: inline-flex; align-items: center; gap: 7px; background: #111827; color: #fff; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.visual-kb-delete { padding: 10px; display: grid; grid-template-columns: 30px minmax(0,1fr); gap: 10px; }
.visual-kb-delete > :deep(.t-icon) { font-size: 24px; color: #dc2626; }
.visual-kb-delete strong { color: #111827; font-size: 13px; }
.visual-kb-delete p { margin: 5px 0 0; color: #6b7280; font-size: 11px; line-height: 17px; }
.visual-kb-delete footer { grid-column: 1 / -1; margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }
.visual-kb-delete footer button { min-height: 30px; padding: 6px 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #374151; font: inherit; font-size: 11px; cursor: pointer; }
.visual-kb-delete footer button.is-danger { border-color: #dc2626; background: #dc2626; color: #fff; }
.visual-shared-detail__overlay { position: fixed; inset: 0; z-index: 1800; display: flex; justify-content: flex-end; background: rgb(15 23 42 / 18%); }
.visual-shared-detail { width: min(430px,100%); height: 100%; display: flex; flex-direction: column; background: #fff; box-shadow: -16px 0 40px rgb(15 23 42 / 12%); }
.visual-shared-detail > header { min-height: 58px; padding: 12px 16px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; }
.visual-shared-detail > header h3 { margin: 0; color: #111827; font-size: 14px; }
.visual-shared-detail > header button { width: 28px; height: 28px; padding: 6px; border: 0; border-radius: 8px; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-shared-detail__body { min-height: 0; flex: 1; overflow-y: auto; padding: 16px; }
.visual-shared-detail dl { margin: 0; display: flex; flex-direction: column; gap: 12px; }
.visual-shared-detail dl > div { padding: 10px 12px; border: 1px solid #f3f4f6; border-radius: 10px; background: #f9fafb; }
.visual-shared-detail dt { color: #9ca3af; font-size: 10px; }
.visual-shared-detail dd { margin: 3px 0 0; color: #374151; font-size: 12px; line-height: 18px; }
.visual-shared-detail > footer { padding: 12px 16px; border-top: 1px solid #f3f4f6; display: flex; justify-content: flex-end; gap: 8px; }
.visual-shared-detail > footer button { min-height: 32px; padding: 7px 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #374151; font: inherit; font-size: 11px; cursor: pointer; }
.visual-shared-detail > footer button.is-primary { border-color: #111827; background: #111827; color: #fff; }
.visual-shared-detail-enter-active,.visual-shared-detail-leave-active { transition: opacity 160ms ease; }
.visual-shared-detail-enter-active .visual-shared-detail,.visual-shared-detail-leave-active .visual-shared-detail { transition: transform 180ms ease; }
.visual-shared-detail-enter-from,.visual-shared-detail-leave-to { opacity: 0; }
.visual-shared-detail-enter-from .visual-shared-detail,.visual-shared-detail-leave-to .visual-shared-detail { transform: translateX(100%); }
@media (min-width: 768px) { .visual-kb-list { padding: 32px; } :deep(.visual-kb-grid) { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (min-width: 1024px) { :deep(.visual-kb-grid) { grid-template-columns: repeat(3,minmax(0,1fr)); } }
@media (max-width: 760px) { .visual-kb-workspace > :deep(.list-space-sidebar) { display: none; } }
@media (max-width: 600px) { .visual-kb-list__header { align-items: flex-start; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .visual-kb-list__create,.visual-kb-upload-status__bar span,.visual-shared-detail-enter-active,.visual-shared-detail-leave-active,.visual-shared-detail-enter-active .visual-shared-detail,.visual-shared-detail-leave-active .visual-shared-detail { transition: none !important; } }
:root[theme-mode="dark"] .visual-kb-workspace,
:root[theme-mode="dark"] .visual-kb-list { background: var(--mvc-page, #151619) !important; }
:root[theme-mode="dark"] .visual-kb-list__header { background: var(--mvc-page, #151619) !important; }
:root[theme-mode="dark"] .visual-kb-list__create { border-color: #f4f4f5 !important; background: #f4f4f5 !important; color: #18181b !important; }
:root[theme-mode="dark"] .visual-kb-list__create:hover,
:root[theme-mode="dark"] .visual-kb-list__create:focus-visible,
:root[theme-mode="dark"] .visual-kb-list__create:active { border-color: #fff !important; background: #fff !important; color: #09090b !important; }
</style>

<style>
.visual-kb-delete-dialog .t-dialog { border-radius: 14px !important; }
</style>
