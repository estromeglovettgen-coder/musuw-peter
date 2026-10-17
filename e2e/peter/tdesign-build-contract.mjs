// Exercise the real three-entry production graph without replacing dist files.
// The UI component library must remain available through component imports,
// while its all-component installer must not enter any released entry.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from '../../weknora/frontend/node_modules/vite/dist/node/index.js'

const root = fileURLToPath(new URL('../../weknora/frontend/', import.meta.url))
process.env.VITE_WORKSPACE_PROFILE = 'peter'
process.env.VITE_AUTH_MODE = 'native'
const result = await build({ root, configFile: root + 'vite.config.ts', logLevel: 'silent',
  build: { write: false, emptyOutDir: false, reportCompressedSize: false } })
const outputs = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output)
const chunks = outputs.filter(output => output.type === 'chunk')
const installers = []
for (const chunk of chunks) {
  for (const [id, module] of Object.entries(chunk.modules)) {
    if (/\/tdesign-vue-next\/(?:es\/index\.mjs|esm\/index\.js)$/.test(id)
      && module.renderedExports.some(name => name === 'default' || name === 'install')) {
      installers.push({ chunk: chunk.fileName, module: id, renderedExports: module.renderedExports })
    }
  }
}
const entries = chunks.filter(chunk => chunk.isEntry).map(chunk => chunk.name).sort()
assert.deepEqual(entries, ['embed', 'main', 'operations'], 'All native entry surfaces must stay in the build')
console.log(JSON.stringify({ entries, fullInstallers: installers,
  largestChunks: chunks.map(chunk => ({ name: chunk.fileName, raw: Buffer.byteLength(chunk.code), gzip: gzipSync(chunk.code).byteLength }))
    .sort((a, b) => b.gzip - a.gzip).slice(0, 8) }, null, 2))
assert.deepEqual(installers, [], 'A full TDesign installer still forces every component into a released entry')
console.log('PASS All three production entries retain TDesign components without its full-library installer')
