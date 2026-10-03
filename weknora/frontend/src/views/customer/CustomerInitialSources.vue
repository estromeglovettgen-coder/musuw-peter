<script setup lang="ts">
import { ref } from 'vue'
import type { CustomerUploadItem } from '@/api/customer'
import CustomerChatPaste from './CustomerChatPaste.vue'
const files = defineModel<CustomerUploadItem[]>({ required: true })
defineProps<{ created: boolean; uploading: boolean }>()
const input = ref<HTMLInputElement>()
function select(event: Event) {
  const element = event.target as HTMLInputElement
  for (const file of Array.from(element.files || [])) {
    if (!files.value.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) {
      files.value.push({ file, status: 'pending', progress: 0 })
    }
  }
  element.value = ''
}
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
</script>
<template>
  <section class="initial-sources" aria-label="客户聊天资料">
    <h2>{{ created ? '资料上传' : '聊天资料（可选）' }}</h2>
    <p>{{ created ? '客户已保存，已上传的资料正在按保存的配置整理。' : '可上传聊天记录、截图或其他文件，也可直接粘贴聊天文字。' }}</p>
    <input ref="input" type="file" multiple hidden @change="select" />
    <div v-if="!created" class="source-actions"><t-button variant="outline" :disabled="uploading" @click="input?.click()"><template #icon><t-icon name="upload" /></template>选择文件</t-button><CustomerChatPaste :disabled="uploading" :add-file="file => { files.push({ file, status: 'pending', progress: 0 }) }" /></div>
    <ul v-if="files.length" aria-live="polite">
      <li v-for="(item, index) in files" :key="index">
        <div class="source-name"><strong>{{ item.file.name }}</strong><small>{{ size(item.file.size) }}</small></div>
        <span v-if="item.status === 'pending'">待上传</span>
        <span v-else-if="item.status === 'uploading'">{{ item.progress < 100 ? `上传 ${item.progress}%` : '正在接收…' }}</span>
        <span v-else-if="item.status === 'success'" class="success">已上传</span>
        <span v-else class="error">{{ item.error || '上传失败' }}</span>
        <t-button v-if="!created" variant="text" shape="square" :aria-label="`移除 ${item.file.name}`" @click="files.splice(index, 1)"><t-icon name="close" /></t-button>
      </li>
    </ul>
    <p v-else class="empty">尚未添加资料，也可以创建后再补充。</p>
    <t-alert v-if="created && !uploading && files.some(item => item.status === 'error')" theme="warning" message="部分文件上传失败。可重试失败文件，或先进入客户，稍后补传。" />
  </section>
</template>
<style scoped>
h2{font-size:20px;margin:0 0 14px}p,small{color:var(--td-text-color-secondary)}p{line-height:1.6;font-size:14px}
ul{padding:0;list-style:none;margin:24px 0}li{display:flex;align-items:center;gap:16px;padding:16px 0;border-bottom:1px solid var(--td-component-border);font-size:13px}
.source-name{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}strong{font-weight:500;overflow-wrap:anywhere}.error{max-width:48%;color:var(--td-error-color);overflow-wrap:anywhere}.success{color:var(--td-success-color)}.empty{padding:32px 0}
.source-actions{display:flex;gap:12px;flex-wrap:wrap}
</style>
