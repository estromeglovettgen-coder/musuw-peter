// Opt-in physical deletion regression against the dedicated acceptance server.
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {setTimeout as delay} from 'node:timers/promises'
import {api, request, login, upload, state, record} from './server-client.mjs'

const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
const ssh = command => execFileSync('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=15','musuw-build-x64',command], {encoding:'utf8'}).trim()
await login()
const kb=(await api('/api/v1/knowledge-bases','POST',{
  name:'临时删除回归验收',type:'document',embedding_model_id:state.embeddingModel,
  summary_model_id:state.chatModel,chunking_config:{chunk_size:512,chunk_overlap:50},
  storage_provider_config:{provider:'local'},
  indexing_strategy:{vector_enabled:true,keyword_enabled:true,wiki_enabled:false,graph_enabled:false},
})).data
const doc=(await upload(`/api/v1/knowledge-bases/${kb.id}/knowledge/file`,'delete-check.txt','此文件仅验证删除知识库时原文件被真正清理。确认码 DELETE-4127。')).data
let current
for(let attempt=0;attempt<60;attempt++) {
  current=(await api(`/api/v1/knowledge/${doc.id}`)).data
  if(current.parse_status==='completed') break
  assert.notEqual(current.parse_status,'failed',current.error_message)
  await delay(2000)
}
assert.equal(current.parse_status,'completed')
const handle=current.file_path.replace('resource://','')
assert.match(handle,/^[A-Za-z0-9_-]{22}$/)
const physical=ssh('sudo docker exec musuw-peter-postgres-1 psql -U peter -d peter -At -c '+quote(`SELECT physical_path FROM resources WHERE handle='${handle}';`))
const relative=physical.split('/local://')[1]
assert.ok(relative && relative.split('/')[1]===doc.id)
assert.match(relative,/^[A-Za-z0-9/_.-]+$/)
assert.ok(!relative.split('/').includes('..'))
const filename='/var/lib/musuw-peter/files/'+relative
const exists=()=>ssh('sudo python3 -c '+quote('import os; print(os.path.isfile('+JSON.stringify(filename)+'))'))==='True'
assert.ok(exists(),'source bytes must exist before deletion')
await api(`/api/v1/knowledge-bases/${kb.id}`,'DELETE')
let removed=false
for(let attempt=0;attempt<60;attempt++) {
  if(!exists()) { removed=true;break }
  await delay(2000)
}
assert.ok(removed,'physical source bytes must be deleted by the asynchronous job')
assert.ok(!(await request(`/api/v1/knowledge/${doc.id}`)).ok)
record('Deleting a knowledge library removes both its source record and physical file',{knowledgeBase:kb.id})
