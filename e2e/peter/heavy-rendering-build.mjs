// Follow Vite's real resolved static module graph, without replacing dist.
// Optional engines must remain behind their native preview/import boundary.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { build } from '../../weknora/frontend/node_modules/vite/dist/node/index.js'

const root = fileURLToPath(new URL('../../weknora/frontend/', import.meta.url))
const graph = new Map()
const chunks = new Map()
process.env.VITE_WORKSPACE_PROFILE = 'peter'
process.env.VITE_AUTH_MODE = 'native'
await build({ root, configFile: root + 'vite.config.ts', logLevel: 'silent',
  build: { write: false, emptyOutDir: false, reportCompressedSize: false },
  plugins: [{ name: 'audit-optional-engine-boundaries', generateBundle(_options, bundle) {
    for (const id of this.getModuleIds()) graph.set(id, this.getModuleInfo(id)?.importedIds || [])
    for (const chunk of Object.values(bundle)) {
      if (chunk.type === 'chunk') chunks.set(chunk.fileName, { imports: chunk.imports, modules: Object.keys(chunk.modules) })
    }
  } }],
})
const staticClosure = (entry) => {
  const visited = new Set(), pending = [entry]
  while (pending.length) {
    const id = pending.pop()
    if (visited.has(id)) continue
    visited.add(id)
    pending.push(...(graph.get(id) || []))
  }
  return [...visited]
}
const staticPath = (entry, destination) => {
  const paths = [[entry]], visited = new Set([entry])
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i], id = path.at(-1)
    if (id === destination) return path.map(id => id.replace(root, ''))
    for (const child of graph.get(id) || []) {
      if (visited.has(child)) continue
      visited.add(child)
      paths.push([...path, child])
    }
  }
  return []
}
const checks = [
  ['src/views/customer/CustomerKnowledgeView.vue', /\/views\/knowledge\/KnowledgeBase\.vue$/],
  ['src/views/customer/CustomerProject.vue', /\/views\/knowledge\/KnowledgeBase\.vue$/],
  ['src/components/doc-content.vue', /\/node_modules\/(?:mermaid|highlight\.js)\//],
  ['src/components/document-preview.vue', /\/node_modules\/(?:mermaid|highlight\.js)\//],
  ['src/views/knowledge/components/FAQEntryManager.vue', /\/node_modules\/xlsx\//],
  ['src/views/knowledge/KnowledgeBase.vue', /\/node_modules\/highlight\.js\//],
]
const leaks = []
for (const [source, forbidden] of checks) {
  const id = root + source
  assert.ok(graph.has(id), 'The actual module must participate in the production build: ' + source)
  const dependencies = staticClosure(id).filter(path => forbidden.test(path) && !path.includes('/highlight.js/styles/'))
  if (dependencies.length) leaks.push({ source, examples: dependencies.slice(0, 4), count: dependencies.length, path: staticPath(id, dependencies[0]) })
}
console.log(JSON.stringify({ sources: checks.map(([source]) => source), leaks }, null, 2))
assert.deepEqual(leaks, [], 'An unused detail view or heavy rendering engine is still loaded statically')
// A manual chunk can combine a statically imported CSS module with a dynamic
// JS engine even when the source module graph has the correct async boundary.
const kbChunk = [...chunks].find(([, chunk]) => chunk.modules.includes(root + 'src/views/knowledge/KnowledgeBase.vue'))?.[0]
assert.ok(kbChunk, 'The actual KnowledgeBase output chunk must be found')
const chunkPaths = [[kbChunk]], seen = new Set([kbChunk]), chunkLeaks = []
for (let i = 0; i < chunkPaths.length; i++) {
  const path = chunkPaths[i], chunk = chunks.get(path.at(-1))
  if (!chunk) continue
  const engine = chunk.modules.find(id => /\/node_modules\/highlight\.js\//.test(id) && !id.includes('/highlight.js/styles/'))
  if (engine) chunkLeaks.push({ path, engine: engine.replace(root, '') })
  for (const name of chunk.imports) {
    if (seen.has(name)) continue
    seen.add(name)
    chunkPaths.push([...path, name])
  }
}
console.log(JSON.stringify({ knowledgeBaseChunk: kbChunk, chunkLeaks }, null, 2))
assert.deepEqual(chunkLeaks, [], 'The built knowledge page must not statically import the optional highlight engine')
console.log('PASS Customer shells and document/FAQ previews defer their unrelated heavy dependencies')
