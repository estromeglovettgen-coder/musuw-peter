<script setup lang="ts">
import { computed } from 'vue'
import type { CustomerConfig, CustomerProfile } from '@/api/customer'
import PeterTermHelp from '@/components/PeterTermHelp.vue'

const name = defineModel<string>('name', { required: true })
const profile = defineModel<CustomerProfile>('profile', { required: true })
const props = defineProps<{ config: CustomerConfig; libraries: any[]; pages: any[]; editing?: boolean }>()
const tags = computed(() => [...new Set([...props.config.tags, ...profile.value.tags])])
const libraryOptions = computed(() => {
  const options = props.libraries.map(lib => ({ label: lib.name, value: lib.id }))
  for (const id of profile.value.shared_knowledge_base_ids) {
    if (!options.some(option => option.value === id)) options.push({ label: '已关联资料库（当前不可用）', value: id })
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
    <label>客户名称 <span class="required">*</span><t-input v-model="name" aria-label="客户名称" :maxlength="80" placeholder="例如：Alex" /></label>
    <label>联系方式<t-input v-model="profile.contact" aria-label="联系方式" :maxlength="300" placeholder="微信、邮箱或电话" /></label>
    <label class="wide">客户标签<PeterTermHelp text="客户标签：可以同时选多个，也可以输入新标签后回车。旧客户的“状态”会作为普通标签显示，不再需要单独设置状态。" label="了解客户标签" /><t-select v-model="profile.tags" aria-label="客户标签" multiple creatable filterable clearable :options="tags.map(value => ({ label: value, value }))" placeholder="选择标签，或输入新标签后回车" /></label>
    <label class="wide">客户备注<PeterTermHelp text="客户备注：记录客户现状、需求、顾虑或跟进事项，智能体分析时可将它作为背景。旧版的一句话说明和置顶备注会在这里一起显示。" label="了解客户备注" /><t-textarea v-model="profile.note" aria-label="客户备注" :maxlength="10000" :autosize="{ minRows: 4, maxRows: 10 }" placeholder="客户目前的情况、关注点，以及后续需要跟进的事项" /></label>
    <label class="wide">回答可参考的资料库<PeterTermHelp text="公共知识库：可选择销售案例、课程等共用资料，智能体分析这个客户时能同时参考。客户自己的聊天记录仍保存在独立资料中。" label="了解共用资料库" /><t-select v-model="profile.shared_knowledge_base_ids" aria-label="回答可参考的资料库" multiple filterable clearable :options="libraryOptions" placeholder="选择销售经验或课程资料" /></label>
    <label v-if="editing && wikiOptions.length" class="wide">概览显示哪篇客户分析<PeterTermHelp text="Wiki 页面：系统从客户资料中整理出的主题页面。选中一篇显示在客户概览；留空时系统自动选择。" label="了解首页客户分析" /><t-select v-model="profile.wiki_slug" aria-label="概览显示哪篇客户分析" clearable filterable :options="wikiOptions" placeholder="自动选择客户分析" /></label>
  </div>
</template>

<style scoped>
.profile-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}
label{display:block;min-width:0;font-size:14px;font-weight:500;color:var(--td-text-color-primary)}
label :deep(.t-input__wrap),label :deep(.t-textarea),label :deep(.t-select__wrap){margin-top:8px}
.wide{grid-column:1/-1}.required{color:var(--td-error-color)}
@media(max-width:640px){.profile-fields{grid-template-columns:1fr}}
</style>
