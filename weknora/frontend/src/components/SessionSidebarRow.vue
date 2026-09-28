<template>
  <div
    class="visual-session-row"
    :class="{
      'is-active': !batchMode && activePath === item.path,
      'is-selected': batchMode && selectedIds.includes(item.id),
      'is-batch': batchMode,
    }"
    @mouseenter="emit('hover-in')"
    @mouseleave="emit('hover-out')"
    @click="batchMode ? emit('toggle-select') : emit('navigate')"
  >
    <t-checkbox
      v-if="batchMode"
      class="visual-session-row__checkbox"
      :checked="selectedIds.includes(item.id)"
      @click.stop
      @change="emit('toggle-select')"
    />

    <form
      v-if="titleEditing"
      class="visual-session-row__edit"
      @submit.prevent="submitTitleEdit"
      @click.stop
    >
      <input
        ref="titleInputRef"
        v-model="titleDraft"
        class="visual-session-row__edit-input"
        :maxlength="SESSION_TITLE_MAX_LENGTH"
        @keydown.esc.prevent="cancelTitleEdit"
        @blur="submitTitleEdit"
      />
    </form>

    <div v-else class="visual-session-row__title" :title="item.title">
      <span>{{ item.title }}</span>
    </div>

    <div v-if="!batchMode" class="visual-session-row__actions" @click.stop>
      <t-icon v-if="item.is_pinned" name="pin-filled" class="visual-session-row__pin" />
      <t-popup
        v-model:visible="menuOpen"
        :overlay-class-name="menuOverlayClass"
        trigger="click"
        destroy-on-close
        placement="bottom-right"
        @visible-change="onMenuVisibleChange"
      >
        <button
          type="button"
          class="visual-session-row__more"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click.stop
        >
          <t-icon name="ellipsis" />
        </button>

        <template #content>
          <div class="visual-session-menu" @click.stop>
            <template v-if="menuMode === 'menu'">
              <template v-for="(option, index) in menuOptions" :key="option.value">
                <div
                  v-if="shouldShowDividerBefore(option.value, index)"
                  class="visual-session-menu__divider"
                />
                <button
                  type="button"
                  class="visual-session-menu__item"
                  :class="{ 'is-danger': option.theme === 'error' }"
                  @click="handleMenuClick(option)"
                >
                  <component
                    :is="option.prefixIcon"
                    v-if="option.prefixIcon"
                    class="visual-session-menu__icon"
                  />
                  <span>{{ option.content }}</span>
                </button>
              </template>
            </template>

            <div v-else class="visual-session-confirm">
              <h4>
                {{ menuMode === 'clear' ? t('chatHeader.clearConfirmTitle') : t('chatHeader.deleteConfirmTitle') }}
              </h4>
              <p>
                {{ menuMode === 'clear' ? t('chatHeader.clearConfirmBody') : t('chatHeader.deleteConfirmBody') }}
              </p>
              <div class="visual-session-confirm__actions">
                <button type="button" class="visual-session-confirm__button" @click="backToMenu">
                  {{ t('common.cancel') }}
                </button>
                <button
                  type="button"
                  class="visual-session-confirm__button is-danger"
                  @click="confirmDangerAction"
                >
                  {{ menuMode === 'clear' ? t('common.clear') : t('common.delete') }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </t-popup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { normalizeSessionTitleDraft, SESSION_TITLE_MAX_LENGTH } from './sessionTitleEdit'

interface SessionMenuOption {
  content: string
  value: string
  theme?: 'default' | 'success' | 'warning' | 'error' | 'primary'
  prefixIcon?: any
}

type MenuMode = 'menu' | 'clear' | 'delete'

const props = defineProps<{
  item: { id: string; path: string; title: string; is_pinned?: boolean }
  batchMode: boolean
  activePath: string
  selectedIds: string[]
  menuOptions: SessionMenuOption[]
  /** 渠道文件夹下的会话（样式与聊天区会话共用文案列对齐） */
  nested?: boolean
}>()

const emit = defineEmits<{
  (e: 'navigate'): void
  (e: 'toggle-select'): void
  (e: 'menu-click', data: { value: string }): void
  (e: 'rename-submit', data: { title: string }): void
  (e: 'hover-in'): void
  (e: 'hover-out'): void
}>()

const { t } = useI18n()

const menuOpen = ref(false)
const menuMode = ref<MenuMode>('menu')
const titleEditing = ref(false)
const titleDraft = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

const menuOverlayClass = computed(() => (
  menuMode.value === 'menu'
    ? 'visual-session-menu-popup'
    : 'visual-session-menu-popup is-confirm'
))

const onMenuVisibleChange = (visible: boolean): void => {
  if (!visible) menuMode.value = 'menu'
}

const backToMenu = (): void => {
  menuMode.value = 'menu'
}

const shouldShowDividerBefore = (value: string, index: number): boolean => {
  if (index === 0) return false
  return value === 'clearMessages' || value === 'delete'
}

const startTitleEdit = (): void => {
  menuOpen.value = false
  menuMode.value = 'menu'
  titleDraft.value = props.item.title || ''
  titleEditing.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}

const cancelTitleEdit = (): void => {
  titleEditing.value = false
  titleDraft.value = ''
}

const submitTitleEdit = (): void => {
  // Enter 会先触发 form submit，随后 input blur 再进一次；必须同步退出编辑态防重入。
  if (!titleEditing.value) return
  const nextTitle = normalizeSessionTitleDraft(titleDraft.value)
  const currentTitle = normalizeSessionTitleDraft(props.item.title || '')
  titleEditing.value = false
  titleDraft.value = ''
  if (!nextTitle || nextTitle === currentTitle) return
  emit('rename-submit', { title: nextTitle })
}

const handleMenuClick = (option: SessionMenuOption): void => {
  if (option.value === 'rename') {
    startTitleEdit()
    return
  }
  if (option.value === 'clearMessages') {
    menuMode.value = 'clear'
    return
  }
  if (option.value === 'delete') {
    menuMode.value = 'delete'
    return
  }
  menuOpen.value = false
  menuMode.value = 'menu'
  emit('menu-click', { value: option.value })
}

const confirmDangerAction = (): void => {
  const value = menuMode.value === 'clear' ? 'clearMessages' : 'delete'
  menuOpen.value = false
  menuMode.value = 'menu'
  emit('menu-click', { value })
}
</script>

<style scoped lang="less">
.visual-session-row {
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 29px;
  padding: 6px 10px;
  box-sizing: border-box;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: transparent;
  color: #374151;
  font-size: 12.5px;
  line-height: 1.375;
  font-weight: 400;
  cursor: pointer;
  transition: all 150ms ease;
}

.visual-session-row:hover {
  background: rgb(229 231 235 / 50%);
  color: #030712;
}

.visual-session-row.is-active,
.visual-session-row.is-selected {
  background: rgb(229 231 235 / 90%);
  color: #030712;
  font-weight: 600;
  box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
}

.visual-session-row__checkbox { flex: 0 0 auto; }
.visual-session-row__title { min-width: 0; flex: 1 1 auto; }
.visual-session-row__title > span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.visual-session-row__actions { flex: 0 0 auto; margin-left: 6px; display: inline-flex; align-items: center; gap: 4px; }
.visual-session-row__pin { flex: 0 0 12px; width: 12px; height: 12px; font-size: 12px; color: #f59e0b; }
.visual-session-row__edit { min-width: 0; flex: 1 1 auto; }
.visual-session-row__edit-input {
  width: 100%;
  height: 24px;
  padding: 2px 6px;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  outline: 0;
  background: #fff;
  color: #111827;
  font: inherit;
  font-size: 12px;
}
.visual-session-row__edit-input:focus { border-color: #6366f1; }
.visual-session-row__more {
  width: 18px;
  height: 18px;
  padding: 2px;
  border: 0;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #9ca3af;
  opacity: 0;
  cursor: pointer;
  transition: all 150ms ease;
}
.visual-session-row:hover .visual-session-row__more,
.visual-session-row__more[aria-expanded='true'],
.visual-session-row.is-active .visual-session-row__more { opacity: 1; }
.visual-session-row__more:hover { background: rgb(229 231 235 / 80%); color: #111827; }
.visual-session-row__more :deep(.t-icon) { font-size: 14px; }
</style>

<style lang="less">
.visual-session-menu-popup { z-index: 3000 !important; }
.visual-session-menu-popup .t-popup__content {
  min-width: 128px !important;
  width: 128px !important;
  margin-top: 4px !important;
  padding: 0 !important;
  overflow: hidden;
  border: 1px solid #e5e7eb !important;
  border-radius: 12px !important;
  background: #fff !important;
  box-shadow: 0 12px 30px rgb(0 0 0 / 12%) !important;
}
.visual-session-menu-popup.is-confirm .t-popup__content { width: 260px !important; min-width: 260px !important; }
.visual-session-menu { width: 128px; padding: 4px 0; box-sizing: border-box; display: flex; flex-direction: column; }
.visual-session-menu__item {
  width: 100%;
  min-height: 30px;
  padding: 6px 12px;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  color: #374151;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
.visual-session-menu__item:hover { background: #f9fafb; }
.visual-session-menu__item.is-danger { color: #dc2626; }
.visual-session-menu__item.is-danger:hover { background: #fef2f2; }
.visual-session-menu__icon { flex: 0 0 12px; width: 12px; height: 12px; color: #6b7280; }
.visual-session-menu__item.is-danger .visual-session-menu__icon { color: #ef4444; }
.visual-session-menu__divider { height: 1px; margin: 4px 0; background: #f3f4f6; }
.visual-session-confirm { width: 258px; padding: 14px; box-sizing: border-box; }
.visual-session-confirm h4 { margin: 0 0 5px; color: #111827; font-size: 13px; line-height: 19px; font-weight: 700; }
.visual-session-confirm p { margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5; }
.visual-session-confirm__actions { margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px; }
.visual-session-confirm__button { min-height: 30px; padding: 6px 12px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; color: #374151; font-size: 12px; font-weight: 500; cursor: pointer; }
.visual-session-confirm__button.is-danger { border-color: #dc2626; background: #dc2626; color: #fff; font-weight: 600; }
</style>
