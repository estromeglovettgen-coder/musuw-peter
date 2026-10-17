// Explicit live acceptance. Never invoked by the offline test suite.
// FIRE_API_ACCEPTANCE_RUN=true FIRE_API_ORIGIN=... node e2e/peter/fire-membership-api.mjs
// Optional phases: --phase=cleanup, --phase=expiry (after an operator expires ONLY registry.users.b).
// Credentials and raw SSE remain in the ignored, mode-0600 runtime directory.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { request } from '@playwright/test'

assert.equal(process.env.FIRE_API_ACCEPTANCE_RUN, 'true', 'Live mutations require FIRE_API_ACCEPTANCE_RUN=true')
const origin = process.env.FIRE_API_ORIGIN
assert.ok(origin && /^https?:\/\//.test(origin), 'Set the exact FIRE_API_ORIGIN; no implicit production target')
const phase = process.argv.find(arg => arg.startsWith('--phase='))?.slice(8) || 'all'
assert.ok(['all', 'cleanup', 'expiry'].includes(phase))
const runtime = resolve(process.env.FIRE_API_RUNTIME || '.runtime/peter/membership-20261017/api-acceptance')
mkdirSync(runtime, { recursive: true, mode: 0o700 })
chmodSync(runtime, 0o700)
const registryPath = runtime + '/registry.json'
const registry = existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : {
  run: randomUUID(), origin, users: {}, plans: [], sessions: [], kbs: [], checks: [], completed: false,
}
assert.equal(registry.origin, origin, 'A run registry can only be replayed against its original target')
const save = () => { writeFileSync(registryPath, JSON.stringify(registry, null, 2), { mode: 0o600 }); chmodSync(registryPath, 0o600) }
const pass = (name, evidence = {}) => { registry.checks.push({ name, at: new Date().toISOString(), ...evidence }); save(); console.log('PASS ' + name) }
const client = await request.newContext({ baseURL: origin, ignoreHTTPSErrors: true, timeout: 240000 })
const account = JSON.parse(readFileSync(process.env.FIRE_API_ADMIN_FILE || '.runtime/peter/deployment/account.json', 'utf8'))
let admin, a, b
function headers(actor, tenant) {
  return { ...(actor.apiKey ? { 'X-API-Key': actor.apiKey } : actor.token ? { Authorization: 'Bearer ' + actor.token } : {}),
    ...(tenant ? { 'X-Tenant-ID': String(tenant) } : {}), 'Accept-Language': 'zh-CN' }
}
async function raw(actor, path, method = 'GET', data, options = {}) {
  const response = await client.fetch(path, { method, headers: headers(actor, options.tenant),
    ...(data === undefined ? {} : { data }), ...options, failOnStatusCode: false })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = null }
  return { code: response.status(), body, text }
}
async function api(actor, path, method = 'GET', data, options) {
  const r = await raw(actor, path, method, data, options)
  assert.ok(r.code >= 200 && r.code < 300 && r.body?.success !== false, `${method} ${path}: HTTP ${r.code}`)
  return r.body?.data ?? r.body
}
async function forbidden(actor, path, method = 'GET', data, options) {
  const r = await raw(actor, path, method, data, options)
  assert.ok([401, 403, 404].includes(r.code), `${method} ${path} must reject; HTTP ${r.code}`)
}
async function login(credentials) {
  const result = await api({}, '/api/v1/auth/login', 'POST', { email: credentials.username || credentials.email, password: credentials.password })
  assert.ok(result.token && result.user?.id)
  return { token: result.token, user: result.user }
}
const status = actor => api(actor, '/api/v1/fire/membership')
const usage = actor => api(actor, '/api/v1/fire/usage?page_size=100')
const adjust = (user, mutation) => api(admin, `/api/v1/system/admin/fire/users/${user.id}/adjustments`, 'POST', mutation)
async function session(actor, target) {
  const s = await api(actor, '/api/v1/sessions', 'POST', { title: 'Fire API acceptance ' + registry.run, ...(target ? { customer_knowledge_base_id: target } : {}) })
  registry.sessions.push({ id: s.id, owner: actor.user.id }); save(); return s
}
function events(text) {
  return text.split(/\r?\n/).filter(line => line.startsWith('data:')).flatMap(line => {
    try { return [JSON.parse(line.slice(5).trim())] } catch { return [] }
  })
}
async function chat(actor, id, query, extra = {}, blocked = false) {
  const r = await raw(actor, `/api/v1/agent-chat/${id}`, 'POST', {
    query, agent_id: 'fire-taylor', agent_enabled: true, disable_title: true, channel: 'web', ...extra,
  })
  writeFileSync(`${runtime}/chat-${id}-${Date.now()}.sse`, r.text, { mode: 0o600 })
  const rows = events(r.text), errors = rows.filter(row => row.response_type === 'error')
  const answer = rows.filter(row => row.response_type === 'answer').map(row => row.content || '').join('')
  if (blocked) {
    assert.ok(r.code === 402 || errors.length || r.body?.success === false, 'Inactive/insufficient allowance must explicitly reject generation')
    assert.equal(answer, '', 'A blocked user must not receive generated answer text')
  } else {
    assert.equal(r.code, 200, 'Natural-language QA must start')
    assert.equal(errors.length, 0, 'Natural-language QA must finish without a hidden SSE failure')
    assert.ok(answer.trim().length > 5, 'Natural-language QA must return actual answer text')
  }
  return answer
}
async function settled(actor, test, timeout = 180000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const value = await status(actor)
    if (value.reserved_tokens === 0 && test(value)) return value
    await delay(1500)
  }
  assert.fail('Allowance did not reach its expected settled state')
}
async function upload(actor, kb, label, options = {}) {
  const text = '# 沟通记录（虚构验收资料）\n\n' +
    '林晓和陈宇第一次一起参加朋友组织的徒步活动。林晓说她最近忙着准备展览，周日有空，但不喜欢被临时催促。陈宇回复“你先忙，等你方便我们再约”，没有连续追问。' +
    '两人都喜欢摄影，林晓主动分享了三张海边照片，并询问陈宇常用哪一款相机。下次沟通可以先回应她分享的照片，再提出明确且可拒绝的邀约；不能从一次回复推断她的固定性格或承诺。' +
    '\n\n这份资料只用于验证用户自己上传的 Markdown 能通过原生解析、摘要、向量处理；验收标记：' + registry.run + '，文件：' + label + '\n'
  return api(actor, `/api/v1/knowledge-bases/${kb}/knowledge/file`, 'POST', undefined, {
    ...options, multipart: { file: { name: label + '.md', mimeType: 'text/markdown', buffer: Buffer.from(text) }, channel: 'web' },
  })
}
async function processed(actor, id, options = {}) {
  const started = Date.now()
  while (Date.now() - started < 240000) {
    const doc = await api(actor, '/api/v1/knowledge/' + id, 'GET', undefined, options)
    assert.ok(!['failed', 'cancelled'].includes(doc.parse_status), 'Native document processing failed')
    assert.notEqual(doc.summary_status, 'failed', 'Native summary generation failed')
    if (doc.parse_status === 'completed' && doc.summary_status === 'completed') return doc
    await delay(1500)
  }
  assert.fail('Native document/summary pipeline did not finish')
}
async function cleanup() {
  const failures = []
  // Only IDs registered by this run are ever removed. The shared course is never registered.
  for (const key of ['a', 'b']) {
    const own = registry.users[key]
    if (!own) continue
    let actor
    try { actor = await login(own) } catch { continue }
    for (const s of registry.sessions.filter(row => row.owner === own.id && !row.cleaned)) {
      const r = await raw(actor, '/api/v1/sessions/' + s.id, 'DELETE')
      if ([200, 202, 204, 404].includes(r.code)) s.cleaned = true
      else failures.push('session:' + s.id + ':' + r.code)
    }
    for (const kb of registry.kbs.filter(row => row.owner === own.id && !row.cleaned)) {
      const r = await raw(actor, '/api/v1/knowledge-bases/' + kb.id, 'DELETE')
      if ([200, 202, 204, 404].includes(r.code)) kb.cleaned = true
      else failures.push('kb:' + kb.id + ':' + r.code)
    }
  }
  for (const plan of registry.plans.filter(row => !row.cleaned)) {
    const r = await raw(admin, '/api/v1/system/admin/fire/plans/' + plan.id, 'PUT', { ...plan.body, active: false })
    if (r.code === 200) plan.cleaned = true
    else failures.push('plan:' + plan.id + ':' + r.code)
  }
  for (const own of Object.values(registry.users).filter(row => !row.deletionAccepted)) {
    const r = await raw(admin, '/api/v1/system/admin/users/' + own.id, 'DELETE')
    if ([202, 404].includes(r.code)) own.deletionAccepted = true
    else failures.push('account:' + own.id + ':' + r.code)
  }
  registry.cleanup = { at: new Date().toISOString(), failures, accountDeletionIsAsynchronous: true }; save()
  assert.deepEqual(failures, [], 'Cleanup must not claim success when native deletion rejects a test resource')
  pass('Only this run’s disposable sessions, targets and accounts were deleted/requested for erasure; own plan deactivated')
}
try {
  admin = await login(account)
  assert.equal((await status(admin)).unlimited, true, 'The operator must be a real exempt administrator')
  if (phase === 'cleanup') { await cleanup() } else if (phase === 'expiry') {
    assert.ok(registry.users.b, 'Run all first; expire only the B account recorded by this run')
    b = await login(registry.users.b)
    assert.equal((await status(b)).status, 'expired', 'An operator must first expire this disposable membership through a narrow database fixture')
    const s = await session(b)
    await chat(b, s.id, '你好，简单打个招呼。', {}, true)
    const req = { operation_id: randomUUID(), kind: 'renew', duration_days: 2, tokens: 50000, note: 'API acceptance ' + registry.run }
    const renewed = await adjust(b.user, req), replay = await adjust(b.user, req)
    assert.equal(renewed.status, 'active'); assert.equal(replay.expires_at, renewed.expires_at); assert.equal(replay.token_limit, renewed.token_limit)
    pass('A truly expired test account cannot generate; native renewal and replay restore exactly one allowance period')
    registry.expiryVerified = true; registry.expiryPending = false
    registry.completed = !registry.blockedChecks?.length; save()
    if (process.env.FIRE_API_ACCEPTANCE_KEEP !== 'true') await cleanup()
  } else {
    assert.equal(Object.keys(registry.users).length, 0, 'Use a new private runtime directory for a fresh run, or --phase=cleanup')
    const planBody = { name: '验收临时套餐 ' + registry.run, duration_days: 2, token_limit: 400000, active: true }
    const plan = await api(admin, '/api/v1/system/admin/fire/plans', 'POST', planBody)
    registry.plans.push({ id: plan.id, body: planBody }); save()
    for (const key of ['a', 'b']) {
      const body = { operation_id: randomUUID(), ...(key === 'a' ? { fire_plan_id: plan.id } : { fire_duration_days: 2, fire_tokens: 1 }) }
      const r = await raw(admin, '/api/v1/system/admin/users/create', 'POST', body)
      assert.equal(r.code, 201)
      assert.ok(r.body.user?.id && r.body.generated_password)
      registry.users[key] = { id: r.body.user.id, username: r.body.user.username, email: r.body.user.email,
        password: r.body.generated_password, tenant_id: r.body.user.tenant_id, request: body }; save()
      assert.match(r.body.user.username, /^taylor\d{3,}$/); assert.match(r.body.generated_password, /^Ty\d{6}$/)
      const again = await raw(admin, '/api/v1/system/admin/users/create', 'POST', body)
      assert.equal(again.code, 200); assert.equal(again.body.user.id, r.body.user.id)
      assert.equal(again.body.generated_password, undefined, 'An idempotent retry must not redisclose the password')
      const conflict = await raw(admin, '/api/v1/system/admin/users/create', 'POST', { ...body, username: 'conflict-' + registry.run })
      assert.equal(conflict.code, 409)
    }
    a = await login(registry.users.a); b = await login(registry.users.b)
    assert.notEqual(a.user.tenant_id, b.user.tenant_id); assert.notEqual(a.user.tenant_id, admin.user.tenant_id)
    assert.ok(!a.user.is_system_admin && !b.user.is_system_admin && !a.user.can_access_all_tenants)
    pass('Native username login, independent tenants, default credentials, atomic account replay and conflict rejection')
    const badName = 'accept-rollback-' + registry.run
    const bad = await raw(admin, '/api/v1/system/admin/users/create', 'POST', {
      operation_id: randomUUID(), username: badName, fire_plan_id: randomUUID(),
    })
    assert.equal(bad.code, 400)
    const found = await api(admin, '/api/v1/system/admin/fire/users?query=' + encodeURIComponent(badName))
    assert.equal(found.total, 0, 'Invalid plan must roll back identity, tenant, resources and grant')
    pass('Invalid plan atomically rolls back the entire account without an orphan user')
    const taylor = await api(a, '/api/v1/agents/fire-taylor')
    const otherTaylor = await api(b, '/api/v1/agents/fire-taylor')
    assert.equal(taylor.name, '泰勒'); assert.equal(taylor.tenant_id, a.user.tenant_id)
    assert.equal(otherTaylor.tenant_id, b.user.tenant_id)
    assert.equal(taylor.config.knowledge_bases.length, 1)
    assert.equal(taylor.config.model_id, otherTaylor.config.model_id)
    assert.equal(taylor.config.mcp_selection_mode, 'none'); assert.equal(taylor.config.skills_selection_mode, 'all')
    registry.course = taylor.config.knowledge_bases[0]; save()
    const course = await api(a, '/api/v1/knowledge-bases/' + registry.course)
    assert.notEqual(course.tenant_id, a.user.tenant_id)
    const shared = await api(a, '/api/v1/shared-knowledge-bases')
    assert.ok(Array.isArray(shared) && shared.some(row => (row.knowledge_base?.id || row.id || row.knowledge_base_id) === registry.course), 'The actual @ picker shared-course projection must contain the granted resource')
    const wiki = await api(a, `/api/v1/knowledgebase/${registry.course}/wiki/pages?page_size=1`)
    assert.ok(wiki, 'Shared course Wiki must be accessible under actual product gates')
    // Harmless unchanged-name write probes; no delete is attempted against shared content.
    await forbidden(a, '/api/v1/knowledge-bases/' + registry.course, 'PUT', { name: course.name })
    await forbidden(a, '/api/v1/agents/fire-taylor', 'PUT', { name: taylor.name, config: taylor.config })
    await forbidden(a, '/api/v1/system/admin/users/create', 'POST', { operation_id: randomUUID() })
    await forbidden(a, '/api/v1/system/admin/fire/plans', 'POST', planBody)
    await forbidden(a, `/api/v1/system/admin/fire/users/${b.user.id}/adjustments`, 'POST', { operation_id: randomUUID(), kind: 'topup', tokens: 1 })
    await forbidden(a, '/api/v1/fire/membership', 'GET', undefined, { tenant: b.user.tenant_id })
    assert.equal((await api(a, '/api/v1/fire/membership?user_id=' + b.user.id)).token_limit, 400000, 'A forged target query must still return only the caller’s own membership')
    const models = await api(a, '/api/v1/models')
    const rows = Array.isArray(models) ? models : models.models
    assert.ok(Array.isArray(rows) && rows.some(row => row.id === taylor.config.model_id))
    for (const row of rows.filter(row => row.tenant_id !== a.user.tenant_id && !row.is_builtin)) {
      for (const key of ['api_key', 'app_secret', 'secret_key', 'secret_id', 'base_url', 'app_id']) assert.ok(!row.parameters?.[key] && !row[key], 'Shared model metadata must not expose ' + key)
      assert.ok(!Object.keys(row.parameters?.custom_headers || {}).length)
      assert.ok(!Object.keys(row.parameters?.extra_config || {}).length)
      assert.ok(!Object.keys(row.credentials || {}).length, 'A shared model must not disclose source credential configuration')
    }
    pass('Each user receives local Taylor plus the same native read-only course; admin mutations and source model secrets are denied')
    const model = rows.find(row => row.id === taylor.config.model_id)
    assert.match(model.name || model.description || JSON.stringify(model), /deepseek/i, 'All real generation must use the approved DeepSeek default')
    for (const actor of [a, b]) {
      const kb = await api(actor, '/api/v1/knowledge-bases', 'POST', {
        name: '验收虚构目标 ' + registry.run, type: 'document', description: 'Disposable API acceptance fixture',
        customer_profile: { status: '待了解', tags: [], note: 'Private to ' + actor.user.id, shared_knowledge_base_ids: [registry.course] },
        embedding_model_id: course.embedding_model_id, summary_model_id: taylor.config.model_id,
        chunking_config: { chunk_size: 512, chunk_overlap: 50, separators: ['\n\n', '\n', '。'] },
        indexing_strategy: { vector_enabled: true, keyword_enabled: true, wiki_enabled: false, graph_enabled: false },
      })
      registry.kbs.push({ id: kb.id, owner: actor.user.id }); save()
      actor.target = kb.id
    }
    await forbidden(a, '/api/v1/knowledge-bases/' + b.target)
    await forbidden(b, '/api/v1/knowledge-bases/' + a.target)
    const as = await session(a, a.target), bs = await session(b)
    await forbidden(b, '/api/v1/sessions/' + as.id)
    await forbidden(b, '/api/v1/messages/' + as.id + '/load')
    await forbidden(a, '/api/v1/sessions/' + bs.id)
    assert.equal((await status(a)).token_limit, 400000)
    await chat(b, bs.id, '你好，简单打个招呼。', {}, true)
    await settled(b, value => value.used_tokens === 0)
    pass('Targets, conversations and messages stay private; insufficient allowance blocks a provider call without charging')
    const before = await status(a)
    await chat(a, as.id, '第一次约她见面，我应该注意什么？结合课程简单说两点。', {
      knowledge_base_ids: [registry.course], mentioned_items: [{ id: registry.course, name: course.name, type: 'kb', kb_type: 'document' }],
    })
    const afterQA = await settled(a, value => value.used_tokens > before.used_tokens)
    assert.ok((await usage(a)).items.some(row => row.total_tokens > 0))
    pass('A short natural-language question with the real @course answers through local Taylor and settles user Token usage', { tokens: afterQA.used_tokens - before.used_tokens })
    const doc = await upload(a, a.target, 'user-own-' + registry.run)
    await processed(a, doc.id)
    const afterDoc = await settled(a, value => value.used_tokens > afterQA.used_tokens)
    const chunks = await api(a, '/api/v1/chunks/' + doc.id)
    assert.ok(chunks.length || chunks.chunks?.length)
    pass('An own Markdown file passes the real document→summary→embedding pipeline and bills its actual initiator', { tokens: afterDoc.used_tokens - afterQA.used_tokens })
    const maintenance = account.platform_api_key ? { apiKey: account.platform_api_key } : admin
    const maintenanceAccess = await raw(maintenance, '/api/v1/knowledge-bases/' + a.target, 'GET', undefined, { tenant: a.user.tenant_id })
    const maintenanceAllowed = maintenanceAccess.code === 200
    if (maintenanceAllowed) {
      const adminDoc = await upload(maintenance, a.target, 'admin-maintenance-' + registry.run, { tenant: a.user.tenant_id })
      await processed(maintenance, adminDoc.id, { tenant: a.user.tenant_id })
    } else {
      assert.ok([403, 404].includes(maintenanceAccess.code), 'Maintenance access must fail honestly')
      registry.blockedChecks ||= []
      registry.blockedChecks.push({ name: 'cross-tenant administrator document maintenance', http: maintenanceAccess.code,
        reason: 'Existing native deployment policy blocks tenant switching; do not change account privileges for acceptance' })
      save()
      console.log('PENDING cross-tenant administrator maintenance is blocked by existing native permissions; use isolated integration evidence')
      assert.notEqual(process.env.FIRE_API_ADMIN_MAINTENANCE_REQUIRED, 'true', 'Cross-tenant administrator maintenance is required but native permissions rejected it')
    }
    const afterMaintenance = await settled(a, value => value.used_tokens === afterDoc.used_tokens)
    assert.equal(afterMaintenance.used_tokens, afterDoc.used_tokens)
    if (maintenanceAllowed) pass('Administrator maintenance of this disposable user document completes without reducing that user’s allowance')
    const topup = { operation_id: randomUUID(), kind: 'topup', tokens: 10000, note: 'API acceptance ' + registry.run }
    const topped = await adjust(b.user, topup), topupReplay = await adjust(b.user, topup)
    assert.equal(topped.token_limit, 10001); assert.equal(topupReplay.token_limit, topped.token_limit)
    assert.equal((await raw(admin, `/api/v1/system/admin/fire/users/${b.user.id}/adjustments`, 'POST', { ...topup, tokens: 10001 })).code, 409)
    const invalid = await raw(admin, `/api/v1/system/admin/fire/users/${b.user.id}/adjustments`, 'POST', { operation_id: randomUUID(), kind: 'topup', tokens: -1 })
    assert.equal(invalid.code, 400); assert.equal((await status(b)).token_limit, topped.token_limit)
    await adjust(a.user, { operation_id: randomUUID(), kind: 'suspend' })
    await chat(a, as.id, '你好，简单打个招呼。', {}, true)
    assert.equal((await status(a)).used_tokens, afterMaintenance.used_tokens)
    await adjust(a.user, { operation_id: randomUUID(), kind: 'resume' })
    assert.equal((await status(a)).status, 'active')
    const renewal = { operation_id: randomUUID(), kind: 'renew', duration_days: 1, tokens: 1000 }
    const renewed = await adjust(b.user, renewal), replay = await adjust(b.user, renewal)
    assert.equal(renewed.token_limit, 11001); assert.equal(replay.expires_at, renewed.expires_at); assert.equal(replay.token_limit, renewed.token_limit)
    pass('Top-up, suspend/resume, renewal, invalid mutation rollback and idempotent/conflicting retries preserve exact balances')
    registry.mainVerified = true; registry.expiryPending = true; save()
    // An operator may run this narrow fixture after confirming the private run
    // registry. It cannot affect any account not created by this run operation.
    const fixtureUser = registry.users.b.id, fixtureOp = registry.users.b.request.operation_id
    assert.match(fixtureUser, /^[0-9a-f-]{36}$/i); assert.match(fixtureOp, /^[0-9a-f-]{36}$/i)
    writeFileSync(runtime + '/expire-own-test-account.sql',
      `BEGIN;\nDO $$ BEGIN\nUPDATE fire_token_memberships SET expires_at=CURRENT_TIMESTAMP - INTERVAL '1 minute' ` +
      `WHERE user_id='${fixtureUser}' AND reserved_tokens=0 AND EXISTS (` +
      `SELECT 1 FROM fire_workspace_accounts WHERE user_id='${fixtureUser}' AND operation_id='${fixtureOp}');\n` +
      `IF NOT FOUND THEN RAISE EXCEPTION 'Only the idle account created by this acceptance run may be expired'; END IF;\nEND $$;\nCOMMIT;\n`, { mode: 0o600 })
    console.log('PENDING real expiry fixture: only registry.users.b may be expired; then run --phase=expiry using the same runtime directory')
    // Keep these disposable users for the real expiry phase; cleanup remains explicitly available.
  }
} catch (error) {
  registry.failure = { at: new Date().toISOString(), message: String(error.message).slice(0, 600) }; save()
  console.error('FAIL ' + error.message)
  process.exitCode = 1
} finally {
  await client.dispose()
}
