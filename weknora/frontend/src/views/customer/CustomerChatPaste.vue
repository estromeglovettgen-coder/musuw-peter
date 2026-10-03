<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

const props = defineProps<{
  addFile: (file: File) => void | boolean | Promise<void | boolean>
  disabled?: boolean
}>()
const visible = ref(false), saving = ref(false), title = ref(''), content = ref('')
async function save() {
  if (saving.value || props.disabled) return
  if (!content.value.trim()) return MessagePlugin.warning('请先粘贴聊天记录')
  saving.value = true
  try {
    const name = (title.value.trim() || `聊天记录 ${new Date().toLocaleDateString('sv-SE')}`).replace(/[\\/:*?"<>|]/g, '-')
    const file = new File([content.value], `${name.replace(/\.txt$/i, '')}.txt`, { type: 'text/plain;charset=utf-8' })
    if (await props.addFile(file) === false) return
    visible.value = false; title.value = ''; content.value = ''
  } catch (error: any) {
    MessagePlugin.error(error.message || '聊天记录未能保存，请重试')
  } finally { saving.value = false }
}
</script>

<template>
  <t-button variant="outline" :disabled="disabled" @click="visible = true"><template #icon><t-icon name="paste" /></template>粘贴聊天记录</t-button>
  <t-dialog v-model:visible="visible" header="粘贴聊天记录" width="min(680px, calc(100vw - 32px))" :z-index="3500"
    :confirm-btn="{ content: '添加资料', loading: saving }" :cancel-btn="{ disabled: saving }" :close-btn="!saving"
    :close-on-overlay-click="!saving" :close-on-esc-keydown="!saving" @confirm="save">
    <div class="chat-paste-form">
      <label>标题（可选）<t-input v-model="title" aria-label="聊天记录标题" :maxlength="100" placeholder="例如：10 月 2 日课程咨询" :disabled="saving" /></label>
      <label>聊天记录<t-textarea v-model="content" aria-label="聊天记录内容" :autosize="{ minRows: 10, maxRows: 16 }" :disabled="saving" placeholder="直接粘贴双方聊天原文，保留说话人和时间。" /></label>
    </div>
  </t-dialog>
</template>

<style scoped>
.chat-paste-form{display:flex;flex-direction:column;gap:18px}.chat-paste-form label{display:flex;flex-direction:column;gap:8px;font-size:14px}
</style>
