// Read-only evidence for native image ingestion, Wiki, entity graph and customer chats.
// The only POST is authentication. No source text, credentials or model output is saved.
import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const defaults = {
  state: '.runtime/peter/deployment/sales-demo-state.json',
  account: '.runtime/peter/deployment/account.json',
  output: '.runtime/peter/deployment/sales-demo-audit.json',
}
const options = { ...defaults, neo4j: false }
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i]
  if (flag === '--help') {
    console.log('node scripts/peter-sales-demo-audit.mjs [--state path] [--account path] [--output path] [--neo4j]')
    process.exit(0)
  }
  if (flag === '--neo4j') { options.neo4j = true; continue }
  const key = flag.replace(/^--/, '')
  if (!Object.hasOwn(defaults, key) || !process.argv[i + 1]) throw new Error('Invalid audit option; use --help')
  options[key] = process.argv[++i]
}
const readJSON = path => JSON.parse(readFileSync(resolve(path), 'utf8'))
const state = readJSON(options.state)
const account = readJSON(options.account)
const origin = process.env.PETER_ORIGIN || state.origin || 'https://62.234.188.55'
const target = new URL(origin)
if (!['62.234.188.55', '127.0.0.1', 'localhost'].includes(target.hostname) || target.username || target.password) {
  throw new Error('Audit origin must be the authorized Peter server or localhost')
}
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const resourceId = value => typeof value === 'string' ? value : value?.id || value?.kb_id || value?.kbId || value?.knowledge_base_id
const resources = new Map()
function addKB(value, role, fallbackName, expected) {
  const id = resourceId(value)
  if (!id) return
  if (!uuid.test(id)) throw new Error('Invalid knowledge base ID in state')
  const info = typeof value === 'object' ? value : {}
  resources.set(id, {
    id, role, name: info.name || fallbackName || role,
    expected_documents: info.expected_documents ?? info.expectedDocuments ?? expected,
    session_id: info.sessionId || info.session_id,
  })
}
addKB(state.sales || state.caseKbId || state.case_kb_id || state.caseKB || state.salesCaseKB || state.highStateKB, 'sales_cases', 'Peter 销售案例库', 50)
addKB(state.general || state.generalKbId || state.general_kb_id || state.generalKB, 'sales_methods', '销售方法库', 1)
for (const [name, customer] of Object.entries(state.customers || {})) addKB(customer, 'customer', name, 5)
for (const kb of Array.isArray(state.kbs) ? state.kbs : Object.values(state.kbs || {})) {
  const id = resourceId(kb)
  if (!resources.has(id)) addKB(kb, kb.role || 'knowledge_base', kb.name, kb.expected_documents)
}
if (!resources.size) throw new Error('State contains no knowledge base IDs')

async function fetchJSON(path, init = {}) {
  let response
  try {
    response = await fetch(origin + path, { ...init, signal: AbortSignal.timeout(60000) })
  } catch {
    throw new Error(`Request failed: ${path}`)
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`)
  const value = await response.json().catch(() => { throw new Error(`Invalid JSON: ${path}`) })
  if (value.success === false) throw new Error(`API failure: ${path}`)
  return value
}
const login = await fetchJSON('/api/v1/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: account.email, password: account.password }),
})
const token = login.token || login.data?.token
if (!token) throw new Error('Authentication returned no token')
const get = path => fetchJSON(path, { headers: { authorization: `Bearer ${token}` } })
const unwrap = value => value.data ?? value
const rows = value => {
  const data = unwrap(value)
  return Array.isArray(data) ? data : data.items || data.documents || data.sessions || data.messages || data.chunks || []
}
const counts = (items, field) => items.reduce((out, item) => { const key = item[field] || 'unknown'; out[key] = (out[key] || 0) + 1; return out }, {})
const errors = []
async function optional(path, fallback) {
  try { return unwrap(await get(path)) } catch (error) { errors.push(error.message); return fallback }
}
async function listAll(path) {
  const result = []
  for (let page = 1; page <= 100; page++) {
    const value = await get(`${path}${path.includes('?') ? '&' : '?'}page=${page}&page_size=100`)
    const items = rows(value)
    result.push(...items)
    const total = value.total ?? value.data?.total
    if (!items.length || (total !== undefined && result.length >= total) || (items.length < 100 && value.has_more !== true)) return result
  }
  throw new Error(`Pagination exceeded 100 pages: ${path}`)
}
const chunkTypes = ['text', 'parent_text', 'image_ocr', 'image_caption', 'summary', 'entity', 'relationship']
const chunkQuery = chunkTypes.map(type => `chunk_type=${type}`).join('&')
const oldSeedPattern = /虚构|模拟|验收|测试确认码|截图识别码|\b(?:MIRA|KAI|ALEX)-[A-Z\d]+/i
const sourceRoot = resolve('artifacts/peter-sales-demo-20261001')
const sourcePages = new Map()
if (existsSync(resolve(sourceRoot, 'conversations.json')) && existsSync(resolve(sourceRoot, 'screenshots.json'))) {
  const source = readJSON(resolve(sourceRoot, 'conversations.json'))
  const screenshots = readJSON(resolve(sourceRoot, 'screenshots.json'))
  for (const group of screenshots.customers || []) {
    const customer = source.customers?.find(item => item.name === group.name)
    for (const file of group.files || []) {
      const page = customer?.pages?.find(item => item.stage === file.stage && item.date === file.date)
      if (page) sourcePages.set(file.file, page)
    }
  }
}
const normalized = text => text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()
function stageSummary(span) {
  if (!span) return undefined
  let output = span.output
  if (typeof output === 'string') { try { output = JSON.parse(output) } catch { output = {} } }
  const metrics = {}
  for (const key of ['ocr_chars', 'caption_chars', 'chunks_created', 'image_bytes', 'indexed', 'ocr_skipped', 'ocr_prompt', 'skipped']) {
    if (output?.[key] !== undefined) metrics[key] = output[key]
  }
  for (const key of ['ocr_error', 'caption_error', 'read_error', 'normalization_error']) {
    if (!output?.[key]) continue
    const message = String(output[key])
    metrics[key] = {
      present: true,
      category: /429|rate.?limit|too many/i.test(message) ? 'rate_limit'
        : /timeout|timed out|deadline/i.test(message) ? 'timeout'
          : /401|403|unauthorized|authentication|invalid.*key/i.test(message) ? 'authentication'
            : /402|insufficient|balance|credit|quota/i.test(message) ? 'quota'
              : /500|502|503|504|server error|bad gateway/i.test(message) ? 'provider_server'
                : /decode|unmarshal|invalid character|json/i.test(message) ? 'response_format'
                  : 'other',
    }
  }
  return {
    name: span.name, kind: span.kind, status: span.status,
    error_code: span.error_code || undefined,
    output_metrics: Object.keys(metrics).length ? metrics : undefined,
    children: (span.children || []).map(stageSummary),
  }
}
async function auditDocument(doc) {
  const [detail, chunks, stages] = await Promise.all([
    optional(`/api/v1/knowledge/${doc.id}`, doc),
    listAll(`/api/v1/chunks/${doc.id}?${chunkQuery}`).catch(error => { errors.push(error.message); return [] }),
    optional(`/api/v1/knowledge/${doc.id}/stages`, {}),
  ])
  let imageOCRChars = 0
  let imageCaptionChars = 0
  let imageMetadataCount = 0
  let hasPeterLabel = false
  let containsOldSeedMarker = oldSeedPattern.test(detail.description || '')
  const charsByType = {}
  const seenImages = new Set()
  for (const chunk of chunks) {
    const content = chunk.content || ''
    const type = chunk.chunk_type || 'unknown'
    charsByType[type] = (charsByType[type] || 0) + content.length
    hasPeterLabel ||= /Peter/.test(content)
    containsOldSeedMarker ||= oldSeedPattern.test(content)
    let images = chunk.image_info
    if (typeof images === 'string') { try { images = JSON.parse(images) } catch { images = [] } }
    for (const image of Array.isArray(images) ? images : []) {
      const signature = JSON.stringify([image.url, image.original_url, image.ocr_text, image.caption])
      if (seenImages.has(signature)) continue
      seenImages.add(signature)
      imageMetadataCount++
      imageOCRChars += (image.ocr_text || '').length
      imageCaptionChars += (image.caption || '').length
    }
  }
  const page = sourcePages.get(detail.file_name || detail.title)
  const sourceCoverage = page ? Object.fromEntries(['image_ocr', 'image_caption'].map(type => {
    const content = chunks.filter(chunk => chunk.chunk_type === type).map(chunk => chunk.content || '').join('\n')
    const canonical = normalized(content)
    return [type, {
      expected_messages: page.messages.length,
      fully_covered_messages: page.messages.filter(message => canonical.includes(normalized(message.text))).length,
      peter_label_count: (content.match(/Peter/g) || []).length,
      date_retained: canonical.includes(normalized(page.date)),
    }]
  })) : undefined
  return {
    id: doc.id, file_name: detail.file_name || detail.title,
    file_type: detail.file_type, file_hash: detail.file_hash,
    parse_status: detail.parse_status, summary_status: detail.summary_status,
    pending_subtasks_count: detail.pending_subtasks_count,
    summary_chars: (detail.description || '').length,
    chunk_counts: counts(chunks, 'chunk_type'), chunk_chars: charsByType,
    image_metadata_count: imageMetadataCount,
    image_ocr_chars: imageOCRChars, image_caption_chars: imageCaptionChars,
    has_peter_label: hasPeterLabel, contains_old_seed_marker: containsOldSeedMarker,
    source_message_coverage: sourceCoverage,
    stages: stageSummary(stages.trace),
  }
}
async function auditSession(session) {
  const id = session.id || session.session_id
  const [attachments, messages] = await Promise.all([
    optional(`/api/v1/sessions/${id}/attachments`, []),
    optional(`/api/v1/messages/${id}/load`, []),
  ])
  const attachmentRows = rows({ data: attachments })
  const messageRows = rows({ data: messages })
  return {
    id, customer_knowledge_base_id: session.customer_knowledge_base_id,
    attachments: attachmentRows.map(item => ({
      id: item.id, file_name: item.file_name, status: item.status || item.parse_status,
      content_chars: (item.content || item.parsed_content || '').length,
      archived_knowledge_id: item.archived_knowledge_id || item.knowledge_id,
    })),
    attachment_statuses: counts(attachmentRows, 'status'),
    loaded_message_count: messageRows.length, message_roles: counts(messageRows, 'role'),
    loaded_messages_have_old_seed_marker: messageRows.some(item => oldSeedPattern.test(item.content || '')),
    message_scope: 'API default history window; not the total lifetime message count',
  }
}
const result = {
  inspected_at: new Date().toISOString(), origin,
  account: { email: account.email, tenant_id: login.tenant?.id || login.data?.tenant?.id || account.tenant_id },
  evidence_scope: 'GET snapshots and optional Neo4j read counts; no chat or ingestion was triggered',
  knowledge_bases: [], errors,
}
for (const kb of resources.values()) {
  const startErrorCount = errors.length
  const metadata = await optional(`/api/v1/knowledge-bases/${kb.id}`, {})
  const documents = await listAll(`/api/v1/knowledge-bases/${kb.id}/knowledge`).catch(error => { errors.push(error.message); return [] })
  // Keep load small while ingestion workers are processing the same server.
  const audited = []
  for (const doc of documents) audited.push(await auditDocument(doc))
  const wikiStats = await optional(`/api/v1/knowledgebase/${kb.id}/wiki/stats`, null)
  const wikiGraph = await optional(`/api/v1/knowledgebase/${kb.id}/wiki/graph`, null)
  const wikiPages = await optional(`/api/v1/knowledgebase/${kb.id}/wiki/pages?page=1&page_size=100`, null)
  let sessions = []
  if (kb.role === 'customer') {
    sessions = await listAll(`/api/v1/sessions?customer_knowledge_base_id=${kb.id}`).catch(error => { errors.push(error.message); return [] })
  }
  if (kb.session_id && !sessions.some(session => session.id === kb.session_id)) {
    const session = await optional(`/api/v1/sessions/${kb.session_id}`, null)
    if (session) sessions.push(session)
  }
  const chatEvidence = []
  for (const session of sessions) chatEvidence.push(await auditSession(session))
  result.knowledge_bases.push({
    ...kb, name: metadata.name || kb.name,
    tenant_id: metadata.tenant_id, indexing_strategy: metadata.indexing_strategy,
    wiki_granularity: metadata.wiki_config?.extraction_granularity,
    image_processing_enabled: metadata.vlm_config?.enabled,
    entity_extraction_enabled: metadata.extract_config?.enabled,
    document_count: documents.length,
    expected_document_count_matches: kb.expected_documents === undefined ? null : documents.length === kb.expected_documents,
    document_statuses: counts(audited, 'parse_status'),
    summary_statuses: counts(audited, 'summary_status'),
    image_document_count: audited.filter(doc => /\.(png|jpe?g|webp|gif)$/i.test(doc.file_name || '')).length,
    documents: audited,
    wiki_stats: wikiStats,
    wiki_link_graph: wikiGraph ? { nodes: wikiGraph.nodes?.length, edges: wikiGraph.edges?.length, meta: wikiGraph.meta } : null,
    wiki_pages: (wikiPages?.pages || []).map(page => ({ id: page.id, slug: page.slug, title: page.title, page_type: page.page_type })),
    wiki_pages_total: wikiPages?.total,
    entity_graph: { status: 'not_checked', reason: 'Wiki link graph is distinct from the Neo4j entity graph; use --neo4j' },
    sessions: chatEvidence, read_error_count: errors.length - startErrorCount,
  })
  console.log(`${kb.name}: ${documents.length} documents, ${audited.filter(doc => doc.parse_status === 'completed').length} complete, Wiki ${wikiStats?.total_pages ?? 'unavailable'}`)
}
if (options.neo4j) {
  const queries = [...resources.values()].map(kb => {
    const label = 'ENTITY' + kb.id.replaceAll('-', '_')
    return `CALL { MATCH (n:\`${label}\`) RETURN count(n) AS nodes, count(DISTINCT n.kg) AS documents, count(DISTINCT n.name) AS names } CALL { MATCH (:\`${label}\`)-[r]->(:\`${label}\`) RETURN count(r) AS relations } RETURN '${kb.id}|' + toString(nodes) + '|' + toString(relations) + '|' + toString(documents) + '|' + toString(names) AS audit`
  }).join('\nUNION ALL\n') + ';\n'
  const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'"
  const shell = 'auth=$(tr -d \'\\r\\n\' < /run/secrets/neo4j_auth); export NEO4J_USERNAME=neo4j; export NEO4J_PASSWORD="${auth#neo4j/}"; unset auth; exec cypher-shell --format plain'
  const remote = `sudo docker exec -i musuw-peter-neo4j-1 sh -c ${shellQuote(shell)}`
  const query = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'musuw-build-x64', remote], { input: queries, encoding: 'utf8', timeout: 90000, maxBuffer: 1024 * 1024 })
  if (query.status !== 0) {
    errors.push(`Neo4j read failed: exit ${query.status ?? 'timeout'}`)
    for (const kb of result.knowledge_bases) kb.entity_graph = { status: 'read_failed' }
  } else {
    const byId = new Map()
    for (const line of query.stdout.split('\n')) {
      const match = line.match(/([a-f\d-]{36})\|(\d+)\|(\d+)\|(\d+)\|(\d+)/i)
      if (match) byId.set(match[1], { status: 'checked', nodes: Number(match[2]), relationships: Number(match[3]), covered_documents: Number(match[4]), distinct_entity_names: Number(match[5]) })
    }
    for (const kb of result.knowledge_bases) kb.entity_graph = byId.get(kb.id) || { status: 'missing_read_result' }
  }
}
result.finished_at = new Date().toISOString()
result.totals = {
  knowledge_bases: result.knowledge_bases.length,
  documents: result.knowledge_bases.reduce((sum, kb) => sum + kb.document_count, 0),
  completed: result.knowledge_bases.reduce((sum, kb) => sum + (kb.document_statuses.completed || 0), 0),
  failed: result.knowledge_bases.reduce((sum, kb) => sum + (kb.document_statuses.failed || 0), 0),
  read_errors: errors.length,
}
const output = resolve(options.output)
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
chmodSync(output, 0o600)
console.log(`Read-only audit saved: ${output}`)
if (errors.length) process.exitCode = 1
