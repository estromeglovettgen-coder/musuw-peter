import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  registerPoolErrorHandler,
  clampPage,
  clampPageSize,
  modelPolicyRequestPlan,
  isPublicConsoleAsset,
  isSafeOperationsPath,
  parseEnvFile,
  productionDatabaseConnectionString,
  readKeychainSecret,
  readLangfuseData,
  readPaddleData,
  readR2Inventory,
  readSupabaseAdminData,
  targetListenPort,
  targetPort,
  targetCookieNames,
  targetSessionToken,
  unavailableProviderState,
} from './musuw-admin-server.mjs'

test('an idle database connection error is observed instead of terminating the console', () => {
  let handler
  const pool = {
    on(event, callback) {
      assert.equal(event, 'error')
      handler = callback
    },
  }
  const observed = []

  registerPoolErrorHandler(pool, (message) => observed.push(message))
  assert.doesNotThrow(() => handler(new Error('connection interrupted')))
  assert.deepEqual(observed, ['[musuw-admin] database connection interrupted'])
})

test('parseEnvFile handles comments, exports, and quoted values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'musuw-admin-test-'))
  const path = join(directory, 'runtime.env')
  try {
    writeFileSync(path, '# ignored\nexport A=one\nB="two words"\nC=\'three\'\nINVALID\n')
    assert.deepEqual(parseEnvFile(path), { A: 'one', B: 'two words', C: 'three' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('pagination is finite and bounded', () => {
  assert.equal(clampPage('2'), 2)
  assert.equal(clampPage('-1'), 1)
  assert.equal(clampPageSize('500'), 100)
  assert.equal(clampPageSize('0'), 25)
})

test('each fixed environment has a distinct cookie namespace', () => {
  const testCookies = targetCookieNames('test')
  const productionCookies = targetCookieNames('production')
  assert.deepEqual(testCookies, {
    session: 'musuw_admin_session_test',
    csrf: 'musuw_admin_csrf_test',
  })
  assert.deepEqual(productionCookies, {
    session: 'musuw_admin_session_production',
    csrf: 'musuw_admin_csrf_production',
  })
  assert.notEqual(testCookies.session, productionCookies.session)
  assert.notEqual(testCookies.csrf, productionCookies.csrf)
})

test('a session cookie from the other fixed origin is ignored', () => {
  assert.equal(targetSessionToken('production', { musuw_admin_session_test: 'test-session' }), '')
  assert.equal(targetSessionToken('test', { musuw_admin_session_production: 'production-session' }), '')
  assert.equal(targetSessionToken('production', { musuw_admin_session_production: 'production-session' }), 'production-session')
})

test('each target is bound to its fixed console port', () => {
  assert.equal(targetPort('test'), 4186)
  assert.equal(targetPort('production'), 4187)
  assert.equal(targetListenPort('test'), 4186)
  assert.equal(targetListenPort('production'), 4187)
  assert.equal(targetListenPort('test', '4186'), 4186)
  assert.throws(() => targetListenPort('test', 4187), /TEST.*4186/)
  assert.throws(() => targetListenPort('production', 4186), /PRODUCTION.*4187/)
  assert.throws(() => targetListenPort('staging'), /target must be test or production/)
})

test('production database loader takes its password from the protected read-only secret file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'musuw-admin-production-secret-'))
  const passwordPath = join(directory, 'production-ro-password')
  try {
    writeFileSync(passwordPath, 'authoritative-password', { mode: 0o600 })
    chmodSync(passwordPath, 0o600)
    const connectionString = productionDatabaseConnectionString({
      MUSUW_ADMIN_DATABASE_URL: 'postgresql://musuw_operations_ro:stale-password@127.0.0.1:25432/WeKnora?sslmode=disable',
    }, { passwordPath })
    const parsed = new URL(connectionString)
    assert.equal(parsed.username, 'musuw_operations_ro')
    assert.equal(parsed.password, 'authoritative-password')
    assert.equal(parsed.hostname, '127.0.0.1')
    assert.equal(parsed.port, '25432')

    chmodSync(passwordPath, 0o644)
    assert.throws(() => productionDatabaseConnectionString({
      MUSUW_ADMIN_DATABASE_URL: 'postgresql://musuw_operations_ro:stale-password@127.0.0.1:25432/WeKnora',
    }, { passwordPath }), /permissions are unsafe/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('cross-target switching is navigation-only at the server boundary', () => {
  const source = readFileSync(new URL('./musuw-admin-server.mjs', import.meta.url), 'utf8')
  assert.match(source, /environment switching is navigation-only/)
})

test('model policy route exposes only the five fixed safe boundaries', () => {
  assert.deepEqual(modelPolicyRequestPlan('GET', '/admin-api/model-policy'), {
    method: 'GET',
    upstreamPath: '/api/v1/system/admin/consumer-model-policy',
  })
  assert.deepEqual(modelPolicyRequestPlan('PUT', '/admin-api/model-policy/rag'), {
    method: 'PUT',
    scene: 'rag',
    upstreamPath: '/api/v1/system/admin/consumer-model-policy/rag',
  })
  for (const scene of ['rag', 'rerank', 'wiki', 'vision', 'asr']) {
    assert.equal(modelPolicyRequestPlan('PUT', `/admin-api/model-policy/${scene}`)?.scene, scene)
  }
  assert.equal(modelPolicyRequestPlan('PUT', '/admin-api/model-policy/chat'), null)
  assert.equal(modelPolicyRequestPlan('PUT', '/admin-api/model-policy/embedding'), null)
  assert.equal(modelPolicyRequestPlan('POST', '/admin-api/model-policy/rag'), null)
  assert.equal(modelPolicyRequestPlan('GET', '/admin-api/model-policy/rag'), null)
  assert.equal(modelPolicyRequestPlan('GET', '/admin-api/model-policy/'), null)
})

test('admin launcher keeps the historical production tunnel safety contract', () => {
  const source = readFileSync(new URL('./musuw-admin', import.meta.url), 'utf8')
  assert.match(source, /test_port=4186/)
  assert.match(source, /production_port=4187/)
  assert.match(source, /process_state_dir=.*processes/)
  assert.match(source, /start_all\(\)/)
  assert.match(source, /start_console test no/)
  assert.match(source, /start_console production no/)
  assert.match(source, /target_state_dir/)
  assert.match(source, /production_ssh_target_default=musuw-tokyo/)
  assert.match(source, /production_container_default=weknora-v072-production-postgres/)
  assert.match(source, /StrictHostKeyChecking=yes/)
  assert.match(source, /BatchMode=yes/)
  assert.match(source, /ExitOnForwardFailure=yes/)
  assert.match(source, /-M -S \"\$ssh_control_socket\" -f -N/)
  assert.match(source, /repo_instance_id=.*cksum/)
  assert.match(source, /ssh_control_socket=\"\/tmp\/musuw-admin-\$\{repo_instance_id\}-\$\{admin_uid\}\.sock\"/)
  assert.match(source, /-L \"127\.0\.0\.1:\$\{tunnel_port\}:\$\{container_ip\}:\$\{remote_db_port\}\"/)
  assert.match(source, /require_pinned_ssh_target/)
  assert.match(source, /sudo -n docker inspect/)
  assert.match(source, /safe_ssh_target/)
  assert.match(source, /safe_container_name/)
  assert.match(source, /prepare-production-tunnel\)/)
  assert.match(source, /stop_tunnel/)
  assert.match(source, /env -i/)
  assert.doesNotMatch(source, /StrictHostKeyChecking=no/)
})

test('an occupied production port is accepted only for the validated launcher-owned tunnel', () => {
  const source = readFileSync(new URL('./musuw-admin', import.meta.url), 'utf8')
  const occupiedStart = source.indexOf('if tcp_port_is_busy')
  const occupiedEnd = source.indexOf('  rm -f "$ssh_control_socket"', occupiedStart)
  const occupiedBranch = source.slice(occupiedStart, occupiedEnd)
  assert.match(occupiedBranch, /existing_port/)
  assert.match(occupiedBranch, /ssh .* -S "\$ssh_control_socket" -O check "\$ssh_target"/)
  assert.match(occupiedBranch, /require_pinned_ssh_target "\$ssh_target"/)
  assert.match(occupiedBranch, /discover_production_container_ip "\$ssh_target" "\$container"/)
  assert.match(occupiedBranch, /return 0/)
  assert.match(occupiedBranch, /production tunnel port .*already in use/)
})

test('target startup failure cannot terminate the other fixed console', () => {
  const source = readFileSync(new URL('./musuw-admin', import.meta.url), 'utf8')
  assert.match(source, /stop_server "\$target"/)
  assert.match(source, /die "\$target_label operations server did not become healthy/)
  assert.doesNotMatch(source, /previous_target=/)
  assert.doesNotMatch(source, /restore_previous_target/)
})

test('launcher only owns a target-matching server process and health response', () => {
  const source = readFileSync(new URL('./musuw-admin', import.meta.url), 'utf8')
  assert.match(source, /server_script=.*musuw-admin-server\.mjs/)
  assert.match(source, /awk -v target=\"\$target\"/)
  assert.match(source, /health_is_target/)
  assert.match(source, /environment.*expected_label|expected_label.*environment/)
  assert.match(source, /health_is_target "\$health_payload" "\$target"/)
})

test('server has no restart child for environment navigation', () => {
  const source = readFileSync(new URL('./musuw-admin-server.mjs', import.meta.url), 'utf8')
  assert.match(source, /environment switching is navigation-only/)
  assert.doesNotMatch(source, /child\.unref\(\)/)
})

test('an unimplemented official provider never becomes available from credential presence alone', () => {
  assert.deepEqual(unavailableProviderState(false, 'credential missing', 'adapter missing'), {
    available: false,
    reason: 'credential missing',
  })
  assert.deepEqual(unavailableProviderState(true, 'credential missing', 'adapter missing'), {
    available: false,
    reason: 'adapter missing',
  })
})

test('allowlist admits only scoped operations routes and methods', () => {
  const allowed = [
    ['GET', '/api/v1/system/admin/runtime/queues'],
    ['GET', '/api/v1/system/admin/runtime/queues/knowledge/tasks'],
    ['GET', '/api/v1/system/admin/tenants/10005/entitlement'],
    ['GET', '/api/v1/system/admin/users/7c67173c-7113-4766-98b9-61f47ed182c9/investigation'],
    ['DELETE', '/api/v1/system/admin/users/7c67173c-7113-4766-98b9-61f47ed182c9'],
    ['PATCH', '/api/v1/system/admin/tenants/10005'],
    ['PUT', '/api/v1/system/admin/tenants/10005/openrouter-credits'],
    ['PUT', '/api/v1/system/admin/tenants/10005/complimentary-entitlement'],
    ['DELETE', '/api/v1/system/admin/tenants/10005/complimentary-entitlement'],
    ['POST', '/api/v1/system/admin/runtime/queues/knowledge/tasks/abc:123/actions/retry'],
    ['DELETE', '/api/v1/system/admin/runtime/queues/knowledge/archived'],
  ]
  for (const [method, path] of allowed) assert.equal(isSafeOperationsPath(method, path), true, `${method} ${path}`)

  const denied = [
    ['GET', '/api/v1/system/info'],
    ['GET', '/api/v1/system/settings'],
    ['GET', '/api/v1/system/admin/api-keys'],
    ['POST', '/api/v1/system/admin/tenants/10005'],
    ['POST', '/api/v1/system/admin/tenants/10005/complimentary-entitlement'],
    ['PATCH', '/api/v1/system/admin/tenants/10005/complimentary-entitlement'],
    ['DELETE', '/api/v1/system/admin/runtime/queues/knowledge/tasks/abc'],
    ['GET', '/api/v1/system/admin/users/not-an-id/investigation'],
    ['DELETE', '/api/v1/system/admin/users/not-an-id'],
    ['PATCH', '/api/v1/system/admin/tenants/10005/../../settings'],
  ]
  for (const [method, path] of denied) assert.equal(isSafeOperationsPath(method, path), false, `${method} ${path}`)
})

test('allowlist matches the user-drawer complimentary mutation path exactly', () => {
  assert.equal(isSafeOperationsPath('PUT', '/api/v1/system/admin/tenants/10018/complimentary-entitlement'), true)
  assert.equal(isSafeOperationsPath('DELETE', '/api/v1/system/admin/tenants/10018/complimentary-entitlement'), true)
  assert.equal(isSafeOperationsPath('PUT', '/api/v1/system/admin/tenants/10018/complimentary-entitlement/'), true)
  assert.equal(isSafeOperationsPath('DELETE', '/api/v1/system/admin/tenants/10018/complimentary-entitlement/'), true)
  assert.equal(isSafeOperationsPath('PUT', '/api/v1/system/admin/tenants/10018/complimentary-entitlement//'), false)
})

test('operations user list projects and filters the effective complimentary plan without rewriting Paddle state', () => {
  const source = readFileSync(new URL('./musuw-admin-server.mjs', import.meta.url), 'utf8')
  assert.match(source, /complimentary_expires_at > NOW\(\)/)
  assert.match(source, /effectivePlanSQL} = \$\$\{params\.length\}/)
  assert.match(source, /effectivePlanSQL} AS plan, t\.plan AS configured_plan/)
  assert.match(source, /GREATEST\(t\.storage_quota, CASE t\.complimentary_plan/)
})

test('console shell assets can bootstrap after a server restart while APIs stay session-bound', () => {
  assert.equal(isPublicConsoleAsset('GET', '/musuw-logo.png'), true)
  assert.equal(isPublicConsoleAsset('HEAD', '/favicon.ico'), true)
  assert.equal(isPublicConsoleAsset('GET', '/assets/operations.js'), true)
  assert.equal(isPublicConsoleAsset('GET', '/tdesign-icons/0.4.1/fonts/index.js'), true)
  assert.equal(isPublicConsoleAsset('GET', '/admin-api/config'), false)
  assert.equal(isPublicConsoleAsset('GET', '/api/v1/system/info'), false)
  assert.equal(isPublicConsoleAsset('POST', '/assets/operations.js'), false)
})

test('Paddle reads keep each official capability honest when transaction scope is absent', async () => {
  const fetcher = async (url) => {
    if (String(url).includes('/subscriptions?')) {
      return {
        response: { ok: true, status: 200 },
        payload: { data: [{ id: 'sub_1', status: 'active', customer_id: 'ctm_1' }] },
      }
    }
    return {
      response: { ok: false, status: 403 },
      payload: { error: { code: 'forbidden', detail: 'not authorized to read transaction' } },
    }
  }

  const result = await readPaddleData({
    apiKey: 'configured-for-test',
    apiBase: 'https://api.paddle.test',
    fetcher,
  })

  assert.equal(result.available, true)
  assert.equal(result.subscriptions_available, true)
  assert.equal(result.subscriptions.length, 1)
  assert.equal(result.transactions_available, false)
  assert.deepEqual(result.transactions, [])
  assert.match(result.transactions_reason, /HTTP 403/)
})

test('provider secrets are read from named Keychain items without leaking command output', () => {
  const calls = []
  const executor = (command, args, options) => {
    calls.push({ command, args, options })
    return 'secret-value\n'
  }

  assert.equal(readKeychainSecret('com.musuw.test', 'operations-production', executor), 'secret-value')
  assert.deepEqual(calls, [{
    command: '/usr/bin/security',
    args: ['find-generic-password', '-w', '-s', 'com.musuw.test', '-a', 'operations-production'],
    options: { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  }])
})

test('production provider credentials never fall back to plaintext runtime environment values', () => {
  const source = readFileSync(new URL('./musuw-admin-server.mjs', import.meta.url), 'utf8')
  for (const variable of [
    'MUSUW_PADDLE_API_KEY',
    'MUSUW_SUPABASE_SERVICE_ROLE_KEY',
    'MUSUW_R2_ACCESS_KEY_ID',
    'MUSUW_R2_SECRET_ACCESS_KEY',
    'LANGFUSE_PUBLIC_KEY',
    'LANGFUSE_SECRET_KEY',
  ]) {
    assert.doesNotMatch(source, new RegExp(`runtime\\.${variable}\\b`), variable)
  }
})

test('production operations runtime is authoritative and cannot be overridden by the parent process environment', () => {
  const source = readFileSync(new URL('./musuw-admin-server.mjs', import.meta.url), 'utf8')
  const productionBranch = source.slice(source.indexOf("if (target === 'production')"), source.indexOf('const candidate ='))
  assert.match(productionBranch, /const runtime = parseEnvFile\(runtimePath\)/)
  assert.doesNotMatch(productionBranch, /\.\.\.process\.env/)
})

test('TEST operations reads database identity from the durable local source, not the generated candidate artifact', () => {
  const source = readFileSync(new URL('./musuw-admin-server.mjs', import.meta.url), 'utf8')
  assert.match(source, /\.runtime\/weknora\/local\.source\.env/)
  assert.doesNotMatch(source, /parseEnvFile\(resolve\(repoRoot, '\.runtime\/weknora\/candidate\.env'\)\)/)
})

test('host development loads Paddle and Langfuse server secrets from Keychain instead of ignored env files', () => {
  const source = readFileSync(new URL('./musuw-dev', import.meta.url), 'utf8')
  assert.match(source, /com\.musuw\.local-admin\.paddle-api-key/)
  assert.match(source, /com\.musuw\.local-admin\.paddle-webhook-secret/)
  assert.match(source, /com\.musuw\.local-admin\.langfuse-public-key/)
  assert.match(source, /com\.musuw\.local-admin\.langfuse-secret-key/)
  assert.match(source, /security find-generic-password/)
  assert.match(source, /musuw-admin-test/)
  assert.doesNotMatch(source, /load_env_file "\$paddle_sandbox_env"/)
	assert.match(source, /export LANGFUSE_ENVIRONMENT=test/)
})

test('admin launcher starts each target with a clean environment', () => {
  const source = readFileSync(new URL('./musuw-admin', import.meta.url), 'utf8')
  assert.match(source, /run_with_runtime_env/)
  assert.match(source, /--replace-process/)
  assert.match(source, /env -i/)
  assert.match(source, /MUSUW_ADMIN_TEST_DB_HOST=/)
  assert.match(source, /MUSUW_ADMIN_TEST_BACKEND_URL=/)
  const testEnvironmentBranch = source.slice(
    source.indexOf('if [ "$runtime_target" = test ]'),
    source.indexOf('  if [ "$replace_process" = yes ]', source.indexOf('if [ "$runtime_target" = test ]')),
  )
  assert.doesNotMatch(testEnvironmentBranch, /MUSUW_ADMIN_PRODUCTION_/)
  assert.doesNotMatch(source, /MUSUW_ADMIN_DATABASE_URL=.*env/)
  assert.doesNotMatch(source, /MUSUW_ADMIN_BACKEND_URL=.*env/)
  assert.doesNotMatch(source, /MUSUW_PADDLE_API_KEY=.*env/)
})

test('production operations reads the authorized Paddle Live unit', () => {
  const source = readFileSync(new URL('./musuw-admin-server.mjs', import.meta.url), 'utf8')
  const productionBranch = source.slice(source.indexOf("if (target === 'production')"), source.indexOf('const candidate ='))
  assert.match(productionBranch, /paddleEnvironment:\s*'live'/)
  assert.match(productionBranch, /paddleApiBase:\s*'https:\/\/api\.paddle\.com'/)
  assert.doesNotMatch(productionBranch, /paddleEnvironment:\s*'sandbox'/)
  assert.doesNotMatch(productionBranch, /https:\/\/sandbox-api\.paddle\.com/)
})

test('Supabase Auth Admin reads only the selected process environment with the official apikey header', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url: String(url), options })
    return {
      response: { ok: true, status: 200 },
      payload: {
        users: [{
          id: 'user-1',
          email: 'person@example.com',
          created_at: '2026-08-22T00:00:00Z',
          last_sign_in_at: '2026-08-22T01:00:00Z',
          email_confirmed_at: '2026-08-22T00:01:00Z',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: { private: 'must not leave provider adapter' },
        }],
      },
    }
  }

  const result = await readSupabaseAdminData({
    targetEnvironment: 'PRODUCTION',
    projects: [
      { environment: 'TEST', name: 'Staging', ref: 'staging-ref', url: 'https://staging-ref.supabase.co', applicable: false },
      { environment: 'PRODUCTION', name: 'Production', ref: 'production-ref', url: 'https://production-ref.supabase.co', applicable: true, apiKey: 'production-key' },
    ],
    fetcher,
  })

  assert.equal(result.available, true)
  assert.equal(result.projects[0].available, false)
  assert.equal(result.projects[0].applicable, false)
  assert.match(result.projects[0].reason, /not queried by the PRODUCTION process/)
  assert.equal(result.projects[1].available, true)
  assert.equal(result.projects[1].total, 1)
  assert.deepEqual(result.projects[1].users[0], {
    id: 'user-1',
    email: 'person@example.com',
    created_at: '2026-08-22T00:00:00Z',
    last_sign_in_at: '2026-08-22T01:00:00Z',
    email_confirmed_at: '2026-08-22T00:01:00Z',
    provider: 'email',
    providers: ['email'],
  })
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /production-ref/)
  assert.equal(calls[0].options.headers.apikey, 'production-key')
  assert.equal('Authorization' in calls[0].options.headers, false)
})

test('R2 inventory uses the official S3 client and returns bounded object metadata', async () => {
  const calls = []
  const client = {
    send: async (command) => {
      calls.push(command.input)
      return {
        KeyCount: 2,
        IsTruncated: false,
        Contents: [
          { Key: 'weknora/a.txt', Size: 7, LastModified: new Date('2026-08-22T00:00:00Z'), ETag: 'etag-a' },
          { Key: 'weknora/b.txt', Size: 9, LastModified: new Date('2026-08-22T01:00:00Z'), ETag: 'etag-b' },
        ],
      }
    },
  }

  const result = await readR2Inventory({ client, bucket: 'musuw-production', prefix: 'weknora/' })
  assert.equal(result.available, true)
  assert.equal(result.total, 2)
  assert.equal(result.total_bytes, 16)
  assert.deepEqual(calls, [{ Bucket: 'musuw-production', Prefix: 'weknora/', MaxKeys: 1000 }])
  assert.deepEqual(result.objects[0], {
    key: 'weknora/a.txt',
    size: 7,
    last_modified: '2026-08-22T00:00:00.000Z',
    etag: 'etag-a',
  })
})

test('R2 inventory reports TEST local storage as not applicable instead of a credential failure', async () => {
  const result = await readR2Inventory({
    client: null,
    bucket: '',
    prefix: '',
    applicable: false,
  })

  assert.equal(result.available, false)
  assert.equal(result.applicable, false)
  assert.match(result.reason, /TEST uses local storage/)
})

test('Langfuse query is pinned to the selected environment and projects safe v2 model fields', async () => {
  let call
  const fetcher = async (url, options) => {
    call = { url: String(url), options }
    return {
      response: { ok: true, status: 200 },
      payload: {
        data: [{
          id: 'obs-1', traceId: 'trace-1', name: 'chat', type: 'GENERATION',
          startTime: '2026-08-22T00:00:00Z', endTime: '2026-08-22T00:00:01Z',
          environment: 'staging', level: 'DEFAULT', model: 'model-a', providedModelName: 'legacy-model',
          totalCost: 0.001, input: 'must not escape', output: 'must not escape',
        }, {
          id: 'obs-2', traceId: 'trace-2', name: 'chat', type: 'GENERATION',
          environment: 'staging', providedModelName: 'legacy-only',
        }, {
          id: 'obs-prod', traceId: 'trace-prod', name: 'chat', type: 'GENERATION',
          environment: 'production', model: 'must-not-escape',
        }],
        meta: { cursor: null },
      },
    }
  }

  const result = await readLangfuseData({
    host: 'https://jp.cloud.langfuse.com',
    publicKey: 'public-key',
    secretKey: 'secret-key',
    environment: 'staging',
    fetcher,
  })

  assert.equal(result.available, true)
  assert.equal(result.observations.length, 2)
  assert.deepEqual(result.observations.map((observation) => observation.id), ['obs-1', 'obs-2'])
  assert.equal(result.observations.every((observation) => observation.environment === 'staging'), true)
  assert.equal(result.observations[0].model, 'model-a')
  assert.equal(result.observations[1].model, 'legacy-only')
  assert.equal('input' in result.observations[0], false)
  assert.equal('output' in result.observations[0], false)
  assert.equal('metadata' in result.observations[0], false)
  assert.match(call.url, /\/api\/public\/v2\/observations\?/)
  assert.match(call.url, /fields=core%2Cbasic%2Ctime%2Cmodel%2Cusage%2Cmetrics%2Ctrace_context/)
  assert.match(call.url, /environment=staging/)
  assert.doesNotMatch(call.url, /fields=[^&]*io/)
  assert.equal(call.options.headers.Authorization, `Basic ${Buffer.from('public-key:secret-key').toString('base64')}`)
})
