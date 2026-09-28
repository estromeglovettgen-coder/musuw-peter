<template>
  <div v-if="visible" ref="menuRef" class="visual-mention-menu" :style="style" @click.stop>
    <div ref="listRef" class="visual-mention-list" @scroll="onScroll">
      <template v-if="!currentGroupType && !isFlatMode">
        <button
          v-for="(group, index) in groupRows"
          :key="group.type"
          type="button"
          class="visual-mention-group-entry"
          :class="{ 'is-active': index === groupActiveIndex }"
          @click.stop="enterGroup(group.type)"
          @mouseenter="groupActiveIndex = index"
        >
          <span class="visual-mention-group-entry__icon"><t-icon :name="group.icon" /></span>
          <span class="visual-mention-group-entry__label">{{ group.label }}</span>
          <span class="visual-mention-group-entry__count">{{ formatGroupCount(group) }}</span>
          <t-icon name="chevron-right" class="visual-mention-group-entry__arrow" />
        </button>
        <div v-if="groupRows.length === 0 && !loading" class="visual-mention-empty">
          {{ emptyHint || $t('common.noResult') }}
        </div>
      </template>

      <template v-else>
        <button v-if="!isFlatMode" type="button" class="visual-mention-back" @click.stop="leaveGroup">
          <t-icon name="chevron-left" />
          <span>{{ currentGroup?.label }}</span>
        </button>

        <div v-if="isFlatMode && groupTabs.length > 1 && kbItems.length > 0" class="visual-mention-section-label">
          {{ $t('common.knowledgeBase') }}
        </div>
        <div
          v-if="(isFlatMode || currentGroupType === 'kb') && kbItems.length > 0"
          class="visual-mention-group"
          data-group-type="kb"
        >
          <t-popup
            v-for="(item, index) in kbItems"
            :key="item.id"
            placement="right-start"
            trigger="hover"
            :show-arrow="false"
            :delay="[320, 80]"
            :disabled="isScrolling"
            overlay-class-name="visual-mention-detail-popup"
            @visible-change="(v: boolean) => v && fetchKbDetail(item)"
          >
            <button
              type="button"
              class="visual-mention-item"
              :class="{ 'is-active': index === activeIndex }"
              @click="$emit('select', item)"
              @mouseenter="$emit('update:activeIndex', index)"
            >
              <span class="visual-mention-item__icon" :class="{ 'is-faq': item.kbType === 'faq' }">
                <t-icon :name="item.kbType === 'faq' ? 'chat-bubble-help' : 'folder'" />
              </span>
              <span class="visual-mention-item__copy">
                <strong :title="item.name">{{ item.name }}</strong>
                <small>{{ item.count || 0 }}</small>
              </span>
            </button>
            <template #content>
              <div class="visual-mention-detail">
                <div v-if="detailCache[item.id]?.loading" class="visual-mention-detail__loading"><t-loading size="small" /></div>
                <div v-else-if="detailCache[item.id]?.error" class="visual-mention-detail__error">{{ detailCache[item.id].error }}</div>
                <template v-else-if="detailCache[item.id]?.data">
                  <div class="visual-mention-detail__header">
                    <strong>{{ detailCache[item.id].data.name }}</strong>
                    <span>{{ detailCache[item.id].data.type === 'faq' ? $t('knowledgeEditor.basic.typeFAQ') : $t('knowledgeEditor.basic.typeDocument') }}</span>
                  </div>
                  <p v-if="detailCache[item.id].data.description">{{ detailCache[item.id].data.description }}</p>
                  <div class="visual-mention-detail__meta">
                    <span>
                      {{ detailCache[item.id].data.type === 'faq'
                        ? $t('mentionDetail.faqCount', { count: detailCache[item.id].data.chunk_count ?? detailCache[item.id].data.count ?? 0 })
                        : $t('mentionDetail.kbCount', { count: detailCache[item.id].data.knowledge_count ?? detailCache[item.id].data.count ?? 0 }) }}
                    </span>
                    <button
                      v-if="detailCache[item.id].data.org_name || item.orgName"
                      type="button"
                      @click.stop="handleOrgClick(detailCache[item.id].data.org_name || item.orgName)"
                    >
                      {{ $t('mentionDetail.belongsToOrg') }} {{ detailCache[item.id].data.org_name || item.orgName }}
                    </button>
                    <span v-if="agentIdForDetail && (detailCache[item.id].data.org_name || item.orgName)" class="is-readonly">
                      {{ $t('mentionDetail.readOnlyFromAgent') }}
                    </span>
                  </div>
                </template>
              </div>
            </template>
          </t-popup>
        </div>

        <template v-for="group in activeExtraGroups" :key="group.type">
          <div v-if="isFlatMode && groupTabs.length > 1" class="visual-mention-section-label">{{ group.label }}</div>
          <div class="visual-mention-group" :data-group-type="group.type">
            <t-popup
              v-for="(item, index) in group.items"
              :key="`${item.type}:${item.id}`"
              placement="right-start"
              trigger="hover"
              :show-arrow="false"
              :delay="[320, 80]"
              :disabled="isScrolling"
              overlay-class-name="visual-mention-detail-popup"
            >
              <button
                type="button"
                class="visual-mention-item"
                :class="{ 'is-active': group.offset + index === activeIndex }"
                @click="$emit('select', item)"
                @mouseenter="$emit('update:activeIndex', group.offset + index)"
              >
                <span class="visual-mention-item__icon"><t-icon :name="group.icon" /></span>
                <span class="visual-mention-item__copy"><strong :title="item.name">{{ item.name }}</strong></span>
              </button>
              <template #content>
                <div class="visual-mention-detail">
                  <div class="visual-mention-detail__header"><strong>{{ item.name }}</strong></div>
                  <p v-if="item.description">{{ item.description }}</p>
                  <div class="visual-mention-detail__meta">
                    <button v-if="item.kbName" type="button" @click.stop="handleKbClick(item.kbId)">
                      {{ $t('mentionDetail.belongsToKb') }} {{ item.kbName }}
                    </button>
                    <span v-if="item.serviceName">MCP：{{ item.serviceName }}</span>
                  </div>
                </div>
              </template>
            </t-popup>
          </div>
        </template>

        <div v-if="isFlatMode && groupTabs.length > 1 && fileItems.length > 0" class="visual-mention-section-label">
          {{ $t('common.file') }}
        </div>
        <div
          v-if="(isFlatMode || currentGroupType === 'file') && fileItems.length > 0"
          class="visual-mention-group"
          data-group-type="file"
        >
          <t-popup
            v-for="(item, index) in fileItems"
            :key="item.id"
            placement="right-start"
            trigger="hover"
            :show-arrow="false"
            :delay="[320, 80]"
            :disabled="isScrolling"
            overlay-class-name="visual-mention-detail-popup"
            @visible-change="(v: boolean) => v && fetchFileDetail(item)"
          >
            <button
              type="button"
              class="visual-mention-item"
              :class="{ 'is-active': fileGroupOffset + index === activeIndex }"
              @click="$emit('select', item)"
              @mouseenter="$emit('update:activeIndex', fileGroupOffset + index)"
            >
              <span class="visual-mention-item__icon"><t-icon name="file" /></span>
              <span class="visual-mention-item__copy"><strong :title="item.name">{{ item.name }}</strong></span>
            </button>
            <template #content>
              <div class="visual-mention-detail">
                <div v-if="detailCache[item.id]?.loading" class="visual-mention-detail__loading"><t-loading size="small" /></div>
                <div v-else-if="detailCache[item.id]?.error" class="visual-mention-detail__error">{{ detailCache[item.id].error }}</div>
                <template v-else-if="detailCache[item.id]?.data">
                  <div class="visual-mention-detail__header">
                    <strong>{{ detailCache[item.id].data.title || detailCache[item.id].data.file_name || item.name }}</strong>
                  </div>
                  <p v-if="detailCache[item.id].data.description">{{ detailCache[item.id].data.description }}</p>
                  <div class="visual-mention-detail__meta">
                    <button
                      v-if="detailCache[item.id].data.knowledge_base_name || item.kbName"
                      type="button"
                      @click.stop="handleKbClick(detailCache[item.id].data.knowledge_base_id || (item as any).kbId)"
                    >
                      {{ $t('mentionDetail.belongsToKb') }} {{ detailCache[item.id].data.knowledge_base_name || item.kbName }}
                    </button>
                    <button v-if="item.orgName" type="button" @click.stop="handleOrgClick(item.orgName)">
                      {{ $t('mentionDetail.belongsToOrg') }} {{ item.orgName }}
                    </button>
                  </div>
                </template>
              </div>
            </template>
          </t-popup>
          <div v-if="loading" class="visual-mention-loading"><t-loading size="small" /></div>
        </div>

        <div v-if="items.length === 0 && !loading" class="visual-mention-empty">
          {{ emptyHint || $t('common.noResult') }}
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref, nextTick, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { getKnowledgeBaseById, getKnowledgeDetails } from "@/api/knowledge-base";
import { useOrganizationStore } from "@/stores/organization";
import { useSettingsStore } from "@/stores/settings";
import { SKILL_ICON, type MentionItem, type MentionItemType } from '@/types/mention';

type DetailState = { loading: boolean; error?: string; data?: any };

const props = defineProps<{
  visible: boolean;
  style: any;
  items: MentionItem[];
  activeIndex: number;
  hasMore?: boolean;
  loading?: boolean;
  emptyHint?: string;
  query?: string;
  groupCounts?: Partial<Record<MentionItemType, number>>;
}>();

const emit = defineEmits(["select", "update:activeIndex", "loadMore"]);
const router = useRouter();
const { t } = useI18n();
const orgStore = useOrganizationStore();
const settingsStore = useSettingsStore();
const menuRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const detailCache = ref<Record<string, DetailState>>({});
const isScrolling = ref(false);
const currentGroupType = ref<MentionItemType | null>(null);
const groupActiveIndex = ref(0);
let scrollTimer: ReturnType<typeof setTimeout> | null = null;

onBeforeUnmount(() => {
  if (scrollTimer) clearTimeout(scrollTimer);
});

const agentIdForDetail = computed(() => {
  const sourceTenantId = settingsStore.selectedAgentSourceTenantId;
  const agentId = settingsStore.selectedAgentId;
  return sourceTenantId && agentId ? agentId : undefined;
});
const agentSourceTenantIdForDetail = computed(() => settingsStore.selectedAgentSourceTenantId ?? undefined);

const kbItems = computed(() => props.items.filter((item) => item.type === "kb"));
const fileItems = computed(() => props.items.filter((item) => item.type === "file"));

const mentionGroupDefs = computed<Array<{ type: MentionItemType; label: string; icon: string }>>(() => [
  { type: "kb", label: t("common.knowledgeBase"), icon: "folder" },
  { type: "tag", label: "标签", icon: "tag" },
  { type: "mcp", label: "MCP", icon: "tools" },
  { type: "skill", label: t("common.skill"), icon: SKILL_ICON },
  { type: "file", label: t("common.file"), icon: "file" },
]);

const mentionGroups = computed(() => {
  let offset = 0;
  return mentionGroupDefs.value.map((def) => {
    const items = props.items.filter((item) => item.type === def.type);
    const loadedCount = items.length;
    const count = props.groupCounts?.[def.type] ?? loadedCount;
    const group = { ...def, items, offset, count, loadedCount };
    offset += items.length;
    return group;
  });
});

const formatGroupCount = (group: { type: MentionItemType; count: number; loadedCount: number }) => {
  if (props.groupCounts?.[group.type] != null) return props.groupCounts[group.type]!;
  if (group.type === "file" && props.hasMore) return `${group.loadedCount}+`;
  return group.count;
};

const groupTabs = computed(() => mentionGroups.value.filter((group) => group.count > 0));
const groupRows = computed(() => groupTabs.value);
const isFlatMode = computed(() => (props.query ?? "").trim().length > 0);
const currentGroup = computed(() => mentionGroups.value.find((group) => group.type === currentGroupType.value));
const extraGroups = computed(() => mentionGroups.value.filter((group) => group.type !== "kb" && group.type !== "file" && group.count > 0));
const activeExtraGroups = computed(() => isFlatMode.value ? extraGroups.value : extraGroups.value.filter((group) => group.type === currentGroupType.value));
const fileGroupOffset = computed(() => mentionGroups.value.find((group) => group.type === "file")?.offset || 0);

const enterGroup = (type: MentionItemType) => {
  const group = mentionGroups.value.find((item) => item.type === type && item.count > 0);
  if (!group || !listRef.value) return;
  currentGroupType.value = type;
  emit("update:activeIndex", group.offset);
  nextTick(() => listRef.value?.scrollTo({ top: 0 }));
};

const leaveGroup = () => {
  if (isFlatMode.value || !currentGroupType.value) return false;
  const rowIndex = groupRows.value.findIndex((group) => group.type === currentGroupType.value);
  groupActiveIndex.value = Math.max(0, rowIndex);
  currentGroupType.value = null;
  nextTick(() => { if (listRef.value) listRef.value.scrollTop = 0; });
  return true;
};

const updateActiveGroupFromIndex = (index: number) => {
  const group = groupTabs.value.find((item) => index >= item.offset && index < item.offset + item.count);
  if (group) currentGroupType.value = group.type;
};

watch(groupTabs, (groups) => {
  if (groupActiveIndex.value >= groups.length) groupActiveIndex.value = Math.max(0, groups.length - 1);
});

const moveActive = (delta: number) => {
  if (isFlatMode.value) {
    const next = Math.min(props.items.length - 1, Math.max(0, props.activeIndex + delta));
    emit("update:activeIndex", next);
    scrollToItem(next);
    return;
  }
  if (!currentGroupType.value) {
    const maxIndex = Math.max(0, groupRows.value.length - 1);
    groupActiveIndex.value = Math.min(maxIndex, Math.max(0, groupActiveIndex.value + delta));
    return;
  }
  const group = currentGroup.value;
  if (!group) return;
  const currentLocalIndex = props.activeIndex - group.offset;
  const nextLocalIndex = Math.min(group.count - 1, Math.max(0, currentLocalIndex + delta));
  emit("update:activeIndex", group.offset + nextLocalIndex);
  scrollToItem(nextLocalIndex);
};

const confirmActive = () => {
  if (isFlatMode.value) {
    const item = props.items[props.activeIndex];
    if (item) emit("select", item);
    return;
  }
  if (!currentGroupType.value) {
    const group = groupRows.value[groupActiveIndex.value];
    if (group) enterGroup(group.type);
    return;
  }
  const group = currentGroup.value;
  if (!group) return;
  const localIndex = props.activeIndex - group.offset;
  const item = group.items[localIndex];
  if (item) emit("select", item);
};

defineExpose({ moveActive, confirmActive, leaveGroup });

async function fetchKbDetail(item: { id: string }) {
  if (detailCache.value[item.id]?.data || detailCache.value[item.id]?.loading) return;
  detailCache.value = { ...detailCache.value, [item.id]: { loading: true } };
  try {
    const opts = agentIdForDetail.value ? { agent_id: agentIdForDetail.value, agent_source_tenant_id: agentSourceTenantIdForDetail.value } : undefined;
    const res: any = await getKnowledgeBaseById(item.id, opts);
    detailCache.value = { ...detailCache.value, [item.id]: { loading: false, data: res?.data ?? res } };
  } catch (e: any) {
    detailCache.value = { ...detailCache.value, [item.id]: { loading: false, error: e?.message || "Failed to load" } };
  }
}

async function fetchFileDetail(item: { id: string }) {
  if (detailCache.value[item.id]?.data || detailCache.value[item.id]?.loading) return;
  detailCache.value = { ...detailCache.value, [item.id]: { loading: true } };
  try {
    const opts = agentIdForDetail.value ? { agent_id: agentIdForDetail.value, agent_source_tenant_id: agentSourceTenantIdForDetail.value } : undefined;
    const res: any = await getKnowledgeDetails(item.id, opts);
    detailCache.value = { ...detailCache.value, [item.id]: { loading: false, data: res?.data ?? res } };
  } catch (e: any) {
    detailCache.value = { ...detailCache.value, [item.id]: { loading: false, error: e?.message || "Failed to load" } };
  }
}

function handleKbClick(kbId: string | undefined) {
  if (!kbId) return;
  router.push(`/platform/knowledge-bases/${kbId}`);
}

function handleOrgClick(orgName: string) {
  if (!orgName) return;
  const sharedKb = orgStore.sharedKnowledgeBases.find((s: any) => s.org_name === orgName);
  if (sharedKb?.organization_id) router.push("/platform/organizations");
  else router.push("/platform/organizations");
}

const onScroll = (e: Event) => {
  isScrolling.value = true;
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => { isScrolling.value = false; }, 150);
  const target = e.target as HTMLElement;
  const { scrollTop, scrollHeight, clientHeight } = target;
  if ((currentGroupType.value === "file" || isFlatMode.value) && scrollHeight - scrollTop - clientHeight < 50 && props.hasMore && !props.loading) {
    emit("loadMore");
  }
};

watch(() => props.activeIndex, (newIndex) => {
  if (isFlatMode.value) {
    scrollToItem(newIndex);
    return;
  }
  if (currentGroupType.value) {
    updateActiveGroupFromIndex(newIndex);
    const group = currentGroup.value;
    if (group) scrollToItem(newIndex - group.offset);
  }
});

watch(isFlatMode, (flat) => {
  if (flat) {
    currentGroupType.value = null;
    nextTick(() => { if (listRef.value) listRef.value.scrollTop = 0; });
  }
});

watch(() => props.visible, (newVisible) => {
  if (newVisible) {
    nextTick(() => {
      if (listRef.value) listRef.value.scrollTop = 0;
      currentGroupType.value = null;
      groupActiveIndex.value = 0;
    });
  }
});

const scrollToItem = (index: number) => {
  nextTick(() => {
    if (!listRef.value) return;
    const items = listRef.value.querySelectorAll(".visual-mention-item");
    if (!items || items.length <= index) return;
    const activeItem = items[index] as HTMLElement;
    const menu = listRef.value;
    if (!activeItem) return;
    const menuRect = menu.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    if (itemRect.top < menuRect.top) menu.scrollTop -= menuRect.top - itemRect.top;
    else if (itemRect.bottom > menuRect.bottom) menu.scrollTop += itemRect.bottom - menuRect.bottom;
  });
};
</script>

<style scoped>
.visual-mention-menu {
  position: fixed;
  z-index: 10000;
  width: 240px;
  max-height: 388px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 14px 34px rgb(15 23 42 / 14%);
  color: #374151;
}
.visual-mention-list { min-height: 0; flex: 1; overflow-y: auto; padding: 5px; scrollbar-width: thin; }
.visual-mention-group-entry,.visual-mention-back,.visual-mention-item {
  width: 100%; min-height: 36px; padding: 6px 8px; border: 0; border-radius: 9px; display: flex; align-items: center; gap: 8px;
  background: transparent; color: #4b5563; font: inherit; font-size: 11px; line-height: 17px; text-align: left; cursor: pointer;
}
.visual-mention-group-entry:hover,.visual-mention-group-entry.is-active,.visual-mention-back:hover,.visual-mention-item:hover,.visual-mention-item.is-active { background: #f3f4f6; color: #111827; }
.visual-mention-group-entry__icon,.visual-mention-item__icon {
  flex: 0 0 26px; width: 26px; height: 26px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; background: #f9fafb; color: #6b7280;
}
.visual-mention-group-entry__icon :deep(.t-icon),.visual-mention-item__icon :deep(.t-icon) { font-size: 13px; }
.visual-mention-item__icon.is-faq { background: #f3f4f6; }
.visual-mention-group-entry__label { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.visual-mention-group-entry__count { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #f3f4f6; color: #9ca3af; font-size: 9px; }
.visual-mention-group-entry__arrow { flex: 0 0 12px; font-size: 12px; color: #9ca3af; }
.visual-mention-back { margin-bottom: 4px; border-bottom: 1px solid #f3f4f6; border-radius: 8px 8px 0 0; color: #6b7280; font-weight: 600; }
.visual-mention-back :deep(.t-icon) { font-size: 12px; }
.visual-mention-section-label { padding: 8px 8px 4px; color: #9ca3af; font-size: 9px; line-height: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.visual-mention-group { display: flex; flex-direction: column; }
.visual-mention-item__copy { min-width: 0; flex: 1; display: flex; align-items: center; gap: 6px; }
.visual-mention-item__copy strong { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 600; }
.visual-mention-item__copy small { color: #9ca3af; font-size: 9px; font-variant-numeric: tabular-nums; }
.visual-mention-loading { min-height: 34px; display: flex; align-items: center; justify-content: center; color: #9ca3af; }
.visual-mention-empty { min-height: 80px; padding: 18px 10px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 11px; text-align: center; }
.visual-mention-detail { width: 280px; max-width: calc(100vw - 24px); padding: 10px; box-sizing: border-box; color: #4b5563; font-size: 10px; line-height: 16px; }
.visual-mention-detail__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.visual-mention-detail__header strong { min-width: 0; overflow: hidden; color: #111827; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.visual-mention-detail__header span { flex: 0 0 auto; padding: 2px 5px; border-radius: 5px; background: #f3f4f6; color: #6b7280; font-size: 9px; }
.visual-mention-detail p { margin: 7px 0 0; color: #6b7280; }
.visual-mention-detail__meta { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f3f4f6; display: flex; flex-direction: column; gap: 4px; color: #9ca3af; }
.visual-mention-detail__meta button { padding: 0; border: 0; background: transparent; color: #6b7280; font: inherit; text-align: left; cursor: pointer; }
.visual-mention-detail__meta button:hover { color: #111827; }
.visual-mention-detail__meta .is-readonly { color: #9ca3af; font-style: italic; }
.visual-mention-detail__loading { min-height: 50px; display: flex; align-items: center; justify-content: center; }
.visual-mention-detail__error { color: #dc2626; }
</style>

<style>
.visual-mention-detail-popup .t-popup__content { padding: 0 !important; overflow: hidden; border: 1px solid #e5e7eb !important; border-radius: 12px !important; background: #fff !important; box-shadow: 0 14px 34px rgb(15 23 42 / 14%) !important; }
</style>
