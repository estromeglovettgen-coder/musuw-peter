<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  items: Array<{ id: string; title: string; is_pinned?: boolean }>
  selectedIds: string[]
  allSelected: boolean
  indeterminate: boolean
  deleting?: boolean
  loading?: boolean
  hasMore?: boolean
}>()
const emit = defineEmits<{
  close: []
  toggle: [id: string]
  'toggle-all': [checked: boolean]
  'load-more': []
  delete: []
}>()

const requestClose = () => {
  if (!props.deleting) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="visual-batch-modal">
      <div v-if="visible" class="visual-batch-modal__backdrop" @click.self="requestClose">
        <section class="visual-batch-modal" role="dialog" aria-modal="true" :aria-busy="deleting ? 'true' : 'false'" :aria-label="$t('batchManage.title')">
          <header class="visual-batch-modal__header">
            <div><h3>{{ $t('batchManage.title') }}</h3><span>({{ selectedIds.length }}/{{ items.length }})</span></div>
            <button type="button" :disabled="deleting" :aria-label="$t('common.close')" @click="requestClose"><t-icon name="close" /></button>
          </header>

          <div class="visual-batch-modal__body">
            <button type="button" class="visual-batch-modal__select-all" :disabled="deleting" @click="emit('toggle-all', !allSelected)">
              <span class="visual-batch-modal__check"><t-icon :name="allSelected ? 'check-rectangle-filled' : indeterminate ? 'minus-rectangle-filled' : 'rectangle'" /></span>
              <strong>{{ $t('batchManage.selectAll') }}</strong>
              <small>{{ items.length }}</small>
            </button>

            <div v-if="items.length === 0 && !hasMore && !loading" class="visual-batch-modal__empty">{{ $t('menu.noSessions') }}</div>
            <button
              v-for="item in items"
              v-else
              :key="item.id"
              type="button"
              class="visual-batch-modal__row"
              :disabled="deleting"
              :class="{ 'is-selected': selectedIds.includes(item.id) }"
              @click="emit('toggle', item.id)"
            >
              <t-icon :name="selectedIds.includes(item.id) ? 'check-rectangle-filled' : 'rectangle'" class="visual-batch-modal__checkbox" />
              <t-icon name="chat" class="visual-batch-modal__message" />
              <span class="visual-batch-modal__title" :title="item.title">{{ item.title }}</span>
              <span v-if="item.is_pinned" class="visual-batch-modal__pinned"><t-icon name="pin-filled" />{{ $t('knowledgeList.pin.pin') }}</span>
            </button>

            <button
              v-if="hasMore"
              type="button"
              class="visual-batch-modal__load-more"
              :disabled="loading || deleting"
              @click="emit('load-more')"
            >
              <t-loading v-if="loading" size="small" />
              <span>{{ $t('common.loadMore') }}</span>
            </button>
          </div>

          <footer class="visual-batch-modal__footer">
            <span />
            <div>
              <button type="button" class="visual-batch-modal__cancel" :disabled="deleting" @click="requestClose">{{ $t('batchManage.cancel') }}</button>
              <button type="button" class="visual-batch-modal__delete" :disabled="selectedIds.length === 0 || deleting" @click="emit('delete')">
                <t-loading v-if="deleting" size="small" />
                <t-icon v-else name="delete" />
                <span>{{ $t('batchManage.delete') }} ({{ selectedIds.length }})</span>
              </button>
            </div>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.visual-batch-modal__backdrop { position: fixed; inset: 0; z-index: 3000; padding: 16px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: rgb(0 0 0 / 45%); backdrop-filter: blur(2px); user-select: none; }
.visual-batch-modal { width: min(512px,100%); max-height: calc(100dvh - 32px); overflow: hidden; border: 1px solid #e5e7eb; border-radius: 16px; display: flex; flex-direction: column; background: #fff; color: #374151; box-shadow: 0 25px 50px -12px rgb(0 0 0 / 25%); text-align: left; }
.visual-batch-modal__header { flex: 0 0 auto; padding: 16px 24px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.visual-batch-modal__header > div { display: flex; align-items: center; gap: 8px; }
.visual-batch-modal__header h3 { margin: 0; color: #111827; font-size: 16px; line-height: 24px; font-weight: 700; }
.visual-batch-modal__header span { color: #9ca3af; font-family: var(--app-font-family-mono); font-size: 12px; }
.visual-batch-modal__header > button { width: 28px; height: 28px; padding: 6px; border: 0; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-batch-modal__header > button:hover { background: #f3f4f6; color: #374151; }
.visual-batch-modal__header > button:disabled { opacity: .45; cursor: wait; }
.visual-batch-modal__header > button :deep(.t-icon) { font-size: 16px; }
.visual-batch-modal__body { min-height: 0; max-height: 380px; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.visual-batch-modal__select-all { width: 100%; min-height: 34px; margin-bottom: 2px; padding: 8px 12px; border: 0; border-radius: 12px; display: flex; align-items: center; gap: 8px; background: #f9fafb; color: #374151; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.visual-batch-modal__select-all:hover { background: rgb(243 244 246 / 80%); }
.visual-batch-modal__select-all:disabled { opacity: .6; cursor: wait; }
.visual-batch-modal__select-all strong { font-weight: 600; }
.visual-batch-modal__select-all small { margin-left: auto; color: #9ca3af; font-size: 11px; font-weight: 400; }
.visual-batch-modal__check { flex: 0 0 16px; color: #9ca3af; }
.visual-batch-modal__select-all :deep(.t-icon) { font-size: 16px; }
.visual-batch-modal__row { width: 100%; min-height: 38px; padding: 10px 12px; border: 1px solid #f3f4f6; border-radius: 12px; display: flex; align-items: center; gap: 10px; background: #fff; color: #374151; font: inherit; font-size: 12px; text-align: left; cursor: pointer; transition: all 150ms ease; }
.visual-batch-modal__row:hover { border-color: #e5e7eb; background: rgb(249 250 251 / 40%); }
.visual-batch-modal__row:disabled { opacity: .7; cursor: wait; }
.visual-batch-modal__row.is-selected { border-color: #111827; background: rgb(249 250 251 / 80%); color: #111827; font-weight: 500; }
.visual-batch-modal__checkbox { flex: 0 0 16px; font-size: 16px; color: #d1d5db; }
.visual-batch-modal__row.is-selected .visual-batch-modal__checkbox { color: #111827; }
.visual-batch-modal__message { flex: 0 0 14px; font-size: 14px; color: #9ca3af; }
.visual-batch-modal__title { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-batch-modal__pinned { flex: 0 0 auto; padding: 2px 6px; border: 1px solid rgb(253 230 138 / 60%); border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; background: #fffbeb; color: #b45309; font-size: 10px; font-weight: 500; }
.visual-batch-modal__pinned :deep(.t-icon) { font-size: 10px; }
.visual-batch-modal__empty { padding: 32px; color: #9ca3af; font-size: 12px; text-align: center; }
.visual-batch-modal__load-more { min-height: 32px; margin: 4px 0 0; padding: 7px 12px; border: 1px solid #e5e7eb; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: #fff; color: #374151; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.visual-batch-modal__load-more:hover:not(:disabled) { border-color: #d1d5db; background: #f9fafb; }
.visual-batch-modal__load-more:disabled { opacity: .6; cursor: wait; }
.visual-batch-modal__footer { flex: 0 0 auto; padding: 14px 24px; border-top: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; background: #f9fafb; }
.visual-batch-modal__footer > div { display: flex; align-items: center; gap: 8px; }
.visual-batch-modal__cancel,.visual-batch-modal__delete { min-height: 30px; padding: 6px 12px; border-radius: 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.visual-batch-modal__cancel { border: 1px solid #e5e7eb; background: #fff; color: #374151; }
.visual-batch-modal__cancel:hover { border-color: #d1d5db; }
.visual-batch-modal__delete { padding-inline: 14px; border: 0; display: inline-flex; align-items: center; gap: 6px; background: #dc2626; color: #fff; }
.visual-batch-modal__delete:hover:not(:disabled) { background: #b91c1c; }
.visual-batch-modal__delete:disabled { opacity: .4; cursor: not-allowed; }
.visual-batch-modal__delete :deep(.t-icon) { font-size: 14px; }
.visual-batch-modal-enter-active,.visual-batch-modal-leave-active { transition: opacity 150ms ease; }
.visual-batch-modal-enter-active .visual-batch-modal,.visual-batch-modal-leave-active .visual-batch-modal { transition: transform 150ms ease; }
.visual-batch-modal-enter-from,.visual-batch-modal-leave-to { opacity: 0; }
.visual-batch-modal-enter-from .visual-batch-modal,.visual-batch-modal-leave-to .visual-batch-modal { transform: scale(.98); }
@media (prefers-reduced-motion: reduce) { .visual-batch-modal-enter-active,.visual-batch-modal-leave-active,.visual-batch-modal-enter-active .visual-batch-modal,.visual-batch-modal-leave-active .visual-batch-modal { transition: none !important; } }
</style>
