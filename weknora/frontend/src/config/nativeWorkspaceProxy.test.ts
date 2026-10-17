import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { createServer as createViteServer } from 'vite'
import { nativeWorkspaceProxy } from '../../../../shared/nativeWorkspaceProxy'

test('native proxy drops oversized localhost cookies and retains Bearer authentication', async () => {
  const upstream = createServer((req, res) => {
    if ((req.headers.cookie || '').length > 8192) { res.writeHead(400); res.end('Request Header Or Cookie Too Large'); return }
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ authorization: req.headers.authorization, cookie: req.headers.cookie || '' }))
  })
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const target = `http://127.0.0.1:${(upstream.address() as any).port}`
  const vite = await createViteServer({ configFile: false, appType: 'custom', logLevel: 'silent', optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0, proxy: {
    '/native': nativeWorkspaceProxy(target, true), '/standard': nativeWorkspaceProxy(target, false),
  } } })
  try {
    await vite.listen()
    const origin = `http://127.0.0.1:${(vite.httpServer!.address() as any).port}`
    const response = await fetch(origin + '/native', { headers: { cookie: 'other_local_app=' + 'x'.repeat(12000), authorization: 'Bearer native-test-token' } })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { authorization: 'Bearer native-test-token', cookie: '' })
    const standard = await fetch(origin + '/standard', { headers: { cookie: 'session=keep-me' } })
    assert.deepEqual(await standard.json(), { cookie: 'session=keep-me' })
  } finally { await vite.close(); await new Promise<void>(resolve => upstream.close(() => resolve())) }
})
