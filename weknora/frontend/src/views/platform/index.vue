<template>
  <div class="main musuw-workspace-surface" ref="dropzone" @keydown.esc="closeMobileNavigation">
    <Menu @click.capture="handleMobileNavigationClick"></Menu>
    <button v-if="mobileNavigationOpen" class="visual-mobile-backdrop" :aria-label="t('menu.collapseSidebar')" @click="closeMobileNavigation" />
    <header class="visual-mobile-header" :inert="mobileNavigationOpen">
      <button ref="mobileMenuButton" type="button" :aria-label="t('menu.expandSidebar')" :aria-expanded="mobileNavigationOpen" @click="uiStore.sidebarCollapsed = false"><t-icon name="view-list" /></button>
      <img src="/musuw-logo.png" alt="Musuw" />
      <button type="button" :aria-label="t('menu.newChat')" @click="router.push('/platform/creatChat')"><t-icon name="chat-add" /></button>
    </header>
    <div v-if="isRouterAlive" class="platform-route-outlet" :inert="mobileNavigationOpen">
      <RouterView />
    </div>
    <div class="upload-mask" v-show="ismask">
      <UploadMask></UploadMask>
    </div>
    <!-- The dedicated settings route mounts Settings in RouterView. All other
         platform routes share this modal instance, so only one dialog exists. -->
    <Settings v-if="route.path !== '/platform/settings'" />
    <!-- 全局命令面板 (⌘K)，随 platform 路由存活 -->
    <GlobalCommandPalette />
    <!-- NewUserGuide owns the contextual guide and the invitation bell. Keep
         one mounted instance so the bell is not rendered twice. -->
    <NewUserGuide />
  </div>
</template>
<script setup lang="ts">
import Menu from "@/components/menu.vue";
import { computed, ref, onMounted, onUnmounted, nextTick, provide, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import UploadMask from "@/components/upload-mask.vue";
import Settings from "@/views/settings/Settings.vue";
import GlobalCommandPalette from "@/components/GlobalCommandPalette.vue";
import { useCommandPaletteStore } from "@/stores/commandPalette";
import { useChatResourcesStore } from "@/stores/chatResources";
import { getKnowledgeBaseById, listKnowledgeFolders } from "@/api/knowledge-base/index";
import { MessagePlugin } from "tdesign-vue-next";
import { useI18n } from "vue-i18n";
import NewUserGuide from '@/components/NewUserGuide.vue'
import { collectDroppedFiles } from './collectDroppedFiles'
import { isKnowledgeBaseRuntimeReady } from '@/utils/knowledgeBaseRuntime'
import { getCurrentEntitlement } from '@/api/entitlement'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { useConsumerUpgradePrompt } from '@/hooks/useConsumerUpgradePrompt'
import { partitionFilesForConsumerPlan } from '@/views/knowledge/utils/uploadSources'
import {
  exceedsConsumerDocumentLimit,
  exceedsConsumerStorageQuota,
} from '@/utils/consumerUploadLimits'

const route = useRoute();
const router = useRouter();
const commandPaletteStore = useCommandPaletteStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const dropzone = ref<HTMLElement | null>(null);
const mobileViewport = window.matchMedia('(max-width: 760px)');
const isMobileViewport = ref(mobileViewport.matches);
const mobileMenuButton = ref<HTMLButtonElement | null>(null);
const mobileNavigationOpen = computed(() => isMobileViewport.value && !uiStore.sidebarCollapsed);
const syncMobileViewport = () => { isMobileViewport.value = mobileViewport.matches; };
const closeMobileNavigation = () => {
  if (!mobileNavigationOpen.value) return;
  // The sidebar already restores the desktop preference when leaving this
  // breakpoint. Do not persist a phone drawer action as a desktop preference.
  uiStore.sidebarCollapsed = true;
  nextTick(() => mobileMenuButton.value?.focus({ preventScroll: true }));
};
const handleMobileNavigationClick = (event: MouseEvent) => {
  if (event.target instanceof Element && event.target.closest('.visual-sidebar__primary, .visual-sidebar__brand')) closeMobileNavigation();
};
watch(mobileNavigationOpen, (open) => {
  if (open) nextTick(() => dropzone.value?.querySelector<HTMLButtonElement>('.visual-sidebar__brand')?.focus({ preventScroll: true }));
});
watch(() => route.fullPath, closeMobileNavigation);
onMounted(() => mobileViewport.addEventListener('change', syncMobileViewport));
onUnmounted(() => mobileViewport.removeEventListener('change', syncMobileViewport));
const showConsumerUpgradePrompt = useConsumerUpgradePrompt();
let ismask = ref(false);
const { t } = useI18n();

const isRouterAlive = ref(true);
const reloadApp = () => {
  isRouterAlive.value = false;
  nextTick(() => {
    isRouterAlive.value = true;
  });
};
provide("app:reload", reloadApp);

// 仅在 Wails 桌面端运行时拦截 Cmd/Ctrl+R：
// 桌面端没有浏览器地址栏，整页重载会白屏，所以用前端软刷新替代。
// 浏览器（含 Web 版 / 非 Lite 部署）里不拦截，交给浏览器做真正的整页刷新，
// 否则会出现左侧菜单、全局设置、Pinia store 等不随"刷新"一起重置的问题。
// @ts-ignore
const isWailsDesktop = typeof window !== "undefined" && !!(window as any).runtime?.EventsOn;

const handleGlobalKeyDown = (e: KeyboardEvent) => {
  if (!isWailsDesktop) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") {
    e.preventDefault();
    reloadApp();
  }
};

// 用于跟踪拖拽进入/离开的计数器，解决子元素触发 dragleave 的问题
let dragCounter = 0;

// 获取当前知识库ID
const getCurrentKbId = (): string | null => {
  return ((route.params as any)?.kbId as string) || null;
};

const CHAT_DROP_ROUTE_NAMES = new Set(["chat", "globalCreatChat", "kbCreatChat"]);

const isChatDropRoute = () => {
  return CHAT_DROP_ROUTE_NAMES.has(String(route.name || ""));
};

// 检查知识库初始化状态
const checkKnowledgeBaseInitialization = async (): Promise<boolean> => {
  const currentKbId = getCurrentKbId();

  if (!currentKbId) {
    MessagePlugin.error(t("knowledgeBase.missingId"));
    return false;
  }

  try {
    const kbResponse = await getKnowledgeBaseById(currentKbId);
    const kb = kbResponse.data;

    if (!isKnowledgeBaseRuntimeReady(kb)) {
      MessagePlugin.warning(t("knowledgeBase.notInitialized"));
      return false;
    }
    return true;
  } catch (error) {
    MessagePlugin.error(t("knowledgeBase.getInfoFailed"));
    return false;
  }
};

// isFileDrag distinguishes an OS file drag (the only thing the global upload
// drop zone cares about) from an in-app element drag such as the wiki
// folder/page drag-and-drop. Element drags carry only "text/*" types, never
// "Files", so we bail out and let the originating component handle the drop.
const isFileDrag = (event: DragEvent): boolean => {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
};

// 全局拖拽事件处理
const handleGlobalDragEnter = (event: DragEvent) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragCounter++;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "all";
  }
  ismask.value = true;
};

const handleGlobalDragOver = (event: DragEvent) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
};

const handleGlobalDragLeave = (event: DragEvent) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    ismask.value = false;
  }
};

const handleGlobalDrop = async (event: DragEvent) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragCounter = 0;
  ismask.value = false;

  const droppedFiles = await collectDroppedFiles(event);
  if (droppedFiles.length === 0) {
    MessagePlugin.warning(t("knowledgeBase.dragFileNotText"));
    return;
  }

  if (isChatDropRoute()) {
    event.stopPropagation();
    window.dispatchEvent(
      new CustomEvent("weknora:chat-file-drop", {
        detail: { files: droppedFiles },
      }),
    );
    return;
  }

  const isInitialized = await checkKnowledgeBaseInitialization();
  if (!isInitialized) {
    return;
  }

  let filesToDispatch = droppedFiles;
  let blockedVideoCount = 0;
  let blockingUpgradeBody: string | null = null;
  if (authStore.isLiteMode) {
    const restricted = partitionFilesForConsumerPlan(droppedFiles, { videoUpload: false });
    try {
      const entitlement = (await getCurrentEntitlement()).data;
      if (entitlement.video_upload !== true) {
        filesToDispatch = restricted.allowedFiles;
        blockedVideoCount = restricted.blockedVideoFiles.length;
      }

      if (filesToDispatch.length > 0 && exceedsConsumerStorageQuota(entitlement, filesToDispatch)) {
        filesToDispatch = [];
        blockingUpgradeBody = String(t('entitlement.storageQuotaUpgradeBody'));
      } else if (filesToDispatch.length > 0 && entitlement.max_documents_per_kb > 0) {
        const kbId = getCurrentKbId();
        if (kbId) {
          try {
            const folders: any = await listKnowledgeFolders(kbId);
            const count = folders?.data?.total_document_count ?? folders?.total_document_count;
            if (exceedsConsumerDocumentLimit(entitlement, Number(count), filesToDispatch.length)) {
              filesToDispatch = [];
              blockingUpgradeBody = String(t('entitlement.freeDocumentLimit'));
            }
          } catch {
            // The page-level upload handler repeats this guard and remains the
            // source of truth when the lightweight preflight cannot load.
          }
        }
      }
    } catch {
      filesToDispatch = restricted.allowedFiles;
      MessagePlugin.error(t('entitlement.usageUnavailable'));
    }
  }

  if (filesToDispatch.length > 0) {
    window.dispatchEvent(
      new CustomEvent("weknora:knowledge-file-drop", {
        detail: { kbId: getCurrentKbId(), files: filesToDispatch },
      }),
    );
  }
  if (blockingUpgradeBody) {
    showConsumerUpgradePrompt(blockingUpgradeBody);
  } else if (blockedVideoCount > 0) {
    const body = filesToDispatch.length > 0
      ? t('entitlement.videoMixedUpgradeBody', {
        allowed: filesToDispatch.length,
        blocked: blockedVideoCount,
      })
      : t('entitlement.videoUploadUpgradeBody');
    showConsumerUpgradePrompt(String(body));
  }
};

// 组件挂载时添加全局事件监听器
onMounted(() => {
  document.addEventListener("dragenter", handleGlobalDragEnter, true);
  document.addEventListener("dragover", handleGlobalDragOver, true);
  document.addEventListener("dragleave", handleGlobalDragLeave, true);
  document.addEventListener("drop", handleGlobalDrop, true);
  if (isWailsDesktop) {
    window.addEventListener("keydown", handleGlobalKeyDown);
    // @ts-ignore
    window.runtime.EventsOn("app:reload", () => {
      reloadApp();
    });
  }
  // 支持通过 URL 查询参数打开全局命令面板，例如旧路径
  // /platform/knowledge-search?q=foo 重定向后携带 ?cmdk=foo
  maybeOpenCmdkFromRoute();
  // 后台预取对话输入栏资源，进入 creatChat / chat 时复用缓存
  void useChatResourcesStore().prefetchChatInput();
});

// 监听路由变化，兼容 SPA 内部跳转时的 ?cmdk= 参数
watch(
  () => route.query.cmdk,
  () => {
    maybeOpenCmdkFromRoute();
  },
);

function maybeOpenCmdkFromRoute() {
  if (!("cmdk" in route.query)) return;
  const q = String(route.query.cmdk ?? "");
  commandPaletteStore.openPalette(q);
  // 清除 query，避免回退/刷新时反复触发
  const newQuery = { ...route.query };
  delete (newQuery as any).cmdk;
  router.replace({ path: route.path, query: newQuery, hash: route.hash });
}

// 组件卸载时移除全局事件监听器
onUnmounted(() => {
  document.removeEventListener("dragenter", handleGlobalDragEnter, true);
  document.removeEventListener("dragover", handleGlobalDragOver, true);
  document.removeEventListener("dragleave", handleGlobalDragLeave, true);
  document.removeEventListener("drop", handleGlobalDrop, true);
  if (isWailsDesktop) {
    window.removeEventListener("keydown", handleGlobalKeyDown);
    // @ts-ignore
    if (window.runtime?.EventsOff) {
      // @ts-ignore
      window.runtime.EventsOff("app:reload");
    }
  }
  dragCounter = 0;
});
</script>
<style lang="less">
.main {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  /* Shell only: the feature routes keep their own data layout, inside a quiet Musuw canvas. */
  background: var(--musuw-canvas);
}

/* 右侧路由区：占满剩余宽度与整列高度，并把 min-height:0 传给子页面以便内部 flex 滚动 */
.platform-route-outlet {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--musuw-surface);
}

.upload-mask {
  background-color: color-mix(in srgb, var(--musuw-surface) 88%, transparent);
  position: fixed;
  width: 100%;
  height: 100%;
  z-index: 999;
  display: flex;
  justify-content: center;
  align-items: center;
}

img {
  -webkit-user-drag: none;
  -khtml-user-drag: none;
  -moz-user-drag: none;
  -o-user-drag: none;
  user-drag: none;
}

/* Keep the shell inside the viewport on compact screens. Sidebar and route
   interaction contracts stay unchanged; only the outer canvas is allowed to
   shrink instead of forcing a 600px horizontal layout. */
@media (max-width: 760px) {
  .main {
    min-width: 0;
    overflow-x: hidden;
  }

  .platform-route-outlet {
    min-width: 0;
  }
}
</style>
