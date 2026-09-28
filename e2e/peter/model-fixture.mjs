// Controlled local provider for acceptance; never used as a real AI model.
import { createServer } from 'node:http'
const requests = []
const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/requests') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(requests))
    return
  }
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'peter-local-fixture', object: 'model', owned_by: 'local-test' }] }))
    return
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  let body
  try { body = JSON.parse(raw || '{}') } catch { res.writeHead(400); res.end(); return }
  requests.push({ path: req.url, body, authorized: req.headers.authorization === 'Bearer peter-local-test-key' })
  if (req.url === '/v1/chat/completions') {
    const content = '本地链路验收成功。这是测试服务的固定回复，不代表真实模型回答。'
    const base = { id: 'peter-local-chat', created: Math.floor(Date.now() / 1000), model: body.model }
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\n`)
      res.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\n`)
      res.end('data: [DONE]\n\n')
    } else {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }))
    }
    return
  }
  if (req.url === '/v1/embeddings') {
    const input = Array.isArray(body.input) ? body.input : [body.input]
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ object: 'list', model: body.model, data: input.map((_, index) => ({ object: 'embedding', index, embedding: [1, 0, 0, 0, 0, 0, 0, 0] })), usage: { prompt_tokens: input.length, total_tokens: input.length } }))
    return
  }
  res.writeHead(404); res.end(JSON.stringify({ error: { message: 'Unsupported local fixture endpoint' } }))
})
server.listen(19187, '127.0.0.1', () => console.log('Local acceptance provider: http://127.0.0.1:19187/v1'))
process.on('SIGTERM', () => server.close())
process.on('SIGINT', () => server.close())
