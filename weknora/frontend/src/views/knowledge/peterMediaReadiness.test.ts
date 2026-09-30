import assert from 'node:assert/strict'
import test from 'node:test'
import {
  needsPeterMediaModelCheck,
  peterMediaRepairSection,
} from './peterMediaReadiness'

const activeModels = [
  { id: 'vision-1', type: 'VLLM', status: 'active' },
  { id: 'speech-1', type: 'ASR', status: 'active' },
]
const configuredKb = {
  vlm_config: { enabled: true, model_id: 'vision-1' },
  asr_config: { enabled: true, model_id: 'speech-1' },
}

test('text and video keep direct submission without a media model check', () => {
  assert.equal(needsPeterMediaModelCheck(['contract.pdf', 'clip.mp4']), false)
  assert.equal(peterMediaRepairSection(['contract.pdf', 'clip.mp4'], {}, []), null)
})

test('valid image and audio models keep media uploads and reparses on direct submission', () => {
  assert.equal(needsPeterMediaModelCheck(['photo.PNG', 'VOICE.MP3']), true)
  assert.equal(peterMediaRepairSection(['photo.PNG', 'VOICE.MP3'], configuredKb, activeModels), null)
  assert.equal(peterMediaRepairSection(['png', 'MP3'], configuredKb, activeModels), null)
})

test('missing or disabled vision binding opens the image repair section', () => {
  assert.equal(peterMediaRepairSection(['photo.png'], {
    ...configuredKb, vlm_config: { enabled: true, model_id: '' },
  }, activeModels), 'multimodal')
  assert.equal(peterMediaRepairSection(['photo.png'], {
    ...configuredKb, vlm_config: { enabled: false, model_id: 'vision-1' },
  }, activeModels), 'multimodal')
})

test('removed, inactive, or wrong-type vision bindings open repair', () => {
  assert.equal(peterMediaRepairSection(['photo.svg'], {
    ...configuredKb, vlm_config: { enabled: true, model_id: 'removed' },
  }, activeModels), 'multimodal')
  assert.equal(peterMediaRepairSection(['photo.webp'], configuredKb, [
    { id: 'vision-1', type: 'VLLM', status: 'inactive' },
  ]), 'multimodal')
  assert.equal(peterMediaRepairSection(['photo.tiff'], configuredKb, [
    { id: 'vision-1', type: 'ASR', status: 'active' },
  ]), 'multimodal')
})

test('missing or invalid speech binding opens the ASR repair section', () => {
  assert.equal(peterMediaRepairSection(['recording.m4a'], {
    ...configuredKb, asr_config: { enabled: true, model_id: '' },
  }, activeModels), 'asr')
  assert.equal(peterMediaRepairSection(['recording.flac'], configuredKb, [
    { id: 'speech-1', type: 'ASR', status: 'inactive' },
  ]), 'asr')
})

test('file URL query text does not hide its media extension', () => {
  assert.equal(needsPeterMediaModelCheck(['https://example.test/voice.ogg?download=1']), true)
  assert.equal(peterMediaRepairSection(['https://example.test/voice.ogg?download=1'], configuredKb, activeModels), null)
})
