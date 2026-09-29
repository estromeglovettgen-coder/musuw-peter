// Creates fictional LOCAL review data. No model calls and no production access.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const runtime=resolve(root,'.runtime/peter')
const origin='http://127.0.0.1:18187'
const account=JSON.parse(readFileSync(resolve(runtime,'preview-account.json'),'utf8'))
let token=''
async function api(path,method='GET',body){
  const response=await fetch(origin+path,{method,headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)})
  const result=await response.json()
  if(!response.ok || result.success===false)throw new Error(`${method} ${path}: ${response.status} ${typeof result.error==='string'?result.error:result.error?.message || result.message || ''}`)
  return result
}
token=(await api('/api/v1/auth/login','POST',{email:account.email,password:account.password})).token
const models=(await api('/api/v1/models')).data
const model=models.find(m=>/deepseek/i.test(m.name) && !/fixture/i.test(m.name))
if(!model)throw new Error('Local DeepSeek model is missing. Configure one in the browser before seeding.')
const all=(await api('/api/v1/knowledge-bases')).data
const extraction='重点识别当前客户、关联人物、重要经历、需求、顾虑和课程疑问。保留原文依据，不把销售建议或 AI 推断当作客户事实。'
const content='围绕当前客户按背景与现状、需求与痛点、顾虑与疑问、沟通进展和待确认事项组织 Wiki。客户人物条目持续汇总来源，区分事实与推断，保留引用。'
const manifestPath=resolve(runtime,'customer-demo.json')
const manifest=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{customers:[]}
const persist=()=>writeFileSync(manifestPath,JSON.stringify(manifest,null,2),{mode:0o600})
async function kb(name,description,profile){
  const existing=all.find(k=>k.name===name);if(existing)return existing
  const result=await api('/api/v1/knowledge-bases','POST',{name,description,type:'document',customer_profile:profile,summary_model_id:model.id,indexing_strategy:{vector_enabled:false,keyword_enabled:false,wiki_enabled:true,graph_enabled:false},wiki_config:{synthesis_model_id:model.id,extraction_granularity:'focused',content_instructions:content,extraction_instructions:extraction}})
  all.push(result.data);return result.data
}
async function document(kbID,title,body,summary){
  const current=(await api(`/api/v1/knowledge-bases/${kbID}/knowledge?page=1&page_size=100`)).data || []
  const prior=current.find(d=>d.title===title);if(prior)return prior
  return (await api(`/api/v1/knowledge-bases/${kbID}/knowledge/manual`,'POST',{title,content:body,status:'publish',curated_summary:summary,skip_auto_enrichment:true,channel:'web'})).data
}
async function page(kbID,slug,title,type,body,summary,sources){
  const response=await api(`/api/v1/knowledgebase/${kbID}/wiki/pages?page_size=100`)
  const current=(response.data ?? response).pages || []
  if(current.some(p=>p.slug===slug))return
  await api(`/api/v1/knowledgebase/${kbID}/wiki/pages`,'POST',{slug,title,page_type:type,status:'published',content:body,summary,source_refs:sources,page_metadata:{demo:true,origin:'fictional local review fixture'}})
}
const common=await kb('销售经验（演示）','虚构演示资料：需求澄清、课程匹配与交付跟进。实际案例由 Peter 手动维护。')
manifest.sharedKnowledgeBaseID=common.id;persist()
const methodDoc=await document(common.id,'销售案例：先确认目标，再介绍课程（演示）','# 虚构演示案例\n\n客户第一次咨询时，不急着给出课程方案。先确认他希望改变的具体场景、尝试过的方法，以及判断改善的标准。\n\n## 处理过程\n1. 复述客户的实际困难，确认理解。\n2. 问一个具体问题，了解最近一次发生的情境。\n3. 将课程内容和该情境逐项对应，并说明课程不承诺保证结果。\n4. 对时间、费用或课程形式的疑问分别回答。\n\n这是一份人工编写的本地演示材料。','演示方法：先澄清具体目标，再将课程内容与客户情境对应。')
await page(common.id,'concept/needs-first','先澄清需求，再匹配课程','concept','这是本地虚构案例提炼的演示方法。\n\n- 先确认具体情境与希望改变的行为。\n- 用实际课程内容说明适用性，不编造效果承诺。\n- 一次提出一个容易回答的问题。\n- 不把客户未确认的预算、动机或意愿写成事实。','需求澄清与课程匹配的演示方法。',[methodDoc.id])
const agentName='Peter 销售助手'
const agentList=(await api('/api/v1/agents')).data || []
const agent=agentList.find(a=>a.name===agentName) || (await api('/api/v1/agents','POST',{name:agentName,description:'结合当前客户资料与销售经验，分析情况、建议下一步，并起草回复。所有配置均可自行修改。',config:{agent_mode:'smart-reasoning',agent_type:'wiki-qa',model_id:model.id,system_prompt:'你是 Peter 的销售与交付工作助手。先读取当前客户及已关联经验库中的相关 Wiki，再回答。结合证据分析客户情况与卡点，给出具体下一步，并在适合时提供一段可编辑回复草稿。区分客户已说过的话、Peter 的备注和你的推断。信息不够时明确指出，并给出需要确认的问题；不要编造课程价格、承诺、客户事实或已发送的消息。这只是可编辑的初始工作方式，遵循 Peter 在对话中提出的具体任务。',kb_selection_mode:'selected',knowledge_bases:[common.id],allowed_tools:['wiki_search','wiki_read_page'],max_iterations:8,max_completion_tokens:2500,temperature:0.3,history_turns:20,memory_enabled:true,web_search_enabled:false,image_upload_enabled:false,audio_upload_enabled:false,question_suggestions:{starters:{enabled:true,mode:'curated',items:['分析这位客户目前最需要确认的问题','结合最近沟通，帮我起草下一条回复','整理这个客户目前的交付重点'],count:3},follow_ups:{enabled:false}}}})).data
manifest.agentID=agent.id;manifest.modelID=model.id;persist()
const samples=[
{name:'Alex',status:'沟通中',tags:['表达练习','时间安排'],contact:'微信：alex_demo（虚构）',description:'想改善初次沟通时紧张、解释过多的问题，正在了解课程形式。',note:'先了解具体场景；不要把“问价格”直接当作已决定购买。',goal:'希望初次沟通更自然，减少紧张时不断解释的情况。',concern:'工作日下班较晚，关心是否有回放，以及每周需要投入多久。',progress:'已经介绍课程的练习方式，还没有确认预算、报名时间或购买意愿。',chat:'2026-09-24 20:15 Alex：我一紧张就会说很多，后来想想其实没必要解释那么多。\n20:17 Peter：最近一次是什么情况？\n20:19 Alex：上周第一次见面，对方话比较少，我就一直在找话题。\n20:22 Peter：可以先从停顿和简洁表达的练习入手。\n20:25 Alex：我平时加班比较多，课程有没有回放？大概每周花多久？',next:'先回答回放与练习时间的问题，再确认 Alex 希望优先改善哪一种沟通场景。'},
{name:'Ben',status:'待了解',tags:['目标澄清','课程咨询'],contact:'邮箱：ben@example.test',description:'看过 Taylor 的公开内容，想了解课程是否适合自己，目标还不够具体。',note:'尚未确认年龄、预算和职业。所有建议应以他实际提供的信息为依据。',goal:'想让自己在人际互动中更有主见，但还没有描述具体困难。',concern:'担心课程只有理念，没有可以执行的练习。',progress:'首次咨询，需继续了解最近发生的真实情境。',chat:'2026-09-25 12:10 Ben：看了 Taylor 的视频，感觉说到我心里了。你们课程具体怎么学？\n12:13 Peter：你最希望改变的是哪方面？\n12:15 Ben：就是不想总顺着别人，但不知道怎么练。\n12:18 Ben：我以前买过类似课程，听完觉得有道理，但是回到生活里还是老样子。',next:'请 Ben 举一个最近“明明不愿意却答应了”的例子，以此判断课程中的练习是否匹配。'},
{name:'Ryan',status:'服务中',tags:['已报名','第一周练习'],contact:'微信：ryan_demo（虚构）',description:'已进入第一周练习，正在复盘表达边界时的不适感。',note:'以交付支持为主。先确认完成情况，再讨论调整；不把“练过一次”写成已经掌握。',goal:'在不情绪化的情况下说清自己的安排与边界。',concern:'表达不同意见后仍会内疚，担心关系变差。',progress:'完成第一次书面练习；已提供一次生活情境，等待下一轮复盘。',chat:'2026-09-26 19:00 Ryan：我按练习说了这周末已经有安排，这次不能帮忙。\n19:03 Peter：对方当时怎么回应的？\n19:06 Ryan：他说知道了，也没生气。但我后来还是想再解释一下。\n19:09 Peter：先把这次表达、对方的原话和你后续的感受记下来，我们一起复盘。\n19:12 Ryan：好，我已经写了，晚点发给你。',next:'复盘这一次表达的事实、对方反应与 Ryan 的感受，避免把内疚推断成真实的关系恶化。'}
]
const seededSessions=[]
for(const s of samples){
 const customer=await kb(`${s.name}（演示）`,s.description,{status:s.status,tags:s.tags,contact:s.contact,note:s.note,shared_knowledge_base_ids:[common.id],wiki_slug:`entity/${s.name.toLowerCase()}`})
 const source=await document(customer.id,`${s.name} · 原始聊天记录（演示）`,`# 虚构聊天原文\n\n> 本资料由人工编写，仅用于本地界面体验，不对应任何真实客户。\n\n${s.chat.replaceAll('\n','\n\n')}`,s.description)
 const followup=await document(customer.id,`${s.name} · 跟进记录（演示）`,`# 人工跟进记录\n\n> 虚构演示记录。\n\n${s.progress}\n\n需要继续确认：${s.next}`,s.progress)
 const clientSlug=`entity/${s.name.toLowerCase()}`
 await page(customer.id,'concept/goals','需求与目标','concept',`# 需求与目标\n\n${s.goal}\n\n来自 [[${clientSlug}|${s.name}]] 的聊天材料。\n\n相关：[[concept/concerns|顾虑与疑问]]。`,s.goal,[source.id])
 await page(customer.id,'concept/concerns','顾虑与疑问','concept',`# 顾虑与疑问\n\n${s.concern}\n\n需要结合 [[concept/goals|需求与目标]] 继续确认。\n\n客户：[[${clientSlug}|${s.name}]]。`,s.concern,[source.id])
 await page(customer.id,'concept/progress','沟通进展','concept',`# 沟通进展\n\n${s.progress}\n\n人工备注：${s.note}\n\n客户：[[${clientSlug}|${s.name}]]。`,s.progress,[followup.id])
 await page(customer.id,clientSlug,`${s.name} · 客户画像`,'entity',`> 本页是人工编写的虚构演示画像，用来展示界面效果，非本次模型生成。\n\n## 背景与现状\n${s.description}\n\n## 需求与痛点\n${s.goal}\n\n详见 [[concept/goals|需求与目标]]。\n\n## 顾虑与疑问\n${s.concern}\n\n详见 [[concept/concerns|顾虑与疑问]]。\n\n## 沟通进展\n${s.progress}\n\n详见 [[concept/progress|沟通进展]]。\n\n## 待确认事项\n${s.next}\n\n**资料依据：**「${s.name} · 原始聊天记录（演示）」与「${s.name} · 跟进记录（演示）」。`,s.description,[source.id,followup.id])
 await page(customer.id,'index',`${s.name} 的客户资料`,'index',`# ${s.name} 的客户资料\n\n本地虚构演示客户。\n\n- [[${clientSlug}|客户画像]]\n- [[concept/goals|需求与目标]]\n- [[concept/concerns|顾虑与疑问]]\n- [[concept/progress|沟通进展]]`,s.description,[source.id])
 let sessions=(await api(`/api/v1/sessions?customer_knowledge_base_id=${customer.id}&page_size=50`)).data || []
 const session=sessions.find(x=>x.title===`${s.name} · 首次情况分析`) || (await api('/api/v1/sessions','POST',{title:`${s.name} · 首次情况分析`,description:'虚构本地演示会话；示例回复为人工编写。',customer_knowledge_base_id:customer.id})).data
 seededSessions.push({id:session.id,agentID:agent.id,modelID:model.id,kbID:customer.id,sharedID:common.id,question:'结合客户资料，整理目前最需要确认的问题。',answer:`【人工编写的演示回复】\n\n**当前情况**\n${s.description}\n\n**已有依据**\n${s.goal}\n${s.concern}\n\n**建议下一步**\n${s.next}\n\n这是一段本地示例历史。你可以直接继续提问，后续回复使用已配置的模型。`})
 if(!manifest.customers.some(x=>x.id===customer.id))manifest.customers.push({id:customer.id,name:customer.name,sessionID:session.id})
 persist();console.log(`Prepared ${customer.name}`)
}
const python=`import json,sqlite3,sys,uuid,datetime\nx=json.load(sys.stdin)\nc=sqlite3.connect(x['db'],timeout=30)\nfor s in x['sessions']:\n if c.execute('select count(*) from messages where session_id=?',(s['id'],)).fetchone()[0]: continue\n state={'agent_id':s['agentID'],'model_id':s['modelID'],'agent_enabled':True,'knowledge_base_ids':[s['kbID'],s['sharedID']],'web_search_enabled':False}\n c.execute('update sessions set agent_config=? where id=?',(json.dumps(state).encode(),s['id']))\n for role,content in [('user',s['question']),('assistant',s['answer'])]:\n  c.execute('insert into messages (id,request_id,session_id,role,content,is_completed,channel,agent_id,model_id) values (?,?,?,?,?,1,?,?,?)',(str(uuid.uuid4()),str(uuid.uuid4()),s['id'],role,content,'web',s['agentID'] if role=='assistant' else '',s['modelID'] if role=='assistant' else ''))\nc.commit()\nc.close()\n`
const result=spawnSync('python3',['-c',python],{input:JSON.stringify({db:resolve(runtime,'workspace.db'),sessions:seededSessions}),encoding:'utf8'})
if(result.status!==0)throw new Error(result.stderr || 'Failed to seed local conversation history')
console.log('Local fictional customer workspace is ready. No model generation was requested.')
