<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { useI18n } from 'vue-i18n';
import { MAX_FILE_SIZE_MB } from '@/utils';
import { getParserEngines } from '@/api/system';
import { useAuthStore } from '@/stores/auth';
import { useCurrentEntitlementStore } from '@/stores/entitlement';
import {
  deleteTemporaryAttachment,
  getTemporaryAttachment,
  uploadTemporaryAttachment,
  type TemporaryAttachmentStatus,
} from '@/api/chat/temporary-attachments';

const { t } = useI18n();
const authStore = useAuthStore();
const entitlementStore = useCurrentEntitlementStore();

export interface AttachmentFile {
  file: File;
  id: string;
  name: string;
  size: number;
  type: string;
  preview?: string;
  documentId?: string;
  status: TemporaryAttachmentStatus | 'local' | 'uploading';
  progress?: number;
  error?: string;
}

const props = defineProps<{
  maxFiles?: number;
  maxSize?: number;
  disabled?: boolean;
  sessionId?: string;
  agentId?: string;
  agentSourceTenantId?: string;
}>();

const emit = defineEmits<{
  (e: 'update:files', files: AttachmentFile[]): void;
  (e: 'remove', id: string): void;
}>();

const attachments = ref<AttachmentFile[]>([]);
const fileInputRef = ref<HTMLInputElement>();
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();
let disposed = false;

const supportedTypes = ref([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.epub', '.mhtml',
  '.txt', '.md', '.csv', '.json', '.xml', '.html', '.markdown', '.yaml', '.yml', '.log',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp',
  '.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac',
]);

onMounted(async () => {
  try {
    const response = await getParserEngines();
    const discovered = (response.data || [])
      .filter(engine => engine.Available !== false)
      .flatMap(engine => engine.FileTypes || [])
      .filter((type) => {
        const normalizedType = type?.replace(/^\./, '').toLowerCase();
        return normalizedType && normalizedType !== 'url' && (!authStore.isLiteMode || normalizedType !== 'xmind');
      })
      .map(type => `.${type.replace(/^\./, '').toLowerCase()}`);
    supportedTypes.value = [...new Set([...supportedTypes.value, ...discovered])];
  } catch {
    // Keep the static baseline when engine discovery is unavailable.
  }
});

const maxFiles = computed(() => props.maxFiles || 5);
const maxSizeMB = computed(() => props.maxSize || MAX_FILE_SIZE_MB);
const maxSize = computed(() => maxSizeMB.value * 1024 * 1024);

const triggerFileSelect = () => {
  if (props.disabled) return;
  fileInputRef.value?.click();
};

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;
  await addFiles(Array.from(input.files));
  input.value = '';
};

const addFiles = async (files: File[]) => {
  if (props.disabled) return;

  for (const file of files) {
    if (attachments.value.length >= maxFiles.value) {
      MessagePlugin.warning(t('chat.attachmentTooMany', { max: maxFiles.value }));
      break;
    }

    if (file.size > maxSize.value) {
      MessagePlugin.warning(t('chat.attachmentTooLarge', { name: file.name, max: maxSizeMB.value }));
      continue;
    }

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if ((authStore.isLiteMode && ext === '.xmind') || !supportedTypes.value.includes(ext)) {
      MessagePlugin.warning(t('chat.attachmentTypeNotSupported', { name: file.name }));
      continue;
    }

    const attachment: AttachmentFile = {
      file,
      id: `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: file.type || ext,
      status: props.sessionId ? 'uploading' : 'local',
      progress: 0,
    };

    attachments.value.push(attachment);
    const reactiveAttachment = attachments.value[attachments.value.length - 1];
    emit('update:files', [...attachments.value]);
    if (props.sessionId) void uploadAttachment(reactiveAttachment);
  }
};

const emitFiles = () => emit('update:files', [...attachments.value]);

const uploadAttachment = async (attachment: AttachmentFile) => {
  if (!props.sessionId) return;
  try {
    const response = await uploadTemporaryAttachment(
      props.sessionId,
      attachment.file,
      props.agentId,
      props.agentSourceTenantId,
      'auto',
      (progress) => {
        attachment.progress = progress;
        emitFiles();
      },
    );
    attachment.documentId = response.data.id;
    if (disposed || !attachments.value.some(item => item.id === attachment.id)) {
      await deleteTemporaryAttachment(props.sessionId, response.data.id).catch(() => undefined);
      return;
    }
    void entitlementStore.refresh();
    attachment.status = response.data.status;
    attachment.progress = 100;
    emitFiles();
    if (attachment.status !== 'ready' && attachment.status !== 'failed') scheduleStatusPoll(attachment);
  } catch (error: any) {
    attachment.status = 'failed';
    attachment.error = error?.message || t('chat.attachmentUploadFailed');
    emitFiles();
  }
};

const scheduleStatusPoll = (attachment: AttachmentFile) => {
  clearPoll(attachment.id);
  pollTimers.set(attachment.id, setTimeout(() => void pollStatus(attachment), 800));
};

const pollStatus = async (attachment: AttachmentFile) => {
  if (!props.sessionId || !attachment.documentId || !attachments.value.some(item => item.id === attachment.id)) return;
  try {
    const response = await getTemporaryAttachment(props.sessionId, attachment.documentId);
    attachment.status = response.data.status;
    attachment.error = response.data.error_message;
    emitFiles();
    if (attachment.status !== 'ready' && attachment.status !== 'failed') scheduleStatusPoll(attachment);
  } catch (error: any) {
    attachment.status = 'failed';
    attachment.error = error?.message || t('chat.attachmentParseFailed');
    emitFiles();
  }
};

const clearPoll = (id: string) => {
  const timer = pollTimers.get(id);
  if (timer) clearTimeout(timer);
  pollTimers.delete(id);
};

const removeAttachment = (id: string) => {
  const index = attachments.value.findIndex(a => a.id === id);
  if (index !== -1) {
    const attachment = attachments.value[index];
    clearPoll(id);
    attachments.value.splice(index, 1);
    emitFiles();
    emit('remove', id);
    if (props.sessionId && attachment.documentId) void deleteTemporaryAttachment(props.sessionId, attachment.documentId).catch(() => undefined);
  }
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const getFileExt = (fileName: string): string => fileName.split('.').pop()?.toUpperCase() || 'FILE';
const getFileIcon = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['pdf'].includes(ext || '')) return 'file-pdf';
  if (['doc', 'docx'].includes(ext || '')) return 'file-word';
  if (['xls', 'xlsx'].includes(ext || '')) return 'file-excel';
  if (['ppt', 'pptx'].includes(ext || '')) return 'file-powerpoint';
  if (['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac'].includes(ext || '')) return 'sound';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(ext || '')) return 'image';
  return 'file';
};
const statusLabel = (attachment: AttachmentFile): string => {
  if (attachment.status === 'uploading') return t('chat.attachmentUploading', { progress: attachment.progress || 0 });
  if (attachment.status === 'uploaded' || attachment.status === 'processing') return t('chat.attachmentParsing');
  if (attachment.status === 'ready') return t('chat.attachmentReady');
  if (attachment.status === 'failed') return attachment.error || t('chat.attachmentParseFailed');
  return '';
};
const isPending = (attachment: AttachmentFile) => attachment.status === 'uploading' || attachment.status === 'uploaded' || attachment.status === 'processing';

onUnmounted(() => {
  disposed = true;
  pollTimers.forEach(timer => clearTimeout(timer));
  pollTimers.clear();
});

defineExpose({
  attachments,
  triggerFileSelect,
  addFiles,
  clear: () => {
    pollTimers.forEach(timer => clearTimeout(timer));
    pollTimers.clear();
    attachments.value = [];
    emit('update:files', []);
  }
});
</script>

<template>
  <div class="visual-attachment-upload">
    <input ref="fileInputRef" type="file" :accept="supportedTypes.join(',')" multiple class="visual-attachment-upload__input" @change="handleFileSelect" />
    <div v-if="attachments.length > 0" class="visual-attachment-list" aria-live="polite">
      <article v-for="attachment in attachments" :key="attachment.id" class="visual-attachment-card" :class="[`is-${attachment.status}`, { 'is-pending': isPending(attachment) }]">
        <span class="visual-attachment-card__icon" aria-hidden="true"><t-icon :name="getFileIcon(attachment.name)" /></span>
        <span class="visual-attachment-card__copy">
          <strong :title="attachment.name">{{ attachment.name }}</strong>
          <small><span>{{ getFileExt(attachment.name) }}</span><span aria-hidden="true">·</span><span>{{ formatFileSize(attachment.size) }}</span></small>
          <span v-if="attachment.status !== 'local'" class="visual-attachment-card__status" :title="statusLabel(attachment)">
            <span v-if="isPending(attachment)" class="visual-attachment-card__spinner" aria-hidden="true" />
            <t-icon v-else-if="attachment.status === 'ready'" name="check-circle" aria-hidden="true" />
            <t-icon v-else-if="attachment.status === 'failed'" name="close-circle" aria-hidden="true" />
            <span>{{ statusLabel(attachment) }}</span>
          </span>
        </span>
        <button type="button" class="visual-attachment-card__remove" :aria-label="$t('common.remove')" @click="removeAttachment(attachment.id)"><t-icon name="close" /></button>
        <span v-if="attachment.status === 'uploading'" class="visual-attachment-card__progress" aria-hidden="true"><span :style="{ width: `${Math.max(0, Math.min(100, attachment.progress || 0))}%` }" /></span>
      </article>
    </div>
    <slot name="trigger" :trigger="triggerFileSelect" :count="attachments.length" />
  </div>
</template>

<style scoped lang="less">
.visual-attachment-upload { width: 100%; min-width: 0; }
.visual-attachment-upload__input { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
.visual-attachment-list { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgb(229 231 235 / 60%); }
.visual-attachment-card { position: relative; flex: 0 1 auto; max-width: 270px; min-width: 150px; min-height: 30px; padding: 4px 28px 4px 8px; box-sizing: border-box; border: 1px solid #e5e7eb; border-radius: 8px; display: flex; align-items: center; gap: 8px; overflow: hidden; background: #fff; color: #374151; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-attachment-card.is-failed { border-color: #fecaca; background: #fffafa; }
.visual-attachment-card__icon { flex: 0 0 18px; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; color: #6b7280; }
.visual-attachment-card__icon :deep(.t-icon) { font-size: 16px; }
.visual-attachment-card__copy { min-width: 0; flex: 1 1 auto; display: grid; grid-template-columns: minmax(0,1fr) auto; grid-template-areas: 'name meta' 'status status'; column-gap: 6px; align-items: center; }
.visual-attachment-card__copy strong { grid-area: name; overflow: hidden; color: #374151; font-size: 12px; line-height: 18px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.visual-attachment-card__copy small { grid-area: meta; display: flex; align-items: center; gap: 3px; color: #9ca3af; font-size: 9px; line-height: 14px; white-space: nowrap; }
.visual-attachment-card__status { grid-area: status; min-width: 0; display: flex; align-items: center; gap: 4px; overflow: hidden; color: #9ca3af; font-size: 9px; line-height: 14px; white-space: nowrap; }
.visual-attachment-card__status > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.visual-attachment-card.is-ready .visual-attachment-card__status { color: #047857; }
.visual-attachment-card.is-failed .visual-attachment-card__status { color: #dc2626; }
.visual-attachment-card__status :deep(.t-icon) { flex: 0 0 10px; width: 10px; height: 10px; font-size: 10px; }
.visual-attachment-card__spinner { flex: 0 0 9px; width: 9px; height: 9px; border: 1px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: visual-attachment-spin .8s linear infinite; }
.visual-attachment-card__remove { position: absolute; top: 5px; right: 5px; width: 20px; height: 20px; padding: 3px; border: 0; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-attachment-card__remove:hover { color: #374151; background: #f3f4f6; }
.visual-attachment-card__remove :deep(.t-icon) { font-size: 11px; }
.visual-attachment-card__progress { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; overflow: hidden; background: #f3f4f6; }
.visual-attachment-card__progress > span { display: block; height: 100%; background: #9ca3af; transition: width 120ms linear; }
@keyframes visual-attachment-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .visual-attachment-card__spinner { animation: none; } .visual-attachment-card__progress > span { transition: none; } }
</style>
