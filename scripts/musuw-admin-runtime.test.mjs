import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer as createTCPServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import pg from 'pg'

import { createDatabaseReadiness, loadRuntime, readPlatformKey } from './musuw-admin-server.mjs'

function serverFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'musuw-admin-runtime-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const secretDir = join(root, 'secrets')
  mkdirSync(secretDir, { mode: 0o700 })
  const runtimeFile = join(root, 'server.env')
  const databaseHostFile = join(root, 'database-host')
  writeFileSync(databaseHostFile, '127.0.0.2\n', { mode: 0o644 })
  writeFileSync(runtimeFile, [
    'MUSUW_ADMIN_DATABASE_URL=postgresql://musuw_operations_ro@127.0.0.1:5432/WeKnora',
    'MUSUW_ADMIN_BACKEND_URL=http://127.0.0.1:8080',
    `MUSUW_ADMIN_DATABASE_HOST_FILE=${databaseHostFile}`,
  ].join('\n'), { mode: 0o600 })
  const secrets = {
    'production-ro-password': 'readonly-password',
    platform_api_key: 'platform-value',
    paddle_api_key: 'paddle-value',
    supabase_service_role_key: 'supabase-value',
    r2_access_key_id: 'r2-access-value',
    r2_secret_access_key: 'r2-secret-value',
    langfuse_public_key: 'langfuse-public-value',
    langfuse_secret_key: 'langfuse-secret-value',
  }
  for (const [name, value] of Object.entries(secrets)) {
    writeFileSync(join(secretDir, name), value + '\n', { mode: 0o600 })
  }
  return {
    root, secretDir, runtimeFile, databaseHostFile,
    env: {
      MUSUW_ADMIN_MODE: 'server',
      MUSUW_ADMIN_RUNTIME_FILE: runtimeFile,
      MUSUW_ADMIN_SECRET_DIR: secretDir,
    },
    keychainReader() { throw new Error('server must never read macOS Keychain') },
  }
}

// This boundary loads real protected files, proving Linux startup does not need
// a developer checkout's runtime files, SSH tunnel, or macOS Keychain.
test('server runtime reads production configuration and registered provider secret files', (t) => {
  const fixture = serverFixture(t)
  const runtime = loadRuntime('production', fixture)
  assert.equal(runtime.server, true)
  assert.equal(runtime.secretDir, fixture.secretDir)
  assert.equal(runtime.target, 'production')
  assert.equal(runtime.label, 'PRODUCTION')
  assert.equal(new URL(runtime.database.connectionString).username, 'musuw_operations_ro')
  assert.equal(new URL(runtime.database.connectionString).password, 'readonly-password')
  assert.equal(new URL(runtime.database.connectionString).hostname, '127.0.0.2')
  assert.equal(runtime.backendBaseUrl, 'http://127.0.0.1:8080')
  assert.equal(runtime.paddleEnvironment, 'live')
  assert.equal(runtime.paddleApiKey, 'paddle-value')
  assert.equal(runtime.supabaseAdmin.projects.find((project) => project.applicable).apiKey, 'supabase-value')
  assert.equal(runtime.r2Admin.accessKeyId, 'r2-access-value')
  assert.equal(runtime.r2Admin.secretAccessKey, 'r2-secret-value')
  assert.equal(runtime.langfuse.publicKey, 'langfuse-public-value')
  assert.equal(runtime.langfuse.secretKey, 'langfuse-secret-value')
  assert.equal(readPlatformKey(runtime.platformKeyAccount, { secretDir: runtime.secretDir }), 'platform-value')
})

test('server startup only accepts an absolute regular database-host file with one IP address', (t) => {
  const fixture = serverFixture(t)
  for (const invalid of ['db.internal', '127.0.0.1\n127.0.0.2', '', '127.0.0.1/evil', '127.0.0.999', 'fe80::1%eth0']) {
    writeFileSync(fixture.databaseHostFile, invalid)
    assert.throws(() => loadRuntime('production', fixture), /database host file.*invalid/)
  }
  writeFileSync(fixture.databaseHostFile, '::1\n')
  assert.equal(new URL(loadRuntime('production', fixture).database.connectionString).hostname, '[::1]')
  chmodSync(fixture.databaseHostFile, 0o666)
  assert.throws(() => loadRuntime('production', fixture), /database host file permissions are unsafe/)
  rmSync(fixture.databaseHostFile)
  assert.throws(() => loadRuntime('production', fixture), /database host file is unavailable/)
  symlinkSync(fixture.runtimeFile, fixture.databaseHostFile)
  assert.throws(() => loadRuntime('production', fixture), /database host file permissions are unsafe/)
  writeFileSync(fixture.runtimeFile, 'MUSUW_ADMIN_DATABASE_URL=postgresql://musuw_operations_ro@127.0.0.1/WeKnora\nMUSUW_ADMIN_BACKEND_URL=http://127.0.0.1:8080\nMUSUW_ADMIN_DATABASE_HOST_FILE=relative-path\n')
  assert.throws(() => loadRuntime('production', fixture), /MUSUW_ADMIN_DATABASE_HOST_FILE must be an explicit absolute path/)
})

test('server startup rejects missing, readable-by-others, or linked configuration and credentials', (t) => {
  const fixture = serverFixture(t)
  const load = (env = {}) => loadRuntime('production', { ...fixture, env: { ...fixture.env, ...env } })
  for (const name of ['MUSUW_ADMIN_RUNTIME_FILE', 'MUSUW_ADMIN_SECRET_DIR']) {
    assert.throws(() => load({ [name]: undefined }), /explicit absolute path/)
    assert.throws(() => load({ [name]: 'relative/path' }), /explicit absolute path/)
  }
  chmodSync(fixture.runtimeFile, 0o644)
  assert.throws(() => load(), /runtime file permissions are unsafe/)
  chmodSync(fixture.runtimeFile, 0o600)
  chmodSync(fixture.secretDir, 0o755)
  assert.throws(() => load(), /secret directory permissions are unsafe/)
  chmodSync(fixture.secretDir, 0o700)

  const linkedConfig = join(fixture.root, 'linked.env')
  symlinkSync(fixture.runtimeFile, linkedConfig)
  assert.throws(() => load({ MUSUW_ADMIN_RUNTIME_FILE: linkedConfig }), /runtime file permissions are unsafe/)
  const linkedSecrets = join(fixture.root, 'linked-secrets')
  symlinkSync(fixture.secretDir, linkedSecrets)
  assert.throws(() => load({ MUSUW_ADMIN_SECRET_DIR: linkedSecrets }), /secret directory permissions are unsafe/)

  const paddlePath = join(fixture.secretDir, 'paddle_api_key')
  chmodSync(paddlePath, 0o644)
  assert.throws(() => load(), /paddle_api_key secret file permissions are unsafe/)
  chmodSync(paddlePath, 0o600)
  writeFileSync(paddlePath, '')
  assert.throws(() => load(), /paddle_api_key secret file is empty or invalid/)
  rmSync(paddlePath)
  assert.throws(() => load(), /paddle_api_key secret file is unavailable/)
  symlinkSync(join(fixture.secretDir, 'platform_api_key'), paddlePath)
  assert.throws(() => load(), /paddle_api_key secret file permissions are unsafe/)
})

test('server read-only database and platform credentials remain mandatory protected regular files', (t) => {
  const fixture = serverFixture(t)
  const passwordPath = join(fixture.secretDir, 'production-ro-password')
  chmodSync(passwordPath, 0o644)
  assert.throws(() => loadRuntime('production', fixture), /read-only database password file permissions are unsafe/)
  chmodSync(passwordPath, 0o600)
  rmSync(passwordPath)
  symlinkSync(join(fixture.secretDir, 'platform_api_key'), passwordPath)
  assert.throws(() => loadRuntime('production', fixture), /read-only database password file permissions are unsafe/)
  rmSync(passwordPath)
  assert.throws(() => loadRuntime('production', fixture), /read-only database password file is unavailable/)

  const platformPath = join(fixture.secretDir, 'platform_api_key')
  rmSync(platformPath)
  assert.throws(() => readPlatformKey('ignored', { secretDir: fixture.secretDir }), /platform_api_key secret file is unavailable/)
})

test('server mode cannot target test or silently accept an unknown mode or incomplete configuration', (t) => {
  const fixture = serverFixture(t)
  assert.throws(() => loadRuntime('test', fixture), /server mode only supports production/)
  assert.throws(() => loadRuntime('staging', fixture), /target must be test or production/)
  assert.throws(() => loadRuntime('production', { ...fixture, env: { ...fixture.env, MUSUW_ADMIN_MODE: 'typo' } }), /MUSUW_ADMIN_MODE must be local or server/)
  writeFileSync(fixture.runtimeFile, 'MUSUW_ADMIN_DATABASE_URL=postgresql://musuw_operations_ro@127.0.0.1/WeKnora\n')
  assert.throws(() => loadRuntime('production', fixture), /requires MUSUW_ADMIN_DATABASE_URL and MUSUW_ADMIN_BACKEND_URL/)
})

test('local production continues reading its protected runtime and target-specific Keychain account', (t) => {
  const fixture = serverFixture(t)
  const runtimeDir = join(fixture.root, '.runtime/musuw-admin')
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(join(runtimeDir, 'production.env'), [
    'MUSUW_ADMIN_DATABASE_URL=postgresql://musuw_operations_ro@127.0.0.1:25432/WeKnora',
    'MUSUW_ADMIN_BACKEND_URL=http://127.0.0.1:18081',
    'MUSUW_PADDLE_API_KEY=must-never-be-read',
  ].join('\n'))
  writeFileSync(join(runtimeDir, 'production-ro-password'), 'local-ro-password', { mode: 0o600 })
  const reads = []
  const runtime = loadRuntime('production', {
    root: fixture.root,
    env: { MUSUW_ADMIN_DATABASE_URL: 'ignored', MUSUW_ADMIN_BACKEND_URL: 'ignored' },
    keychainReader(service, account) {
      reads.push({ service, account })
      return `${account}:${service}`
    },
  })
  assert.equal(runtime.server, false)
  assert.equal(runtime.secretDir, undefined)
  assert.equal(runtime.paddleEnvironment, 'live')
  assert.equal(runtime.paddleApiBase, 'https://api.paddle.com')
  assert.equal(runtime.paddleApiKey, 'musuw-admin-production:com.musuw.local-admin.paddle-api-key')
  assert.equal(runtime.backendBaseUrl, 'http://127.0.0.1:18081')
  assert.equal(new URL(runtime.database.connectionString).password, 'local-ro-password')
  assert.equal(new URL(runtime.database.connectionString).port, '25432')
  assert.equal(reads.length, 6)
  assert.ok(reads.every(({ account }) => account === 'musuw-admin-production'))
})

test('local test retains its durable database source, sandbox, and test Keychain account', (t) => {
  const fixture = serverFixture(t)
  const runtimeDir = join(fixture.root, '.runtime/weknora')
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(join(runtimeDir, 'local.source.env'), 'DB_USER=test-user\nDB_PASSWORD=test-password\nDB_NAME=test-db\n')
  const runtime = loadRuntime('test', {
    root: fixture.root,
    env: { MUSUW_ADMIN_TEST_DB_PORT: '15433' },
    keychainReader(service, account) { return `${account}:${service}` },
  })
  assert.equal(runtime.label, 'TEST')
  assert.equal(runtime.database.user, 'test-user')
  assert.equal(runtime.database.password, 'test-password')
  assert.equal(runtime.database.database, 'test-db')
  assert.equal(runtime.database.port, 15433)
  assert.equal(runtime.paddleEnvironment, 'sandbox')
  assert.equal(runtime.paddleApiBase, 'https://sandbox-api.paddle.com')
  assert.equal(runtime.paddleApiKey, 'musuw-admin-test:com.musuw.local-admin.paddle-api-key')
})

test('readiness uses the database result and merges concurrent HTTP and watchdog probes', async (t) => {
  let complete
  let calls = 0
  const probe = createDatabaseReadiness({
    query() {
      calls++
      return new Promise((resolve, reject) => { complete = { resolve, reject } })
    },
  }, { onFailure() { assert.fail('no watchdog tick is due') } })
  t.after(() => probe.stop())
  const first = probe.check()
  const concurrent = probe.check()
  await Promise.resolve()
  assert.equal(calls, 1)
  complete.reject(new Error('private database detail'))
  assert.deepEqual(await Promise.all([first, concurrent]), [false, false])
  const recovered = probe.check()
  await Promise.resolve()
  complete.resolve({ rows: [{ '?column?': 1 }] })
  assert.equal(await recovered, true)
})

test('watchdog requests one restart after database failure and stops issuing queries', async (t) => {
  let calls = 0
  let failures = 0
  let failed
  const failure = new Promise((resolve) => { failed = resolve })
  const probe = createDatabaseReadiness({
    query() { calls++; return Promise.reject(new Error('connection closed')) },
  }, { intervalMs: 10, onFailure() { failures++; failed() } })
  t.after(() => probe.stop())
  await Promise.race([failure, delay(1_000).then(() => assert.fail('watchdog did not restart'))])
  const failedCalls = calls
  await delay(35)
  assert.equal(failures, 1)
  assert.equal(calls, failedCalls)
  assert.equal(await probe.check(), false)
})

test('readiness failure is bounded even when a real PostgreSQL client connects to an unresponsive socket', async (t) => {
  const connections = new Set()
  const socketServer = createTCPServer((socket) => {
    connections.add(socket)
    socket.on('close', () => connections.delete(socket))
  })
  await new Promise((resolve) => socketServer.listen(0, '127.0.0.1', resolve))
  const pool = new pg.Pool({
    host: '127.0.0.1', port: socketServer.address().port,
    user: 'synthetic-readonly', password: 'synthetic-password', database: 'synthetic-db',
    max: 1, connectionTimeoutMillis: 50, query_timeout: 50,
  })
  const probe = createDatabaseReadiness(pool, { onFailure() {} })
  t.after(async () => {
    probe.stop()
    for (const socket of connections) socket.destroy()
    await pool.end()
    await new Promise((resolve) => socketServer.close(resolve))
  })
  const readiness = Promise.all([probe.check(), probe.check(), probe.check()])
  const result = await Promise.race([readiness, delay(1_000).then(() => assert.fail('database readiness was unbounded'))])
  assert.deepEqual(result, [false, false, false])
  assert.equal(pool.waitingCount, 0)
  assert.equal(pool.totalCount, 0)
})

test('a stalled established PostgreSQL query times out, releases its client, and requests one restart', async (t) => {
  const connections = new Set()
  const socketServer = createTCPServer((socket) => {
    connections.add(socket)
    socket.on('close', () => connections.delete(socket))
    // PostgreSQL AuthenticationOk and ReadyForQuery complete the real client's
    // startup handshake. The peer then deliberately never answers SELECT 1.
    socket.once('data', () => socket.write(Buffer.from('5200000008000000005a0000000549', 'hex')))
  })
  await new Promise((resolve) => socketServer.listen(0, '127.0.0.1', resolve))
  const pool = new pg.Pool({
    host: '127.0.0.1', port: socketServer.address().port,
    user: 'synthetic-readonly', password: 'synthetic-password', database: 'synthetic-db',
    max: 1, connectionTimeoutMillis: 250,
  })
  let restarted
  let failures = 0
  const failure = new Promise((resolve) => { restarted = resolve })
  const probe = createDatabaseReadiness(pool, {
    intervalMs: 10,
    onFailure() { failures++; restarted() },
  })
  t.after(async () => {
    probe.stop()
    for (const socket of connections) socket.destroy()
    await pool.end()
    await new Promise((resolve) => socketServer.close(resolve))
  })
  await Promise.race([failure, delay(3_000).then(() => assert.fail('established query did not trigger recovery'))])
  assert.equal(failures, 1)
  assert.equal(await probe.check(), false)
  assert.equal(pool.waitingCount, 0)
  assert.equal(pool.totalCount, 0)
})
