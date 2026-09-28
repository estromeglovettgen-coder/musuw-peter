import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const app = fs.readFileSync(path.join(root, 'src/operations/OperationsApp.vue'), 'utf8')
const types = fs.readFileSync(path.join(root, 'src/operations/types.ts'), 'utf8')

test('environment menu navigates between the two fixed local origins', () => {
  assert.match(app, /TEST/)
  assert.match(app, /PRODUCTION/)
  assert.match(app, /4187/)
  assert.match(app, /location\.assign/)
  assert.doesNotMatch(app, /operationsApi\.switchEnvironment/)
  assert.doesNotMatch(app, /waitForEnvironment/)
  assert.doesNotMatch(app, /location\.reload/)
})

test('environment UI does not expose a restart timeout or cross-target switch state', () => {
  assert.doesNotMatch(app, /switchTarget|switchError|switchPollTimer/)
  assert.doesNotMatch(app, /healthMatches|healthz/)
  assert.doesNotMatch(app, /30_000|30 seconds|30 秒/)
})

test('environment policy keeps the typed target contract', () => {
  assert.match(types, /EnvironmentTarget/)
  assert.match(types, /EnvironmentName/)
})
