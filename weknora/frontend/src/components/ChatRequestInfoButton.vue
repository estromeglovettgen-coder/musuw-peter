<template>
  <t-popup
    v-model:visible="visible"
    trigger="click"
    placement="top"
    :show-arrow="false"
    destroy-on-close
    overlay-class-name="visual-request-info-popup"
    :overlay-inner-style="{ padding: '5px' }"
  >
    <button type="button" class="visual-request-info__trigger" :title="$t('chat.requestInfoTitle')">
      <t-icon name="info-circle" />
    </button>
    <template #content>
      <section class="visual-request-info" @click.stop>
        <header class="visual-request-info__header">
          <strong>{{ $t('chat.requestInfoTitle') }}</strong>
          <button v-if="rows.length > 0" type="button" :title="$t('common.copy')" @click="copyAll">
            <t-icon name="copy" />
          </button>
        </header>
        <div v-if="rows.length === 0" class="visual-request-info__empty">{{ $t('chat.requestInfoEmpty') }}</div>
        <dl v-else class="visual-request-info__rows">
          <div v-for="row in rows" :key="row.key" class="visual-request-info__row">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
      </section>
    </template>
  </t-popup>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  buildChatRequestDebugPayload,
  type ChatRequestDebugInfo,
} from '@/utils/chatRequestDebug';
import { copyWithToast } from '@/utils/clipboard';

const props = defineProps<{ session: Record<string, unknown>; sessionId?: string }>();
const { t } = useI18n();
const visible = ref(false);

const debugInfo = computed((): ChatRequestDebugInfo => {
  const s = props.session;
  const dr = s.debugRequest as ChatRequestDebugInfo | undefined;
  return {
    requestId: (s.request_id as string) || dr?.requestId,
    messageId: (s.id as string) || undefined,
    sessionId: props.sessionId || dr?.sessionId,
    url: dr?.url,
    method: dr?.method,
    body: dr?.body ?? null,
    sentAt: dr?.sentAt,
  };
});

const rows = computed(() => {
  const info = debugInfo.value;
  const list: { key: string; label: string; value: string }[] = [];
  const add = (key: string, labelKey: string, val?: string) => {
    if (!val) return;
    list.push({ key, label: t(labelKey), value: val });
  };
  add('requestId', 'chat.requestInfoRequestId', info.requestId);
  add('messageId', 'chat.requestInfoMessageId', info.messageId);
  add('sessionId', 'chat.requestInfoSessionId', info.sessionId);
  if (info.method && info.url) list.push({ key: 'url', label: t('chat.requestInfoUrl'), value: `${info.method} ${info.url}` });
  if (info.sentAt) add('sentAt', 'chat.requestInfoSentAt', new Date(info.sentAt).toLocaleString());
  return list;
});

const copyAll = async () => {
  const ok = await copyWithToast(buildChatRequestDebugPayload(debugInfo.value), 'common.copied');
  if (ok) visible.value = false;
};
</script>

<style scoped lang="less">
.visual-request-info__trigger { width: 28px; height: 28px; padding: 6px; border: 1px solid #e5e7eb; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; background: #fff; color: #9ca3af; cursor: pointer; }
.visual-request-info__trigger:hover { background: #f9fafb; color: #374151; }
.visual-request-info__trigger :deep(.t-icon) { font-size: 13px; }
.visual-request-info { width: min(350px, calc(100vw - 24px)); min-width: 260px; padding: 7px; box-sizing: border-box; }
.visual-request-info__header { min-height: 30px; padding: 3px 4px 7px; border-bottom: 1px solid #f3f4f6; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.visual-request-info__header strong { color: #374151; font-size: 11px; line-height: 17px; font-weight: 650; }
.visual-request-info__header button { width: 24px; height: 24px; padding: 5px; border: 0; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-request-info__header button:hover { background: #f3f4f6; color: #374151; }
.visual-request-info__rows { margin: 5px 0 0; }
.visual-request-info__row { min-height: 28px; padding: 5px 4px; display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 8px; align-items: start; }
.visual-request-info__row dt { color: #9ca3af; font-size: 10px; line-height: 16px; }
.visual-request-info__row dd { min-width: 0; margin: 0; color: #374151; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; line-height: 16px; word-break: break-all; }
.visual-request-info__empty { padding: 15px 5px; color: #9ca3af; font-size: 10px; text-align: center; }
</style>

<style lang="less">
.visual-request-info-popup .t-popup__content { border: 1px solid #e5e7eb !important; border-radius: 12px !important; background: #fff !important; box-shadow: 0 14px 34px rgb(15 23 42 / 14%) !important; }
</style>
