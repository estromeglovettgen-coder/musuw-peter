<script setup lang="ts">
import { computed } from 'vue'
import ResourceOriginBadge from '@/components/ResourceOriginBadge.vue'
import { useAuthStore } from '@/stores/auth'

type OriginVariant = 'mine' | 'tenant' | 'creator' | 'space' | 'shared'

const props = withDefaults(defineProps<{
  kb: any
  shared?: boolean
  favorited?: boolean
  canFavorite?: boolean
  canDuplicate?: boolean
  canManage?: boolean
  showOriginBadge?: boolean
  originVariant?: OriginVariant
  creatorName?: string
  orgName?: string
  highlighted?: boolean
  showDetailsOnly?: boolean
  showStrategies?: boolean
  showFooter?: boolean
}>(), {
  shared: false,
  favorited: false,
  canFavorite: true,
  canDuplicate: false,
  canManage: false,
  showOriginBadge: false,
  originVariant: 'mine',
  creatorName: '',
  orgName: '',
  highlighted: false,
  showDetailsOnly: false,
  showStrategies: true,
  showFooter: true,
})
const authStore = useAuthStore()

const emit = defineEmits<{
  open: []
  favorite: [event: MouseEvent]
  pin: []
  edit: []
  duplicate: []
  delete: []
  details: []
}>()

const hasRagStrategy = computed(() => Boolean(
  props.kb.indexing_strategy?.vector_enabled || props.kb.indexing_strategy?.keyword_enabled,
))
const hasWikiStrategy = computed(() => Boolean(props.kb.indexing_strategy?.wiki_enabled))
const isVisibleStrategyMissing = computed(() => (
  authStore.isLiteMode && props.kb.type !== 'faq' && !hasRagStrategy.value && !hasWikiStrategy.value
))

const requestEdit = () => {
  props.kb.showMore = false
  emit('edit')
}

const requestDuplicate = () => {
  props.kb.showMore = false
  emit('duplicate')
}

const requestDelete = () => {
  props.kb.showMore = false
  emit('delete')
}
</script>

<template>
  <article
    class="visual-reference-kb-card group"
    :class="{ 'is-shared': shared, 'is-faq': kb.type === 'faq', 'is-highlighted': highlighted }"
    @click="emit('open')"
  >
    <button
      v-if="canFavorite"
      type="button"
      class="visual-reference-kb-card__favorite"
      :class="{ 'is-active': favorited }"
      :aria-label="favorited ? $t('knowledgeList.favorites.remove') : $t('knowledgeList.favorites.add')"
      @click.stop="emit('favorite', $event)"
    >
      <t-icon :name="favorited ? 'star-filled' : 'star'" />
    </button>

    <header class="visual-reference-kb-card__header">
      <div class="visual-reference-kb-card__title" :title="kb.name">
        <span v-if="kb.is_pinned" class="visual-reference-kb-card__pinned">
          <t-icon name="pin-filled" />
          <span>{{ $t('knowledgeList.pin.pin') }}</span>
        </span>
        <strong>{{ kb.name }}</strong>
      </div>

      <t-tooltip v-if="showDetailsOnly" :content="$t('knowledgeList.menu.viewDetails')" placement="top">
        <button type="button" class="visual-reference-kb-card__more" :aria-label="$t('knowledgeList.menu.viewDetails')" @click.stop="emit('details')">
          <t-icon name="info-circle" />
        </button>
      </t-tooltip>

      <t-popup v-else-if="canDuplicate || canManage || !shared" v-model="kb.showMore" trigger="click" destroy-on-close placement="bottom-right">
        <button type="button" class="visual-reference-kb-card__more" :aria-label="$t('common.more')" @click.stop><t-icon name="ellipsis" /></button>
        <template #content>
          <div class="visual-reference-kb-card-menu" @click.stop>
            <button v-if="canManage" type="button" @click="requestEdit"><t-icon name="setting" /><span>{{ $t('knowledgeList.menu.editConfig') }}</span></button>
            <button v-if="!shared" type="button" @click="emit('pin')"><t-icon :name="kb.is_pinned ? 'pin-filled' : 'pin'" /><span>{{ kb.is_pinned ? $t('knowledgeList.pin.unpin') : $t('knowledgeList.pin.pin') }}</span></button>
            <button v-if="canDuplicate" type="button" @click="requestDuplicate"><t-icon name="file-copy" /><span>{{ $t('knowledgeList.menu.duplicate') }}</span></button>
            <span v-if="canManage" class="visual-reference-kb-card-menu__separator" aria-hidden="true" />
            <button v-if="canManage" type="button" class="is-danger" @click="requestDelete"><t-icon name="delete" /><span>{{ $t('common.delete') }}</span></button>
          </div>
        </template>
      </t-popup>
    </header>

    <div v-if="showStrategies" class="visual-reference-kb-card__strategies" :aria-label="$t('knowledgeEditor.indexing.title')">
      <slot name="strategies">
      <span v-if="hasRagStrategy" data-indexing-strategy="rag" class="visual-reference-kb-card__strategy">
        <t-icon name="layers" />
        <span>RAG</span>
      </span>
      <span v-if="hasWikiStrategy" data-indexing-strategy="wiki" class="visual-reference-kb-card__strategy">
        <t-icon name="book-open" />
        <span>Wiki</span>
      </span>
      <span v-if="isVisibleStrategyMissing" data-indexing-strategy="unconfigured" class="visual-reference-kb-card__strategy is-warning">
        <t-icon name="error-circle" />
        <span>{{ $t('knowledgeList.features.unconfigured') }}</span>
      </span>
      </slot>
    </div>

    <p class="visual-reference-kb-card__description">{{ kb.description?.trim() || $t('knowledgeBase.noDescription') }}</p>

    <footer class="visual-reference-kb-card__footer" :aria-hidden="!showFooter || undefined">
      <span v-if="!showFooter" class="visual-reference-kb-card__badge" style="visibility: hidden"><t-icon name="file" /></span>
      <slot v-else name="footer">
      <span class="visual-reference-kb-card__badge">
        <t-icon :name="kb.type === 'faq' ? 'chat-bubble-help' : 'file'" />
        <span v-if="kb.type === 'faq'">{{ kb.chunk_count ?? 0 }} Q&A</span>
        <span v-else>{{ $t('knowledgeBase.folderTree.folderCardCount', { count: kb.knowledge_count ?? 0 }) }}</span>
        <span v-if="kb.isProcessing" class="visual-reference-kb-card__spinner" />
      </span>
      <t-tooltip v-if="kb.question_generation_config?.enabled" :content="$t('knowledgeList.features.questionGeneration')" placement="top">
        <span class="visual-reference-kb-card__state"><t-icon name="help-circle" /></span>
      </t-tooltip>
      <t-tooltip v-if="(kb.share_count ?? 0) > 0" :content="$t('knowledgeList.sharedToOrgs', { count: kb.share_count ?? 0 })" placement="top">
        <span class="visual-reference-kb-card__state"><t-icon name="share" /><small>{{ kb.share_count }}</small></span>
      </t-tooltip>
      <span class="visual-reference-kb-card__spacer" />
      <ResourceOriginBadge v-if="showOriginBadge" :variant="originVariant" :creator-name="creatorName" />
      <span v-else-if="orgName" class="visual-reference-kb-card__origin" :title="orgName"><t-icon name="usergroup" /><span>{{ orgName }}</span></span>
      </slot>
    </footer>
  </article>
</template>

<style scoped lang="less">
.visual-reference-kb-card {
  position: relative;
  min-width: 0;
  min-height: 154px;
  padding: 18px;
  box-sizing: border-box;
  border: 1px solid rgb(229 231 235 / 90%);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #fff;
  color: #1f2937;
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.visual-reference-kb-card:hover { border-color: #d1d5db; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 10%),0 2px 4px -2px rgb(0 0 0 / 10%); transform: none; }
.visual-reference-kb-card.is-highlighted { border-color: #9ca3af; box-shadow: 0 0 0 2px rgb(17 24 39 / 8%),0 1px 2px rgb(0 0 0 / 5%); }
.visual-reference-kb-card__header { min-height: 24px; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.visual-reference-kb-card__title { min-width: 0; flex: 1; padding-right: 42px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.visual-reference-kb-card__title strong { min-width: 0; flex: 1; overflow: hidden; color: #111827; font-size: 14px; line-height: 20px; font-weight: 700; letter-spacing: -.025em; text-overflow: ellipsis; white-space: nowrap; }
.visual-reference-kb-card__pinned { flex: 0 0 auto; min-height: 18px; padding: 2px 6px; border: 1px solid rgb(253 230 138 / 60%); border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; background: rgb(255 251 235 / 90%); color: #b45309; font-size: 10px; line-height: 12px; font-weight: 500; }
.visual-reference-kb-card__pinned :deep(.t-icon) { width: 10px; height: 10px; font-size: 10px; color: #d97706; }
.visual-reference-kb-card__favorite { position: absolute; top: 14px; right: 42px; z-index: 2; width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #d1d5db; opacity: 0; cursor: pointer; transition: opacity 150ms ease,color 150ms ease,background-color 150ms ease; }
.visual-reference-kb-card:hover .visual-reference-kb-card__favorite,.visual-reference-kb-card__favorite.is-active { opacity: 1; }
.visual-reference-kb-card__favorite.is-active { color: #d97706; }
.visual-reference-kb-card__favorite:hover { background: rgb(243 244 246 / 80%); }
.visual-reference-kb-card__favorite :deep(.t-icon) { width: 14px; height: 14px; font-size: 14px; }
.visual-reference-kb-card__more { flex: 0 0 24px; width: 24px; height: 24px; padding: 4px; border: 0; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; opacity: 0; cursor: pointer; transition: opacity 150ms ease,color 150ms ease,background-color 150ms ease; }
.visual-reference-kb-card:hover .visual-reference-kb-card__more,.visual-reference-kb-card__more:focus-visible { opacity: 1; }
.visual-reference-kb-card__state { min-width: 20px; height: 20px; padding: 2px 5px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 3px; background: #f3f4f6; color: #6b7280; font-size: 11px; }
.visual-reference-kb-card__state :deep(.t-icon) { font-size: 12px; }
.visual-reference-kb-card__state small { font-size: 9px; line-height: 1; }
.visual-reference-kb-card__more:hover { background: rgb(243 244 246 / 80%); color: #1f2937; }
.visual-reference-kb-card__more :deep(.t-icon) { width: 16px; height: 16px; font-size: 16px; }
.visual-reference-kb-card__strategies { min-height: 18px; margin-top: 6px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.visual-reference-kb-card__strategy { min-height: 18px; padding: 2px 6px; border: 1px solid rgb(229 231 235 / 90%); border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; background: #f9fafb; color: #6b7280; font-size: 10px; line-height: 12px; font-weight: 500; }
.visual-reference-kb-card__strategy :deep(.t-icon) { width: 10px; height: 10px; font-size: 10px; }
.visual-reference-kb-card__strategy.is-warning { border-color: rgb(253 230 138 / 80%); background: #fffbeb; color: #b45309; }
.visual-reference-kb-card__description { margin: 6px 0 0; overflow: hidden; color: #6b7280; font-size: 12px; line-height: 1.625; letter-spacing: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.visual-reference-kb-card__footer { margin-top: 12px; padding-top: 12px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.visual-reference-kb-card__badge { min-height: 20px; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px; background: #f5f5f5; color: #4b5563; font-size: 11px; line-height: 16px; font-weight: 400; }
.visual-reference-kb-card__badge :deep(.t-icon) { width: 12px; height: 12px; font-size: 12px; color: #9ca3af; }
.visual-reference-kb-card__spinner { width: 9px; height: 9px; border: 1px solid #9ca3af; border-right-color: transparent; border-radius: 50%; animation: visual-kb-card-spin .8s linear infinite; }
.visual-reference-kb-card__spacer { flex: 1; }
.visual-reference-kb-card__origin { min-width: 0; max-width: 130px; display: inline-flex; align-items: center; gap: 4px; color: #9ca3af; font-size: 10px; line-height: 14px; }
.visual-reference-kb-card__origin :deep(.t-icon) { flex: 0 0 12px; font-size: 12px; }
.visual-reference-kb-card__origin span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
:root[theme-mode="dark"] .visual-reference-kb-card { border-color: #27272a; background: #18181b; color: #d4d4d8; box-shadow: 0 1px 2px rgb(0 0 0 / 28%); }
:root[theme-mode="dark"] .visual-reference-kb-card:hover { border-color: var(--mvc-line-strong, #484c54) !important; background: var(--mvc-hover, #25272c) !important; box-shadow: var(--mvc-shadow) !important; transform: none !important; }
:root[theme-mode="dark"] .visual-reference-kb-card.is-highlighted { border-color: #71717a; box-shadow: 0 0 0 2px rgb(244 244 245 / 7%); }
:root[theme-mode="dark"] .visual-reference-kb-card__title strong { color: #f4f4f5; }
:root[theme-mode="dark"] .visual-reference-kb-card__strategy { border-color: #3f3f46; background: #27272a; color: #d4d4d8; }
:root[theme-mode="dark"] .visual-reference-kb-card__strategy.is-warning { border-color: rgb(146 64 14 / 70%); background: rgb(120 53 15 / 24%); color: #fbbf24; }
:root[theme-mode="dark"] .visual-reference-kb-card__description { color: #a1a1aa; }
:root[theme-mode="dark"] .visual-reference-kb-card__footer { border-color: #27272a; }
:root[theme-mode="dark"] .visual-reference-kb-card__badge,
:root[theme-mode="dark"] .visual-reference-kb-card__state { background: #27272a; color: #d4d4d8; }
:root[theme-mode="dark"] .visual-reference-kb-card__badge :deep(.t-icon) { color: #a1a1aa; }
:root[theme-mode="dark"] .visual-reference-kb-card__favorite { color: #71717a; }
:root[theme-mode="dark"] .visual-reference-kb-card__favorite:hover,
:root[theme-mode="dark"] .visual-reference-kb-card__more:hover { background: #27272a; color: #f4f4f5; }
:root[theme-mode="dark"] .visual-reference-kb-card__more,
:root[theme-mode="dark"] .visual-reference-kb-card__origin { color: #a1a1aa; }
@keyframes visual-kb-card-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .visual-reference-kb-card,.visual-reference-kb-card__favorite,.visual-reference-kb-card__more { transition: none !important; } .visual-reference-kb-card__spinner { animation: none; } }
</style>

<style lang="less">
.visual-reference-kb-card-menu { width: 144px; padding: 4px; }
.visual-reference-kb-card-menu button { width: 100%; min-height: 32px; padding: 8px 12px; border: 0; border-radius: 0; display: flex; align-items: center; gap: 8px; background: transparent; color: #374151; font-size: 12px; text-align: left; cursor: pointer; }
.visual-reference-kb-card-menu button:hover { background: #f9fafb; }
.visual-reference-kb-card-menu__separator { height: 1px; margin: 4px 0; display: block; background: #f3f4f6; }
.visual-reference-kb-card-menu button.is-danger { color: #dc2626; }
.visual-reference-kb-card-menu button.is-danger:hover { background: #fef2f2; }
:root[theme-mode="dark"] body .visual-reference-kb-card-menu button { color: #e4e4e7; }
:root[theme-mode="dark"] body .visual-reference-kb-card-menu button:hover { background: #3f3f46; }
:root[theme-mode="dark"] body .visual-reference-kb-card-menu__separator { background: #3f3f46; }
:root[theme-mode="dark"] body .visual-reference-kb-card-menu button.is-danger { color: #f87171; }
:root[theme-mode="dark"] body .visual-reference-kb-card-menu button.is-danger:hover { background: rgb(127 29 29 / 30%); }
</style>
