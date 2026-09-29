<script setup lang="ts">
import { computed } from 'vue'
import type { CustomerConfig, CustomerProfile } from '@/api/customer'

const name = defineModel<string>('name', { required: true })
const description = defineModel<string>('description', { required: true })
const profile = defineModel<CustomerProfile>('profile', { required: true })
const props = defineProps<{ config: CustomerConfig; libraries: any[]; pages: any[]; templateMode?: boolean; editing?: boolean }>()
const statuses = computed(() => [...new Set([...props.config.statuses, profile.value.status].filter(Boolean))])
const tags = computed(() => [...new Set([...props.config.tags, ...profile.value.tags])])
const libraryOptions = computed(() => {
  const options = props.libraries.map(lib => ({ label: lib.name, value: lib.id }))
  for (const id of profile.value.shared_knowledge_base_ids) {
    if (!options.some(option => option.value === id)) options.push({ label: '已关联知识库（当前不可用）', value: id })
  }
  return options
})
const wikiOptions = computed(() => {
  const options = props.pages.filter(page => page.page_type !== 'index').map(page => ({ label: page.title, value: page.slug }))
  if (profile.value.wiki_slug && !options.some(option => option.value === profile.value.wiki_slug)) {
    options.push({ label: profile.value.wiki_slug, value: profile.value.wiki_slug })
  }
  return options
})
</script>

<template>
  <div class="profile-fields">
    <label class="wide">{{ templateMode ? '模板名称' : '客户名称' }} <span class="required">*</span><t-input v-model="name" :aria-label="templateMode ? '模板名称' : '客户名称'" :maxlength="80" :placeholder="templateMode ? '例如：课程咨询、学员交付' : '例如：Alex'" /></label>
    <label class="wide">{{ templateMode ? '适用场景' : '一句话说明' }}<t-textarea v-model="description" :aria-label="templateMode ? '适用场景' : '一句话说明'" :maxlength="500" :autosize="{ minRows: 2, maxRows: 4 }" :placeholder="templateMode ? '这套模板适用于哪些客户' : '目前的情况或关注点'" /></label>
    <label>{{ templateMode ? '默认状态' : '客户状态' }}<t-select v-model="profile.status" aria-label="客户状态" :options="statuses.map(value => ({ label: value, value }))" /></label>
    <label>标签<t-select v-model="profile.tags" aria-label="客户标签" multiple filterable clearable :options="tags.map(value => ({ label: value, value }))" placeholder="选择客户标签" /></label>
    <label v-if="!templateMode" class="wide">联系方式<t-input v-model="profile.contact" aria-label="联系方式" :maxlength="300" placeholder="微信、邮箱或电话" /></label>
    <label class="wide">{{ templateMode ? '默认备注' : '置顶备注' }}<t-textarea v-model="profile.note" aria-label="置顶备注" :maxlength="4000" :autosize="{ minRows: 3, maxRows: 8 }" placeholder="需要持续保留的背景或注意事项" /></label>
    <label class="wide">关联销售经验 / 课程知识库<t-select v-model="profile.shared_knowledge_base_ids" aria-label="关联知识库" multiple filterable clearable :options="libraryOptions" placeholder="选择公共知识库" /></label>
    <label v-if="editing && !templateMode && wikiOptions.length" class="wide">首页显示的客户画像<t-select v-model="profile.wiki_slug" aria-label="首页显示的客户画像" clearable filterable :options="wikiOptions" placeholder="自动选择客户画像" /><small>选择一篇 Wiki 作为客户首页的画像；留空时自动选择。</small></label>
  </div>
</template>

<style scoped>
.profile-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
label{display:block;min-width:0;font-size:14px;font-weight:500;color:var(--td-text-color-primary)}
label :deep(.t-input__wrap),label :deep(.t-textarea),label :deep(.t-select__wrap){margin-top:8px}
.wide{grid-column:1/-1}.required{color:var(--td-error-color)}
small{display:block;margin-top:8px;font-size:12px;font-weight:400;color:var(--td-text-color-secondary)}
@media(max-width:640px){.profile-fields{grid-template-columns:1fr}}
</style>
