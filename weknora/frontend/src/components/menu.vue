<script lang="ts">
import { defineComponent, type SetupContext } from 'vue'
import LegacySidebarBusiness from '@/assets/business-baselines/menu.pre-view.vue'
import SessionSidebarRow from './SessionSidebarRow.vue'
import SessionSourceFilter from './SessionSourceFilter.vue'
import SessionBatchManageModal from './SessionBatchManageModal.vue'
import UserMenu from './UserMenu.vue'
import TenantSelector from './TenantSelector.vue'
import { useOrganizationStore } from '@/stores/organization'
import { bucketHasMore } from './sessionSidebarBuckets'

const legacy = LegacySidebarBusiness as any
const legacySetup = legacy.setup

export default defineComponent({
  ...legacy,
  name: 'AppSidebar',
  components: {
    ...(legacy.components || {}),
    SessionSidebarRow,
    SessionSourceFilter,
    SessionBatchManageModal,
    UserMenu,
    TenantSelector,
  },
  setup(props: Record<string, unknown>, context: SetupContext) {
    const state = legacySetup?.(props, context)
    const orgStore = useOrganizationStore()
    if (state && typeof state === 'object' && typeof state.then !== 'function') return { ...state, orgStore, bucketHasMore }
    return state
  },
})
</script>

<template>
  <aside class="visual-sidebar" :class="{ 'is-collapsed': uiStore.sidebarCollapsed }">
    <template v-if="uiStore.sidebarCollapsed">
      <div class="visual-sidebar__collapsed-main">
        <button type="button" class="visual-sidebar__collapsed-logo" :title="'Musuw 穆苏瓦'" @click="toggleSidebar"><img src="/musuw-logo.png" alt="Musuw" /></button>
        <button type="button" class="visual-sidebar__collapsed-control" :title="t('menu.expandSidebar')" @click="toggleSidebar"><t-icon name="chevron-right" /></button>
        <div class="visual-sidebar__collapsed-divider" />
        <button type="button" class="visual-sidebar__collapsed-nav is-new" :title="t('menu.newChat')" @click="handleMenuClick('creatChat')"><t-icon name="chat-add" /></button>
        <button type="button" class="visual-sidebar__collapsed-nav" :class="{ 'is-active': isMenuItemActive('knowledge-bases') }" :title="t('menu.knowledgeBase')" @click="handleMenuClick('knowledge-bases')"><t-icon name="folder" /></button>
        <button type="button" class="visual-sidebar__collapsed-nav" :class="{ 'is-active': currentpath === 'marketplace' || currentpath === 'marketplaceProduct' }" :title="t('creatorMarketplace.title')" @click="handleMenuClick('marketplace')"><t-icon name="shop" /></button>
        <button v-if="visibleMenuArr.some((item: { path?: string }) => item.path === 'agents')" type="button" class="visual-sidebar__collapsed-nav" :class="{ 'is-active': currentpath === 'agentList' }" :title="t('menu.agents')" @click="handleMenuClick('agents')"><t-icon name="usergroup" /></button>
        <button v-if="visibleMenuArr.some((item: { path?: string }) => item.path === 'organizations')" type="button" class="visual-sidebar__collapsed-nav" :class="{ 'is-active': currentpath === 'organizationList' }" :title="t('menu.organizations')" @click="handleMenuClick('organizations')"><t-icon name="system-sum" /></button>
      </div>
      <div class="visual-sidebar__drag-handle" @mousedown="onDragHandleMouseDown" />
      <div class="visual-sidebar__collapsed-user"><UserMenu /></div>
    </template>

    <template v-else>
      <header class="visual-sidebar__header">
        <button type="button" class="visual-sidebar__brand" aria-label="Musuw" @click="handleMenuClick('creatChat')"><span class="visual-sidebar__mark" aria-hidden="true"><img src="/musuw-logo.png" alt="" /></span></button>
        <div class="visual-sidebar__header-actions">
          <button v-if="!authStore.isLiteMode" type="button" class="visual-sidebar__header-icon" :title="t('menu.search')" :aria-label="t('menu.search')" @click="commandPaletteStore.openPalette('')"><t-icon name="search" /></button>
          <button type="button" class="visual-sidebar__header-icon" :title="t('menu.collapseSidebar')" :aria-label="t('menu.collapseSidebar')" @click="toggleSidebar"><t-icon name="chevron-left" /></button>
        </div>
      </header>

      <TenantSelector v-if="!authStore.isLiteMode && authStore.canAccessAllTenants" class="visual-sidebar__tenant-selector" />

      <div class="visual-sidebar__primary-actions">
        <button type="button" class="visual-sidebar__primary is-new" data-guide="nav-creatChat" @click="handleMenuClick('creatChat')"><t-icon name="chat-add" /><span>{{ t('menu.newChat') }}</span></button>
        <button type="button" class="visual-sidebar__primary is-kb" :class="{ 'is-active': isMenuItemActive('knowledge-bases') }" data-guide="nav-knowledge-bases" @click="handleMenuClick('knowledge-bases')">
          <span class="visual-sidebar__primary-copy"><t-icon name="folder" /><span>{{ t('menu.knowledgeBase') }}</span></span>
          <span v-if="chatResources.rawKnowledgeBases?.length" class="visual-sidebar__kb-count">{{ chatResources.rawKnowledgeBases.length }}</span>
        </button>
        <button type="button" class="visual-sidebar__primary is-native" :class="{ 'is-active': currentpath === 'marketplace' || currentpath === 'marketplaceProduct' }" data-guide="nav-marketplace" @click="handleMenuClick('marketplace')"><span class="visual-sidebar__primary-copy"><t-icon name="shop" /><span>{{ t('creatorMarketplace.title') }}</span></span></button>
        <button v-if="visibleMenuArr.some((item: { path?: string }) => item.path === 'agents')" type="button" class="visual-sidebar__primary is-native" :class="{ 'is-active': currentpath === 'agentList' }" data-guide="nav-agents" @click="handleMenuClick('agents')">
          <span class="visual-sidebar__primary-copy"><t-icon name="usergroup" /><span>{{ t('menu.agents') }}</span></span>
        </button>
        <button v-if="visibleMenuArr.some((item: { path?: string }) => item.path === 'organizations')" type="button" class="visual-sidebar__primary is-native" :class="{ 'is-active': currentpath === 'organizationList' }" data-guide="nav-organizations" @click="handleMenuClick('organizations')">
          <span class="visual-sidebar__primary-copy"><t-icon name="system-sum" /><span>{{ t('menu.organizations') }}</span></span>
          <span v-if="orgStore.totalPendingJoinRequestCount > 0" class="visual-sidebar__kb-count">{{ orgStore.totalPendingJoinRequestCount }}</span>
        </button>
      </div>

      <section class="visual-sidebar__history" aria-label="Sessions">
        <div v-if="!authStore.isLiteMode && showSessionSourceFilter && !batchMode" class="visual-sidebar__session-scope"><SessionSourceFilter inline :emphasized="sessionScopeFilterPinned" :sources="sessionSourceOptions" :current="activeSessionBucketKey" @select="switchSessionBucket" /></div>
        <div ref="scrollContainer" class="visual-sidebar__history-scroll" @scroll="handleScroll">
          <div v-if="sessionListBooting && !hasAnySession" class="visual-sidebar__session-skeletons" aria-hidden="true"><div v-for="n in 4" :key="n" class="visual-sidebar__session-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '100%', height: '14px' }]" /></div></div>
          <div v-else-if="activeBucket?.loading && !activeBucket.loaded && filteredGroupedSessions.length === 0" class="visual-sidebar__session-skeletons" aria-hidden="true"><div v-for="n in 4" :key="`bucket-${n}`" class="visual-sidebar__session-skeleton"><t-skeleton animation="gradient" :row-col="[{ width: '100%', height: '14px' }]" /></div></div>
          <div v-else-if="activeBucket?.loaded && filteredGroupedSessions.length === 0" class="visual-sidebar__empty"><t-icon name="chat" /><span>{{ t('menu.noSessions') }}</span></div>
          <template v-else>
            <section v-for="group in filteredGroupedSessions" :key="group.key" class="visual-sidebar__session-group">
              <h4 v-if="group.label">{{ group.label }}</h4>
              <SessionSidebarRow v-for="subitem in group.items" :key="subitem.id" :item="subitem" :batch-mode="batchMode" :active-path="currentSecondpath" :selected-ids="batchSelectedIds" :menu-options="buildSessionMenuOptions(subitem)" @navigate="gotopage(subitem.path)" @toggle-select="toggleBatchSelect(subitem.id)" @menu-click="handleSessionMenuClick($event, subitem)" @rename-submit="renameSessionTitle(subitem, $event.title)" @hover-in="mouseenteBotDownr(subitem.id)" @hover-out="mouseleaveBotDown" />
            </section>
            <div v-if="activeBucket?.loading && filteredGroupedSessions.length > 0" class="visual-sidebar__loading-more"><t-loading size="small" /></div>
          </template>
        </div>
      </section>

      <footer class="visual-sidebar__footer"><UserMenu /></footer>
    </template>

    <SessionBatchManageModal
      :visible="batchMode"
      :items="batchSessionItems"
      :selected-ids="batchSelectedIds"
      :all-selected="isAllBatchSelected"
      :indeterminate="isBatchIndeterminate"
      :deleting="batchDeleting || batchConfirming"
      :loading="activeBucket?.loading"
      :has-more="activeBucket ? bucketHasMore(activeBucket) : false"
      @load-more="loadMoreBatchSessions"
      @close="exitBatchMode"
      @toggle="toggleBatchSelect"
      @toggle-all="toggleBatchSelectAll"
      @delete="handleInlineBatchDelete"
    />
  </aside>
</template>

<style scoped lang="less">
.visual-sidebar { --resource-nav-idle: #374151; --resource-nav-hover: #030712; --resource-nav-hover-bg: rgb(229 231 235 / 50%); --resource-nav-active: rgb(229 231 235 / 90%); --resource-nav-active-text: #030712; width: 256px; min-width: 256px; height: 100%; min-height: 0; padding: 12px; box-sizing: border-box; border-right: 1px solid rgb(229 231 235 / 80%); background: #fbfbfb; color: #374151; display: flex; flex-direction: column; position: relative; overflow: hidden; user-select: none; transition: width 200ms ease,min-width 200ms ease; }
.visual-sidebar.is-collapsed { width: 56px; min-width: 56px; padding: 14px 8px; align-items: center; justify-content: space-between; overflow: visible; }
:global(html.wails-desktop) .visual-sidebar:not(.is-collapsed),:global(html.wails-desktop) .visual-sidebar.is-collapsed { padding-top: 30px; }
.visual-sidebar__header { flex: 0 0 auto; margin-bottom: 10px; padding: 6px 4px; display: flex; align-items: center; justify-content: space-between; }
.visual-sidebar__brand { width: 44px; height: 40px; padding: 0; border: 0; display: flex; align-items: center; background: transparent; color: #111827; cursor: pointer; }
.visual-sidebar__mark { flex: 0 0 44px; width: 44px; height: 40px; border: 0; display: inline-flex; align-items: center; justify-content: center; overflow: visible; }
.visual-sidebar__collapsed-logo { flex: 0 0 32px; width: 32px; height: 32px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: #fff; color: #111827; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); overflow: hidden; }
.visual-sidebar__mark img,.visual-sidebar__collapsed-logo img { display: block; width: 100%; height: 100%; object-fit: contain; }
.visual-sidebar__mark { transition: transform 150ms ease; }
.visual-sidebar__brand:hover .visual-sidebar__mark { transform: scale(1.05); }
.visual-sidebar__header-actions { display: flex; align-items: center; gap: 2px; color: #9ca3af; }
.visual-sidebar__header-icon,.visual-sidebar__collapsed-control { width: 28px; height: 28px; padding: 6px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; transition: color 150ms ease,background-color 150ms ease; }
.visual-sidebar__header-icon:hover { color: #1f2937; background: rgb(229 231 235 / 60%); }
.visual-sidebar__header-icon :deep(.t-icon) { font-size: 16px; }
.visual-sidebar__tenant-selector { flex: 0 0 auto; margin: -2px 2px 8px; }
.visual-sidebar__primary-actions { flex: 0 0 auto; margin-bottom: 8px; padding: 0 2px; display: flex; flex-direction: column; gap: 4px; }
.visual-sidebar__primary { width: 100%; min-height: 36px; padding: 8px 12px; box-sizing: border-box; border: 0; border-radius: 12px; display: flex; align-items: center; gap: 8px; background: transparent; color: var(--resource-nav-idle); font: inherit; font-size: 12px; line-height: 18px; font-weight: 400; text-align: left; cursor: pointer; transition: color 150ms ease, background-color 150ms ease; }
.visual-sidebar__primary.is-new { border: 1px solid rgb(229 231 235 / 80%); background: #fff; color: #111827; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); font-weight: 500; }
.visual-sidebar__primary.is-new:hover { background: #f9fafb; }
.visual-sidebar__primary.is-new > span { font-size: 13px; font-weight: 600; }
.visual-sidebar__primary.is-kb,
.visual-sidebar__primary.is-native { justify-content: space-between; color: var(--resource-nav-idle); }
.visual-sidebar__primary.is-kb:hover,
.visual-sidebar__primary.is-native:hover { color: var(--resource-nav-hover); background: var(--resource-nav-hover-bg); }
.visual-sidebar__primary.is-kb.is-active,
.visual-sidebar__primary.is-native.is-active { color: var(--resource-nav-active-text); background: var(--resource-nav-active); font-weight: 700; box-shadow: none; }
.visual-sidebar__primary-copy { min-width: 0; display: inline-flex; align-items: center; gap: 8px; }
.visual-sidebar__primary :deep(.t-icon) { flex: 0 0 16px; width: 16px; height: 16px; font-size: 16px; }
.visual-sidebar__primary-copy > span:last-child { font-size: 13px; }
.visual-sidebar__kb-count { flex: 0 0 auto; padding: 0 6px; border-radius: 6px; background: rgb(229 231 235 / 80%); color: #4b5563; font-family: var(--app-font-family-mono); font-size: 10px; line-height: 16px; }
.visual-sidebar__history { min-height: 0; flex: 1 1 auto; margin-top: 4px; display: flex; flex-direction: column; overflow: hidden; }
.visual-sidebar__session-scope { flex: 0 0 auto; margin-bottom: 4px; padding: 0 2px; }
.visual-sidebar__history-scroll { min-height: 0; flex: 1 1 auto; padding: 4px 4px 4px 0; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 12px; scrollbar-width: thin; }
.visual-sidebar__session-group { display: flex; flex-direction: column; gap: 2px; }
.visual-sidebar__session-group > h4 { margin: 0; padding: 4px 10px; color: #9ca3af; font-size: 11px; line-height: 16px; font-weight: 500; letter-spacing: .025em; }
.visual-sidebar__session-skeletons { display: flex; flex-direction: column; gap: 4px; }
.visual-sidebar__session-skeleton { min-height: 30px; padding: 7px 10px; }
.visual-sidebar__empty { padding: 32px 12px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: #9ca3af; font-size: 12px; text-align: center; }
.visual-sidebar__empty :deep(.t-icon) { font-size: 24px; color: #d1d5db; }
.visual-sidebar__loading-more { min-height: 30px; display: flex; align-items: center; justify-content: center; color: #9ca3af; }
.visual-sidebar__footer { flex: 0 0 auto; margin-top: 4px; padding-top: 8px; border-top: 1px solid rgb(229 231 235 / 70%); position: relative; }
.visual-sidebar__collapsed-main { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 16px; }
.visual-sidebar__collapsed-logo { width: 32px; height: 32px; flex-basis: 32px; cursor: pointer; transition: transform 150ms ease; }
.visual-sidebar__collapsed-logo:hover { transform: scale(1.05); }
.visual-sidebar__collapsed-control { color: #9ca3af; }
.visual-sidebar__collapsed-control:hover { color: #111827; background: #f3f4f6; }
.visual-sidebar__collapsed-divider { width: 32px; height: 1px; margin: 4px 0; background: rgb(229 231 235 / 80%); }
.visual-sidebar__collapsed-nav { width: 36px; height: 36px; padding: 9px; border: 0; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #4b5563; cursor: pointer; transition: color 150ms ease,background-color 150ms ease; }
.visual-sidebar__collapsed-nav.is-new { background: #f3f4f6; color: #111827; }
.visual-sidebar__collapsed-nav:hover { background: #e5e7eb; color: #111827; }
.visual-sidebar__collapsed-nav.is-active { background: var(--resource-nav-active); color: var(--resource-nav-active-text); box-shadow: none; }
.visual-sidebar__collapsed-nav :deep(.t-icon) { font-size: 16px; }
.visual-sidebar__collapsed-user { width: 100%; display: flex; justify-content: center; }
.visual-sidebar__drag-handle { position: absolute; top: 0; right: -3px; z-index: 20; width: 6px; height: 100%; cursor: ew-resize; }
@media (max-width: 760px) { .visual-sidebar:not(.is-collapsed) { position: absolute; inset: 0 auto 0 0; z-index: 1000; box-shadow: 12px 0 36px rgb(15 23 42 / 14%); } }
@media (prefers-reduced-motion: reduce) { .visual-sidebar,.visual-sidebar * { transition: none !important; } }

:global(:root[theme-mode="dark"] .visual-sidebar) {
  --resource-nav-idle: #d0d1d3;
  --resource-nav-hover: #f2f2f2;
  --resource-nav-hover-bg: #343539;
  --resource-nav-active: #3b3c40;
  --resource-nav-active-text: #f5f5f5;
}
:global(:root[theme-mode="dark"] .visual-sidebar__primary.is-kb),
:global(:root[theme-mode="dark"] .visual-sidebar__primary.is-native) { color: var(--resource-nav-idle) !important; }
:global(:root[theme-mode="dark"] .visual-sidebar__primary.is-kb:hover),
:global(:root[theme-mode="dark"] .visual-sidebar__primary.is-native:hover) { color: var(--resource-nav-hover) !important; background: var(--resource-nav-hover-bg) !important; }
:global(:root[theme-mode="dark"] .visual-sidebar__primary.is-kb.is-active),
:global(:root[theme-mode="dark"] .visual-sidebar__primary.is-native.is-active),
:global(:root[theme-mode="dark"] .visual-sidebar__collapsed-nav.is-active) { color: var(--resource-nav-active-text) !important; background: var(--resource-nav-active) !important; box-shadow: none !important; }
</style>
