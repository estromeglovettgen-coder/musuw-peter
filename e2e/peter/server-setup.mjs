import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { api, login, runtime, state, save, record, origin } from './server-client.mjs'

if (process.argv.includes('--bootstrap')) {
  assert.equal(origin, 'http://127.0.0.1:18287', 'bootstrap only through the private SSH forward')
  const account = JSON.parse(readFileSync(`${runtime}/account.json`, 'utf8'))
  await api('/api/v1/auth/register', 'POST', account)
}
await login()
record('Server account login')
const provider = JSON.parse(readFileSync(`${runtime}/provider.json`, 'utf8'))
const existing = (await api('/api/v1/models')).data
const chatParameters = {
  ...provider.parameters,
  extra_config: { ...(provider.parameters.extra_config || {}), thinking_control: 'thinking_type' },
  supports_vision: true,
  max_concurrency: 4,
}
for (const [key, type, name, display, parameters] of [
  ['chatModel', 'KnowledgeQA', provider.name, 'DeepSeek Flash', chatParameters],
  ['visionModel', 'VLLM', provider.name, 'DeepSeek 图像理解', { ...provider.parameters, supports_vision: true, interface_type: 'openai', max_concurrency: 2 }],
  ['rerankModel', 'Rerank', 'mmarco-reranker', '多语言重排序（Peter 服务器）', { provider: 'generic', base_url: 'http://reranker', extra_config: { rerank_format: 'tei' }, max_concurrency: 2 }],
  ['embeddingModel', 'Embedding', 'bge-small-zh-v1.5', '中文向量检索（Peter 服务器）', { provider: 'generic', base_url: 'http://embeddings/v1', embedding_parameters: { dimension: 512, truncate_prompt_tokens: 512 }, max_concurrency: 2 }],
]) {
  const found = existing.find(m => m.type === type && m.name === name)
  const legacyDisplay = ['Rerank', 'Embedding'].includes(type) ? display.replace('Peter 服务器', '本机') : ''
  const repairThinking = type === 'KnowledgeQA' && found?.parameters?.extra_config?.thinking_control !== 'thinking_type'
  const renameLegacy = legacyDisplay && found?.display_name === legacyDisplay
  const model = found
    ? renameLegacy || repairThinking
      ? (await api(`/api/v1/models/${found.id}`, 'PUT', {
          name: found.name, display_name: renameLegacy ? display : found.display_name, description: found.description,
          type: found.type, source: found.source, is_default: found.is_default,
          parameters: repairThinking
            ? { ...found.parameters, extra_config: { ...(found.parameters?.extra_config || {}), thinking_control: 'thinking_type' } }
            : found.parameters,
        })).data
      : found
    : (await api('/api/v1/models', 'POST', { name, display_name: display, type, source: 'remote', is_default: true, parameters })).data
  state[key] = model.id
  assert.ok(model.id)
  assert.ok(!JSON.stringify(model).includes(provider.parameters.api_key), 'credential must not be returned')
  save()
  record(`Configured ${type} model; read response masked`)
}

const thinkingDebug = new FormData()
thinkingDebug.set('input', '只回复 PETER_GRAPH_READY')
thinkingDebug.set('options', JSON.stringify({ max_tokens: 128, thinking: false }))
const thinkingResult = (await api(`/api/v1/models/${state.chatModel}/debug`, 'POST', thinkingDebug)).data
assert.match(JSON.stringify(thinkingResult), /PETER_GRAPH_READY/, 'configured model must return content with thinking disabled')
record('DeepSeek non-thinking output is usable for graph extraction')

const sandboxes = (await api('/api/v1/sandbox-configs')).data
const rows = Array.isArray(sandboxes) ? sandboxes : sandboxes?.configs || []
const sandbox = rows.find(x => x.name === 'Peter 工作沙箱') || (await api('/api/v1/sandbox-configs', 'POST', {
  name: 'Peter 工作沙箱',
  config: {
    sandbox_type: 'docker', default_timeout_sec: 60,
    docker: { image: 'mirror.ccs.tencentyun.com/wechatopenai/weknora-sandbox:v0.8.0', host: 'unix:///var/run/docker.sock', cpu_limit: 1, memory_limit_mb: 512, pids_limit: 128, network_mode: 'bridge', idle_ttl_seconds: 900 },
  },
})).data
state.sandbox = sandbox.id
save()
record('Named sandbox configuration persisted', { sandbox: sandbox.id })
