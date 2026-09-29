#!/usr/bin/env node
// Local-only wiring for the native application; no hosted auth or billing shell.
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const app = join(root, 'weknora')
const local = join(root, '.runtime', 'peter')
const ports = { web: 4217, api: 18187 }
const children = []
let stopping = false

// Do not inherit another project's DB/provider/auth/billing environment.
const baseEnv = Object.fromEntries(['PATH', 'HOME', 'USER', 'TMPDIR', 'LANG', 'LC_CTYPE']
  .filter(key => process.env[key]).map(key => [key, process.env[key]]))

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, env: baseEnv, encoding: 'utf8', ...options })
}

function start(command, args, cwd, env, name) {
  const fd = openSync(join(local, `${name}.log`), 'a', 0o600)
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', fd, fd] })
  closeSync(fd)
  children.push(child)
  child.on('error', error => { console.error(`${name}: ${error.message}`); stop(1) })
  child.on('exit', code => {
    if (!stopping) { console.error(`${name} exited (${code}); see .runtime/peter/${name}.log`); stop(1) }
  })
  return child
}

async function requireFree(port) {
  await new Promise((ok, fail) => {
    const server = createServer()
    server.once('error', () => fail(new Error(`Port ${port} is occupied; stop the earlier Peter process first.`)))
    server.listen(port, '127.0.0.1', () => server.close(ok))
  })
}

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  await Promise.all(children.map(child => child.exitCode !== null ? null : new Promise(resolve => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 8000)
    child.once('exit', () => { clearTimeout(timeout); resolve() })
  })))
  process.exit(code)
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())

try {
  if (!existsSync(join(app, 'frontend/node_modules/vite/bin/vite.js'))) throw new Error('Run npm ci --prefix weknora/frontend first.')
  if (!existsSync(join(root, 'auth/node_modules/vite/bin/vite.js'))) throw new Error('Run npm ci --prefix auth first.')
  await requireFree(ports.web)
  await requireFree(ports.api)
  run('npm', ['run', 'auth:peter:build'], { stdio: 'inherit' })
  mkdirSync(local, { recursive: true, mode: 0o700 })
  const secretPath = join(local, 'secrets.json')
  if (!existsSync(secretPath)) writeFileSync(secretPath, JSON.stringify({
    jwt: randomBytes(32).toString('hex'), aes: randomBytes(16).toString('hex'),
  }), { mode: 0o600, flag: 'wx' })
  const secrets = JSON.parse(readFileSync(secretPath, 'utf8'))
  console.log('Building the native backend…')
  const binary = join(local, 'server')
  run('go', ['build', '-tags', 'sqlite_fts5', '-o', binary, './cmd/server'], { cwd: app, stdio: 'inherit' })
  const env = {
    ...baseEnv, MUSUW_PRODUCT_EDITION: 'standard', GIN_MODE: 'release', LOG_LEVEL: 'info',
    SERVER_HOST: '127.0.0.1', SERVER_PORT: String(ports.api),
    DB_DRIVER: 'sqlite', DB_PATH: join(local, 'workspace.db'),
    RETRIEVE_DRIVER: 'sqlite', STREAM_MANAGER_TYPE: 'memory',
    JWT_SECRET: secrets.jwt, SYSTEM_AES_KEY: secrets.aes, STORAGE_TYPE: 'local', LOCAL_STORAGE_BASE_DIR: join(local, 'files'),
    BUILTIN_MODELS_CONFIG: join(root, 'integration/peter/builtin_models.yaml'),
    WEKNORA_BOOTSTRAP_SYSTEM_ADMIN_EMAIL: process.env.PETER_ADMIN_EMAIL || 'peter@localhost.test',
    WEKNORA_TENANT_ENABLE_RBAC: 'true', WEKNORA_TENANT_ENABLE_CROSS_TENANT_ACCESS: 'false',
    SSRF_WHITELIST_EXTRA: '127.0.0.1', // Local model acceptance fixture only.
    WEKNORA_SANDBOX_MODE: 'disabled', NEO4J_ENABLE: 'false',
    DOCREADER_ADDR: '127.0.0.1:15087', DOCREADER_TRANSPORT: 'grpc',
    AUTO_RECOVER_DIRTY: 'false',
  }
  start(binary, [], app, env, 'backend')
  start(process.execPath, [join(app, 'frontend/node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(ports.web), '--strictPort'], join(app, 'frontend'), {
    ...baseEnv, VITE_AUTH_MODE: 'native', VITE_WORKSPACE_PROFILE: 'peter', VITE_DEV_PROXY_TARGET: `http://127.0.0.1:${ports.api}`,
  }, 'frontend')
  console.log(`Peter local workspace: http://127.0.0.1:${ports.web}/`)
  console.log('Logs/data: .runtime/peter/ · Ctrl+C stops this workspace and preserves data.')
} catch (error) {
  console.error(error.message)
  await stop(1)
}
