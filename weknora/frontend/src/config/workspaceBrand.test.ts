import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { workspaceBrandCopy, workspaceBrandMessages } from './workspaceBrand'

test('Fire replaces display branding while preserving URLs and protocol identifiers', () => {
  assert.equal(workspaceBrandCopy('欢迎使用 Musuw，Hi，我是 Musuw。穆苏瓦', true), '欢迎使用 火种，Hi，我是 火种。火种')
  assert.equal(workspaceBrandCopy('打开 https://docs.musuw.com，使用 X-Musuw-Signature，返回 Musuw', true), '打开 https://docs.musuw.com，使用 X-Musuw-Signature，返回 火种')
  const original = { musuw: { title: 'Musuw Skill', examples: ['使用 Musuw', 'musuw/images'] } }
  assert.deepEqual(workspaceBrandMessages(original, true), { musuw: { title: '火种 Skill', examples: ['使用 火种', 'musuw/images'] } })
  assert.equal(original.musuw.title, 'Musuw Skill')
  assert.equal(workspaceBrandMessages(original, false), original)
})

test('startup HTML uses Fire copy while retaining preference and DOM identifiers', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  const fire = workspaceBrandCopy(html, true)
  assert.doesNotMatch(fire, /正在打开 Musuw|Opening Musuw|<title>Musuw<|<strong>Musuw</)
  assert.match(fire, /正在打开 火种/)
  assert.match(fire, /Musuw_theme/)
  assert.match(fire, /id="musuw-startup"/)
  assert.equal(workspaceBrandCopy(html, false), html)
})
