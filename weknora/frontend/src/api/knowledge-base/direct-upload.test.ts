import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DIRECT_VIDEO_UPLOAD_THRESHOLD_BYTES,
  isDirectVideoUploadFile,
} from '../../utils/directVideoUpload.ts'

test('direct video upload threshold stays fixed at the ordinary 50 MiB ceiling', () => {
  assert.equal(DIRECT_VIDEO_UPLOAD_THRESHOLD_BYTES, 50 * 1024 * 1024)
})

test('direct video upload accepts a supported extension when the browser omits MIME', () => {
  assert.equal(isDirectVideoUploadFile(new File(['video'], 'clip.mp4')), true)
})

test('direct video upload rejects an explicit extension and MIME conflict', () => {
  assert.equal(isDirectVideoUploadFile(new File(['video'], 'clip.mp4', { type: 'video/webm' })), false)
})

test('direct video upload canonicalizes the supported browser MIME combinations', () => {
  assert.equal(isDirectVideoUploadFile(new File(['video'], 'clip.mp4', { type: 'video/mp4' })), true)
  assert.equal(isDirectVideoUploadFile(new File(['video'], 'clip.mov', { type: 'video/mov' })), true)
})
