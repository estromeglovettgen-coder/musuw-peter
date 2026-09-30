import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./KnowledgeBase.pre-view.vue', import.meta.url), 'utf8')
const section = (start, end) => {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  assert.ok(from >= 0 && to > from, `${start} section exists`)
  return source.slice(from, to)
}

test('file chooser, drops, and URL import check fresh Peter media configuration before direct submission', () => {
  const guard = section('const ensurePeterMediaReady = async', 'const IMAGE_EXTENSIONS')
  assert.match(guard, /!isPeterWorkspace \|\| !needsPeterMediaModelCheck\(fileTypesOrNames\)/)
  assert.match(guard, /getKnowledgeBaseById\(targetKbId\)[\s\S]*?listModels\(\)[\s\S]*?peterMediaRepairSection\([\s\S]*?uiStore\.openKBSettings\(targetKbId, repairSection\)/)
  assert.match(guard, /if \(repairSection\) \{[\s\S]*?return false/)
  assert.match(section('const handleUploadSourceFiles = async', 'const handleUploadSourceUrl'), /if \(!await ensurePeterMediaReady\(files\.map\(file => file\.name\)\)\) return;[\s\S]*?startPlatformDefaultUpload\(files\)/)
  assert.match(section('const handleUploadSourceUrl = async', 'const handleManualCreate'), /if \(!await ensurePeterMediaReady\(\[url\]\)\) return;[\s\S]*?startPlatformDefaultUpload\(\[\], \[url\]\)/)
  assert.match(section('const handleKnowledgeFileDrop =', 'const pendingKnowledgeId'), /handleUploadSourceFiles\(files\)/)
})

test('Peter reparses preflight media and clear old per-document overrides', () => {
  assert.match(section('const confirmBatchReparse = async', 'const tagFilterPanelVisible'), /if \(!await ensurePeterMediaReady\(mediaSources\)\) return;[\s\S]*?batchReparseKnowledge\(targetKbId, ids, isPeterWorkspace \? \{\} : undefined\)/)
  assert.match(section('const confirmRebuildKnowledge = async', 'const submitReparse'), /if \(!await ensurePeterMediaReady\(\[item\.file_type \|\| item\.file_name \|\| ''\]\)\) return;[\s\S]*?submitReparse\(item\.id\)/)
  assert.match(source, /uploadKnowledgeFile\(targetKbId, uploadData,/)
  assert.match(section('const submitReparse = async', 'const handleScroll'), /reparseKnowledge\(id, isPeterWorkspace \? \{ process_config: \{\} \} : undefined\)/)
  assert.doesNotMatch(source, /uploadData\.process_config/)
})
