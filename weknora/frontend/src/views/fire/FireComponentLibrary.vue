<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import FireBrand from '@/components/fire/FireBrand.vue'

const query = ref('')
const course = ref('expression')
const enabled = ref(true)
const tab = ref('wiki')
const dialog = ref(false)
const drawer = ref(false)
const saving = ref(false)
const status = ref('')
const courses = [{ label: '真男人不要输在表达上', value: 'expression' }, { label: '社交媒体自我价值展示', value: 'social' }]
function handleMenu({ value }: { value?: unknown }) {
  MessagePlugin.info(value === 'copy' ? '已选择复制链接' : '已选择重命名')
}
async function save() {
  saving.value = true
  await new Promise(resolve => setTimeout(resolve, 650))
  saving.value = false
  status.value = '示例已保存'
  MessagePlugin.success('示例已保存')
}
</script>

<template>
  <main class="fire-library">
    <header class="fire-library__header"><div><p class="fire-library__eyebrow">FIRE / DESIGN SYSTEM</p><h1>火种组件库</h1><p>工作区正在使用的品牌、控件与内容样式。</p></div><FireBrand /></header>
    <section class="fire-library__section" aria-labelledby="fire-brand-title">
      <div class="fire-library__section-copy"><span>01</span><h2 id="fire-brand-title">品牌与色彩</h2><p>同一个火焰标记，贯穿导航、对话和移动端。</p></div>
      <div class="fire-library__samples"><div class="fire-library__brand"><FireBrand /><FireBrand mark-only /></div><div class="fire-library__swatches"><div v-for="item in [['底色', '#0b0b0d'], ['面板', '#151518'], ['分隔线', '#2b2b31'], ['重点色', '#d62642']]" :key="item[0]"><i :style="{ background: item[1] }" /><span>{{ item[0] }}</span><code>{{ item[1] }}</code></div></div></div>
    </section>
    <section class="fire-library__section" aria-labelledby="fire-buttons-title">
      <div class="fire-library__section-copy"><span>02</span><h2 id="fire-buttons-title">操作与状态</h2><p>原生 TDesign 行为，共用火种主题。</p></div>
      <div class="fire-library__samples"><div class="fire-library__row"><t-button theme="primary" :loading="saving" @click="save"><template #icon><t-icon name="save" /></template>保存示例</t-button><t-button theme="default" @click="dialog = true">打开对话框</t-button><t-button theme="default" variant="outline" @click="drawer = true">查看来源</t-button><t-button theme="primary" variant="text" @click="MessagePlugin.info('内容已展开')">文字操作</t-button><t-button theme="default" disabled>不可用</t-button></div><div class="fire-library__row"><t-tag>概念</t-tag><t-tag theme="primary" variant="light">已选课程</t-tag><t-loading size="small" text="正在保存" /></div><p class="fire-library__status" role="status">{{ status || '点击控件可查看真实交互。' }}</p></div>
    </section>
    <section class="fire-library__section" aria-labelledby="fire-inputs-title">
      <div class="fire-library__section-copy"><span>03</span><h2 id="fire-inputs-title">输入与选择</h2><p>支持键盘选择、搜索、焦点和禁用状态。</p></div>
      <div class="fire-library__samples"><div class="fire-library__fields"><label class="fire-library__field"><span>搜索知识</span><t-input v-model="query" placeholder="搜索知识…" clearable aria-label="搜索知识"><template #prefix-icon><t-icon name="search" /></template></t-input></label><label class="fire-library__field"><span>选择课程</span><t-select v-model="course" :options="courses" aria-label="选择课程" /></label></div><label class="fire-library__field"><span>对话内容</span><t-textarea placeholder="说说你现在遇到的情况…" :autosize="{ minRows: 2, maxRows: 5 }" aria-label="对话内容" /></label><div class="fire-library__row"><t-switch v-model="enabled" aria-label="显示课程来源" /><span>显示课程来源</span><t-dropdown :options="[{ content: '复制链接', value: 'copy' }, { content: '重命名', value: 'rename' }]" @click="handleMenu"><t-button variant="text">更多操作 <t-icon name="chevron-down" /></t-button></t-dropdown></div></div>
    </section>
    <section class="fire-library__section" aria-labelledby="fire-content-title">
      <div class="fire-library__section-copy"><span>04</span><h2 id="fire-content-title">导航与阅读</h2><p>内容层级优先，减少多余边框。</p></div>
      <div class="fire-library__samples"><t-tabs v-model="tab"><t-tab-panel value="documents" label="文档"><p>课程文件与逐字稿</p></t-tab-panel><t-tab-panel value="wiki" label="Wiki"><article class="fire-prose"><h2>话术与交流</h2><p>话术是交流的支架，真实反应决定对话如何继续。</p><blockquote>不要把交流变成流程。</blockquote><p>相关知识：<a href="#fire-content-title">自然表达</a> · <a href="#fire-content-title">真实反馈</a></p></article></t-tab-panel><t-tab-panel value="graph" label="图谱"><p>概念、实体与课程之间的真实关联。</p></t-tab-panel></t-tabs><t-alert theme="info" message="这是组件交互示例，不会修改课程数据。" /></div>
    </section>
    <t-dialog v-model:visible="dialog" header="保存这次修改？" confirm-btn="确认保存" cancel-btn="取消" @confirm="dialog = false; save()"><p>查看对话框的文字、边框、主操作与键盘焦点。</p><t-input placeholder="文档名称" aria-label="文档名称" /></t-dialog>
    <t-drawer :close-btn="true" v-model:visible="drawer" header="引用来源" size="360px" :footer="false"><article class="fire-prose"><t-tag>课程逐字稿</t-tag><h2>新搭讪讲解</h2><p>00:07:40–00:08:27</p><blockquote>把注意力放回眼前的人和情境。</blockquote><p>来源示例，用于检查抽屉、阅读区和滚动状态。</p></article></t-drawer>
  </main>
</template>

<style scoped>
.fire-library { flex: 1; min-width: 0; overflow: auto; padding: 40px clamp(22px, 4vw, 64px) 70px; background: var(--fire-canvas); color: var(--fire-text); }
.fire-library__header { max-width: 1160px; margin: 0 auto 40px; display: flex; justify-content: space-between; align-items: center; gap: 24px; }
.fire-library__header h1 { margin: 8px 0 12px; font-size: 30px; font-weight: 600; letter-spacing: -.03em; }
.fire-library__header p { margin: 0; color: var(--fire-muted); font-size: 13px; }
.fire-library__header .fire-library__eyebrow { color: var(--fire-link); letter-spacing: .16em; font-size: 10px; }
.fire-library__section { max-width: 1160px; margin: 0 auto; padding: 30px 0 36px; display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 36px; border-top: 1px solid var(--fire-line); }
.fire-library__section-copy > span { color: var(--fire-muted); font-size: 11px; font-family: var(--app-font-family-mono); }
.fire-library__section-copy h2 { margin: 9px 0 10px; font-size: 17px; font-weight: 600; }
.fire-library__section-copy p { margin: 0; color: var(--fire-muted); font-size: 12px; line-height: 1.8; }
.fire-library__samples { display: flex; flex-direction: column; gap: 22px; min-width: 0; }
.fire-library__row, .fire-library__brand { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.fire-library__brand { gap: 48px; min-height: 60px; }
.fire-library__swatches { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.fire-library__swatches > div { display: grid; gap: 7px; color: var(--fire-secondary); font-size: 12px; }
.fire-library__swatches i { display: block; height: 42px; border: 1px solid var(--fire-line-strong); border-radius: 6px; }
.fire-library__swatches code { color: var(--fire-muted); font-size: 11px; }
.fire-library__field { display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 12px; color: var(--fire-secondary); }
.fire-library__fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.fire-library__status { min-height: 20px; margin: 0; color: var(--fire-muted); font-size: 12px; }
@media (max-width: 900px) { .fire-library__section { grid-template-columns: 1fr; gap: 22px; } }
@media (max-width: 540px) { .fire-library__header > .fire-brand { display: none; } .fire-library__swatches { grid-template-columns: 1fr 1fr; } .fire-library__fields { grid-template-columns: 1fr; } }
</style>
