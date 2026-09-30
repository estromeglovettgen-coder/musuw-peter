// Optional Peter server bootstrap. Supply OPENROUTER_API_KEY at runtime;
// the credential is sent only to the native, encrypted model store.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { api, login } from './server-client.mjs'

const key = process.env.OPENROUTER_API_KEY?.trim()
if (!key) {
  console.log('SKIP Peter ASR setup: OPENROUTER_API_KEY is absent')
  process.exit(0)
}

const name = 'openai/whisper-large-v3'
const baseURL = 'https://openrouter.ai/api/v1'
// Peter owns this credential per model. The "openrouter" provider id would
// instead invoke Musuw's separate tenant billing key and override it.
const provider = 'generic'
const builtins = ['builtin-quick-answer', 'builtin-smart-reasoning']
const staleASR = 'builtin-openrouter-asr'
const probePath = process.env.PETER_ASR_PROBE_WAV || fileURLToPath(new URL('../../weknora/internal/assets/asr_test.wav', import.meta.url))
let step = 'login'
let created = false
let credentialAdded = false
let promoted = false
let model
let previousDefault
const updatedAgents = []

function modelUpdateBody(row, isDefault = row.is_default) {
  return {
    name: row.name,
    display_name: row.display_name,
    description: row.description,
    type: row.type,
    source: row.source,
    is_default: isDefault,
    parameters: row.parameters,
  }
}

try {
  await login()
  step = 'inspect models'
  const models = (await api('/api/v1/models')).data
  previousDefault = models.find(row => row.type === 'ASR' && row.is_default)
  const matches = models.filter(row => row.type === 'ASR' && row.name === name)
  assert.ok(matches.length <= 1, 'duplicate Peter ASR model names')
  model = matches[0]

  if (!model) {
    step = 'create ASR model'
    model = (await api('/api/v1/models', 'POST', {
      name,
      display_name: 'Whisper Large V3 · 语音转文字',
      description: 'OpenRouter 多语言语音识别',
      type: 'ASR',
      source: 'remote',
      is_default: false,
      parameters: { provider, base_url: baseURL, extra_config: { response_format: 'verbose_json' } },
    })).data
    created = true
  }
  assert.equal(model.source, 'remote')
  assert.equal(model.status, 'active')
  assert.equal(model.parameters?.provider, provider)
  assert.equal(model.parameters?.base_url, baseURL)
  assert.ok(model.id)
  assert.ok(!JSON.stringify(model).includes(key), 'model response must redact the credential')

  if (!model.credentials?.api_key?.configured) {
    step = 'store encrypted ASR credential'
    const response = (await api(`/api/v1/models/${model.id}/credentials`, 'PUT', { api_key: key })).data
    assert.equal(response.fields?.api_key?.configured, true)
    credentialAdded = true
  } else {
    console.log('INFO Peter ASR: existing encrypted credential retained; supplied key was not applied')
  }

  step = 'debug ASR model'
  const audio = readFileSync(probePath)
  assert.ok(audio.length > 0 && audio.length < 2_000_000, 'ASR probe must be a small WAV')
  const form = new FormData()
  form.set('file', new Blob([audio], { type: 'audio/wav' }), 'peter-asr-probe.wav')
  const debug = (await api(`/api/v1/models/${model.id}/debug`, 'POST', form)).data
  assert.equal(debug.ok, true, 'native ASR debug failed')
  const transcript = debug.raw_response?.text?.trim()
  assert.ok(transcript, 'native ASR debug returned no transcript')
  const expectedText = process.env.PETER_ASR_EXPECTED_TEXT?.trim()
  if (expectedText) assert.ok(transcript.includes(expectedText), 'native ASR transcript missed expected text')

  if (!model.is_default) {
    step = 'select ASR default'
    model = (await api(`/api/v1/models/${model.id}`, 'PUT', modelUpdateBody(model, true))).data
    promoted = true
  }

  for (const id of builtins) {
    step = `repair ${id} ASR binding`
    const agent = (await api(`/api/v1/agents/${id}`)).data
    if (agent.config?.asr_model_id !== staleASR) continue
    await api(`/api/v1/agents/${id}`, 'PUT', {
      name: agent.name,
      description: agent.description,
      config: { ...agent.config, asr_model_id: model.id },
    })
    updatedAgents.push(agent)
  }

  step = 'verify ASR bindings'
  const finalModels = (await api('/api/v1/models')).data
  const finalModel = finalModels.find(row => row.id === model.id)
  assert.equal(finalModel?.is_default, true)
  assert.equal(finalModel?.credentials?.api_key?.configured, true)
  for (const id of builtins) {
    const agent = (await api(`/api/v1/agents/${id}`)).data
    assert.equal(agent.config?.asr_model_id, model.id)
  }
  console.log(JSON.stringify({ result: 'PASS', name, model_id: model.id, endpoint: baseURL,
    provider, source: 'remote', is_default: true,
    credential_action: credentialAdded ? 'configured' : 'existing_retained',
    native_debug_ok: true, transcript_has_expected_text: expectedText ? transcript.includes(expectedText) : null,
    repaired_builtin_agents: updatedAgents.map(agent => agent.id) }))
} catch {
  // A failed probe must never leave a new model selected for future resources.
  for (const agent of updatedAgents.reverse()) {
    try {
      await api(`/api/v1/agents/${agent.id}`, 'PUT', {
        name: agent.name, description: agent.description, config: agent.config,
      })
    } catch { /* report the failed step below; manual review can restore this row */ }
  }
  if (model?.id && created) {
    try { await api(`/api/v1/models/${model.id}`, 'DELETE') } catch { /* manual review may be required */ }
  } else if (model?.id && promoted) {
    try { await api(`/api/v1/models/${model.id}`, 'PUT', modelUpdateBody(model, false)) } catch { /* manual review may be required */ }
  }
  if (previousDefault && previousDefault.id !== model?.id) {
    try { await api(`/api/v1/models/${previousDefault.id}`, 'PUT', modelUpdateBody(previousDefault, true)) } catch { /* manual review may be required */ }
  }
  if (model?.id && !created && credentialAdded) {
    try { await api(`/api/v1/models/${model.id}/credentials/api_key`, 'DELETE') } catch { /* manual review may be required */ }
  }
  console.error(`Peter ASR setup failed at ${step}; rollback attempted. Inspect model and agent bindings before retry.`)
  process.exitCode = 1
}
