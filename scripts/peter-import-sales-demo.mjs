// Uses the native ingestion pipeline; no hand-written Wiki pages or injected AI answers.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

const origin = process.env.PETER_ORIGIN || 'https://62.234.188.55'
const runtime = resolve('.runtime/peter/deployment')
const sourceRoot = resolve('artifacts/peter-sales-demo-20261001')
const source = JSON.parse(readFileSync(resolve(sourceRoot, 'conversations.json'), 'utf8'))
const screenshots = JSON.parse(readFileSync(resolve(sourceRoot, 'screenshots.json'), 'utf8'))
assert.equal(source.provenance.kind, 'authored_business_demo')
assert.equal(screenshots.count, 50)
assert.equal(source.customers.length, 10)
mkdirSync(runtime, { recursive: true })
const statePath = resolve(runtime, 'sales-demo-state.json')
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {
  origin, provenance: source.provenance, customers: {}, created_at: new Date().toISOString(),
}
assert.equal(state.origin, origin)
// Run mutating modes sequentially. Replace the receipt atomically so a stopped
// process cannot leave partial JSON that prevents resuming completed uploads.
const save = () => {
  const temp = `${statePath}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
  renameSync(temp, statePath)
}
const account = JSON.parse(readFileSync(resolve(runtime, 'account.json'), 'utf8'))
const login = await fetch(origin + '/api/v1/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: account.email, password: account.password }),
  signal: AbortSignal.timeout(30000),
})
assert.equal(login.status, 200)
const { token } = await login.json()
assert.ok(token)
let activeToken = token
async function api(path, method = 'GET', body, upload = false) {
  const response = await fetch(origin + path, {
    method, headers: { authorization: `Bearer ${activeToken}`, 'accept-language': 'zh-CN', ...(!upload && body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body === undefined ? {} : { body: upload ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(120000),
  })
  const value = await response.json().catch(() => ({}))
  assert.ok(response.ok && value.success !== false, `${method} ${path}: HTTP ${response.status}; ${value.message || value.error?.message || ''}`)
  return value.data ?? value
}
const listDocs = id => api(`/api/v1/knowledge-bases/${id}/knowledge?page=1&page_size=100`)
const all = await api('/api/v1/knowledge-bases')
const models = await api('/api/v1/models')
const model = type => { const m = models.find(m => m.type === type && m.source === 'remote'); assert.ok(m, `${type} model missing`); return m.id }
state.models = { chat: model('KnowledgeQA'), vision: model('VLLM'), embedding: model('Embedding'), rerank: model('Rerank'), asr: model('ASR') }
const storage = all.find(k => k.storage_backend_id)?.storage_backend_id
assert.ok(storage, 'Native storage binding missing')
const VLM = '逐条提取聊天截图可见的文字，不要只做摘要。页眉姓名是客户；右侧绿色气泡属于 Peter，左侧白色气泡属于客户。输出时明确每条说话人，保留可见日期、时间、先后顺序及金额，避免把 Peter 的建议当作客户事实。看不清的内容标为无法辨认，不补写。图片底部业务演示是来源标识，不是聊天正文。'
const salesContent = '从跨客户的连续销售对话中提炼可复用销售工作流，而不是只摘录几句口号。按阶段、触发信号、判断依据、提问目的、回应原则、下一步、话术原文例子、适用条件和不适用边界组织。追踪从澄清具体经历到课程匹配、预算顾虑、跟进、报名和交付的变化，保留来源引用。未报名与不适配的对话也纳入分析。区分原文、分析与待验证推断，不把演示报价推广成现实产品承诺。'
const customerContent = '持续整理当前客户的背景与现状、需求与痛点、顾虑与疑问、沟通进展、约定的下一步及待确认事项。围绕该客户建立汇总人物条目，并保留重要判断对应的截图引用。按原文日期梳理变化；严格区分客户陈述、Peter 的建议、分析推断，不把建议、感兴趣或练习一次写成已经购买或掌握。更新人物画像时必须把当前状态与历史分开：后续明确报名、取消跟进或实际完成练习后，删除当前状态和待确认事项里已被解决或取代的旧结论，将旧状态移至注明日期的历史进展。不能同时声称已报名与尚未报名，不能保留已取消的跟进作为下一步。新证据优先按截图日期、页序、说话人判断，不能按上传先后。保留有效历史，合并同义段落，不拼接重复或互相矛盾的内容。其他客户只能作为方法参考，不能写进当前客户画像。'
function config(customer = false) {
  return {
    type: 'document', embedding_model_id: state.models.embedding, summary_model_id: state.models.chat,
    storage_backend_id: storage,
    chunking_config: { chunk_size: 2048, chunk_overlap: 150, parent_chunk_size: 4096, child_chunk_size: 512, separators: ['\n\n', '\n', '。', '！', '？'] },
    indexing_strategy: { vector_enabled: true, keyword_enabled: true, wiki_enabled: true, graph_enabled: true },
    wiki_config: {
      synthesis_model_id: state.models.chat, extraction_granularity: 'standard', max_pages_per_ingest: 0,
      ingest_max_inflight: 1, ingest_map_parallel: 2, ingest_reduce_parallel: 2,
      content_instructions: customer ? customerContent : salesContent,
      extraction_instructions: customer
        ? '识别当前客户及相关人物、具体经历、需求、顾虑、购买动机、沟通约定和课程问题。合并同一客户的连续截图，区分销售建议与客户事实，保留变化和原文依据。'
        : '重点识别销售阶段、客户信号、诊断问题、需求澄清、课程匹配、异议和预算处理、跟进节奏、交付反馈与不适配判断。把相同原则的不同客户案例联系起来，同时保留各自条件。',
    },
    vlm_config: { enabled: true, model_id: state.models.vision, description_language: 'zh', custom_instructions: VLM },
    asr_config: { enabled: true, model_id: state.models.asr, language: 'zh' },
    extract_config: {
      enabled: true, tags: ['咨询', '提出需求', '存在顾虑', '澄清', '匹配', '约定跟进', '报名', '交付反馈'],
      text: '客户向 Peter 咨询沟通课程，提出表达需求。Peter 澄清客户的具体经历，并与客户约定下一次沟通。',
      nodes: [{ name: '客户', attributes: ['咨询课程、陈述需求的当事人'] }, { name: 'Peter', attributes: ['负责澄清需求和跟进的销售人员'] }, { name: '沟通课程', attributes: ['客户咨询的产品'] }],
      relations: [{ node1: '客户', node2: '沟通课程', type: '咨询' }, { node1: 'Peter', node2: '客户', type: '约定跟进' }],
      custom_instructions: customer
        ? '只从当前客户资料提取人物、需求、顾虑、课程、具体经历与跟进约定及其关系。区分客户原话与销售建议，不建立其他客户的事实，不补造购买结果。'
        : '提取 Peter、客户、课程、沟通目标、顾虑、销售阶段、提问动作、跟进动作与交付任务及关系。必须有原文支持，避免把未确认的承诺当事实。',
    },
  }
}
async function ensureKB(key, input) {
  if (state[key]?.id) return state[key]
  let kb = all.find(k => k.name === input.name && k.description === input.description)
  if (!kb) kb = await api('/api/v1/knowledge-bases', 'POST', input)
  assert.ok(kb.id)
  state[key] = { id: kb.id, name: kb.name, documents: [] }
  save()
  return state[key]
}
async function upload(kb, filename, mime, bytes) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: mime }), filename)
  const doc = await api(`/api/v1/knowledge-bases/${kb.id}/knowledge/file`, 'POST', form, true)
  assert.ok(doc.id)
  kb.documents.push({ id: doc.id, file: filename, status: doc.parse_status })
  save()
  console.log(`Uploaded ${kb.name}: ${filename}`)
}
const mode = process.argv[2] || 'upload'
if (mode === 'upload') {
  const sales = await ensureKB('sales', { ...config(), name: 'Peter 销售案例库', description: '业务演示资料：10 位客户的连续销售聊天记录，用于提炼需求判断、课程匹配、跟进与交付工作流。' })
  const general = await ensureKB('general', { ...config(), name: '销售方法库', description: '业务演示配套方法：需求澄清、课程匹配、顾虑处理与跟进交付。' })
  let generalDocs = await listDocs(general.id)
  if (!generalDocs.some(d => (d.file_name || d.title) === '销售工作流.md')) {
    const content = readFileSync(resolve(sourceRoot, 'sales-methods.md'), 'utf8')
    await upload(general, '销售工作流.md', 'text/markdown', content)
  }
  for (const customer of source.customers) {
    let kb = state.customers[customer.name]
    if (!kb) {
      const input = {
        ...config(true), name: customer.name, description: customer.notes,
        customer_profile: { status: '', tags: [...new Set([customer.initial_profile?.stage, ...customer.tags].filter(Boolean))], contact: customer.contact,
          note: customer.notes, shared_knowledge_base_ids: [sales.id, general.id], wiki_slug: '' },
      }
      let created = all.find(k => k.name === customer.name && k.customer_profile && k.description === customer.notes)
      if (!created) created = await api('/api/v1/knowledge-bases', 'POST', input)
      assert.ok(created.id)
      kb = state.customers[customer.name] = { id: created.id, name: customer.name, documents: [] }
      save()
    }
    // Upload both destinations natively, so customer entity extraction is not lost
    // through the existing copy/move path's incomplete post-processing fan-out.
    for (const target of [kb, sales]) {
      const docs = await listDocs(target.id)
      for (const file of screenshots.customers.find(c => c.name === customer.name).files) {
        if (docs.some(d => (d.file_name || d.title) === file.file)) continue
        await upload(target, file.file, 'image/png', readFileSync(resolve(sourceRoot, 'screenshots', file.file)))
      }
    }
  }
  state.uploaded_at = new Date().toISOString(); save()
}
if (mode === 'status') {
  for (const kb of [state.sales, state.general, ...Object.values(state.customers)].filter(Boolean)) {
    const docs = await listDocs(kb.id)
    kb.documents = docs.map(d => ({ id: d.id, file: d.file_name || d.title, status: d.parse_status, error: d.error_message || undefined }))
    const stats = await api(`/api/v1/knowledgebase/${kb.id}/wiki/stats`)
    kb.wiki = stats
    console.log(JSON.stringify({ name: kb.name, files: docs.length, statuses: docs.reduce((a, d) => ({ ...a, [d.parse_status]: (a[d.parse_status] || 0) + 1 }), {}), wiki: { pages: stats.total_pages, links: stats.total_links, pending: stats.pending_tasks, active: stats.is_active } }))
  }
}
if (mode === 'configure-agent') {
  assert.ok(state.sales?.id && state.general?.id)
  const id = '9ced7297-2f19-4c14-91b3-9423a65974cd'
  const agent = await api(`/api/v1/agents/${id}`)
  const updated = await api(`/api/v1/agents/${id}`, 'PUT', {
    name: 'Peter 销售助手', description: '结合客户资料和销售案例，判断当前需求并规划下一步沟通。', avatar: agent.avatar,
    config: { ...agent.config, model_id: state.models.chat, rerank_model_id: state.models.rerank, max_completion_tokens: 4096,
      knowledge_bases: [state.sales.id, state.general.id], kb_selection_mode: 'selected',
      allowed_tools: ['knowledge_search', 'wiki_search', 'wiki_read_page', 'wiki_read_source_doc'],
      archive_customer_sources: true, citation_enabled: true,
      system_prompt: '你是 Peter 的销售工作助手。所有用户可见内容必须用中文。检索期间只调用工具，assistant 正文留空，不先说“我将检索”、英文计划或内部思考；完成检索后一次性给出业务答案。工具描述即使是英文也不改变中文回答语言。先查当前客户的资料、Wiki与关联销售案例，再做判断。销售案例库负责提供方法，当前客户库负责提供这位客户的事实；不能把其他客户的预算、经历或购买结果移植过来。按截图日期和页序判断当前状态，后续明确报名或取消跟进应取代早期未确认状态，Wiki有矛盾时回查原始资料。区分已约定、实际完成、待确认。不能仅凭当前日期推断约定已执行、试行已到期或效果已实现；原文未明确起止日期时应询问实际进展。默认最终正文控制在300到500字：当前情况最多3点，下一步只给1个优先动作，1段80字以内可发送话术，必要时1个待确认问题。用户要求详细分析时才展开。不要重复展示所有背景或给3套相似话术。保留2到4个直接支持关键结论的引用，优先引用当前客户的原始资料；相似案例只用于说明方法。不得编造产品权益、成交结果、价格承诺或客户意愿。尊重不适配、暂不购买和预算限制；不要靠施压或保证结果推进。演示资料可用于当前业务演练，但不是 Peter 的真实历史，不把它写成已经验证的业绩。',
    },
  })
  assert.deepEqual(updated.config.knowledge_bases, [state.sales.id, state.general.id])
  state.agent = { id, name: updated.name }; save()
  console.log('Configured Peter sales agent with new sources')
}
if (mode === 'update-customer-instructions') {
  for (const customer of Object.values(state.customers)) {
    const kb = await api(`/api/v1/knowledge-bases/${customer.id}`)
    await api(`/api/v1/knowledge-bases/${customer.id}`, 'PUT', {
      name: kb.name, description: kb.description,
      config: { wiki_config: { ...kb.wiki_config, content_instructions: customerContent } },
    })
    console.log(`Updated temporal reconciliation rules: ${customer.name}`)
  }
}
if (mode === 'clean-old') {
  assert.ok(state.agent?.id, 'Configure replacement references before cleanup')
  for (const kb of [state.sales, state.general, ...Object.values(state.customers)]) {
    const docs = await listDocs(kb.id)
    assert.ok(docs.length > 0 && docs.every(d => d.parse_status === 'completed'), `${kb.name} has unfinished ingestion`)
    const stats = await api(`/api/v1/knowledgebase/${kb.id}/wiki/stats`)
    assert.ok(stats.total_pages > 0, `${kb.name} Wiki not ready`)
  }
  const inventory = JSON.parse(readFileSync(resolve(sourceRoot, 'old-seed-inventory.json'), 'utf8'))
  assert.equal(inventory.origin, origin)
  state.cleanup ||= { knowledge_bases: [], sessions: [], agents: [] }
  for (const file of ['account.json', 'demo-account.json']) {
    const subject = JSON.parse(readFileSync(resolve(runtime, file), 'utf8'))
    const auth = await fetch(origin + '/api/v1/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: subject.email, password: subject.password }), signal: AbortSignal.timeout(30000),
    })
    assert.equal(auth.status, 200)
    activeToken = (await auth.json()).token; assert.ok(activeToken)
    const current = await api('/api/v1/knowledge-bases')
    const candidates = inventory.delete_knowledge_bases.filter(k => k.owner_email === subject.email)
    for (const old of candidates) {
      const present = current.find(k => k.id === old.id)
      if (!present) continue
      assert.equal(present.name, old.name, `Old seed renamed: ${old.id}; review before deleting`)
      assert.ok(!inventory.preserve_knowledge_bases.some(k => k.id === old.id))
      await api(`/api/v1/knowledge-bases/${old.id}`, 'DELETE')
      state.cleanup.knowledge_bases.push({ id: old.id, name: old.name }); save()
    }
    const sessions = inventory.delete_sessions.filter(s => s.owner_email === subject.email)
    if (sessions.length && !state.cleanup.sessions.some(s => s.owner_email === subject.email)) {
      assert.ok(sessions.every(s => !inventory.preserve_sessions.some(p => p.id === s.id)))
      await api('/api/v1/sessions/batch', 'DELETE', { ids: sessions.map(s => s.id), delete_all: false })
      state.cleanup.sessions.push({ owner_email: subject.email, ids: sessions.map(s => s.id) }); save()
    }
    if (file === 'demo-account.json') {
      // These four fixture agents are identified by the prior seed inventory;
      // installed skills, sandbox configuration and user-authored agents remain.
      const agents = await api('/api/v1/agents')
      const list = Array.isArray(agents) ? agents : agents.agents || []
      for (const old of inventory.agents_needing_reference_or_copy_cleanup.filter(a => a.owner_email === subject.email)) {
        const present = list.find(a => a.id === old.id)
        if (!present) continue
        assert.equal(present.name, old.name)
        await api(`/api/v1/agents/${old.id}`, 'DELETE')
        state.cleanup.agents.push({ id: old.id, name: old.name }); save()
      }
    }
  }
  state.cleanup.completed_at = new Date().toISOString(); save()
  console.log(`Cleared identified legacy seeds: ${state.cleanup.knowledge_bases.length} libraries, ${state.cleanup.sessions.reduce((n,s)=>n+s.ids.length,0)} conversations, ${state.cleanup.agents.length} fixture agents`)
}
if (mode === 'chat') {
  assert.ok(state.agent?.id)
  for (const customer of Object.values(state.customers)) {
    if (customer.chat?.completed_at) continue
    let ready = false
    for (let attempt = 0; attempt < 240; attempt++) {
      const docs = await listDocs(customer.id)
      if (docs.some(d => d.parse_status === 'failed')) throw new Error(`${customer.name} ingestion failed`)
      if (docs.length >= 5 && docs.every(d => d.parse_status === 'completed')) { ready = true; break }
      if (attempt % 12 === 0) console.log(`Waiting for ${customer.name} source ingestion (${docs.filter(d=>d.parse_status==='completed').length}/${docs.length})`)
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    assert.ok(ready, `${customer.name} ingestion did not finish`)
    if (!customer.session_id) {
      const session = await api('/api/v1/sessions', 'POST', { title: `${customer.name} · 客户跟进`, customer_knowledge_base_id: customer.id })
      assert.equal(session.customer_knowledge_base_id, customer.id)
      customer.session_id = session.id; save()
    }
    const query = '先总结这位客户当前的目标、报名状态和最近一次约定，再对照销售案例库，给我下一步怎么沟通，并起草一段可以发给客户的话。如果已经结束销售或取消跟进，就按约定处理。所有可见内容用中文，不输出检索过程或计划，查完资料直接回答，正文控制在300到500字。关键结论引用确实含有对应信息的原始截图，别混入其他客户的信息；未明确起止日期或执行结果的约定不要自行认定已到期或已完成。'
    const response = await fetch(origin + `/api/v1/agent-chat/${customer.session_id}`, {
      method: 'POST', headers: { authorization: `Bearer ${activeToken}`, 'content-type': 'application/json', 'accept-language': 'zh-CN' },
      body: JSON.stringify({ query, agent_id: state.agent.id, agent_enabled: true, channel: 'web', disable_title: true,
        knowledge_base_ids: [customer.id] }),
      signal: AbortSignal.timeout(240000),
    })
    const stream = await response.text()
    const filename = `sales-demo-chat-${customer.name}.sse`
    writeFileSync(resolve(runtime, filename), stream, { mode: 0o600 })
    assert.equal(response.status, 200)
    const events = stream.split(/\r?\n\r?\n/).flatMap(part => {
      const line = part.split(/\r?\n/).find(line => line.startsWith('data:'))
      if (!line) return []
      try { return [JSON.parse(line.slice(5))] } catch { return [] }
    })
    // Tool errors are recoverable steps; a terminal error or missing complete
    // event means the actual customer answer did not finish.
    const errors = events.filter(e => e.response_type === 'error' && e.done === true)
    assert.equal(errors.length, 0, `${customer.name} chat error`)
    assert.ok(events.some(e => e.response_type === 'complete' && e.done === true), `${customer.name} stream ended before completion`)
    const answer = events.filter(e => e.response_type === 'answer').map(e => e.content || '').join('')
    assert.ok(answer.trim().length > 80, `${customer.name} empty answer`)
    assert.match(answer.trim(), /[。！？.!?）)」』\]`\"”]$/, `${customer.name} answer appears cut off; review before recording completion`)
    customer.chat = { completed_at: new Date().toISOString(), answer_length: answer.length, sse_file: filename,
      tool_calls: events.filter(e=>e.response_type==='tool_call').length, events: events.length,
      recovered_tool_errors: events.filter(e=>e.response_type==='error'&&!e.done).length }
    save()
    console.log(`Answered ${customer.name}: ${answer.length} characters`)
  }
}
if (mode === 'reset-demo-chats') {
  const selected = process.argv.slice(3)
  assert.ok(selected.every(name => state.customers[name]), 'Unknown customer selected for draft cleanup')
  const created = Object.values(state.customers).filter(c => c.session_id && (!selected.length || selected.includes(c.name)))
  for (const c of created) {
    const session = await api(`/api/v1/sessions/${c.session_id}`)
    assert.equal(session.customer_knowledge_base_id, c.id)
    assert.equal(session.title, `${c.name} · 客户跟进`)
  }
  if (created.length) await api('/api/v1/sessions/batch', 'DELETE', { ids: created.map(c=>c.session_id), delete_all: false })
  for (const c of created) { delete c.session_id; delete c.chat }
  save()
  console.log(`Removed ${created.length} generated drafts before repeating with corrected answer constraints`)
}
