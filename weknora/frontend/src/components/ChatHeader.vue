<template>
  <header
    class="visual-chat-header"
    :class="{ 'is-editing': titleEditing, 'is-docked': hasReferencesPanel }"
  >
    <form v-if="titleEditing" class="visual-chat-header__edit" @submit.prevent="submitTitleEdit" @click.stop>
      <input
        ref="titleInputRef"
        v-model="titleDraft"
        class="visual-chat-header__edit-input"
        :maxlength="SESSION_TITLE_MAX_LENGTH"
        :disabled="busyAction === 'rename'"
        :placeholder="t('chatHeader.renamePlaceholder')"
        @keydown.esc.prevent="cancelTitleEdit"
        @blur="submitTitleEdit"
      />
    </form>

    <h1 v-else class="visual-chat-header__title" :title="displayTitle" @dblclick="startTitleEdit">
      <t-icon v-if="session?.is_pinned" name="pin" class="visual-chat-header__pin" />
      <span>{{ displayTitle }}</span>
    </h1>

    <t-popup
      v-if="!titleEditing"
      v-model:visible="menuVisible"
      :overlay-class-name="menuOverlayClass"
      trigger="click"
      destroy-on-close
      placement="bottom-left"
      :disabled="!session || Boolean(busyAction)"
      @visible-change="onMenuVisibleChange"
    >
      <button
        type="button"
        class="visual-chat-header__menu-button"
        :disabled="!session || Boolean(busyAction)"
        :aria-label="t('chatHeader.moreActions')"
        @click.stop
      >
        <t-loading v-if="busyAction" size="small" />
        <t-icon v-else name="ellipsis" />
      </button>

      <template #content>
        <div class="visual-chat-header-menu" @click.stop>
          <template v-if="menuMode === 'menu'">
            <button type="button" class="visual-chat-header-menu__item" @click="onMenuAction(session?.is_pinned ? 'unpin' : 'pin')">
              <t-icon :name="session?.is_pinned ? 'pin-filled' : 'pin'" />
              <span>{{ session?.is_pinned ? t('menu.unpin') : t('menu.pin') }}</span>
            </button>
            <button type="button" class="visual-chat-header-menu__item" @click="onMenuAction('rename')">
              <t-icon name="edit-1" /><span>{{ t('menu.renameSession') }}</span>
            </button>
            <div class="visual-chat-header-menu__divider" />
            <button type="button" class="visual-chat-header-menu__item" @click="onMenuAction('copyId')"><t-icon name="copy" /><span>{{ t('chatHeader.copySessionId') }}</span></button>
            <button type="button" class="visual-chat-header-menu__item" @click="onMenuAction('copyLink')"><t-icon name="link" /><span>{{ t('chatHeader.copyLink') }}</span></button>
            <button type="button" class="visual-chat-header-menu__item" @click="onMenuAction('copyMarkdown')"><t-icon name="file-copy" /><span>{{ t('chatHeader.copyMarkdown') }}</span></button>
            <button type="button" class="visual-chat-header-menu__item" @click="onMenuAction('openNewWindow')"><t-icon name="browse" /><span>{{ t('chatHeader.openNewWindow') }}</span></button>
            <div class="visual-chat-header-menu__divider" />
            <button type="button" class="visual-chat-header-menu__item" @click="enterConfirmMode('clear')"><t-icon name="clear" /><span>{{ t('menu.clearMessages') }}</span></button>
            <button type="button" class="visual-chat-header-menu__item is-danger" @click="enterConfirmMode('delete')"><t-icon name="delete" /><span>{{ t('chatHeader.deleteSession') }}</span></button>
          </template>

          <div v-else class="visual-chat-header-confirm">
            <strong>{{ menuMode === 'clear' ? t('chatHeader.clearConfirmTitle') : t('chatHeader.deleteConfirmTitle') }}</strong>
            <p>{{ menuMode === 'clear' ? t('chatHeader.clearConfirmBody') : t('chatHeader.deleteConfirmBody') }}</p>
            <div class="visual-chat-header-confirm__actions">
              <button type="button" :disabled="Boolean(busyAction)" @click="backToMenu">{{ t('common.cancel') }}</button>
              <button
                type="button"
                class="is-danger"
                :disabled="Boolean(busyAction)"
                @click="menuMode === 'clear' ? submitClearMessages() : submitDeleteSession()"
              >
                {{ menuMode === 'clear' ? t('common.clear') : t('common.delete') }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </t-popup>
  </header>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import { copyToClipboard } from '@/utils/clipboard'
import { getMessageList } from '@/api/chat'
import { clearSession, removeSession, renameSession, setSessionPinned } from './sessionMutations'
import { normalizeSessionTitleDraft, SESSION_TITLE_MAX_LENGTH } from './sessionTitleEdit'
import { buildSessionMarkdown, collectAllSessionMessages } from '@/utils/sessionMarkdown'

interface ChatHeaderSession {
  id: string
  title?: string
  description?: string
  tenant_id?: number | string
  is_pinned?: boolean
}

type MenuMode = 'menu' | 'clear' | 'delete'

const props = defineProps<{ session: ChatHeaderSession | null; hasReferencesPanel?: boolean }>()
const { t } = useI18n()
const busyAction = ref('')
const menuVisible = ref(false)
const menuMode = ref<MenuMode>('menu')
const titleEditing = ref(false)
const titleDraft = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

const displayTitle = computed(() => props.session?.title?.trim() || t('menu.newSession'))
const menuOverlayClass = computed(() => menuMode.value === 'menu' ? 'visual-chat-header-menu-popup' : 'visual-chat-header-menu-popup is-confirm')

function onMenuVisibleChange(visible: boolean): void { if (!visible) menuMode.value = 'menu' }
function enterConfirmMode(mode: 'clear' | 'delete'): void { menuMode.value = mode }
function backToMenu(): void { if (!busyAction.value) menuMode.value = 'menu' }

function onMenuAction(value: string): void {
  if (value === 'rename') {
    menuVisible.value = false
    startTitleEdit()
    return
  }
  menuVisible.value = false
  handleMenuClick({ value })
}

async function copyText(text: string): Promise<void> {
  const ok = await copyToClipboard(text)
  if (!ok) throw new Error('clipboard unavailable')
}

function currentSessionLink(): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  return url.toString()
}

function startTitleEdit(): void {
  if (!props.session || busyAction.value) return
  menuVisible.value = false
  titleDraft.value = props.session.title || ''
  titleEditing.value = true
  nextTick(() => { titleInputRef.value?.focus(); titleInputRef.value?.select() })
}

function cancelTitleEdit(): void { titleEditing.value = false; titleDraft.value = '' }

async function submitTitleEdit(): Promise<void> {
  if (!titleEditing.value || busyAction.value) return
  const session = props.session
  if (!session) { cancelTitleEdit(); return }
  const title = normalizeSessionTitleDraft(titleDraft.value)
  const currentTitle = normalizeSessionTitleDraft(session.title || '')
  titleEditing.value = false
  titleDraft.value = ''
  if (!title || title === currentTitle) return
  busyAction.value = 'rename'
  try {
    await renameSession(session.id, title, session.description || '')
    MessagePlugin.success(t('menu.renameSessionSuccess'))
  } catch {
    MessagePlugin.error(t('menu.renameSessionFailed'))
  } finally { busyAction.value = '' }
}

async function togglePin(pinned: boolean): Promise<void> {
  const session = props.session
  if (!session || busyAction.value) return
  busyAction.value = 'pin'
  try {
    await setSessionPinned(session.id, pinned)
    MessagePlugin.success(t(pinned ? 'knowledgeList.pin.pinSuccess' : 'chatHeader.unpinSuccess'))
  } catch {
    MessagePlugin.error(t(pinned ? 'menu.pinFailed' : 'menu.unpinFailed'))
  } finally { busyAction.value = '' }
}

async function copySessionId(): Promise<void> {
  if (!props.session) return
  try { await copyText(props.session.id); MessagePlugin.success(t('chatHeader.sessionIdCopied')) }
  catch { MessagePlugin.error(t('chatHeader.copyFailed')) }
}

async function copyLink(): Promise<void> {
  try { await copyText(currentSessionLink()); MessagePlugin.success(t('chatHeader.linkCopied')) }
  catch { MessagePlugin.error(t('chatHeader.copyFailed')) }
}

async function copyMarkdown(): Promise<void> {
  const session = props.session
  if (!session || busyAction.value) return
  busyAction.value = 'markdown'
  try {
    const messages = await collectAllSessionMessages(async (beforeTime, limit) => {
      const response: any = await getMessageList({ session_id: session.id, created_at: beforeTime, limit })
      if (!response?.success || !Array.isArray(response.data)) throw new Error(response?.message || 'failed to load session messages')
      return response.data
    })
    const markdown = buildSessionMarkdown({
      sessionId: session.id,
      title: session.title || t('menu.newSession'),
      messages,
      labels: {
        sessionId: t('chatHeader.markdown.sessionId'), exportedAt: t('chatHeader.markdown.exportedAt'),
        user: t('chatHeader.markdown.user'), assistant: t('chatHeader.markdown.assistant'),
        attachments: t('chatHeader.markdown.attachments'), references: t('chatHeader.markdown.references'),
      },
    })
    await copyText(markdown)
    MessagePlugin.success(t('chatHeader.markdownCopied'))
  } catch {
    MessagePlugin.error(t('chatHeader.markdownCopyFailed'))
  } finally { busyAction.value = '' }
}

async function submitClearMessages(): Promise<void> {
  const session = props.session
  if (!session || busyAction.value) return
  busyAction.value = 'clear'
  try {
    if (!await clearSession(session.id)) return
    menuVisible.value = false
    menuMode.value = 'menu'
    MessagePlugin.success(t('menu.clearMessagesSuccess'))
  } catch { MessagePlugin.error(t('menu.clearMessagesFailed')) }
  finally { busyAction.value = '' }
}

async function submitDeleteSession(): Promise<void> {
  const session = props.session
  if (!session || busyAction.value) return
  busyAction.value = 'delete'
  try {
    if (!await removeSession(session.id)) return
    menuVisible.value = false
    menuMode.value = 'menu'
    MessagePlugin.success(t('chatHeader.deleteSuccess'))
  } catch { MessagePlugin.error(t('chat.deleteSessionFailed')) }
  finally { busyAction.value = '' }
}

function handleMenuClick(data: { value: string }): void {
  switch (data.value) {
    case 'pin': void togglePin(true); break
    case 'unpin': void togglePin(false); break
    case 'copyId': void copySessionId(); break
    case 'copyLink': void copyLink(); break
    case 'copyMarkdown': void copyMarkdown(); break
    case 'openNewWindow': window.open(currentSessionLink(), '_blank', 'noopener,noreferrer'); break
  }
}
</script>

<style scoped lang="less">
.visual-chat-header {
  position: absolute;
  top: 10px;
  left: 14px;
  z-index: 6;
  max-width: min(320px, calc(100% - 28px));
  min-width: 0;
  min-height: 32px;
  padding: 3px 4px 3px 9px;
  border: 1px solid rgb(229 231 235 / 75%);
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  background: rgb(255 255 255 / 88%);
  backdrop-filter: blur(10px);
  color: #374151;
}

.visual-chat-header.is-editing { width: min(360px, calc(100% - 28px)); padding: 3px; }
.visual-chat-header.is-docked { position: relative; top: auto; left: auto; width: 100%; max-width: none; min-height: 48px; padding: 8px 14px; border: 0; border-bottom: 1px solid #f3f4f6; border-radius: 0; background: #fff; backdrop-filter: none; }
.visual-chat-header__title { min-width: 0; flex: 1; margin: 0; display: flex; align-items: center; gap: 5px; color: #374151; font-size: 12px; line-height: 18px; font-weight: 600; }
.visual-chat-header__title span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-chat-header__pin { flex: 0 0 11px; font-size: 11px; color: #9ca3af; }
.visual-chat-header__menu-button { flex: 0 0 26px; width: 26px; height: 26px; padding: 6px; border: 0; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-chat-header__menu-button:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
.visual-chat-header__menu-button:disabled { cursor: default; opacity: .5; }
.visual-chat-header__menu-button :deep(.t-icon),.visual-chat-header__menu-button :deep(.t-loading) { font-size: 13px; }
.visual-chat-header__edit { min-width: 0; flex: 1; }
.visual-chat-header__edit-input { width: 100%; height: 28px; padding: 4px 7px; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 7px; outline: 0; background: #fff; color: #111827; font: inherit; font-size: 12px; }
.visual-chat-header__edit-input:focus { border-color: #9ca3af; box-shadow: 0 0 0 2px rgb(17 24 39 / 6%); }
</style>

<style lang="less">
.visual-chat-header-menu-popup .t-popup__content { padding: 5px !important; min-width: 190px !important; border: 1px solid #e5e7eb !important; border-radius: 12px !important; background: #fff !important; box-shadow: 0 14px 34px rgb(15 23 42 / 14%) !important; }
.visual-chat-header-menu-popup.is-confirm .t-popup__content { width: 270px !important; }
.visual-chat-header-menu { display: flex; flex-direction: column; gap: 2px; }
.visual-chat-header-menu__item { width: 100%; min-height: 32px; padding: 6px 8px; border: 0; border-radius: 8px; display: flex; align-items: center; gap: 8px; background: transparent; color: #4b5563; font: inherit; font-size: 11px; text-align: left; cursor: pointer; }
.visual-chat-header-menu__item:hover { background: #f3f4f6; color: #111827; }
.visual-chat-header-menu__item.is-danger { color: #dc2626; }
.visual-chat-header-menu__item.is-danger:hover { background: #fef2f2; }
.visual-chat-header-menu__item .t-icon { flex: 0 0 13px; font-size: 13px; color: #9ca3af; }
.visual-chat-header-menu__divider { height: 1px; margin: 3px 5px; background: #f3f4f6; }
.visual-chat-header-confirm { padding: 5px; }
.visual-chat-header-confirm strong { display: block; color: #111827; font-size: 12px; line-height: 18px; }
.visual-chat-header-confirm p { margin: 5px 0 12px; color: #6b7280; font-size: 10px; line-height: 16px; }
.visual-chat-header-confirm__actions { display: flex; justify-content: flex-end; gap: 6px; }
.visual-chat-header-confirm__actions button { min-height: 30px; padding: 5px 10px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; color: #4b5563; font: inherit; font-size: 10px; cursor: pointer; }
.visual-chat-header-confirm__actions button.is-danger { border-color: #dc2626; background: #dc2626; color: #fff; }
</style>
