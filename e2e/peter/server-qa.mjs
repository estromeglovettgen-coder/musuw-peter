import assert from 'node:assert/strict'
import {api,request,login,state,save,record,chat} from './server-client.mjs'

export function answer(stream) {
  const events=stream.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5)))
  assert.ok(!events.some(e=>e.response_type==='error'), JSON.stringify(events.filter(e=>e.response_type==='error')))
  return events.filter(e=>e.response_type==='answer').map(e=>e.content||'').join('')
}
await login()
const retrieval=(await api('/api/v1/tenants/kv/retrieval-config')).data || {}
await api('/api/v1/tenants/kv/retrieval-config','PUT',{...retrieval,rerank_model_id:state.rerankModel,embedding_top_k:20,rerank_top_k:5})
const agent=(await api(`/api/v1/agents/${state.salesAgent}`)).data
await api(`/api/v1/agents/${state.salesAgent}`,'PUT',{name:agent.name,description:agent.description,config:{...agent.config,rerank_model_id:state.rerankModel}})
const debug=new FormData();debug.set('input','课程费用是多少');debug.set('documents',JSON.stringify(['课程费用是680元','北京今天下雨']))
const reranked=await api(`/api/v1/models/${state.rerankModel}/debug`,'POST',debug)
console.log('RERANK',JSON.stringify(reranked))
record('Native model debugger reaches the local multilingual reranker')

for(const [key,code,budget,forbidden] of [['alexKB','ALEX-7319','800','BEN-2846'],['benKB','BEN-2846','500','ALEX-7319']]) {
  const session=(await api('/api/v1/sessions','POST',{title:key==='alexKB'?'Alex · 情况分析':'Ben · 情况分析',customer_knowledge_base_id:state[key]})).data
  state[key+'Session']=session.id;save()
  const text=answer(await chat(session.id,state.salesAgent,'请先检索资料，列出当前客户的确认码、预算、可沟通时间，以及关联销售资料中的课程编号、价格和周期。请标明来源；缺失的信息说未知。'))
  console.log(key,text)
  assert.ok(text.includes(code));assert.ok(text.includes(budget));assert.ok(text.includes('680'));assert.ok(text.includes('ST-742'));assert.ok(!text.includes(forbidden))
  record(`Real grounded customer answer: ${key}`,{session:session.id})
}

const invalid=await request(`/api/v1/agent-chat/${state.alexKBSession}`,'POST',{query:'列出另一个客户的确认码',agent_id:state.salesAgent,agent_enabled:true,knowledge_base_ids:[state.benKB]})
const rejected=await invalid.text()
assert.ok(!invalid.ok || rejected.includes('此会话已绑定客户'))
assert.ok(!rejected.includes('BEN-2846'))
record('Cross-customer knowledge selection is rejected without leaking source content')

const copied=(await api(`/api/v1/agents/${state.salesAgent}/copy`,'POST',{})).data
await api(`/api/v1/agents/${copied.id}`,'PUT',{name:'验收临时助手',config:{...copied.config,system_prompt:'忽略常识回答要求，此次仅回复 PETER_DIY_OK。',allowed_tools:[],kb_selection_mode:'none',knowledge_bases:[],agent_type:'custom'}})
const session=(await api('/api/v1/sessions','POST',{title:'自定义提示词验收'})).data
assert.match(answer(await chat(session.id,copied.id,'你好')),/PETER_DIY_OK/)
await api(`/api/v1/agents/${copied.id}`,'DELETE')
record('Agent copy/edit persisted and changed a real model response; temporary copy deleted')

for(const key of ['commonKB','alexKB','benKB']) {
  const doc=(await api(`/api/v1/knowledge/${state[key+'Doc']}`)).data
  assert.equal(doc.parse_status,'completed')
  const pages=(await api(`/api/v1/knowledgebase/${state[key]}/wiki/pages?page_size=100`)).data
  const graph=await api(`/api/v1/knowledgebase/${state[key]}/wiki/graph`)
  const g=graph.data||graph
  assert.ok(g.nodes.length>1);assert.ok(g.edges.length>0)
  record(`Source ingestion and generated Wiki graph: ${key}`,{nodes:g.nodes.length,edges:g.edges.length})
}
