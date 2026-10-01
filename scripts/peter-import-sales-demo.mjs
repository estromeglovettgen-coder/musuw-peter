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
const salesContent = '从课程销售聊天中提炼促成购买的销售工作流。用购买需求、价值说明、异议处理、成交推进、开课交接等少量稳定类别组织，同义原则合并，不为每句通用话术建立重复概念。Peter的任务是卖课，情感问题只作为购买背景，不把销售复盘写成情感辅导。优先提取成功成交：客户为什么考虑付费、之前方案缺口、购买标准、产品权益如何对应价值、真实异议、销售回应、顾虑解决信号、主动提出购买决定、付款对话及开课交接。按阶段、触发信号、判断依据、销售动作、客户反应、结果、话术原文和来源组织；归纳跨客户可复用的价格异议、竞品比较、时间安排、信任与隐私处理。暂缓案例用于识别未决购买条件和下一次跟进，不覆盖成交案例。区分客户说已付款与Peter确认收到，聊天叙事不是外部支付核验。不把案例报价或权益扩大成其他未提供产品的承诺。'
const customerContent = '整理这位客户的销售画像：购买动机、以前购买的替代方案、选择标准、预算与参与条件、决策人、具体异议、异议是否解决、当前购买阶段、付款对话、最新销售约定和开课交接待办。情感经历只作为购买背景，不安排免费情感辅导。为客户生成汇总人物页，关键结论保留原始聊天引用。以截图日期和页序追踪状态变化，明确付款后替代早期考虑中；已成交转为交接，不重复催付。区分客户说已付款、Peter确认收到、实际外部支付核验；只能确认聊天记载。未付款客户保留具体未决条件、客户约定回复日期或明确许可联系日期与下一项成交动作，不能把兴趣写成付款，也不能推断日期到来就已经执行。更新汇总人物页必须把最新当前状态和注明日期的历史进展分开：后续资料确认时间条件满足、取消提醒、确认付款或完成交接后，删除当前状态与待办里已被解决或取代的旧结论，保留旧事为历史，不拼接重复或互相矛盾的段落。已经收到资料、入口能开、通知渠道已确认等不得继续列为待交接。客户约定回复时间与允许销售主动联系的时间不同，原文说等回复就记录等回复，不自动改成主动跟进许可。以截图日期、页序和说话人判断，不能按上传先后，也不能从练习日推算提交截止。已解决异议从当前待办移至历史。其他客户只供销售方法参考，不得把别人的预算、付款或经历写进当前画像。'
function config(customer = false) {
  return {
    type: 'document', embedding_model_id: state.models.embedding, summary_model_id: state.models.chat,
    storage_backend_id: storage,
    image_processing_config: { model_id: state.models.vision },
    chunking_config: { chunk_size: 2048, chunk_overlap: 150, parent_chunk_size: 4096, child_chunk_size: 512, separators: ['\n\n', '\n', '。', '！', '？'] },
    indexing_strategy: { vector_enabled: true, keyword_enabled: true, wiki_enabled: true, graph_enabled: true },
    wiki_config: {
      synthesis_model_id: state.models.chat, extraction_granularity: 'standard', max_pages_per_ingest: 0,
      ingest_max_inflight: 1, ingest_map_parallel: 2, ingest_reduce_parallel: 2,
      content_instructions: customer ? customerContent : salesContent,
      extraction_instructions: customer
        ? '识别当前客户、课程、购买动机、预算、决策条件、异议、销售回应、购买决定、付款记载、跟进约定和开课交接。合并连续截图，保留每个阶段的变化和证据。'
        : '重点识别课程价值说明、购买资格、价格异议、竞品比较、时间和信任顾虑、异议解决信号、成交提问、付款确认、跟进条件和报名交接。关联成功案例中的共性销售动作与成交原因，保留原话和适用条件。',
    },
    vlm_config: { enabled: true, model_id: state.models.vision, description_language: 'zh', custom_instructions: VLM },
    asr_config: { enabled: true, model_id: state.models.asr, language: 'zh' },
    extract_config: {
      enabled: true, tags: ['购买需求', '价值说明', '价格异议', '竞品比较', '异议解决', '购买决定', '付款确认', '开课交接', '待跟进'],
      text: '客户向 Peter 咨询课程，提出价格顾虑。Peter 对照客户的购买标准介绍练习与反馈价值，客户接受并决定报名，聊天中确认付款后安排开课资料。',
      nodes: [{ name: '客户', attributes: ['咨询课程、陈述需求的当事人'] }, { name: 'Peter', attributes: ['负责卖课、处理异议、推进购买和报名交接的销售人员'] }, { name: '沟通课程', attributes: ['客户咨询的产品'] }],
      relations: [{ node1: '客户', node2: '沟通课程', type: '咨询' }, { node1: 'Peter', node2: '客户', type: '约定跟进' }],
      custom_instructions: customer
        ? '只从当前客户资料提取人物、需求、顾虑、课程、具体经历与跟进约定及其关系。区分客户原话与销售建议，不建立其他客户的事实，不补造购买结果。'
        : '提取 Peter、客户、课程权益、购买动机、异议、价值比较、成交动作、付款记载与开课交接的关系。必须有原文支持，区分客户意向与明确付款。',
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
  const sales = await ensureKB('sales', { ...config(), name: 'Peter 销售案例库', description: '10 位客户的课程销售记录：购买需求、产品价值、异议处理、成交付款与开课交接。' })
  const general = await ensureKB('general', { ...config(), name: '销售方法库', description: '课程销售方法：购买资格、价值说明、异议处理、主动成交与报名交接。' })
  sales.expected_documents = 50; general.expected_documents = 1
  state.provenance = source.provenance
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
    kb.expected_documents = 5; save()
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
if (mode === 'refresh-config') {
  for (const [key, description] of [['sales', '10 位客户的课程销售记录：购买需求、产品价值、异议处理、成交付款与开课交接。'], ['general', '课程销售方法：购买资格、价值说明、异议处理、主动成交与报名交接。']]) {
    const target = state[key]
    const kb = await api(`/api/v1/knowledge-bases/${target.id}`)
    assert.equal(kb.name, target.name)
    await api(`/api/v1/knowledge-bases/${target.id}`, 'PUT', { name: kb.name, description, config: config() })
  }
  for (const input of source.customers) {
    const target = state.customers[input.name]
    assert.ok(target?.id)
    const kb = await api(`/api/v1/knowledge-bases/${target.id}`)
    assert.equal(kb.name, input.name)
    assert.ok(kb.customer_profile)
    await api(`/api/v1/knowledge-bases/${target.id}`, 'PUT', { name: kb.name, description: input.notes,
      config: { ...config(true), customer_profile: { ...kb.customer_profile, status: '',
        tags: [...new Set([input.initial_profile?.stage, ...input.tags].filter(Boolean))], contact: input.contact,
        note: input.notes, shared_knowledge_base_ids: [state.sales.id, state.general.id] } } })
    console.log(`Refreshed sales profile and ingestion instructions: ${input.name}`)
  }
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
    name: 'Peter 销售助手', description: '结合客户购买状态和成交案例，处理异议、推进卖课与报名交接。', avatar: agent.avatar,
    config: { ...agent.config, model_id: state.models.chat, rerank_model_id: state.models.rerank, max_completion_tokens: 4096,
      knowledge_bases: [state.sales.id, state.general.id], kb_selection_mode: 'selected',
      allowed_tools: ['knowledge_search', 'wiki_search', 'wiki_read_page', 'wiki_read_source_doc'],
      archive_customer_sources: true, citation_enabled: true,
      system_prompt: '你是Peter的课程销售助手，帮助他卖课成交、跟进客户和完成报名交接。Peter是销售人员，客户情感问题只是购买背景；不要把回答变成免费情感咨询或练习指导。所有用户可见内容用中文。每轮检索时只调用工具，不输出计划、介绍或内部思考，不以英文介绍开场；查完一次性用中文直接给购买阶段结论。先查当前客户原始资料与Wiki，再对照销售案例库和方法库。客户库提供这位客户的事实，案例库提供成功销售的方法，不能移植其他客户的预算、付款或经历。按截图日期和页序确定购买阶段；明确付款取代早期考虑中，Wiki矛盾时回查原图。涉及跟进时间使用资料确定的绝对日期，例如10月2日上午；没有可靠当前日期就不称今天或明天，不把客户约定的上午扩成某个具体钟点。练习日不等于提交截止日、开课日或联系许可；没有原文约定就不自行排截止日期、提醒日期或具体钟点，实际提交窗口以已发开课说明为准，需要时明确待核对。客户已同意价格仅代表价格异议已解，不能据此推断已付款；不要把尚待核对的价值条件同时写成价值已确认。客户约定回复的时间不等于允许销售主动联系的时间，等回复、允许联系、销售建议必须区分；提出跟进建议要标为建议，不能声称这是客户原有约定。未付款时判断购买动机、尚未解决的真实异议与购买条件，优先给一个推动购买的动作和可发送成交话术。价值、时间、费用已确认就主动提出报名决定，不无限免费分析或只说慢慢考虑。真实预算不足或有明确许可日期就按约定跟进，不编造折扣、名额或催借钱。已经付款则推进开课资料、报名信息和反馈窗口交接，不重复催付同一课程。交接已完成时不重复索要已提供的信息、不重复发送已收到的资料，只处理实际访问或参加问题。默认正文300到500字：最多3项购买状态判断、1个最优销售或交接动作、1段80字以内可发话术，必要时1个待确认购买问题，保留2到4个支持结论的引用。用户要销售方法时拆解触发信号、为什么这样说、客户反应和成交结果，并给可复用话术。不保证复合或他人态度，不新增产品权益或价格政策。客户说已付与销售确认收到按原文分开，不能声称已经外部核验支付；起草话术也不视为已经发给客户。',
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
      config: { chunking_config: kb.chunking_config, image_processing_config: kb.image_processing_config,
        wiki_config: { ...kb.wiki_config, content_instructions: customerContent } },
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
    const query = '我是负责卖课的Peter。查这位客户最新的购买动机、具体异议、报名和付款记载，再参考成功销售案例，给我当前最优的销售动作和一段能直接发给客户的话术。未付款就围绕未决购买条件推进成交；已付款就推进报名开课交接，不重新催付。不要给免费情感辅导。所有可见内容用中文，不输出检索计划，正文300到500字，关键事实引用当前客户原图；不要把别人的付款或预算移植过来，也不要把约定自动写成已执行。'
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
