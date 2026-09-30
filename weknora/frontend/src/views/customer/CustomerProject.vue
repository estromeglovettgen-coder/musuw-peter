<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { marked } from 'marked'
import { sanitizeHTML } from '@/utils/security'
import { createManualKnowledge, getKnowledgeBaseById, listKnowledgeBases, listKnowledgeFiles, uploadKnowledgeFile } from '@/api/knowledge-base'
import { getWikiPage, getWikiStats, listWikiPages } from '@/api/wiki'
import { isBuiltinAgent, listAgents } from '@/api/agent'
import { useSettingsStore } from '@/stores/settings'
import { customerSessions, emptyCustomerProfile, newCustomerSession } from '@/api/customer'
import PeterTermHelp from '@/components/PeterTermHelp.vue'
import KnowledgeBaseEditorModal from '@/views/knowledge/KnowledgeBaseEditorModal.vue'
import KnowledgeBase from '@/views/knowledge/KnowledgeBase.vue'
import { selectCustomerOverview } from './customerOverview'
import { customerVisibleNote, customerVisibleTags } from './customerPresentation'
import './customer.css'
const route = useRoute(), router = useRouter()
const id = computed(() => String(route.params.kbId))
const tabKeys = ['overview', 'documents', 'wiki', 'graph', 'conversations', 'timeline']
const tab = computed(() => tabKeys.includes(String(route.query.tab)) ? String(route.query.tab) : 'overview')
const isContentTab = computed(() => ['documents', 'wiki', 'graph'].includes(tab.value))
const kb = ref<any>(null), profile = ref<any>(emptyCustomerProfile()), pages = ref<any[]>([]), wiki = ref<any>(null), files = ref<any[]>([]), sessions = ref<any[]>([]), libraries = ref<any[]>([])
const busy = ref(true), error = ref(''), detailError = ref(''), showSettings = ref(false), showRecord = ref(false), saving = ref(false), uploading = ref(false), openingChat = ref(false)
const record = ref({ kind: '沟通记录', title: '', content: '' })
const fileInput = ref<HTMLInputElement>(), uploadStatus = ref('')
const wikiProcessing = ref(false)
const wikiEnabled = computed(() => !!kb.value?.indexing_strategy?.wiki_enabled)
const processing = computed(() => wikiProcessing.value || files.value.some(file => ['pending','processing','parsing','finalizing','running'].includes(file.parse_status)))
let sequence = 0, refreshTimer: ReturnType<typeof setTimeout> | undefined
const name = computed(() => kb.value?.name || '客户')
const customerTags = computed(() => customerVisibleTags(profile.value))
const customerNote = computed(() => customerVisibleNote(profile.value?.note, kb.value?.description))
const base = computed(() => `/platform/customers/${id.value}`)
const tabs = computed(() => [
  { name: '概览', key: 'overview', help: '' }, { name: '资料', key: 'documents', help: '' },
  { name: '客户分析', key: 'wiki', help: 'Wiki：系统把客户资料整理成相互关联的主题页面，方便回看客户背景、需求和沟通进展。' },
  { name: '关系图', key: 'graph', help: '知识图谱：从客户资料中提取人物、需求、顾虑等信息及其关系。图中的内容仍以原始资料为准。' },
  { name: '对话记录', key: 'conversations', help: '' }, { name: '时间线', key: 'timeline', help: '' },
].map(item => ({ ...item, href: `${base.value}?tab=${item.key}` })))
const wikiHTML = computed(() => sanitizeHTML(marked.parse((wiki.value?.content || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_: string, slug: string, title: string) => `[${title || slug}](${base.value}?tab=wiki&slug=${encodeURIComponent(slug)})`), {async:false}) as string))
const sharedNames = computed(() => libraries.value.filter(lib => profile.value.shared_knowledge_base_ids?.includes(lib.id)).map(lib => lib.name))
const timeline = computed(() => [...files.value.map(file => ({id:file.id,title:file.title || file.file_name,kind:file.type === 'manual' ? '资料 / 记录' : '上传资料',date:file.created_at,href:base.value+'?tab=documents&knowledge_id='+encodeURIComponent(file.id),icon:'file'})), ...sessions.value.map(s => ({id:s.id,title:s.title || '客户分析',kind:'AI 会话',date:s.updated_at,href:`/platform/chat/${s.id}`,icon:'chat'}))].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()))
const time = (value: string) => value ? new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'
async function load() {
  const run = ++sequence, target = id.value
  if (refreshTimer) clearTimeout(refreshTimer)
  busy.value = !kb.value || kb.value.id !== target; error.value = ''; detailError.value = ''
  try {
    const response: any = await getKnowledgeBaseById(target)
    if (run !== sequence) return
    if (!response.data?.customer_profile) throw new Error('未找到客户项目')
    kb.value = response.data; profile.value = response.data.customer_profile
    const results = await Promise.allSettled([listKnowledgeFiles(target,{page:1,page_size:100}), customerSessions(target), wikiEnabled.value ? listWikiPages(target,{page_size:100,sort_by:'updated_at',sort_order:'desc'}) : Promise.resolve({pages:[]}), listKnowledgeBases(), wikiEnabled.value ? getWikiStats(target) : Promise.resolve(null)])
    if (run !== sequence) return
    const data = (index: number) => { const r = results[index]; return r.status === 'fulfilled' ? ((r.value as any)?.data ?? r.value) : null }
    files.value = data(0) || []; sessions.value = data(1) || []; pages.value = data(2)?.pages || []; libraries.value = (data(3) || []).filter((lib: any)=>!lib.customer_profile)
    wikiProcessing.value = !!(data(4)?.pending_tasks || data(4)?.is_active)
    if (results.some(r=>r.status==='rejected')) detailError.value = '部分资料未能读取，可刷新重试。'
    const selected = selectCustomerOverview(pages.value, name.value, profile.value.wiki_slug)
    if (selected) {
      try { const page: any = await getWikiPage(target,selected.slug); if (run === sequence) wiki.value = page.data ?? page }
      catch { if (run === sequence) { wiki.value=null; detailError.value='客户概况暂时不可用，可在「编辑客户」中重新选择概览内容。' } }
    } else wiki.value = null
    if (run !== sequence) return
    if (processing.value) refreshTimer = setTimeout(load,8000)
  } catch (e:any) { if (run===sequence) error.value=e.message || '客户加载失败' }
  finally { if (run===sequence) busy.value=false }
}
function openEdit() { showSettings.value = true }
async function chat(fresh=false) {
  if (openingChat.value) return
  openingChat.value=true
  try {
    const existing = !fresh && sessions.value[0]
    const settings = useSettingsStore()
    if (!existing && isBuiltinAgent(settings.selectedAgentId)) {
      const agents = await listAgents()
      const preset = agents.data.find(agent => !agent.is_builtin && agent.name === 'Peter 销售助手')
      if (preset) settings.selectAgent(preset.id)
    }
    const s = existing || await newCustomerSession(id.value,name.value)
    await router.push(`/platform/chat/${s.id}`)
  }
  catch(e:any){MessagePlugin.error(e.message || '打开会话失败')} finally{openingChat.value=false}
}
async function addRecord() {
  if (!record.value.content.trim()) return MessagePlugin.warning('请填写记录内容')
  saving.value=true
  try { await createManualKnowledge(id.value,{title:`${record.value.kind} · ${record.value.title || new Date().toLocaleDateString('zh-CN')}`,content:record.value.content,status:'publish'}); showRecord.value=false; record.value={kind:'沟通记录',title:'',content:''}; MessagePlugin.success('记录已保存，正在整理'); await load() }
  catch(e:any){MessagePlugin.error(e.message || '保存失败')}finally{saving.value=false}
}
async function upload(event: Event) {
  const selected=Array.from((event.target as HTMLInputElement).files || []); if(!selected.length) return
  const target=id.value
  uploading.value=true; let done=0,failed=0
  for(const file of selected){ uploadStatus.value=`上传资料 ${done+failed+1}/${selected.length}：${file.name}`; try{await uploadKnowledgeFile(target,{file});done++}catch(e:any){failed++;MessagePlugin.error(`${file.name}：${e.message || '上传失败'}`)} }
  if(id.value!==target){uploading.value=false;uploadStatus.value='';return}
  uploadStatus.value=`已上传 ${done} 份${failed ? `，${failed} 份失败，请重新选择重试` : '，后续整理进度可在资料页查看'}`; uploading.value=false; if(fileInput.value)fileInput.value.value=''; await load()
}
watch(id,()=>{kb.value=null;wiki.value=null;wikiProcessing.value=false;files.value=[];sessions.value=[];void load()},{immediate:true})
onBeforeUnmount(()=>{sequence++;if(refreshTimer)clearTimeout(refreshTimer)})
</script>
<template>
  <main class="customer-page customer-project" :class="{'customer-project--content':isContentTab}">
    <router-link class="customer-back" to="/platform/customers"><t-icon name="chevron-left"/>所有客户</router-link>
    <div v-if="busy" class="customer-empty"><t-loading text="正在读取客户资料…"/></div>
    <div v-else-if="error" class="customer-empty"><p>{{error}}</p><button class="customer-secondary" @click="load">重新加载</button></div>
    <template v-else-if="kb">
      <header class="customer-heading"><div class="customer-title"><div><h1>{{name}}</h1><div v-if="customerTags.length" class="customer-tags"><span v-for="item in customerTags" :key="item">{{item}}</span></div></div></div><div class="customer-actions"><button class="customer-secondary" @click="openEdit"><t-icon name="edit"/>编辑客户</button><button class="customer-primary" :disabled="openingChat" @click="chat()"><t-icon name="chat"/>继续分析</button></div></header>
      <nav class="customer-project-tabs" aria-label="客户项目"><span v-for="item in tabs" :key="item.key" class="customer-project-tab"><router-link :to="item.href" :class="{active:tab===item.key}" :aria-current-value="tab===item.key ? 'page' : 'false'">{{item.name}}</router-link><PeterTermHelp v-if="item.help" :text="item.help" :label="`了解${item.name}`" /></span></nav>
      <t-alert v-if="detailError" theme="warning" :message="detailError" style="margin-bottom:16px"><template #operation><button class="customer-icon" @click="load">刷新</button></template></t-alert>
      <t-alert v-if="uploadStatus" :theme="uploading ? 'info' : 'success'" :message="uploadStatus" style="margin-bottom:16px"/>
      <div v-if="tab==='overview'" class="customer-overview"><section><article class="customer-panel"><div class="customer-panel-head"><h2>客户概况</h2><router-link v-if="wikiEnabled" class="customer-muted" :to="base+'?tab=wiki'+(wiki ? '&slug='+encodeURIComponent(wiki.slug) : '')">查看完整分析 <t-icon name="arrow-up-right"/></router-link></div><p class="customer-muted">{{!wikiEnabled ? '未开启自动整理' : processing ? '正在整理客户概况…' : wiki ? time(wiki.updated_at)+' 更新' : '等待资料整理'}}</p><div v-if="wiki" class="customer-profile-markdown" v-html="wikiHTML"/><div v-else class="customer-empty"><t-icon name="file" size="28px"/><p>{{!wikiEnabled ? '可在「编辑客户」的资料整理选项中开启自动整理。' : processing ? '整理完成后会自动更新。' : '上传聊天记录后，这里将展示整理出的客户概况。'}}</p><button class="customer-secondary" :disabled="uploading" @click="fileInput?.click()">上传资料</button></div></article><article class="customer-panel"><div class="customer-panel-head"><h2>最近记录</h2><button class="customer-secondary" @click="showRecord=true"><t-icon name="add"/>添加记录</button></div><div v-for="entry in timeline.slice(0,5)" :key="entry.id" class="customer-record"><span class="customer-record-icon"><t-icon :name="entry.icon"/></span><div class="customer-record-copy"><router-link :to="entry.href">{{entry.title}}</router-link><p><time>{{time(entry.date)}} · {{entry.kind}}</time></p></div></div><p v-if="!timeline.length" class="customer-muted">沟通、上传和 AI 会话会汇集在这里。</p></article></section>
        <aside><article class="customer-panel"><h2>客户名片</h2><dl class="customer-metadata"><dt>联系方式</dt><dd>{{profile.contact || '尚未填写'}}</dd><dt>可参考的资料库<PeterTermHelp text="公共知识库：可让智能体在分析这个客户时参考所选销售案例或课程资料，不会把这些共用资料复制进客户资料。" label="了解可参考的资料库" /></dt><dd>{{sharedNames.join('、') || '尚未关联'}}</dd><dt>资料数量</dt><dd>{{kb.knowledge_count || files.length}} 份</dd></dl></article><article class="customer-panel"><div class="customer-panel-head"><h2>客户备注</h2><button class="customer-icon" aria-label="编辑客户备注" @click="openEdit"><t-icon name="edit"/></button></div><p class="customer-note">{{customerNote || '暂无备注'}}</p></article><button class="customer-secondary" style="width:100%;margin-bottom:10px" :disabled="uploading" @click="fileInput?.click()"><t-icon name="upload"/>上传聊天资料</button></aside>
      </div>
      <div v-else-if="isContentTab" class="customer-content"><KnowledgeBase :key="id" embedded /></div>
      <section v-else-if="tab==='conversations'" class="customer-panel"><div class="customer-panel-head"><h2>这个客户的 AI 对话</h2><button class="customer-primary" :disabled="openingChat" @click="chat(true)"><t-icon name="add"/>新开一条对话</button></div><div v-for="s in sessions" :key="s.id" class="customer-record"><span class="customer-record-icon"><t-icon name="chat"/></span><div class="customer-record-copy"><router-link :to="'/platform/chat/'+s.id">{{s.title || '客户分析'}}</router-link><p><time>{{time(s.updated_at)}}</time></p></div><t-icon name="chevron-right"/></div><p v-if="!sessions.length" class="customer-muted">还没有对话，开始第一次分析。</p></section>
      <section v-else class="customer-panel"><div class="customer-panel-head"><h2>客户时间线</h2><button class="customer-secondary" @click="showRecord=true"><t-icon name="add"/>添加记录</button></div><div v-for="entry in timeline" :key="entry.id" class="customer-record"><span class="customer-record-icon"><t-icon :name="entry.icon"/></span><div class="customer-record-copy"><router-link :to="entry.href">{{entry.title}}</router-link><p><time>{{time(entry.date)}} · {{entry.kind}}</time></p></div></div><p v-if="!timeline.length" class="customer-muted">添加第一条沟通记录，或上传资料。</p></section>
    </template>
    <input ref="fileInput" type="file" multiple hidden @change="upload"/>

    <t-dialog v-model:visible="showRecord" header="添加客户记录" :confirm-btn="{content:'保存并整理',loading:saving}" @confirm="addRecord"><div class="customer-form"><label>记录类型<t-select v-model="record.kind" :options="['沟通记录','跟进记录','补充备注'].map(value=>({label:value,value}))"/></label><label>标题<t-input v-model="record.title" placeholder="例如：9 月 28 日课程咨询" :maxlength="100"/></label><label>内容<t-textarea v-model="record.content" :autosize="{minRows:8,maxRows:16}" placeholder="粘贴聊天原文或记录实际发生的情况，可注明沟通时间与说话人。"/></label></div></t-dialog>
    <KnowledgeBaseEditorModal v-if="kb" v-model:visible="showSettings" mode="edit" customer :kb-id="kb.id" @success="load"/>
  </main>
</template>
