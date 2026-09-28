<template>
  <aside class="visual-sidebar" :class="{ 'is-collapsed': uiStore.sidebarCollapsed }">
    <header v-if="!uiStore.sidebarCollapsed" class="visual-sidebar__header">
      <div class="visual-sidebar__brand" aria-label="Musuw 穆苏瓦">
        <span class="visual-sidebar__mark" aria-hidden="true">↯</span>
        <strong>Musuw</strong>
      </div>
      <div class="visual-sidebar__header-actions">
        <t-tooltip placement="bottom">
          <template #content>
            <span class="visual-sidebar__shortcut-tip">
              <span>{{ t('menu.search') }}</span>
              <kbd>{{ cmdModKeyLabel }}K</kbd>
            </span>
          </template>
          <button type="button" class="visual-sidebar__icon-button" :aria-label="t('menu.search')" @click="commandPaletteStore.openPalette('')">
            <t-icon name="search" />
          </button>
        </t-tooltip>
        <button type="button" class="visual-sidebar__icon-button" :title="t('menu.collapseSidebar')" @click="toggleSidebar">
          <t-icon name="chevron-left" />
        </button>
      </div>
    </header>

    <div v-else class="visual-sidebar__collapsed-top">
      <t-tooltip :content="t('menu.expandSidebar')" placement="right">
        <button type="button" class="visual-sidebar__rail-button" @click="toggleSidebar">
          <t-icon name="chevron-right" />
        </button>
      </t-tooltip>
    </div>

    <div v-if="uiStore.sidebarCollapsed" class="visual-sidebar__drag-handle" @mousedown="onDragHandleMouseDown" />

    <div ref="scrollContainer" class="visual-sidebar__scroll" @scroll="handleScroll">
      <div v-if="uiStore.sidebarCollapsed" class="visual-sidebar__rail-search">
        <t-tooltip placement="right">
          <template #content>
            <span class="visual-sidebar__shortcut-tip"><span>{{ t('menu.search') }}</span><kbd>{{ cmdModKeyLabel }}K</kbd></span>
          </template>
          <button type="button" class="visual-sidebar__rail-button" @click="commandPaletteStore.openPalette('')">
            <t-icon name="search" />
          </button>
        </t-tooltip>
      </div>

      <nav class="visual-sidebar__nav" :aria-label="t('menu.menuTitle')">
        <t-tooltip
          v-for="item in topMenuItems"
          :key="item.path"
          :content="item.title"
          placement="right"
          :disabled="!uiStore.sidebarCollapsed"
        >
          <button
            type="button"
            class="visual-sidebar__nav-item"
            :class="{
              'is-active': item.childrenPath && item.childrenPath === currentpath
                ? true
                : isMenuItemActive(item.path),
            }"
            :data-guide="`nav-${item.path}`"
            @click="handleMenuClick(item.path)"
            @mouseenter="mouseenteMenu(item.path)"
            @mouseleave="mouseleaveMenu(item.path)"
          >
            <span class="visual-sidebar__nav-icon"><t-icon :name="menuIconName(item.path)" /></span>
            <span v-if="!uiStore.sidebarCollapsed" class="visual-sidebar__nav-label" :title="item.title">{{ item.title }}</span>
          </button>
        </t-tooltip>
      </nav>

      <section v-if="!uiStore.sidebarCollapsed" class="visual-sidebar__sessions" aria-label="Sessions">
        <div v-if="showSessionSourceFilter && !batchMode" class="visual-sidebar__session-scope">
          <SessionSourceFilter
            inline
            :emphasized="sessionScopeFilterPinned"
            :sources="sessionSourceOptions"
            :current="activeSessionBucketKey"
            @select="switchSessionBucket"
          />
        </div>

        <div v-if="sessionListBooting && !hasAnySession" class="visual-sidebar__session-skeletons" aria-hidden="true">
          <div v-for="n in 4" :key="n" class="visual-sidebar__session-skeleton">
            <t-skeleton animation="gradient" :row-col="[{ width: '100%', height: '14px' }]" />
          </div>
        </div>

        <div v-else class="visual-sidebar__session-list">
          <div v-if="activeBucket?.loading && !activeBucket.loaded && filteredGroupedSessions.length === 0" class="visual-sidebar__session-skeletons" aria-hidden="true">
            <div v-for="n in 4" :key="`bucket-${n}`" class="visual-sidebar__session-skeleton">
              <t-skeleton animation="gradient" :row-col="[{ width: '100%', height: '14px' }]" />
            </div>
          </div>
          <div v-else-if="activeBucket?.loaded && filteredGroupedSessions.length === 0" class="visual-sidebar__empty">
            {{ t('menu.noSessions') }}
          </div>
          <template v-else>
            <section v-for="group in filteredGroupedSessions" :key="group.key" class="visual-sidebar__session-group">
              <h4 v-if="group.label">{{ group.label }}</h4>
              <div
                v-for="subitem in group.items"
                :key="subitem.id"
                class="visual-sidebar__session-row"
                :class="{
                  'is-active': !batchMode && subitem.path === currentSecondpath,
                  'is-selected': batchMode && batchSelectedIds.includes(subitem.id),
                }"
              >
                <SessionSidebarRow
                  :item="subitem"
                  :batch-mode="batchMode"
                  :active-path="currentSecondpath"
                  :selected-ids="batchSelectedIds"
                  :menu-options="buildSessionMenuOptions(subitem)"
                  @navigate="gotopage(subitem.path)"
                  @toggle-select="toggleBatchSelect(subitem.id)"
                  @menu-click="handleSessionMenuClick($event, subitem)"
                  @rename-submit="renameSessionTitle(subitem, $event.title)"
                  @hover-in="mouseenteBotDownr(subitem.id)"
                  @hover-out="mouseleaveBotDown"
                />
              </div>
            </section>
            <div v-if="activeBucket?.loading && filteredGroupedSessions.length > 0" class="visual-sidebar__loading-more">
              <t-loading size="small" />
            </div>
          </template>
        </div>
      </section>
    </div>

    <div v-if="batchMode && !uiStore.sidebarCollapsed" class="visual-sidebar__batch-footer">
      <t-checkbox :checked="isAllBatchSelected" :indeterminate="isBatchIndeterminate" @change="toggleBatchSelectAll">
        {{ t('batchManage.selectAll') }}
      </t-checkbox>
      <div>
        <button type="button" class="visual-sidebar__batch-button" @click="exitBatchMode">{{ t('batchManage.cancel') }}</button>
        <button
          type="button"
          class="visual-sidebar__batch-button is-danger"
          :disabled="batchSelectedIds.length === 0 || batchDeleting"
          @click="handleInlineBatchDelete"
        >
          <t-loading v-if="batchDeleting" size="small" />
          <span>{{ t('batchManage.delete') }}{{ batchSelectedIds.length > 0 ? `(${batchDisplayCount})` : '' }}</span>
        </button>
      </div>
    </div>

    <footer class="visual-sidebar__footer">
      <UserMenu />
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted, onUnmounted, watch, computed, ref, h, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getSessionsList, batchDelSessions, getSession } from "@/api/chat/index";
import { useChatResourcesStore } from "@/stores/chatResources";
import { listAllIMChannels } from "@/api/agent/index";
import SessionSidebarRow from "./SessionSidebarRow.vue";
import {
  clearSession,
  removeSession,
  renameSession,
  SESSION_MUTATION_EVENT,
  setSessionPinned,
  type SessionMutationDetail,
} from "./sessionMutations";
import SessionSourceFilter from "./SessionSourceFilter.vue";
import {
  SIDEBAR_BUCKET_PAGE_SIZE,
  applyBucketCountProbe,
  buildBucketDefinitions,
  bucketHasMore,
  bucketVisible,
  createEmptyBucket,
  flattenBucketItems,
  isChannelBucket,
  isChannelBucketKey,
  mergeBucketPage,
  prependSessionToWebBucket,
  removeSessionFromBuckets,
  type SidebarSessionBucket,
} from "./sessionSidebarBuckets";
import type { SessionForGrouping } from "./sessionGrouping";
import { listAllEmbedChannels } from "@/api/embed/index";
import {
  classifyDateBucket,
  configuredPlatforms,
  groupSessionsByDate,
  originGroupKey,
  resolveSessionOrigin,
  type DateBucketKey,
} from "./sessionGrouping";
import {
  DEFAULT_SESSION_BUCKET_KEY,
  buildSessionSourceOptions,
  findSessionBucketKey,
  shouldShowSessionSourceFilter,
} from "./sessionSidebarSourceFilter";
import { logout as logoutApi } from "@/api/auth";
import { useMenuStore } from "@/stores/menu";
import { useAuthStore } from "@/stores/auth";
import { handoffToExternalAuth } from "@/utils/nativeAuthHandoff";
import { useUIStore } from "@/stores/ui";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import { MessagePlugin, DialogPlugin, Icon as TIcon } from "tdesign-vue-next";
import UserMenu from "@/components/UserMenu.vue";
import { useI18n } from "vue-i18n";
import wecomLogo from "@/assets/img/im/wecom.svg";
import feishuLogo from "@/assets/img/im/feishu.svg";
import larkLogo from "@/assets/img/im/lark.svg";
import slackLogo from "@/assets/img/im/slack.svg";
import telegramLogo from "@/assets/img/im/telegram.svg";
import dingtalkLogo from "@/assets/img/im/dingtalk.svg";
import mattermostLogo from "@/assets/img/im/mattermost.svg";
import wechatLogo from "@/assets/img/im/wechat.svg";
import qqbotLogo from "@/assets/img/im/qqbot.png";

const chatResources = useChatResourcesStore();
const PLATFORM_LOGO: Record<string, string> = {
  wecom: wecomLogo,
  feishu: feishuLogo,
  lark: larkLogo,
  slack: slackLogo,
  telegram: telegramLogo,
  dingtalk: dingtalkLogo,
  mattermost: mattermostLogo,
  wechat: wechatLogo,
  qqbot: qqbotLogo,
};
const platformLogo = (p: string): string => (p ? PLATFORM_LOGO[p] || "" : "");

const { t } = useI18n();
const usemenuStore = useMenuStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const commandPaletteStore = useCommandPaletteStore();
const isMacLike = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || "");
const cmdModKeyLabel = isMacLike ? "⌘" : "Ctrl";
const route = useRoute();
const router = useRouter();
const currentpath = ref("");
const total = ref(0);
const sessionBuckets = ref<Record<string, SidebarSessionBucket>>({});
const bucketOrder = ref<string[]>([]);
let bucketRequestToken = 0;
const sessionListBooting = ref(false);
const currentSecondpath = ref("");
const scrollContainer = ref<HTMLElement | null>(null);
const imPlatforms = ref<string[]>([]);
const embedChannelNames = ref<Record<string, string>>({});
const SIDEBAR_NARROW_BREAKPOINT = 760;
let sidebarWasNarrow = false;
let sidebarPreferenceBeforeNarrow: boolean | null = null;

const syncSidebarWithViewport = () => {
  if (typeof window === "undefined") return;
  const isNarrow = window.innerWidth <= SIDEBAR_NARROW_BREAKPOINT;
  if (isNarrow === sidebarWasNarrow) return;
  if (isNarrow) {
    let storedPreference: string | null = null;
    try { storedPreference = window.localStorage.getItem("sidebar_collapsed"); } catch {}
    sidebarPreferenceBeforeNarrow = storedPreference === null ? uiStore.sidebarCollapsed : storedPreference === "true";
    uiStore.sidebarCollapsed = true;
  } else if (sidebarPreferenceBeforeNarrow !== null) {
    uiStore.sidebarCollapsed = sidebarPreferenceBeforeNarrow;
    sidebarPreferenceBeforeNarrow = null;
  }
  sidebarWasNarrow = isNarrow;
};

const toggleSidebar = () => {
  if (sidebarWasNarrow) {
    uiStore.sidebarCollapsed = !uiStore.sidebarCollapsed;
    return;
  }
  uiStore.toggleSidebar();
};
const activeSessionBucketKey = ref(DEFAULT_SESSION_BUCKET_KEY);
const sessionListCanScroll = ref(false);
const visibleChannelBuckets = computed(() =>
  bucketOrder.value.map((key) => sessionBuckets.value[key]).filter(
    (bucket): bucket is SidebarSessionBucket => !!bucket && isChannelBucket(bucket) && bucketVisible(bucket),
  ),
);
const showSessionSourceFilter = computed(() => shouldShowSessionSourceFilter(visibleChannelBuckets.value.length));
const sessionScopeFilterPinned = computed(() => activeSessionBucketKey.value !== DEFAULT_SESSION_BUCKET_KEY);
const sessionSourceOptions = computed(() =>
  buildSessionSourceOptions(
    t("menu.myChats"),
    visibleChannelBuckets.value.map((bucket) => ({ key: bucket.key, label: bucket.label, platform: bucket.platform })),
    (platform) => platformLogo(platform),
  ),
);
const activeBucket = computed(() => sessionBuckets.value[activeSessionBucketKey.value]);
const hasAnySession = computed(() => Object.values(sessionBuckets.value).some((bucket) => bucket.items.length > 0));
type MenuItem = { title: string; icon: string; path: string; childrenPath?: string; children?: any[] };
const { menuArr, visibleMenuArr } = storeToRefs(usemenuStore);
let activeSubmenu = ref<string>("");
const batchMode = ref(false);
const batchSelectedIds = ref<string[]>([]);
const batchDeleting = ref(false);
const batchConfirming = ref(false);

const batchSessionItems = computed(() => (activeBucket.value?.items || []).map((item) => ({
  ...item, title: item.title || t("menu.newSession"),
})));
const allSessionIds = computed(() => batchSessionItems.value.map((item) => item.id));
const isAllBatchSelected = computed(() => allSessionIds.value.length > 0 && allSessionIds.value.every((id) => batchSelectedIds.value.includes(id)));
const isBatchIndeterminate = computed(() => batchSelectedIds.value.length > 0 && batchSelectedIds.value.length < allSessionIds.value.length);
const batchDisplayCount = computed(() => batchSelectedIds.value.length);

const isInKnowledgeBase = computed<boolean>(() =>
  route.name === "knowledgeBaseDetail" || route.name === "kbCreatChat" || route.name === "knowledgeBaseSettings",
);
const isInKnowledgeBaseList = computed<boolean>(() => route.name === "knowledgeBaseList");
const isInCreatChat = computed<boolean>(() => route.name === "globalCreatChat" || route.name === "kbCreatChat");
const isInChatDetail = computed<boolean>(() => route.name === "chat");
void isInKnowledgeBaseList;
void isInCreatChat;
void isInChatDetail;

const isMenuItemActive = (itemPath: string): boolean => {
  const currentRoute = route.name;
  switch (itemPath) {
    case "knowledge-bases":
      return currentRoute === "knowledgeBaseList" || currentRoute === "knowledgeBaseDetail" || currentRoute === "knowledgeBaseSettings";
    case "creatChat":
      return currentRoute === "kbCreatChat" || currentRoute === "globalCreatChat";
    case "settings":
      return currentRoute === "settings";
    default:
      return itemPath === currentpath.value;
  }
};
const topMenuItems = computed<MenuItem[]>(() =>
  (visibleMenuArr.value as unknown as MenuItem[]).filter((item) => item.path === "knowledge-bases" || item.path === "creatChat"),
);
const bottomMenuItems = computed<MenuItem[]>(() =>
  (visibleMenuArr.value as unknown as MenuItem[]).filter((item) => item.path !== "knowledge-bases" && item.path !== "creatChat"),
);
void bottomMenuItems;

const currentKbName = ref<string>("");
const currentKbInfo = ref<any>(null);
const pinningIds = ref<Set<string>>(new Set());
const dateBucketLabels = computed<Record<DateBucketKey, string>>(() => ({
  pinned: t("time.pinned"),
  today: t("time.today"),
  yesterday: t("time.yesterday"),
  last7Days: t("time.last7Days"),
  last30Days: t("time.last30Days"),
  lastYear: t("time.lastYear"),
  earlier: t("time.earlier"),
}));
const filteredGroupedSessions = computed(() => {
  const bucket = activeBucket.value;
  if (!bucket?.items.length) return [];
  return groupSessionsByDate(
    bucket.items.map((item) => ({ ...item, path: `chat/${item.id}`, title: item.title || "" })),
    dateBucketLabels.value,
    (session) => classifyDateBucket(session.updated_at || session.created_at),
  );
});

const refreshSessionListScrollability = async () => {
  await nextTick();
  const container = scrollContainer.value;
  sessionListCanScroll.value = !!container && container.scrollHeight > container.clientHeight + 1;
};
const ensureBucketFillsViewport = async (key: string) => {
  const MAX_ITERATIONS = 20;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const container = scrollContainer.value;
    const bucket = sessionBuckets.value[key];
    if (!container || !bucket || !bucketHasMore(bucket) || bucket.loading) break;
    if (container.scrollHeight > container.clientHeight + 1) break;
    const prevCount = bucket.items.length;
    await loadBucketPage(key);
    if ((sessionBuckets.value[key]?.items.length ?? 0) <= prevCount) break;
  }
};

const mouseenteBotDownr = (val: string) => { activeSubmenu.value = val; };
const mouseleaveBotDown = () => { activeSubmenu.value = ""; };
const enterBatchMode = () => {
  if (batchDeleting.value || batchConfirming.value) return;
  batchMode.value = true; batchSelectedIds.value = [];
};
const exitBatchMode = () => {
  if (batchDeleting.value || batchConfirming.value) return;
  batchMode.value = false; batchSelectedIds.value = [];
};
const toggleBatchSelect = (id: string) => {
  if (batchDeleting.value || batchConfirming.value || !allSessionIds.value.includes(id)) return;
  const idx = batchSelectedIds.value.indexOf(id);
  if (idx > -1) batchSelectedIds.value.splice(idx, 1);
  else batchSelectedIds.value.push(id);
};
const toggleBatchSelectAll = (checked: boolean) => {
  if (batchDeleting.value || batchConfirming.value) return;
  batchSelectedIds.value = checked ? [...allSessionIds.value] : [];
};

const handleInlineBatchDelete = () => {
  if (batchSelectedIds.value.length === 0 || batchDeleting.value || batchConfirming.value) return;
  // Freeze the exact visible selection that the user is confirming. Selecting
  // every loaded row never authorizes deleting unseen conversations.
  const selectedIds = [...batchSelectedIds.value];
  batchConfirming.value = true;
  const closeConfirmation = () => {
    if (batchDeleting.value) return;
    batchConfirming.value = false;
    confirmDialog.destroy();
  };
  const confirmDialog = DialogPlugin.confirm({
    header: t("batchManage.deleteConfirmTitle"),
    body: t("batchManage.deleteConfirmBody", { count: selectedIds.length }),
    confirmBtn: { content: t("batchManage.delete"), theme: "danger" as const },
    cancelBtn: t("batchManage.cancel"),
    theme: "warning",
    zIndex: 4000,
    closeOnOverlayClick: false,
    closeOnEscKeydown: false,
    onClose: closeConfirmation,
    onConfirm: async () => {
      if (batchDeleting.value || !batchConfirming.value) return;
      batchDeleting.value = true;
      confirmDialog.setConfirmLoading(true);
      try {
        const res = await batchDelSessions(selectedIds);
        if (res?.success !== true) throw new Error("session batch deletion failed");
        // Ignore list reads started before deletion; otherwise a late page can
        // put deleted conversations back into the sidebar.
        bucketRequestToken += 1;
        let next = sessionBuckets.value;
        for (const id of selectedIds) next = removeSessionFromBuckets(next, id);
        for (const [key, bucket] of Object.entries(next)) {
          const changed = sessionBuckets.value[key].items.some((item) => selectedIds.includes(item.id));
          // Offset pagination shifts after deletion. Restart it while retaining
          // visible survivors; mergeBucketPage deduplicates the restarted reads.
          next[key] = { ...bucket, loading: false, page: changed ? 0 : bucket.page };
        }
        sessionBuckets.value = next;
        syncMenuStoreFromBuckets();
        const currentChatId = route.params.chatid as string;
        if (currentChatId && selectedIds.includes(currentChatId)) void router.push("/platform/creatChat");
        batchSelectedIds.value = [];
        const needsRefill = activeBucket.value && activeBucket.value.items.length === 0 && bucketHasMore(activeBucket.value);
        if (needsRefill) await loadBucketPage(activeSessionBucketKey.value);
        // If the refresh failed, leave the modal's load-more action available
        // so remaining conversations do not become unreachable behind an empty sidebar.
        batchMode.value = !!(needsRefill && activeBucket.value && activeBucket.value.items.length === 0 && bucketHasMore(activeBucket.value));
        MessagePlugin.success(t("batchManage.deleteSuccess"));
      } catch {
        MessagePlugin.error(t("batchManage.deleteFailed"));
      } finally {
        batchDeleting.value = false;
        closeConfirmation();
      }
    },
  });
};

const loadMoreBatchSessions = async () => {
  if (batchDeleting.value || batchConfirming.value) return;
  const bucket = activeBucket.value;
  if (!bucket || bucket.loading || !bucketHasMore(bucket)) return;
  await loadBucketPage(activeSessionBucketKey.value);
};

const handleSessionMenuClick = (data: { value: string }, item: any) => {
  if (data?.value === "delete") delCard(item);
  else if (data?.value === "clearMessages") clearMessages(item);
  else if (data?.value === "batchManage") enterBatchMode();
  else if (data?.value === "pin" || data?.value === "unpin") togglePin(item, data.value === "pin");
};

const buildSessionMenuOptions = (item: any) => {
  const options: any[] = [];
  options.push(item.is_pinned
    ? { content: t("menu.unpin"), value: "unpin", prefixIcon: () => h(TIcon, { name: "pin-filled", size: "16px" }) }
    : { content: t("menu.pin"), value: "pin", prefixIcon: () => h(TIcon, { name: "pin", size: "16px" }) });
  options.push(
    { content: t("menu.renameSession"), value: "rename", prefixIcon: () => h(TIcon, { name: "edit-1", size: "16px" }) },
    { content: t("menu.clearMessages"), value: "clearMessages", prefixIcon: () => h(TIcon, { name: "clear", size: "16px" }) },
    { content: t("menu.batchManage"), value: "batchManage", prefixIcon: () => h(TIcon, { name: "queue", size: "16px" }) },
    { content: t("upload.deleteRecord"), value: "delete", theme: "error", prefixIcon: () => h(TIcon, { name: "delete", size: "16px" }) },
  );
  return options;
};

const updateSessionInBuckets = (sessionId: string, patch: Partial<{ is_pinned: boolean; pinned_at: string | null; title: string; isNoTitle?: boolean }>) => {
  const next: Record<string, SidebarSessionBucket> = {};
  for (const [key, bucket] of Object.entries(sessionBuckets.value)) {
    next[key] = { ...bucket, items: bucket.items.map((row) => row.id === sessionId ? { ...row, ...patch } : row) };
  }
  sessionBuckets.value = next;
  syncMenuStoreFromBuckets();
};
const renameSessionTitle = async (item: any, title: string) => {
  try { await renameSession(item.id, title, item.description || ""); MessagePlugin.success(t("menu.renameSessionSuccess")); }
  catch { MessagePlugin.error(t("menu.renameSessionFailed")); }
};
const togglePin = (item: any, pin: boolean) => {
  if (pinningIds.value.has(item.id)) return;
  pinningIds.value.add(item.id);
  setSessionPinned(item.id, pin)
    .catch(() => MessagePlugin.error(pin ? t("menu.pinFailed") : t("menu.unpinFailed")))
    .finally(() => pinningIds.value.delete(item.id));
};
const clearMessages = (item: any) => {
  clearSession(item.id)
    .then((started) => { if (started) MessagePlugin.success(t("menu.clearMessagesSuccess")); })
    .catch(() => MessagePlugin.error(t("menu.clearMessagesFailed")));
};
const delCard = (item: any) => { removeSession(item.id).catch(() => MessagePlugin.error(t("chat.deleteSessionFailed"))); };

const debounce = (fn: (...args: any[]) => void, delay: number) => {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: any[]) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
};
const mapSessionRow = (item: any) => ({
  title: item.title ? item.title : t("menu.newSession"),
  path: `chat/${item.id}`,
  id: item.id,
  isMore: false,
  isNoTitle: item.title ? false : true,
  created_at: item.created_at,
  updated_at: item.updated_at,
  is_pinned: !!item.is_pinned,
  pinned_at: item.pinned_at || null,
  im_platform: item.im_platform || "",
  description: item.description || "",
  user_id: item.user_id || "",
});
const syncMenuStoreFromBuckets = () => {
  usemenuStore.clearMenuArr();
  const flat = flattenBucketItems(sessionBuckets.value, bucketOrder.value);
  flat.forEach((item) => usemenuStore.updatemenuArr(item));
  total.value = flat.length;
};
const menuChildToSessionRow = (item: Record<string, unknown>): SessionForGrouping & { path: string } => {
  const id = String(item.id);
  return {
    id,
    path: typeof item.path === "string" ? item.path : `chat/${id}`,
    title: typeof item.title === "string" ? item.title : undefined,
    is_pinned: !!item.is_pinned,
    created_at: typeof item.created_at === "string" ? item.created_at : undefined,
    updated_at: typeof item.updated_at === "string" ? item.updated_at : undefined,
    im_platform: typeof item.im_platform === "string" ? item.im_platform : "",
    description: typeof item.description === "string" ? item.description : "",
    user_id: typeof item.user_id === "string" ? item.user_id : "",
  };
};
const sessionExistsInBuckets = (sessionId: string) => Object.values(sessionBuckets.value).some((bucket) => bucket.items.some((row) => row.id === sessionId));
const ensureSessionInSidebar = (sessionId: string) => {
  if (!sessionId || sessionExistsInBuckets(sessionId)) return;
  const web = sessionBuckets.value.web;
  if (!web) return;
  const chatMenu = (menuArr.value as unknown as MenuItem[]).find((item) => item.path === "creatChat");
  const fromStore = (chatMenu?.children as Record<string, unknown>[] | undefined)?.find((item) => item.id === sessionId);
  if (!fromStore) return;
  sessionBuckets.value = { ...sessionBuckets.value, web: prependSessionToWebBucket(web, menuChildToSessionRow(fromStore)) };
  total.value = flattenBucketItems(sessionBuckets.value, bucketOrder.value).length;
};

const rebuildBucketDefinitions = () => buildBucketDefinitions(
  imPlatforms.value,
  embedChannelNames.value,
  { web: t("menu.myChats"), imPlatform: (platform) => t(`agentEditor.im.${platform}`), embedChannel: (name) => name, api: t("menu.apiChats") },
  { includeAdminChannelBuckets: authStore.hasRole("admin") },
);
const probeChannelBucketCounts = async (keys: string[], token: number) => {
  const targets = keys.filter((key) => isChannelBucketKey(key));
  await Promise.all(targets.map(async (key) => {
    const bucket = sessionBuckets.value[key];
    if (!bucket) return;
    try {
      const res: any = await getSessionsList(1, 1, bucket.apiSource);
      if (token !== bucketRequestToken) return;
      sessionBuckets.value = { ...sessionBuckets.value, [key]: applyBucketCountProbe(bucket, res?.total ?? 0) };
    } catch {
      if (token !== bucketRequestToken) return;
      sessionBuckets.value = { ...sessionBuckets.value, [key]: applyBucketCountProbe(bucket, 0) };
    }
  }));
};
const loadBucketPage = async (key: string, page?: number, token?: number) => {
  const activeToken = token ?? bucketRequestToken;
  const bucket = sessionBuckets.value[key];
  if (!bucket || bucket.loading) return;
  const nextPage = page ?? bucket.page + 1;
  sessionBuckets.value = { ...sessionBuckets.value, [key]: { ...bucket, loading: true } };
  try {
    const res: any = await getSessionsList(nextPage, SIDEBAR_BUCKET_PAGE_SIZE, bucket.apiSource);
    if (activeToken !== bucketRequestToken) return;
    if (res?.success === false) throw new Error("session list load failed");
    const rows = (res?.data || []).map((item: any) => mapSessionRow(item));
    const current = sessionBuckets.value[key];
    sessionBuckets.value = { ...sessionBuckets.value, [key]: mergeBucketPage(current, rows, res?.total ?? rows.length, nextPage) };
    syncMenuStoreFromBuckets();
    await refreshSessionListScrollability();
  } catch {
    if (activeToken !== bucketRequestToken) return;
    const current = sessionBuckets.value[key];
    sessionBuckets.value = { ...sessionBuckets.value, [key]: { ...current, loading: false, loaded: true } };
    if (batchMode.value && key === activeSessionBucketKey.value) MessagePlugin.error(t("batchManage.loadFailed"));
  }
};
const switchSessionBucket = async (key: string) => {
  if (batchMode.value) return;
  if (key === activeSessionBucketKey.value) return;
  activeSessionBucketKey.value = key;
  const bucket = sessionBuckets.value[key];
  if (bucket && !bucket.loaded && !bucket.loading) await loadBucketPage(key, 1);
  await ensureBucketFillsViewport(key);
  await refreshSessionListScrollability();
};
const syncActiveBucketFromChat = async (sessionId: string | undefined) => {
  if (!sessionId) return;
  let bucketKey = findSessionBucketKey(sessionBuckets.value, sessionId);
  if (!bucketKey) {
    const chatMenu = (menuArr.value as unknown as MenuItem[]).find((item) => item.path === "creatChat");
    const fromStore = (chatMenu?.children as Record<string, unknown>[] | undefined)?.find((item) => item.id === sessionId);
    if (fromStore) bucketKey = originGroupKey(resolveSessionOrigin(menuChildToSessionRow(fromStore)));
  }
  if (!bucketKey) {
    try {
      const res: any = await getSession(sessionId);
      const candidate = originGroupKey(resolveSessionOrigin({
        id: sessionId,
        im_platform: res?.data?.im_platform || "",
        description: res?.data?.description || "",
        user_id: res?.data?.user_id || "",
      }));
      if (sessionBuckets.value[candidate]) bucketKey = candidate;
    } catch {}
  }
  if (!bucketKey || bucketKey === activeSessionBucketKey.value) return;
  activeSessionBucketKey.value = bucketKey;
  const bucket = sessionBuckets.value[bucketKey];
  if (bucket && !bucket.loaded && !bucket.loading) await loadBucketPage(bucketKey, 1);
};
const initSessionBuckets = async () => {
  const token = ++bucketRequestToken;
  sessionListBooting.value = true;
  const defs = rebuildBucketDefinitions();
  bucketOrder.value = defs.map((def) => def.key);
  const buckets: Record<string, SidebarSessionBucket> = {};
  for (const def of defs) buckets[def.key] = createEmptyBucket(def);
  sessionBuckets.value = buckets;
  const channelKeys = defs.map((def) => def.key).filter((key) => isChannelBucketKey(key));
  await Promise.all([loadBucketPage("web", 1, token), probeChannelBucketCounts(channelKeys, token)]);
  if (token === bucketRequestToken) {
    sessionListBooting.value = false;
    syncMenuStoreFromBuckets();
    await ensureBucketFillsViewport("web");
    await refreshSessionListScrollability();
  }
};
const getMessageList = async () => { await initSessionBuckets(); };
const checkScrollBottom = async () => {
  const container = scrollContainer.value;
  const key = activeSessionBucketKey.value;
  const bucket = sessionBuckets.value[key];
  if (!container || !bucket || !bucketHasMore(bucket) || bucket.loading) return;
  const { scrollTop, scrollHeight, clientHeight } = container;
  if (scrollHeight <= clientHeight + 1) {
    await ensureBucketFillsViewport(key);
    return;
  }
  if (scrollHeight - (scrollTop + clientHeight) < 100) await loadBucketPage(key);
};
const handleScroll = debounce(checkScrollBottom, 200);

async function loadCurrentKbInfo(kbId: string) {
  if (!kbId || !isInKnowledgeBase.value) {
    currentKbName.value = "";
    currentKbInfo.value = null;
    return;
  }
  const data = await chatResources.fetchKnowledgeBaseById(kbId);
  if (data) {
    currentKbName.value = data.name || "";
    currentKbInfo.value = data;
  } else currentKbInfo.value = null;
}
const loadSessionOriginMeta = async () => {
  if (authStore.isLiteMode) {
    imPlatforms.value = [];
    embedChannelNames.value = {};
    return;
  }
  try {
    const res: any = await listAllIMChannels();
    imPlatforms.value = configuredPlatforms(res?.data || []);
  } catch { imPlatforms.value = []; }
  try {
    const res: any = await listAllEmbedChannels();
    const names: Record<string, string> = {};
    for (const ch of res?.data || []) if (ch?.id && ch?.name) names[ch.id] = ch.name;
    embedChannelNames.value = names;
  } catch { embedChannelNames.value = {}; }
};
const handleSessionMutation = (event: Event) => {
  const detail = (event as CustomEvent<SessionMutationDetail>).detail;
  if (!detail?.sessionId) return;
  if (detail.patch) updateSessionInBuckets(detail.sessionId, { ...detail.patch, ...(detail.patch.title ? { isNoTitle: false } : {}) });
  if (detail.removed) {
    if (!batchConfirming.value && !batchDeleting.value) {
      batchSelectedIds.value = batchSelectedIds.value.filter((id) => id !== detail.sessionId);
    }
    sessionBuckets.value = removeSessionFromBuckets(sessionBuckets.value, detail.sessionId);
    syncMenuStoreFromBuckets();
    if (detail.sessionId === route.params.chatid) router.push("/platform/creatChat");
  }
};

onMounted(async () => {
  syncSidebarWithViewport();
  window.addEventListener("resize", syncSidebarWithViewport);
  const routeName = typeof route.name === "string" ? route.name : route.name ? String(route.name) : "";
  currentpath.value = routeName;
  if (route.params.chatid) currentSecondpath.value = `chat/${route.params.chatid}`;
  window.addEventListener(SESSION_MUTATION_EVENT, handleSessionMutation);
  await loadCurrentKbInfo((route.params as any)?.kbId as string);
  await loadSessionOriginMeta();
  await getMessageList();
  const initialChatId = route.params.chatid as string | undefined;
  if (initialChatId) {
    ensureSessionInSidebar(initialChatId);
    await syncActiveBucketFromChat(initialChatId);
  }
});
onUnmounted(() => {
  window.removeEventListener("resize", syncSidebarWithViewport);
  window.removeEventListener(SESSION_MUTATION_EVENT, handleSessionMutation);
  sidebarWasNarrow = false;
  sidebarPreferenceBeforeNarrow = null;
});
watch([() => route.name, () => route.params], (newvalue, oldvalue) => {
  const nameStr = typeof newvalue[0] === "string" ? newvalue[0] as string : newvalue[0] ? String(newvalue[0]) : "";
  currentpath.value = nameStr;
  if (newvalue[1].chatid) currentSecondpath.value = `chat/${newvalue[1].chatid}`;
  else currentSecondpath.value = "";
  const newChatId = (newvalue[1] as any)?.chatid as string | undefined;
  if (nameStr === "chat" && newChatId) {
    ensureSessionInSidebar(newChatId);
    void syncActiveBucketFromChat(newChatId);
  }
  if (newvalue[1].kbId !== oldvalue?.[1]?.kbId) loadCurrentKbInfo((newvalue[1] as any)?.kbId as string);
});

let pathPrefix = ref(route.name);
const menuIconName = (path: string) => {
  switch (path) {
    case "creatChat": return "chat-add";
    case "knowledge-bases": return "folder";
    case "settings": return "setting";
    case "logout": return "logout";
    default: return "chat";
  }
};
const handleMenuClick = async (path: string) => {
  if (path === "knowledge-bases") {
    const kbId = await getCurrentKbId();
    if (kbId) router.push(`/platform/knowledge-bases/${kbId}`);
    else router.push("/platform/knowledge-bases");
  } else if (path === "settings") {
    uiStore.openSettings();
    router.push("/platform/settings");
  } else gotopage(path);
};
const handleLogout = () => { gotopage("logout"); };
void handleLogout;
const getCurrentKbId = async (): Promise<string | null> => {
  const kbId = (route.params as any)?.kbId as string;
  if (isInKnowledgeBase.value && kbId) return kbId;
  return null;
};
const gotopage = async (path: string) => {
  pathPrefix.value = path;
  if (path === "logout") {
    try { await logoutApi(); } catch (error) { console.error("注销API调用失败:", error); }
    authStore.logout();
    MessagePlugin.success(t("menu.logoutSuccess"));
    handoffToExternalAuth("logout");
    return;
  }
  if (path === "creatChat") router.push("/platform/creatChat");
  else router.push(`/platform/${path}`);
};
const mouseenteMenu = (_path: string) => {};
const mouseleaveMenu = (_path: string) => {};

const onDragHandleMouseDown = (e: MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX;
  const expandThreshold = 40;
  const onMouseMove = (ev: MouseEvent) => {
    if (ev.clientX - startX > expandThreshold) {
      if (sidebarWasNarrow) uiStore.sidebarCollapsed = false;
      else uiStore.expandSidebar();
      cleanup();
    }
  };
  const onMouseUp = () => cleanup();
  const cleanup = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};
</script>

<style scoped lang="less">
.visual-sidebar {
  --sidebar-w: 256px;
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  height: 100%;
  min-height: 0;
  padding: 10px 8px 8px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  border-right: 1px solid #e5e7eb;
  background: #f7f7f7;
  color: #374151;
  transition: width 160ms ease, min-width 160ms ease;
}

.visual-sidebar.is-collapsed {
  --sidebar-w: 64px;
  padding-inline: 6px;
  overflow: visible;
}

:global(html.wails-desktop) .visual-sidebar { padding-top: 30px; }

.visual-sidebar__header {
  flex: 0 0 48px;
  height: 48px;
  padding: 0 4px 0 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.visual-sidebar__brand {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #111827;
}

.visual-sidebar__mark {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #111827;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.visual-sidebar__brand strong {
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visual-sidebar__header-actions { display: flex; gap: 2px; }
.visual-sidebar__icon-button,
.visual-sidebar__rail-button {
  width: 30px;
  height: 30px;
  padding: 7px;
  border: 0;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
}
.visual-sidebar__icon-button:hover,
.visual-sidebar__rail-button:hover { background: #ececec; color: #374151; }
.visual-sidebar__icon-button :deep(.t-icon),
.visual-sidebar__rail-button :deep(.t-icon) { font-size: 14px; }

.visual-sidebar__collapsed-top,
.visual-sidebar__rail-search {
  display: flex;
  justify-content: center;
  padding: 8px 0 3px;
}

.visual-sidebar__drag-handle {
  position: absolute;
  top: 0;
  right: -3px;
  z-index: 20;
  width: 6px;
  height: 100%;
  cursor: ew-resize;
}
.visual-sidebar__drag-handle:hover { background: rgb(17 24 39 / 6%); }

.visual-sidebar__scroll {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.visual-sidebar__scroll:hover { scrollbar-color: #d1d5db transparent; }

.visual-sidebar__nav {
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.visual-sidebar__nav-item {
  width: 100%;
  min-height: 36px;
  padding: 7px 8px;
  border: 0;
  border-radius: 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  background: transparent;
  color: #4b5563;
  font: inherit;
  font-size: 11px;
  line-height: 17px;
  text-align: left;
  cursor: pointer;
}
.visual-sidebar__nav-item:hover { background: #ececec; color: #111827; }
.visual-sidebar__nav-item.is-active { background: #e9e9e9; color: #111827; font-weight: 650; }
.visual-sidebar.is-collapsed .visual-sidebar__nav-item { justify-content: center; padding-inline: 0; }
.visual-sidebar__nav-icon { flex: 0 0 20px; width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; color: #6b7280; }
.visual-sidebar__nav-icon :deep(.t-icon) { font-size: 15px; }
.visual-sidebar__nav-label { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.visual-sidebar__sessions { margin-top: 9px; padding: 0 4px 10px; }
.visual-sidebar__session-scope { min-height: 30px; margin-bottom: 4px; display: flex; align-items: center; justify-content: flex-end; }
.visual-sidebar__session-list { min-width: 0; }
.visual-sidebar__session-group + .visual-sidebar__session-group { margin-top: 9px; }
.visual-sidebar__session-group > h4 { margin: 0; padding: 5px 8px 3px; color: #9ca3af; font-size: 9px; line-height: 14px; font-weight: 600; }
.visual-sidebar__session-row { border-radius: 8px; }
.visual-sidebar__session-row.is-active { background: #ececec; }
.visual-sidebar__session-row.is-selected { background: #e5e7eb; }
.visual-sidebar__session-skeletons { display: flex; flex-direction: column; gap: 4px; }
.visual-sidebar__session-skeleton { min-height: 32px; padding: 8px; box-sizing: border-box; }
.visual-sidebar__empty { padding: 18px 8px; color: #9ca3af; font-size: 10px; text-align: center; }
.visual-sidebar__loading-more { min-height: 34px; display: flex; align-items: center; justify-content: center; color: #9ca3af; }

.visual-sidebar__batch-footer {
  flex: 0 0 auto;
  margin: 6px 4px;
  padding: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fff;
}
.visual-sidebar__batch-footer > div { display: flex; gap: 5px; }
.visual-sidebar__batch-button { min-height: 28px; padding: 4px 7px; border: 0; border-radius: 7px; display: inline-flex; align-items: center; gap: 4px; background: transparent; color: #6b7280; font: inherit; font-size: 9px; cursor: pointer; }
.visual-sidebar__batch-button:hover { background: #f3f4f6; color: #374151; }
.visual-sidebar__batch-button.is-danger { color: #dc2626; }
.visual-sidebar__batch-button:disabled { opacity: .45; cursor: default; }

.visual-sidebar__footer {
  flex: 0 0 auto;
  margin-top: 7px;
  padding: 8px 2px 0;
  border-top: 1px solid #e5e7eb;
}

.visual-sidebar__shortcut-tip { display: inline-flex; align-items: center; gap: 8px; }
.visual-sidebar__shortcut-tip kbd { padding: 1px 5px; border: 1px solid rgb(255 255 255 / 20%); border-radius: 5px; font: inherit; font-size: 9px; }

@media (max-width: 760px) {
  .visual-sidebar { --sidebar-w: 64px; padding-inline: 6px; }
  .visual-sidebar:not(.is-collapsed) { --sidebar-w: 256px; position: absolute; inset: 0 auto 0 0; z-index: 1000; box-shadow: 12px 0 36px rgb(15 23 42 / 14%); }
}

@media (prefers-reduced-motion: reduce) {
  .visual-sidebar { transition: none !important; }
}
</style>
