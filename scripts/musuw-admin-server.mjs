#!/usr/bin/env node

import { createServer } from 'node:http'
import { createReadStream, existsSync, lstatSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import { extname, isAbsolute, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import pg from 'pg'

const { Pool } = pg
const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDir, '..')

const TARGET_PORTS = Object.freeze({ test: 4186, production: 4187 })
const PAGE_SIZE_MAX = 100
const API_TIMEOUT_MS = 12_000
const PRODUCTION_RO_PASSWORD_PATH = resolve(repoRoot, '.runtime/musuw-admin/production-ro-password')
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000
const PLATFORM_KEY_SERVICE = 'com.musuw.local-admin.platform-key'
const ENVIRONMENT_SWITCH_PATH = '/admin-api/environment'
const MODEL_POLICY_PATH = '/admin-api/model-policy'
const UPSTREAM_MODEL_POLICY_PATH = '/api/v1/system/admin/consumer-model-policy'
const PROVIDER_KEY_SERVICES = Object.freeze({
  paddle: 'com.musuw.local-admin.paddle-api-key',
  supabase: 'com.musuw.local-admin.supabase-secret-key',
  r2AccessKeyID: 'com.musuw.local-admin.r2-access-key-id',
  r2SecretAccessKey: 'com.musuw.local-admin.r2-secret-access-key',
  langfusePublicKey: 'com.musuw.local-admin.langfuse-public-key',
  langfuseSecretKey: 'com.musuw.local-admin.langfuse-secret-key',
})
const SERVER_SECRET_FILES = Object.freeze({
  [PROVIDER_KEY_SERVICES.paddle]: 'paddle_api_key',
  [PROVIDER_KEY_SERVICES.supabase]: 'supabase_service_role_key',
  [PROVIDER_KEY_SERVICES.r2AccessKeyID]: 'r2_access_key_id',
  [PROVIDER_KEY_SERVICES.r2SecretAccessKey]: 'r2_secret_access_key',
  [PROVIDER_KEY_SERVICES.langfusePublicKey]: 'langfuse_public_key',
  [PROVIDER_KEY_SERVICES.langfuseSecretKey]: 'langfuse_secret_key',
})
const PUBLIC_BRAND_ASSETS = new Set(['/favicon.ico', '/musuw-logo.png'])
const PUBLIC_ASSET_PREFIXES = ['/assets/', '/tdesign-icons/']

export function targetCookieNames(target) {
  if (!['test', 'production'].includes(target)) throw new Error('target must be test or production')
  return {
    session: 'musuw_admin_session_' + target,
    csrf: 'musuw_admin_csrf_' + target,
  }
}

export function targetPort(target) {
  if (!Object.hasOwn(TARGET_PORTS, target)) throw new Error('target must be test or production')
  return TARGET_PORTS[target]
}

export function targetListenPort(target, configuredPort = undefined) {
  const expectedPort = targetPort(target)
  const rawPort = configuredPort == null || configuredPort === ''
    ? String(expectedPort)
    : String(configuredPort).trim()
  if (!/^\d+$/.test(rawPort)) throw new Error('MUSUW_ADMIN_PORT must be an integer between 1024 and 65535')
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error('MUSUW_ADMIN_PORT must be an integer between 1024 and 65535')
  }
  if (port !== expectedPort) {
    throw new Error(`${target.toUpperCase()} operations must listen on fixed port ${expectedPort}`)
  }
  return port
}

export function targetSessionToken(target, cookies = {}) {
  const { session } = targetCookieNames(target)
  return typeof cookies?.[session] === 'string' ? cookies[session] : ''
}

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line
    const separator = normalized.indexOf('=')
    if (separator <= 0) continue
    const key = normalized.slice(0, separator).trim()
    let value = normalized.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

export function modelPolicyRequestPlan(method, pathname) {
  method = String(method || '').toUpperCase()
  pathname = String(pathname || '')
  if (method === 'GET' && pathname === MODEL_POLICY_PATH) {
    return { method, upstreamPath: UPSTREAM_MODEL_POLICY_PATH }
  }
  if (method !== 'PUT' || !pathname.startsWith(`${MODEL_POLICY_PATH}/`)) return null
  const scene = pathname.slice(MODEL_POLICY_PATH.length + 1)
  if (!['rag', 'rerank', 'wiki', 'vision', 'asr'].includes(scene)) return null
  return { method, scene, upstreamPath: `${UPSTREAM_MODEL_POLICY_PATH}/${scene}` }
}

export function productionDatabaseConnectionString(runtime, { passwordPath = PRODUCTION_RO_PASSWORD_PATH, hostPath } = {}) {
  let database
  try {
    database = new URL(String(runtime?.MUSUW_ADMIN_DATABASE_URL || ''))
  } catch {
    throw new Error('production database URL is invalid')
  }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.username) {
    throw new Error('production database URL is invalid')
  }
  if (hostPath !== undefined) {
    if (!isAbsolute(hostPath)) throw new Error('MUSUW_ADMIN_DATABASE_HOST_FILE must be an explicit absolute path')
    protectedFile(hostPath, 'server database host file', 0o022)
    const host = readFileSync(hostPath, 'utf8').replace(/\r?\n$/, '')
    const ipVersion = isIP(host)
    if (!ipVersion || host.includes('%')) throw new Error('server database host file is empty or invalid')
    database.hostname = ipVersion === 6 ? `[${host}]` : host
  }

  protectedFile(passwordPath, 'production read-only database password file')
  let password = readFileSync(passwordPath, 'utf8').replace(/[\r\n]+$/, '')
  if (!password || /[\r\n]/.test(password)) {
    throw new Error('production read-only database password file is empty or invalid')
  }
  database.password = password
  return database.toString()
}

export function clampPageSize(value, fallback = 25) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, PAGE_SIZE_MAX)
}

export function clampPage(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function unavailableProviderState(configured, missingReason, adapterReason) {
  return { available: false, reason: configured ? adapterReason : missingReason }
}

// Browser/router layers may append one harmless trailing slash. Normalize only
// that equivalent spelling before checking and forwarding an already-scoped
// operations route; repeated slashes remain outside the allowlist.
export function normalizeOperationsPath(pathname) {
  const value = String(pathname || '')
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value
}

export function isSafeOperationsPath(method, pathname) {
  const exactReads = new Set([
    '/api/v1/system/admin/runtime/queues',
    '/api/v1/system/admin/audit-log',
  ])
  method = String(method || '').toUpperCase()
  pathname = normalizeOperationsPath(pathname)
  if (method === 'GET' && exactReads.has(pathname)) return true
  if (method === 'GET' && /^\/api\/v1\/system\/admin\/runtime\/queues\/[a-z0-9_-]+\/tasks$/.test(pathname)) return true
  if (method === 'GET' && /^\/api\/v1\/system\/admin\/tenants\/\d+\/entitlement$/.test(pathname)) return true
  if (method === 'GET' && /^\/api\/v1\/system\/admin\/users\/[0-9a-f-]+\/investigation$/.test(pathname)) return true
  if (method === 'DELETE' && /^\/api\/v1\/system\/admin\/users\/[0-9a-f-]+$/.test(pathname)) return true
  if (method === 'PATCH' && /^\/api\/v1\/system\/admin\/tenants\/\d+$/.test(pathname)) return true
  if (method === 'PUT' && /^\/api\/v1\/system\/admin\/tenants\/\d+\/openrouter-credits$/.test(pathname)) return true
  if (method === 'PUT' && /^\/api\/v1\/system\/admin\/tenants\/\d+\/complimentary-entitlement$/.test(pathname)) return true
  if (method === 'DELETE' && /^\/api\/v1\/system\/admin\/tenants\/\d+\/complimentary-entitlement$/.test(pathname)) return true
  if (method === 'POST' && /^\/api\/v1\/system\/admin\/runtime\/queues\/[a-z0-9_-]+\/tasks\/[0-9a-z:_-]+\/actions\/(retry|run-now|run_now)$/.test(pathname)) return true
  if (method === 'DELETE' && /^\/api\/v1\/system\/admin\/runtime\/queues\/[a-z0-9_-]+\/archived$/.test(pathname)) return true
  return false
}

export function isPublicConsoleAsset(method, pathname) {
  if (!['GET', 'HEAD'].includes(method)) return false
  return PUBLIC_BRAND_ASSETS.has(pathname) || PUBLIC_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function protectedFile(path, label, forbiddenPermissions = 0o077) {
  let stats
  try {
    stats = lstatSync(path)
  } catch {
    throw new Error(`${label} is unavailable`)
  }
  if (!stats.isFile() || (stats.mode & forbiddenPermissions) !== 0) {
    throw new Error(`${label} permissions are unsafe`)
  }
}

function readServerSecret(secretDir, name) {
  const path = resolve(secretDir, name)
  protectedFile(path, `server ${name} secret file`)
  const value = readFileSync(path, 'utf8').replace(/[\r\n]+$/, '')
  if (!value.trim() || /[\r\n]/.test(value)) throw new Error(`server ${name} secret file is empty or invalid`)
  return value
}

export function loadRuntime(target, { env = process.env, root = repoRoot, keychainReader = readKeychainSecret } = {}) {
  const mode = env.MUSUW_ADMIN_MODE || 'local'
  if (!['local', 'server'].includes(mode)) throw new Error('MUSUW_ADMIN_MODE must be local or server')
  if (!['test', 'production'].includes(target)) throw new Error('target must be test or production')
  const server = mode === 'server'
  let secretDir
  if (server) {
    if (target !== 'production') throw new Error('server mode only supports production')
    for (const name of ['MUSUW_ADMIN_RUNTIME_FILE', 'MUSUW_ADMIN_SECRET_DIR']) {
      if (!env[name] || !isAbsolute(env[name])) throw new Error(`${name} must be an explicit absolute path in server mode`)
    }
    secretDir = env.MUSUW_ADMIN_SECRET_DIR
    let directory
    try {
      directory = lstatSync(secretDir)
    } catch {
      throw new Error('server secret directory is unavailable')
    }
    if (!directory.isDirectory() || (directory.mode & 0o077) !== 0) throw new Error('server secret directory permissions are unsafe')
    protectedFile(env.MUSUW_ADMIN_RUNTIME_FILE, 'server runtime file')
  }
  const readProviderSecret = server
    ? (service) => readServerSecret(secretDir, SERVER_SECRET_FILES[service])
    : keychainReader
  if (target === 'production') {
    const runtimePath = server ? env.MUSUW_ADMIN_RUNTIME_FILE : resolve(root, '.runtime/musuw-admin/production.env')
    const runtime = parseEnvFile(runtimePath)
    if (!runtime.MUSUW_ADMIN_DATABASE_URL || !runtime.MUSUW_ADMIN_BACKEND_URL) {
      throw new Error('production runtime requires MUSUW_ADMIN_DATABASE_URL and MUSUW_ADMIN_BACKEND_URL')
    }
    if (server && !runtime.MUSUW_ADMIN_DATABASE_HOST_FILE) throw new Error('MUSUW_ADMIN_DATABASE_HOST_FILE must be an explicit absolute path')
    const platformKeyAccount = runtime.MUSUW_ADMIN_PLATFORM_KEY_ACCOUNT || 'musuw-admin-production'
    const providerKeyAccount = runtime.MUSUW_ADMIN_PROVIDER_KEY_ACCOUNT || platformKeyAccount
    return {
      target,
      server,
      secretDir,
      label: 'PRODUCTION',
      database: {
        connectionString: productionDatabaseConnectionString(runtime, {
          passwordPath: server ? resolve(secretDir, 'production-ro-password') : resolve(root, '.runtime/musuw-admin/production-ro-password'),
          hostPath: server ? runtime.MUSUW_ADMIN_DATABASE_HOST_FILE : undefined,
        }),
        application_name: 'musuw-operations-production',
      },
      backendBaseUrl: runtime.MUSUW_ADMIN_BACKEND_URL.replace(/\/$/, ''),
      platformKeyAccount,
      paddleEnvironment: 'live',
      paddleApiKey: readProviderSecret(PROVIDER_KEY_SERVICES.paddle, providerKeyAccount),
      paddleApiBase: 'https://api.paddle.com',
      supabaseAdmin: {
        targetEnvironment: 'PRODUCTION',
        projects: [
          {
            environment: 'TEST', name: 'Musuw Staging', ref: 'achfnnicetupvtoqiwqd',
            url: 'https://achfnnicetupvtoqiwqd.supabase.co',
            applicable: false,
          },
          {
            environment: 'PRODUCTION', name: 'Musuw Production', ref: 'phtveqtlswzokwsztsvu',
            url: 'https://phtveqtlswzokwsztsvu.supabase.co',
            applicable: true,
            apiKey: readProviderSecret(PROVIDER_KEY_SERVICES.supabase, providerKeyAccount),
          },
        ],
      },
      r2Admin: {
        accountId: runtime.MUSUW_R2_ACCOUNT_ID || 'c692db4757e1454b71880ec6c431db9c',
        bucket: runtime.MUSUW_R2_BUCKET || 'musuw-production',
        prefix: runtime.MUSUW_R2_PREFIX || 'weknora/',
        accessKeyId: readProviderSecret(PROVIDER_KEY_SERVICES.r2AccessKeyID, providerKeyAccount),
        secretAccessKey: readProviderSecret(PROVIDER_KEY_SERVICES.r2SecretAccessKey, providerKeyAccount),
      },
      langfuse: {
        host: (runtime.MUSUW_LANGFUSE_HOST || 'https://jp.cloud.langfuse.com').replace(/\/$/, ''),
        publicKey: readProviderSecret(PROVIDER_KEY_SERVICES.langfusePublicKey, providerKeyAccount),
        secretKey: readProviderSecret(PROVIDER_KEY_SERVICES.langfuseSecretKey, providerKeyAccount),
        environment: 'production',
      },
    }
  }

  // The operations console only needs the database identity from the stable
  // local source. candidate.env is a generated Compose artifact and may be
  // evicted by macOS storage optimization while the source remains local.
  const candidate = parseEnvFile(resolve(root, '.runtime/weknora/local.source.env'))
  const providerKeyAccount = 'musuw-admin-test'
  return {
    target: 'test',
    label: 'TEST',
    database: {
      host: env.MUSUW_ADMIN_TEST_DB_HOST || '127.0.0.1',
      port: Number.parseInt(env.MUSUW_ADMIN_TEST_DB_PORT || '15432', 10),
      user: candidate.DB_USER,
      password: candidate.DB_PASSWORD,
      database: candidate.DB_NAME,
      application_name: 'musuw-operations-test',
    },
    backendBaseUrl: (env.MUSUW_ADMIN_TEST_BACKEND_URL || 'http://127.0.0.1:18090').replace(/\/$/, ''),
    platformKeyAccount: providerKeyAccount,
    paddleEnvironment: 'sandbox',
    paddleApiKey: keychainReader(PROVIDER_KEY_SERVICES.paddle, providerKeyAccount),
    paddleApiBase: 'https://sandbox-api.paddle.com',
    supabaseAdmin: {
      targetEnvironment: 'TEST',
      projects: [
        {
          environment: 'TEST', name: 'Musuw Staging', ref: 'achfnnicetupvtoqiwqd',
          url: 'https://achfnnicetupvtoqiwqd.supabase.co',
          applicable: true,
          apiKey: keychainReader(PROVIDER_KEY_SERVICES.supabase, providerKeyAccount),
        },
        {
          environment: 'PRODUCTION', name: 'Musuw Production', ref: 'phtveqtlswzokwsztsvu',
          url: 'https://phtveqtlswzokwsztsvu.supabase.co',
          applicable: false,
        },
      ],
    },
    r2Admin: {
      accountId: env.MUSUW_R2_ACCOUNT_ID || 'c692db4757e1454b71880ec6c431db9c',
      bucket: env.MUSUW_R2_TEST_BUCKET || candidate.S3_BUCKET_NAME || 'musuw-staging',
      prefix: env.MUSUW_R2_PREFIX || 'weknora/',
      accessKeyId: keychainReader(PROVIDER_KEY_SERVICES.r2AccessKeyID, providerKeyAccount),
      secretAccessKey: keychainReader(PROVIDER_KEY_SERVICES.r2SecretAccessKey, providerKeyAccount),
    },
    langfuse: {
      host: (env.MUSUW_LANGFUSE_HOST || 'https://jp.cloud.langfuse.com').replace(/\/$/, ''),
      publicKey: keychainReader(PROVIDER_KEY_SERVICES.langfusePublicKey, providerKeyAccount),
      secretKey: keychainReader(PROVIDER_KEY_SERVICES.langfuseSecretKey, providerKeyAccount),
      environment: 'staging',
    },
  }
}

export function readKeychainSecret(service, account, executor = execFileSync) {
  try {
    return executor('/usr/bin/security', [
      'find-generic-password',
      '-w',
      '-s', service,
      '-a', account,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

export function readPlatformKey(account, { secretDir } = {}) {
  if (secretDir) return readServerSecret(secretDir, 'platform_api_key')
  return readKeychainSecret(PLATFORM_KEY_SERVICE, account)
}

function parseCookies(header = '') {
  const cookies = {}
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0) continue
    cookies[pair.slice(0, separator).trim()] = decodeURIComponent(pair.slice(separator + 1).trim())
  }
  return cookies
}

function safeEqual(left, right) {
  if (!left || !right) return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function writeJSON(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(body))
}

function publicError(error) {
  if (error?.name === 'AbortError') return 'upstream request timed out'
  if (error?.code === 'ECONNREFUSED') return 'service unavailable'
  return error instanceof Error ? error.message : 'unexpected error'
}

export function registerPoolErrorHandler(pool, log = console.error) {
  pool.on('error', (error) => log(`[musuw-admin] database ${publicError(error)}`))
}

export function createDatabaseReadiness(pool, { onFailure, intervalMs = 5_000 } = {}) {
  let pending
  let stopped = false
  function check() {
    if (stopped) return Promise.resolve(false)
    if (!pending) {
      pending = Promise.resolve()
        .then(() => pool.query({ text: 'SELECT 1', query_timeout: 2_000 }))
        .then(() => true, () => false)
        .finally(() => { pending = undefined })
    }
    return pending
  }
  const timer = setInterval(async () => {
    const ready = await check()
    if (!ready && !stopped) {
      stop()
      onFailure()
    }
  }, intervalMs)
  timer.unref()
  function stop() {
    stopped = true
    clearInterval(timer)
  }
  return { check, stop }
}

function parseJSONBody(request, maxBytes = 64 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        rejectBody(new Error('request body is too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (chunks.length === 0) return resolveBody(null)
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        rejectBody(new Error('invalid JSON body'))
      }
    })
    request.on('error', rejectBody)
  })
}

function secureHeaders(response) {
  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; '))
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
}

function normalizeProviderItems(payload, key) {
  const rows = Array.isArray(payload?.data) ? payload.data : []
  if (key === 'subscriptions') {
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      customer_id: row.customer_id,
      currency_code: row.currency_code,
      collection_mode: row.collection_mode,
      created_at: row.created_at,
      updated_at: row.updated_at,
      next_billed_at: row.next_billed_at,
      current_billing_period: row.current_billing_period || null,
      scheduled_change: row.scheduled_change || null,
    }))
  }
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    customer_id: row.customer_id,
    subscription_id: row.subscription_id,
    currency_code: row.currency_code,
    origin: row.origin,
    created_at: row.created_at,
    updated_at: row.updated_at,
    billed_at: row.billed_at,
    details: row.details ? {
      totals: row.details.totals || null,
      payout_totals: row.details.payout_totals || null,
    } : null,
  }))
}

async function fetchJSON(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = { error: { detail: text.slice(0, 500) } }
    }
    return { response, payload }
  } finally {
    clearTimeout(timer)
  }
}

function projectSupabaseUser(user) {
  return {
    id: user?.id || '',
    email: user?.email || '',
    created_at: user?.created_at || null,
    last_sign_in_at: user?.last_sign_in_at || null,
    email_confirmed_at: user?.email_confirmed_at || null,
    provider: user?.app_metadata?.provider || '',
    providers: Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [],
  }
}

export async function readSupabaseAdminData({ targetEnvironment, projects, fetcher = fetchJSON }) {
  const results = await Promise.all(projects.map(async (project) => {
    const base = {
      environment: project.environment,
      name: project.name,
      ref: project.ref,
      applicable: project.applicable !== false,
      available: false,
      reason: '',
      total: 0,
      users: [],
    }
    if (project.applicable === false) {
      return { ...base, reason: `${project.environment} is not queried by the ${targetEnvironment} process` }
    }
    if (!project.apiKey) {
      return { ...base, reason: 'Auth Admin server credential is not configured in macOS Keychain' }
    }
    try {
      const endpoint = new URL('/auth/v1/admin/users', project.url)
      endpoint.searchParams.set('page', '1')
      endpoint.searchParams.set('per_page', '100')
      const result = await fetcher(endpoint, {
        headers: {
          Accept: 'application/json',
          apikey: project.apiKey,
          'User-Agent': 'MusuwOperations/1.0',
        },
      })
      if (!result.response.ok) {
        return { ...base, reason: `Supabase ${project.environment} Auth Admin returned HTTP ${result.response.status}` }
      }
      const users = Array.isArray(result.payload?.users)
        ? result.payload.users.map(projectSupabaseUser)
        : []
      return { ...base, available: true, total: users.length, users }
    } catch (error) {
      return { ...base, reason: publicError(error) }
    }
  }))
  const target = results.find((project) => project.environment === targetEnvironment)
  return {
    available: Boolean(target?.available),
    reason: target?.available ? '' : (target?.reason || 'Target Supabase Auth project is unavailable'),
    projects: results,
  }
}

export async function readR2Inventory({ client, bucket, prefix = '', applicable = true }) {
  if (!applicable) {
    return {
      available: false,
      applicable: false,
      reason: 'TEST uses local storage; Cloudflare R2 is not applicable in this environment',
      bucket: '',
      prefix: '',
      total: 0,
      total_bytes: 0,
      objects: [],
    }
  }
  if (!client || !bucket) {
    return {
      available: false,
      applicable: true,
      reason: 'R2 operator credential is not configured in macOS Keychain',
      bucket: bucket || '',
      prefix,
      total: 0,
      total_bytes: 0,
      objects: [],
    }
  }
  try {
    const payload = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1000 }))
    const objects = (payload.Contents || []).map((object) => ({
      key: object.Key || '',
      size: Number(object.Size || 0),
      last_modified: object.LastModified instanceof Date ? object.LastModified.toISOString() : (object.LastModified || null),
      etag: object.ETag || '',
    }))
    return {
      available: true,
      applicable: true,
      reason: payload.IsTruncated ? 'R2 inventory is capped at the first 1000 objects' : '',
      bucket,
      prefix,
      total: Number(payload.KeyCount ?? objects.length),
      total_bytes: objects.reduce((sum, object) => sum + object.size, 0),
      objects,
    }
  } catch (error) {
    return {
      available: false,
      applicable: true,
      reason: publicError(error),
      bucket,
      prefix,
      total: 0,
      total_bytes: 0,
      objects: [],
    }
  }
}

function projectLangfuseObservation(observation) {
  return {
    id: observation?.id || '',
    trace_id: observation?.traceId || '',
    name: observation?.name || '',
    type: observation?.type || '',
    start_time: observation?.startTime || null,
    end_time: observation?.endTime || null,
    environment: observation?.environment || '',
    level: observation?.level || '',
    model: observation?.model || observation?.providedModelName || '',
    total_usage: observation?.totalUsage ?? observation?.usageDetails?.total ?? null,
    total_cost: observation?.totalCost ?? observation?.costDetails?.total ?? null,
    latency: observation?.latency ?? null,
    trace_name: observation?.traceName || '',
    release: observation?.release || '',
  }
}

export async function readLangfuseData({ host, publicKey, secretKey, environment, fetcher = fetchJSON }) {
  const unavailable = (reason) => ({ available: false, reason, observations: [], cursor: null })
  if (!publicKey || !secretKey) return unavailable('Langfuse query credentials are not configured in macOS Keychain')
  const normalizedEnvironment = String(environment || '').trim()
  if (!['staging', 'production'].includes(normalizedEnvironment)) {
    return unavailable('Langfuse query environment is not configured')
  }
  try {
    const endpoint = new URL('/api/public/v2/observations', host)
    endpoint.searchParams.set('fields', 'core,basic,time,model,usage,metrics,trace_context')
    endpoint.searchParams.set('limit', '100')
    endpoint.searchParams.set('fromStartTime', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    endpoint.searchParams.set('toStartTime', new Date().toISOString())
    endpoint.searchParams.set('environment', normalizedEnvironment)
    const result = await fetcher(endpoint, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`,
      },
    })
    if (!result.response.ok) return unavailable(`Langfuse observations API returned HTTP ${result.response.status}`)
    return {
      available: true,
      reason: '',
      observations: Array.isArray(result.payload?.data)
        // The project contains both TEST and production observations. Keep this
        // client-side guard even when the upstream environment filter is set.
        ? result.payload.data
          .filter((observation) => observation?.environment === normalizedEnvironment)
          .map(projectLangfuseObservation)
        : [],
      cursor: result.payload?.meta?.cursor || null,
    }
  } catch (error) {
    return unavailable(publicError(error))
  }
}

function cachedOfficialRead(loader, ttlMs = 30_000) {
  let value
  let loadedAt = 0
  let pending
  return async () => {
    if (value && Date.now() - loadedAt < ttlMs) return value
    if (!pending) {
      pending = Promise.resolve()
        .then(loader)
        .then((next) => {
          value = next
          loadedAt = Date.now()
          return next
        })
        .finally(() => { pending = null })
    }
    return pending
  }
}

async function readPaddleResource(fetcher, url, key, label, headers) {
  try {
    const result = await fetcher(url, { headers })
    if (!result.response.ok) {
      return {
        available: false,
        reason: `Paddle ${label} API returned HTTP ${result.response.status}`,
        rows: [],
      }
    }
    return {
      available: true,
      reason: '',
      rows: normalizeProviderItems(result.payload, key),
    }
  } catch (error) {
    return { available: false, reason: publicError(error), rows: [] }
  }
}

export async function readPaddleData({ apiKey, apiBase, fetcher = fetchJSON }) {
  if (!apiKey) {
    const reason = 'Paddle API credential is not configured'
    return {
      available: false,
      reason,
      subscriptions_available: false,
      subscriptions_reason: reason,
      subscriptions: [],
      transactions_available: false,
      transactions_reason: reason,
      transactions: [],
    }
  }

  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
  const [subscriptions, transactions] = await Promise.all([
    readPaddleResource(fetcher, `${apiBase}/subscriptions?per_page=50`, 'subscriptions', 'subscriptions', headers),
    readPaddleResource(fetcher, `${apiBase}/transactions?per_page=50`, 'transactions', 'transactions', headers),
  ])
  const failures = [subscriptions, transactions]
    .filter((capability) => !capability.available)
    .map((capability) => capability.reason)

  return {
    available: subscriptions.available || transactions.available,
    reason: failures.join('; '),
    subscriptions_available: subscriptions.available,
    subscriptions_reason: subscriptions.reason,
    subscriptions: subscriptions.rows,
    transactions_available: transactions.available,
    transactions_reason: transactions.reason,
    transactions: transactions.rows,
  }
}

function createQueries(pool) {
  async function overview() {
    const [users, tenants, knowledge, storage, recent] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE is_active)::int AS active,
               COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_30d
          FROM users WHERE deleted_at IS NULL
      `),
      pool.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'active')::int AS active,
               COUNT(*) FILTER (WHERE plan <> 'free' AND plan_status = 'active')::int AS paid,
               COALESCE(SUM(storage_quota), 0)::bigint AS storage_quota_bytes,
               COALESCE(SUM(storage_used), 0)::bigint AS storage_used_bytes
          FROM tenants WHERE deleted_at IS NULL
      `),
      pool.query(`
        SELECT (SELECT COUNT(*) FROM knowledge_bases WHERE deleted_at IS NULL)::int AS knowledge_bases,
               COUNT(*)::int AS documents,
               COUNT(*) FILTER (WHERE parse_status = 'failed')::int AS failed,
               COUNT(*) FILTER (WHERE parse_status IN ('waiting','pending','running','processing'))::int AS processing,
               COALESCE(SUM(file_size), 0)::bigint AS source_bytes,
               COALESCE(SUM(storage_size), 0)::bigint AS index_bytes
          FROM knowledges WHERE deleted_at IS NULL
      `),
      pool.query(`
        SELECT provider, status, source, COUNT(*)::int AS count
          FROM storage_backends WHERE deleted_at IS NULL
         GROUP BY provider, status, source ORDER BY provider, status
      `),
      pool.query(`
        SELECT k.id, k.title, k.file_type, k.parse_status, k.updated_at,
               kb.name AS knowledge_base_name, t.name AS tenant_name
          FROM knowledges k
          JOIN knowledge_bases kb ON kb.id = k.knowledge_base_id
          JOIN tenants t ON t.id = k.tenant_id
         WHERE k.deleted_at IS NULL
         ORDER BY k.updated_at DESC NULLS LAST, k.created_at DESC
         LIMIT 8
      `),
    ])
    return {
      users: users.rows[0],
      tenants: tenants.rows[0],
      knowledge: knowledge.rows[0],
      storage_backends: storage.rows,
      recent_documents: recent.rows,
    }
  }

  async function users(url) {
    const page = clampPage(url.searchParams.get('page'))
    const pageSize = clampPageSize(url.searchParams.get('page_size'))
    const offset = (page - 1) * pageSize
    const search = (url.searchParams.get('q') || '').trim()
    const plan = (url.searchParams.get('plan') || '').trim().toLowerCase()
    const state = (url.searchParams.get('state') || '').trim().toLowerCase()
    const effectivePlanSQL = `CASE
      WHEN t.plan IN ('plus', 'pro', 'max') AND t.plan_status IN ('active', 'trialing') THEN t.plan
      WHEN t.plan IN ('plus', 'pro', 'max') AND t.plan_status = 'past_due' AND (
        (t.paddle_billing_period = 'monthly' AND t.open_router_credit_period_end > NOW()) OR
        (t.paddle_billing_period = 'yearly' AND t.paddle_current_period_end > NOW())
      ) THEN t.plan
      WHEN t.plan = 'free' AND t.complimentary_plan IN ('plus', 'pro', 'max')
        AND t.complimentary_grant_id IS NOT NULL AND t.complimentary_grant_id <> ''
        AND t.complimentary_expires_at > NOW() THEN t.complimentary_plan
      ELSE 'free'
    END`
    const effectiveStorageQuotaSQL = `CASE
      WHEN t.plan = 'free' AND t.complimentary_plan IN ('plus', 'pro', 'max')
        AND t.complimentary_grant_id IS NOT NULL AND t.complimentary_grant_id <> ''
        AND t.complimentary_expires_at > NOW()
      THEN GREATEST(t.storage_quota, CASE t.complimentary_plan
        WHEN 'plus' THEN 10737418240
        WHEN 'pro' THEN 32212254720
        WHEN 'max' THEN 107374182400
        ELSE t.storage_quota END)
      ELSE t.storage_quota
    END`
    const params = []
    const where = ['u.deleted_at IS NULL']
    if (search) {
      params.push(`%${search}%`)
      where.push(`(u.email ILIKE $${params.length} OR u.username ILIKE $${params.length} OR u.id ILIKE $${params.length} OR t.name ILIKE $${params.length})`)
    }
    if (['free', 'plus', 'pro', 'max'].includes(plan)) {
      params.push(plan)
      where.push(`${effectivePlanSQL} = $${params.length}`)
    }
    if (state === 'active' || state === 'inactive') {
      params.push(state === 'active')
      where.push(`u.is_active = $${params.length}`)
    }
    const whereSQL = where.join(' AND ')
    const dataParams = [...params, pageSize, offset]
    const rows = await pool.query(`
      SELECT u.id, u.username, u.email, u.avatar, u.is_active, u.is_system_admin,
             u.tenant_id, u.created_at, u.updated_at,
             t.name AS tenant_name, t.status AS tenant_status,
             ${effectivePlanSQL} AS plan, t.plan AS configured_plan, t.plan_status,
             t.complimentary_plan, t.complimentary_expires_at, t.complimentary_grant_id,
             ${effectiveStorageQuotaSQL} AS storage_quota_bytes, t.storage_used AS storage_used_bytes,
             t.paddle_customer_id, t.paddle_subscription_id, t.paddle_billing_period,
             t.paddle_current_period_end, t.open_router_credit_period_end,
             COALESCE(kb.knowledge_base_count, 0)::int AS knowledge_base_count,
             COALESCE(doc.document_count, 0)::int AS document_count,
             COALESCE(doc.source_bytes, 0)::bigint AS source_bytes,
             COALESCE(doc.index_bytes, 0)::bigint AS index_bytes
        FROM users u
        LEFT JOIN tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
        LEFT JOIN (
          SELECT tenant_id, COUNT(*) AS knowledge_base_count
            FROM knowledge_bases WHERE deleted_at IS NULL GROUP BY tenant_id
        ) kb ON kb.tenant_id = u.tenant_id
        LEFT JOIN (
          SELECT tenant_id, COUNT(*) AS document_count,
                 COALESCE(SUM(file_size), 0) AS source_bytes,
                 COALESCE(SUM(storage_size), 0) AS index_bytes
            FROM knowledges WHERE deleted_at IS NULL GROUP BY tenant_id
        ) doc ON doc.tenant_id = u.tenant_id
       WHERE ${whereSQL}
       ORDER BY u.created_at DESC, u.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, dataParams)
    const total = await pool.query(`
      SELECT COUNT(*)::int AS total
        FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id AND t.deleted_at IS NULL
       WHERE ${whereSQL}
    `, params)
    return { rows: rows.rows, total: total.rows[0]?.total || 0, page, page_size: pageSize }
  }

  async function knowledge(url) {
    const kind = url.searchParams.get('kind') === 'knowledge_bases' ? 'knowledge_bases' : 'documents'
    const page = clampPage(url.searchParams.get('page'))
    const pageSize = clampPageSize(url.searchParams.get('page_size'))
    const offset = (page - 1) * pageSize
    const search = (url.searchParams.get('q') || '').trim()
    const status = (url.searchParams.get('status') || '').trim().toLowerCase()
    const params = []
    const where = []
    if (kind === 'knowledge_bases') {
      where.push('kb.deleted_at IS NULL')
      if (search) {
        params.push(`%${search}%`)
        where.push(`(kb.name ILIKE $${params.length} OR kb.id ILIKE $${params.length} OR t.name ILIKE $${params.length})`)
      }
      const dataParams = [...params, pageSize, offset]
      const rows = await pool.query(`
        SELECT kb.id, kb.name, kb.description, kb.type, kb.tenant_id, kb.creator_id,
               kb.storage_backend_id, kb.created_at, kb.updated_at,
               t.name AS tenant_name, t.plan, t.storage_quota AS storage_quota_bytes,
               t.storage_used AS storage_used_bytes,
               COALESCE(COUNT(k.id), 0)::int AS document_count,
               COALESCE(SUM(k.file_size), 0)::bigint AS source_bytes,
               COALESCE(SUM(k.storage_size), 0)::bigint AS index_bytes,
               COUNT(k.id) FILTER (WHERE k.parse_status = 'failed')::int AS failed_count,
               sb.provider AS storage_provider, sb.status AS storage_backend_status
          FROM knowledge_bases kb
          JOIN tenants t ON t.id = kb.tenant_id
          LEFT JOIN knowledges k ON k.knowledge_base_id = kb.id AND k.deleted_at IS NULL
          LEFT JOIN storage_backends sb ON sb.id = kb.storage_backend_id AND sb.deleted_at IS NULL
         WHERE ${where.join(' AND ')}
         GROUP BY kb.id, t.id, sb.provider, sb.status
         ORDER BY kb.updated_at DESC NULLS LAST, kb.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, dataParams)
      const total = await pool.query(`
        SELECT COUNT(*)::int AS total FROM knowledge_bases kb
        JOIN tenants t ON t.id = kb.tenant_id WHERE ${where.join(' AND ')}
      `, params)
      return { kind, rows: rows.rows, total: total.rows[0]?.total || 0, page, page_size: pageSize }
    }

    where.push('k.deleted_at IS NULL')
    if (search) {
      params.push(`%${search}%`)
      where.push(`(k.title ILIKE $${params.length} OR k.file_name ILIKE $${params.length} OR k.id ILIKE $${params.length} OR kb.name ILIKE $${params.length} OR t.name ILIKE $${params.length})`)
    }
    if (status) {
      params.push(status)
      where.push(`LOWER(k.parse_status) = $${params.length}`)
    }
    const dataParams = [...params, pageSize, offset]
    const rows = await pool.query(`
      SELECT k.id, k.tenant_id, k.knowledge_base_id, k.type, k.title, k.description,
             k.source, k.parse_status, k.enable_status, k.file_name, k.file_type,
             k.file_size AS source_bytes, k.storage_size AS index_bytes,
             k.file_path AS object_reference, k.error_message, k.channel,
             k.created_at, k.updated_at, k.processed_at,
             kb.name AS knowledge_base_name, kb.storage_backend_id,
             t.name AS tenant_name, t.plan, t.storage_quota AS storage_quota_bytes,
             t.storage_used AS storage_used_bytes,
             sb.provider AS storage_provider, sb.status AS storage_backend_status
        FROM knowledges k
        JOIN knowledge_bases kb ON kb.id = k.knowledge_base_id
        JOIN tenants t ON t.id = k.tenant_id
        LEFT JOIN storage_backends sb ON sb.id = kb.storage_backend_id AND sb.deleted_at IS NULL
       WHERE ${where.join(' AND ')}
       ORDER BY k.updated_at DESC NULLS LAST, k.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, dataParams)
    const total = await pool.query(`
      SELECT COUNT(*)::int AS total FROM knowledges k
      JOIN knowledge_bases kb ON kb.id = k.knowledge_base_id
      JOIN tenants t ON t.id = k.tenant_id
      WHERE ${where.join(' AND ')}
    `, params)
    return { kind, rows: rows.rows, total: total.rows[0]?.total || 0, page, page_size: pageSize }
  }

  async function billing() {
    const result = await pool.query(`
      SELECT id AS tenant_id, name AS tenant_name, status AS tenant_status,
             plan, plan_status, paddle_customer_id, paddle_subscription_id,
             paddle_billing_period, paddle_current_period_end,
             paddle_last_event_id, paddle_last_event_at,
             open_router_credit_period_end, created_at, updated_at
        FROM tenants WHERE deleted_at IS NULL
       ORDER BY (paddle_subscription_id IS NOT NULL) DESC, updated_at DESC, id ASC
    `)
    return result.rows
  }

  async function identity() {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_active)::int AS active,
             COUNT(*) FILTER (WHERE is_system_admin)::int AS system_admins,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_30d,
             MAX(updated_at) AS latest_update
        FROM users WHERE deleted_at IS NULL
    `)
    return result.rows[0]
  }

  async function storage(url) {
    const page = clampPage(url.searchParams.get('page'))
    const pageSize = clampPageSize(url.searchParams.get('page_size'))
    const offset = (page - 1) * pageSize
    const search = (url.searchParams.get('q') || '').trim()
    const params = []
    const where = ['k.deleted_at IS NULL']
    if (search) {
      params.push(`%${search}%`)
      where.push(`(k.title ILIKE $${params.length} OR k.file_name ILIKE $${params.length} OR k.file_path ILIKE $${params.length} OR t.name ILIKE $${params.length})`)
    }
    const [backends, usage, rows, total] = await Promise.all([
      pool.query(`
        SELECT sb.id, sb.tenant_id, sb.name, sb.provider, sb.source, sb.status,
               sb.legacy_alias, sb.created_at, sb.updated_at, t.name AS tenant_name,
               COUNT(kb.id)::int AS knowledge_base_count
          FROM storage_backends sb
          LEFT JOIN tenants t ON t.id = sb.tenant_id
          LEFT JOIN knowledge_bases kb ON kb.storage_backend_id = sb.id AND kb.deleted_at IS NULL
         WHERE sb.deleted_at IS NULL
         GROUP BY sb.id, t.name ORDER BY sb.provider, sb.tenant_id
      `),
      pool.query(`
        SELECT COALESCE(SUM(storage_quota), 0)::bigint AS quota_bytes,
               COALESCE(SUM(storage_used), 0)::bigint AS measured_used_bytes,
               (SELECT COALESCE(SUM(file_size), 0) FROM knowledges WHERE deleted_at IS NULL)::bigint AS source_bytes,
               (SELECT COALESCE(SUM(storage_size), 0) FROM knowledges WHERE deleted_at IS NULL)::bigint AS index_bytes
          FROM tenants WHERE deleted_at IS NULL
      `),
      pool.query(`
        SELECT k.id, k.title, k.file_name, k.file_type,
               k.file_size AS source_bytes, k.storage_size AS index_bytes,
               k.file_path AS object_reference, k.parse_status, k.updated_at,
               t.id AS tenant_id, t.name AS tenant_name,
               t.storage_quota AS quota_bytes, t.storage_used AS measured_used_bytes,
               kb.id AS knowledge_base_id, kb.name AS knowledge_base_name,
               sb.id AS storage_backend_id, sb.provider AS storage_provider,
               sb.status AS storage_backend_status
          FROM knowledges k
          JOIN tenants t ON t.id = k.tenant_id
          JOIN knowledge_bases kb ON kb.id = k.knowledge_base_id
          LEFT JOIN storage_backends sb ON sb.id = kb.storage_backend_id AND sb.deleted_at IS NULL
         WHERE ${where.join(' AND ')}
         ORDER BY k.updated_at DESC NULLS LAST, k.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, pageSize, offset]),
      pool.query(`
        SELECT COUNT(*)::int AS total FROM knowledges k
        JOIN tenants t ON t.id = k.tenant_id
        JOIN knowledge_bases kb ON kb.id = k.knowledge_base_id
        WHERE ${where.join(' AND ')}
      `, params),
    ])
    return {
      backends: backends.rows,
      usage: usage.rows[0],
      rows: rows.rows,
      total: total.rows[0]?.total || 0,
      page,
      page_size: pageSize,
    }
  }

  return { overview, users, knowledge, billing, identity, storage }
}

async function start() {
  const target = (process.argv[2] || 'test').toLowerCase()
  if (!['test', 'production'].includes(target)) throw new Error(`unknown environment: ${target}`)
  const runtime = loadRuntime(target)
  const port = targetListenPort(target, process.env.MUSUW_ADMIN_PORT)
  const host = '127.0.0.1'
  const assetDir = resolve(process.env.MUSUW_ADMIN_ASSET_DIR || resolve(repoRoot, 'weknora/frontend/dist'))
  const operationsHtml = resolve(assetDir, 'operations.html')
  if (!existsSync(operationsHtml)) throw new Error(`operations build is missing: ${operationsHtml}`)

  const platformKey = readPlatformKey(runtime.platformKeyAccount, { secretDir: runtime.secretDir })
  const r2Client = runtime.r2Admin.accessKeyId && runtime.r2Admin.secretAccessKey
    ? new S3Client({
      region: 'auto',
      endpoint: `https://${runtime.r2Admin.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: runtime.r2Admin.accessKeyId,
        secretAccessKey: runtime.r2Admin.secretAccessKey,
      },
    })
    : null
  const supabaseAdminData = cachedOfficialRead(() => readSupabaseAdminData(runtime.supabaseAdmin))
  const r2Inventory = cachedOfficialRead(() => readR2Inventory({
    client: r2Client,
    bucket: runtime.r2Admin.bucket,
    prefix: runtime.r2Admin.prefix,
    applicable: target === 'production',
  }))
  const langfuseData = cachedOfficialRead(() => readLangfuseData(runtime.langfuse))
  const paddleOfficialData = cachedOfficialRead(() => readPaddleData({
    apiKey: runtime.paddleApiKey,
    apiBase: runtime.paddleApiBase,
  }))
  const pool = new Pool({
    ...runtime.database,
    // Two durable connections keep the single-operator console responsive when
    // a page needs a count and a row query over the higher-latency SSH tunnel,
    // without creating the five simultaneous handshakes used by the default.
    max: 2,
    // Keep both tunnel-backed connections alive for the operator session.
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: runtime.server ? 2_000 : 60_000,
    ...(runtime.server ? { query_timeout: 12_000 } : {}),
    options: '-c default_transaction_read_only=on -c statement_timeout=12000',
  })
  const logServerDatabaseError = () => console.error('[musuw-admin] database connection interrupted')
  registerPoolErrorHandler(pool, runtime.server ? logServerDatabaseError : undefined)
  const readOnly = await pool.query('SHOW transaction_read_only')
  if (readOnly.rows[0]?.transaction_read_only !== 'on') {
    await pool.end().catch(() => {})
    throw new Error('operations database connection is not read-only')
  }
  const queries = createQueries(pool)
  // Keep readiness independent of the two business connections so a normal
  // count + row query cannot falsely trigger a process restart.
  const readinessPool = runtime.server ? new Pool({
    ...runtime.database,
    max: 1,
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 2_000,
    query_timeout: 2_000,
    options: '-c default_transaction_read_only=on -c statement_timeout=2000',
  }) : null
  if (readinessPool) registerPoolErrorHandler(readinessPool, logServerDatabaseError)
  let readiness
  const sessions = new Map()
  const cookieNames = targetCookieNames(target)
  const allowedOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`])
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])

  function ensureSession(request, response, pathname) {
    const cookies = parseCookies(request.headers.cookie)
    const sessionToken = targetSessionToken(target, cookies)
    const current = sessions.get(sessionToken)
    if (current && Date.now() - current.createdAt <= SESSION_MAX_AGE_MS) {
      return { id: sessionToken, ...current }
    }
    if (current) sessions.delete(sessionToken)
    if (request.method !== 'GET' || !['/', '/operations.html'].includes(pathname)) return null
    const id = randomBytes(32).toString('base64url')
    const csrf = randomBytes(24).toString('base64url')
    sessions.set(id, { csrf, createdAt: Date.now() })
    response.setHeader('Set-Cookie', [
      `${cookieNames.session}=${id}; Path=/; HttpOnly; SameSite=Strict`,
      `${cookieNames.csrf}=${csrf}; Path=/; SameSite=Strict`,
    ])
    return { id, csrf }
  }

  function validMutation(request, session) {
    const origin = request.headers.origin || ''
    const csrf = request.headers['x-musuw-csrf'] || ''
    return allowedOrigins.has(origin) && safeEqual(String(csrf), session.csrf)
  }

  async function proxyOperationsRequest(request, response, url, session) {
    if (!platformKey) return writeJSON(response, 503, { error: 'Musuw operations credential unavailable' })
    const operationsPath = normalizeOperationsPath(url.pathname)
    if (!isSafeOperationsPath(request.method, url.pathname)) {
      return writeJSON(response, 404, { error: 'operation is outside the console allowlist' })
    }
    if (!['GET', 'HEAD'].includes(request.method) && !validMutation(request, session)) {
      return writeJSON(response, 403, { error: 'same-origin confirmation token required' })
    }
    let body
    if (!['GET', 'HEAD'].includes(request.method)) {
      const parsed = await parseJSONBody(request)
      body = parsed == null ? undefined : JSON.stringify(parsed)
    }
    const upstream = new URL(operationsPath + url.search, runtime.backendBaseUrl)
    const { response: upstreamResponse, payload } = await fetchJSON(upstream, {
      method: request.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': platformKey,
        'X-Request-ID': request.headers['x-request-id'] || randomBytes(12).toString('hex'),
      },
      body,
    })
    return writeJSON(response, upstreamResponse.status, payload ?? {})
  }

  async function proxyModelPolicyRequest(request, response, url, session, plan) {
    if (!platformKey) return writeJSON(response, 503, { error: 'Musuw operations credential unavailable' })
    if (plan.method === 'PUT' && !validMutation(request, session)) {
      return writeJSON(response, 403, { error: 'same-origin confirmation token required' })
    }
    let body
    if (plan.method === 'PUT') {
      try {
        const parsed = await parseJSONBody(request)
        body = parsed == null ? undefined : JSON.stringify(parsed)
      } catch {
        return writeJSON(response, 400, { error: 'invalid model policy request' })
      }
    }
    const upstream = new URL(plan.upstreamPath, runtime.backendBaseUrl)
    const { response: upstreamResponse, payload } = await fetchJSON(upstream, {
      method: plan.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': platformKey,
        'X-Request-ID': request.headers['x-request-id'] || randomBytes(12).toString('hex'),
      },
      body,
    })
    return writeJSON(response, upstreamResponse.status, payload ?? {})
  }

  async function paddleData() {
    return paddleOfficialData()
  }

  const server = createServer(async (request, response) => {
    secureHeaders(response)
    try {
      if (!allowedHosts.has(request.headers.host || '')) return writeJSON(response, 421, { error: 'invalid host' })
      const url = new URL(request.url || '/', `http://${request.headers.host}`)
      if (url.pathname === '/healthz') {
        return writeJSON(response, 200, { status: 'ok', environment: runtime.label })
      }
      if (runtime.server && url.pathname === '/readyz') {
        const ready = await readiness.check()
        return writeJSON(response, ready ? 200 : 503, { status: ready ? 'ok' : 'unavailable', environment: runtime.label })
      }
      const session = ensureSession(request, response, url.pathname)
      if (!session && !isPublicConsoleAsset(request.method || 'GET', url.pathname)) {
        return writeJSON(response, 401, { error: 'open the console directly from this Mac to start an operator session' })
      }

      if (url.pathname.startsWith('/api/v1/system/')) {
        return await proxyOperationsRequest(request, response, url, session)
      }
      if (url.pathname.startsWith('/admin-api/')) {
        if (url.pathname === ENVIRONMENT_SWITCH_PATH) {
          return writeJSON(response, 410, { error: 'environment switching is navigation-only' })
        }
        const modelPolicyPlan = modelPolicyRequestPlan(request.method, url.pathname)
        if (modelPolicyPlan) return await proxyModelPolicyRequest(request, response, url, session, modelPolicyPlan)
        if (url.pathname === MODEL_POLICY_PATH || url.pathname.startsWith(`${MODEL_POLICY_PATH}/`)) {
          return writeJSON(response, 405, { error: 'method not allowed' })
        }
        if (request.method !== 'GET') return writeJSON(response, 405, { error: 'method not allowed' })
        switch (url.pathname) {
          case '/admin-api/config':
            {
            const [paddle, supabase, r2, langfuse] = await Promise.all([
              paddleOfficialData(), supabaseAdminData(), r2Inventory(), langfuseData(),
            ])
            return writeJSON(response, 200, { data: {
              csrf_token: session.csrf,
              environment: runtime.label,
              target: runtime.target,
              providers: {
                weknora: { available: Boolean(platformKey), authority: 'Musuw scoped management API' },
                paddle: {
                  available: Boolean(paddle.subscriptions_available && paddle.transactions_available),
                  reason: paddle.reason,
                  authority: `Paddle ${runtime.paddleEnvironment}`,
                },
                supabase: { available: supabase.available, reason: supabase.reason, authority: 'Supabase Auth Admin' },
                r2: {
                  available: r2.available,
                  applicable: r2.applicable,
                  reason: r2.reason,
                  authority: r2.applicable === false ? 'TEST local storage' : 'Cloudflare R2 S3 API',
                },
                langfuse: { available: langfuse.available, reason: langfuse.reason, authority: 'Langfuse' },
              },
              links: {
                paddle: runtime.paddleEnvironment === 'sandbox' ? 'https://sandbox-vendors.paddle.com/' : 'https://vendors.paddle.com/',
                supabase_staging: 'https://supabase.com/dashboard/project/achfnnicetupvtoqiwqd',
                supabase_production: 'https://supabase.com/dashboard/project/phtveqtlswzokwsztsvu',
                cloudflare_r2: 'https://dash.cloudflare.com/c692db4757e1454b71880ec6c431db9c/r2',
                openrouter: 'https://openrouter.ai/settings/keys',
                resend: 'https://resend.com/domains',
                langfuse: runtime.langfuse.host,
              },
            } })
            }
          case '/admin-api/overview':
            return writeJSON(response, 200, { data: await queries.overview() })
          case '/admin-api/users':
            return writeJSON(response, 200, { data: await queries.users(url) })
          case '/admin-api/knowledge':
            return writeJSON(response, 200, { data: await queries.knowledge(url) })
          case '/admin-api/billing': {
            const [mirror, provider] = await Promise.all([queries.billing(), paddleData()])
            return writeJSON(response, 200, { data: { mirror, provider } })
          }
          case '/admin-api/identity':
            {
            const provider = await supabaseAdminData()
            return writeJSON(response, 200, { data: {
              account_summary: await queries.identity(),
              provider,
            } })
            }
          case '/admin-api/storage':
            {
            const [mirror, provider] = await Promise.all([queries.storage(url), r2Inventory()])
            return writeJSON(response, 200, { data: { ...mirror, provider } })
            }
          case '/admin-api/langfuse':
            return writeJSON(response, 200, { data: await langfuseData() })
          default:
            return writeJSON(response, 404, { error: 'not found' })
        }
      }

      const requestedPath = url.pathname === '/' ? '/operations.html' : url.pathname
      let decodedPath
      try {
        decodedPath = decodeURIComponent(requestedPath)
      } catch {
        return writeJSON(response, 400, { error: 'invalid path' })
      }
      const filePath = resolve(assetDir, `.${decodedPath}`)
      if (filePath !== assetDir && !filePath.startsWith(`${assetDir}${sep}`)) return writeJSON(response, 403, { error: 'forbidden' })
      if (!existsSync(filePath) || !statSync(filePath).isFile()) return writeJSON(response, 404, { error: 'not found' })
      const ext = extname(filePath).toLowerCase()
      response.writeHead(200, {
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      })
      createReadStream(filePath).pipe(response)
    } catch (error) {
      console.error('[musuw-admin]', publicError(error))
      if (!response.headersSent) writeJSON(response, 500, { error: publicError(error) })
      else response.end()
    }
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(port, host, () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  }).catch(async (error) => {
    await pool.end().catch(() => {})
    await readinessPool?.end().catch(() => {})
    throw error
  })
  if (readinessPool) {
    readiness = createDatabaseReadiness(readinessPool, { onFailure() {
      console.error('[musuw-admin] database readiness failed; restarting')
      process.exit(1)
    } })
  }
  console.log(`Musuw operations console ${runtime.label} listening on http://${host}:${port}`)
  console.log(`Musuw management API: ${platformKey ? 'available' : 'unavailable'}`)

  const shutdown = async () => {
    readiness?.stop()
    server.close()
    await Promise.all([pool.end().catch(() => {}), readinessPool?.end().catch(() => {})])
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch((error) => {
    console.error(`musuw-admin: ${process.env.MUSUW_ADMIN_MODE === 'server' ? 'server initialization failed' : publicError(error)}`)
    process.exit(1)
  })
}
