// Opt-in live acceptance of the actual Neo4j-backed Agent graph tool.
// The KB and document are fictional fixtures and are intentionally preserved.
// Only this script's temporary Agent and conversation are deleted.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { origin, runtime } from './server-client.mjs'

if (!process.argv.includes('--run')) {
  console.log('Usage: node e2e/peter/server-graph-tool.mjs --run')
  process.exit(0)
}

const kbID = '9f11d99a-f730-4631-aca4-940138e21165'
const sourceID = 'a59513f2-3341-4332-8afb-d46e31fad8f7'
const query = process.env.PETER_GRAPH_QUERY || '米娅'
const accounts = [
  JSON.parse(readFileSync(`${runtime}/account.json`, 'utf8')),
  JSON.parse(readFileSync(`${runtime}/demo-account.json`, 'utf8')),
]

async function send(token, path, method = 'GET', body) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(240_000),
  })
  const raw = await response.text()
  let payload
  try { payload = JSON.parse(raw) } catch { payload = raw }
  return { status: response.status, ok: response.ok, payload }
}

async function api(token, path, method = 'GET', body) {
  const result = await send(token, path, method, body)
  assert.ok(result.ok && result.payload?.success !== false,
    `${method} ${path} returned HTTP ${result.status}: ${result.payload?.error?.code || result.payload?.code || 'request_failed'}`)
  return result.payload.data
}

async function login(account) {
  const response = await send('', '/api/v1/auth/login', 'POST', {
    email: account.email, password: account.password,
  })
  assert.equal(response.status, 200, 'fixture account must log in')
  assert.ok(response.payload.token, 'login must issue a token')
  return response.payload.token
}

const tokens = await Promise.all(accounts.map(login))
const detailPath = `/api/v1/knowledge-bases/${kbID}`
const views = await Promise.all(tokens.map(token => send(token, detailPath)))
const owners = views.flatMap((view, index) =>
  view.ok && view.payload?.success !== false && view.payload?.data?.id === kbID ? [index] : [])
assert.equal(owners.length, 1, 'fictional graph KB must be visible to exactly one fixture tenant')
const owner = owners[0]
assert.ok(!views[1 - owner].ok || views[1 - owner].payload?.success === false,
  'other tenant must not read the customer KB')
const token = tokens[owner]
const kb = views[owner].payload.data
assert.equal(kb.indexing_strategy?.graph_enabled, true, 'preserved KB must have graph extraction enabled')
assert.equal(kb.extract_config?.enabled, true, 'preserved KB must retain graph extraction rules')
const doc = await api(token, `/api/v1/knowledge/${sourceID}`)
assert.equal(doc.knowledge_base_id, kbID, 'graph source document must belong to selected KB')
assert.equal(doc.parse_status, 'completed', 'graph source document must be parsed')

const models = await api(token, '/api/v1/models')
const chatModel = models.find(model => model.type === 'KnowledgeQA' && model.is_default && (!model.status || model.status === 'active'))
  || models.find(model => model.type === 'KnowledgeQA' && (!model.status || model.status === 'active'))
assert.ok(chatModel, 'owner tenant needs an active KnowledgeQA model')

let agentID = ''
let sessionID = ''
let evidence
try {
  const agent = await api(token, '/api/v1/agents', 'POST', {
    name: '图谱工具临时验收助手',
    description: '仅查询虚构客户的 Neo4j 图谱；验收后删除。',
    config: {
      agent_mode: 'smart-reasoning',
      agent_type: 'custom',
      model_id: chatModel.id,
      system_prompt: '这是图谱工具验收。针对图谱关系问题，必须先调用 query_knowledge_graph 一次，使用当前客户知识库的 bN 标识和用户给出的实体名；仅据工具返回的实体和关系回答。不要使用 Wiki、文本搜索或常识补全关系。',
      max_iterations: 4,
      max_completion_tokens: 800,
      temperature: 0,
      kb_selection_mode: 'selected',
      knowledge_bases: [kbID],
      allowed_tools: ['query_knowledge_graph'],
      multi_turn_enabled: false,
      skills_selection_mode: 'none',
      mcp_selection_mode: 'none',
    },
  })
  agentID = agent.id
  assert.ok(agentID)
  const session = await api(token, '/api/v1/sessions', 'POST', {
    title: '虚构客户图谱工具验收', customer_knowledge_base_id: kbID,
  })
  sessionID = session.id
  assert.ok(sessionID)

  const result = await send(token, `/api/v1/agent-chat/${sessionID}`, 'POST', {
    query: `请使用 query_knowledge_graph 查询「${query}」相关的真实实体关系，然后简述查到的关系。`,
    agent_id: agentID, agent_enabled: true, disable_title: true, channel: 'web',
  })
  assert.equal(result.status, 200, 'Agent chat request must start')
  // SSE is returned as text. Never infer success from the natural-language answer:
  // a tool_result carrying graph_data is the evidence of a Neo4j query.
  assert.equal(typeof result.payload, 'string', 'Agent chat must return SSE')
  const events = result.payload.split('\n').filter(line => line.startsWith('data:')).map(line => {
    try { return JSON.parse(line.slice(5)) } catch { return {} }
  })
  const graphCall = events.find(event => event.response_type === 'tool_call' && event.data?.tool_name === 'query_knowledge_graph')
  const graphResult = events.find(event => event.response_type === 'tool_result' && event.data?.tool_name === 'query_knowledge_graph')
  assert.ok(graphCall, 'model must invoke query_knowledge_graph')
  assert.ok(graphResult, 'graph tool must emit its own result')
  assert.equal(graphResult.data.success, true, 'graph query must succeed')
  assert.equal(graphResult.data.display_type, 'graph_query_results')
  const graph = graphResult.data.graph_data
  assert.ok(Array.isArray(graph?.nodes) && graph.nodes.length > 0, 'Neo4j must return entities')
  assert.ok(Array.isArray(graph?.edges) && graph.edges.length > 0, 'Neo4j must return relationships')
  assert.equal(graph.total_nodes, graph.nodes.length)
  assert.equal(graph.total_edges, graph.edges.length)
  // Customer conversations search the full KB. The graph tool therefore
  // queries Neo4j's KB namespace and intentionally reports an empty
  // knowledge_id; the fixture document was checked separately above.
  assert.ok(graph.nodes.every(node => node.kb_id === kbID), 'entities must stay inside selected KB')
  assert.ok(graph.edges.every(edge => edge.kb_id === kbID), 'relationships must stay inside selected KB')
  assert.ok(graph.edges.every(edge => graph.nodes.some(node => node.id === edge.source) && graph.nodes.some(node => node.id === edge.target)),
    'every Neo4j relationship must connect returned entities')
  assert.ok(!events.some(event => event.response_type === 'error'), 'Agent stream must not contain errors')

  evidence = {
    at: new Date().toISOString(), kb_id: kbID, source_id: sourceID,
    owner_fixture: owner === 0 ? 'peter' : 'demo',
    query, entities: graph.total_nodes, relationships: graph.total_edges,
    relation_types: [...new Set(graph.edges.map(edge => edge.type))].sort(),
  }
} finally {
  const cleanup = []
  if (sessionID) {
    cleanup.push(api(token, `/api/v1/sessions/${sessionID}`, 'DELETE'))
  }
  if (agentID) {
    cleanup.push(api(token, `/api/v1/agents/${agentID}`, 'DELETE'))
  }
  const results = await Promise.allSettled(cleanup)
  assert.ok(results.every(result => result.status === 'fulfilled'),
    `temporary graph objects must be removed: ${results.filter(result => result.status === 'rejected').map(result => result.reason?.message).join('; ')}`)
}
const [removedSession, removedAgent] = await Promise.all([
  send(token, `/api/v1/sessions/${sessionID}`),
  send(token, `/api/v1/agents/${agentID}`),
])
assert.ok(!removedSession.ok || removedSession.payload?.success === false || !removedSession.payload?.data?.id,
  'temporary graph session must no longer be readable')
assert.ok(!removedAgent.ok || removedAgent.payload?.success === false || !removedAgent.payload?.data?.id,
  'temporary graph Agent must no longer be readable')
writeFileSync(`${runtime}/graph-tool-acceptance.json`, JSON.stringify(evidence, null, 2), { mode: 0o600 })
console.log(`PASS isolated tenant access; Neo4j graph tool returned ${evidence.entities} entities and ${evidence.relationships} relationships; temporary Agent and session deleted`)
