import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
const root = new URL('../../', import.meta.url)
test('the first document loads the small native icon set without the complete sprite', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8')
  const icons = readFileSync(new URL('public/tdesign-icons/0.4.1/fonts/workspace.js', root), 'utf8')
  assert.match(html, /src="\/tdesign-icons\/0\.4\.1\/fonts\/workspace\.js"/)
  assert.doesNotMatch(html, /src="\/tdesign-icons\/0\.4\.1\/fonts\/index\.js"/)
  assert(gzipSync(icons).length < 20000, 'Initial icons must not download hundreds of KB')
  for (const name of ['search', 'folder', 'chat', 'user', 'close', 'chevron-right']) {
    assert(icons.includes(`id=\\"t-icon-${name}\\"`), `${name} is needed by the native first screen`)
  }
})
