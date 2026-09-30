// Opt-in live server acceptance. Fixtures are synthetic; all generated outputs
// must come from the deployed pipeline, never seeded into database tables.
import assert from 'node:assert/strict'
import {readFileSync, writeFileSync} from 'node:fs'
import {api, request, login, runtime, state, save, record, upload, chat} from './server-client.mjs'

await login()
const mode = process.argv[2] || 'seed'
if (mode === 'seed') {
  const debug = new FormData()
  debug.set('input', '只回复 PETER_SERVER_OK')
  debug.set('options', JSON.stringify({max_tokens:100,thinking:false}))
  const result = await api(`/api/v1/models/${state.chatModel}/debug`, 'POST', debug)
  assert.match(JSON.stringify(result), /PETER_SERVER_OK/)
  record('DeepSeek native model debugger returns a real response')
  const base = {
    type:'document', embedding_model_id:state.embeddingModel, summary_model_id:state.chatModel,
    chunking_config:{chunk_size:512,chunk_overlap:50}, storage_provider_config:{provider:'local'},
    indexing_strategy:{vector_enabled:true,keyword_enabled:true,wiki_enabled:true,graph_enabled:false},
    wiki_config:{synthesis_model_id:state.chatModel,extraction_granularity:'focused',max_pages_per_ingest:4,ingest_map_parallel:1,ingest_reduce_parallel:1,ingest_max_inflight:1,content_instructions:'用中文简明整理，每个结论须有来源。客户材料优先概括背景、需求、顾虑和待确认事项。',extraction_instructions:'优先提取客户姓名、需求、顾虑及销售方法。'},
    vlm_config:{enabled:true,model_id:state.visionModel},
  }
  const rows = (await api('/api/v1/knowledge-bases')).data
  for (const [key,name,profile,content] of [
    ['commonKB','销售方法（验收演示）',null,'# 虚构课程与销售方法\n\n本材料仅作验收。星河表达课程编号 ST-742，持续 6 周，每周一次 45 分钟练习，学员可在周末查看回放。课程费用为 680 元。销售首先询问最近一次困难场景，区分时间顾虑和费用顾虑，再说明练习安排；不承诺保证结果。\n\n交付规则：每次练习后记录一个事实、一个感受和一个下次调整；每两周回顾一次。'],
    ['alexKB','Alex（验收演示）',{status:'沟通中',tags:['时间安排'],contact:'alex@example.test',note:'演示客户，尚未承诺报名。',shared_knowledge_base_ids:[],wiki_slug:''},'# Alex 聊天记录（虚构验收）\n\n2026-09-29 Alex：我 31 岁，在杭州做产品经理，预算 800 元。我的确认码是 ALEX-7319。\nPeter：你最想改善什么？\nAlex：第一次见面会紧张，解释太多。工作日只能晚上九点后，每周日有空。课程有回放吗？\nPeter：有周末回放，先确认你希望练习的具体场景。\nAlex：目前只是了解，没有决定购买。'],
    ['benKB','Ben（验收演示）',{status:'待了解',tags:['目标澄清'],contact:'ben@example.test',note:'演示客户，不可混入 Alex 的资料。',shared_knowledge_base_ids:[],wiki_slug:''},'# Ben 聊天记录（虚构验收）\n\n2026-09-29 Ben：我 27 岁，在成都做设计师，预算 500 元，确认码 BEN-2846。\nPeter：最困扰你的是什么？\nBen：我不想总是顺着别人。我想学拒绝，但担心只有理论没有练习。周二和周四晚上有空，还没决定报名。'],
  ]) {
    if(profile) profile.shared_knowledge_base_ids=[state.commonKB]
    const kb=rows.find(x=>x.name===name) || (await api('/api/v1/knowledge-bases','POST',{...base,name,description:'虚构验收数据，可删除。',...(profile?{customer_profile:profile}:{})})).data
    state[key]=kb.id; save()
    if(!state[key+'Doc']) {
      const doc=await upload(`/api/v1/knowledge-bases/${kb.id}/knowledge/file`,name+'.md',content)
      state[key+'Doc']=doc.data.id; save()
    }
    record(`Real source upload accepted: ${key}`)
  }
  if(!state.reportAgent) {
    state.reportAgent=(await api('/api/v1/agents','POST',{name:'客户报表助手（演示）',description:'使用已安装技能统计上传的 CSV，生成下载文件。',config:{agent_mode:'smart-reasoning',agent_type:'custom',model_id:state.chatModel,system_prompt:'根据任务使用 customer-report 技能。统计必须执行脚本，不可心算后伪造文件。返回真实下载文件。',max_iterations:8,max_completion_tokens:2000,temperature:0.2,skills_selection_mode:'selected',selected_skills:['customer-report'],sandbox_config_id:state.sandbox,kb_selection_mode:'none',allowed_tools:[],multi_turn_enabled:true,history_turns:10,image_upload_enabled:true,vlm_model_id:state.visionModel}})).data.id
    save()
  }
  if(!state.salesAgent) {
    state.salesAgent=(await api('/api/v1/agents','POST',{name:'Peter 销售助手',description:'结合当前客户与销售经验分析情况、起草回复；配置可自行修改。',config:{agent_mode:'smart-reasoning',agent_type:'hybrid-rag-wiki',model_id:state.chatModel,system_prompt:'你是 Peter 的销售工作助手。必须先检索当前客户及已关联销售知识库再回答事实问题。严格区分客户，不得混入其他客户信息。只根据原始材料、Wiki及明确的人工备注分析，不编造价格或承诺。不足之处说明需要确认。',max_iterations:8,max_completion_tokens:2000,temperature:0.2,kb_selection_mode:'selected',knowledge_bases:[state.commonKB],allowed_tools:['knowledge_search','grep_chunks','get_document_info','list_knowledge_chunks','wiki_search','wiki_read_page','wiki_read_source_doc'],multi_turn_enabled:true,history_turns:20,image_upload_enabled:true,vlm_model_id:state.visionModel,attachment_image_understanding:true,archive_customer_sources:true}})).data.id
    save()
  }
  record('Editable report and sales agents created')
} else if(mode==='skill') {
  const skills=(await api(`/api/v1/sandbox-configs/${state.sandbox}/skills`)).data
  assert.equal(skills.find(x=>x.name==='customer-report')?.status,'ready')
  record('Native skill installation completed with a persisted snapshot')
  state.reportSession=(await api('/api/v1/sessions','POST',{title:'客户跟进统计（验收）'})).data.id;save()
  const attachment=(await upload(`/api/v1/sessions/${state.reportSession}/attachments`,'followups.csv','customer,followups\nAlex,3\nBen,4\nCasey,5\n',{agent_id:state.reportAgent})).data
  state.reportAttachment=attachment.id;save()
  const stream=await chat(state.reportSession,state.reportAgent,'请用 customer-report 技能处理我上传的 followups.csv，执行脚本并生成 /workspace/output/customer-report.json，最后给我这个文件的下载链接。',{attachment_ids:[attachment.id]})
  console.log(stream.slice(-3500))
  const events=stream.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5)))
  assert.ok(!events.some(event=>event.response_type==='error'),'skill chat must not emit an error')
  state.reportMessage=events.find(event=>event.response_type==='agent_query')?.assistant_message_id
  assert.ok(state.reportMessage,'agent stream must expose the persisted assistant message ID')
  save()
  const artifacts=await api(`/api/v1/sessions/${state.reportSession}/artifacts`)
  assert.equal(artifacts.data?.length,1,'skill must create exactly one output artifact')
  const response=await request(`/api/v1/sessions/${state.reportSession}/messages/${state.reportMessage}/artifacts/0/download`)
  assert.equal(response.status,200,'the newly generated artifact must be downloadable without refresh')
  const output=JSON.parse(await response.text())
  assert.deepEqual(output,{customers:3,followups:12,names:['Alex','Ben','Casey']})
  record('Skill artifact download returns independently verified contents without refresh')
  writeFileSync(`${runtime}/report-artifacts.json`,JSON.stringify(artifacts,null,2),{mode:0o600})
  console.log(JSON.stringify(artifacts,null,2))
} else if(mode==='status') {
  for(const key of ['commonKB','alexKB','benKB']) {
    const doc=(await api(`/api/v1/knowledge/${state[key+'Doc']}`)).data
    const wiki=await api(`/api/v1/knowledgebase/${state[key]}/wiki/pages?page_size=100`)
    console.log(JSON.stringify({key,doc:{status:doc.parse_status,error:doc.error_message},wiki},null,2))
  }
}
