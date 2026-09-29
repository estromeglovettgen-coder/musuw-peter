// Opt-in before/after full-host reboot acceptance. Pauses only the default
// ingestion queue through Asynq's native pause key, so pending persistence is
// deterministic. Run `after` even when a check fails, to release that pause.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {readFileSync,writeFileSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
import {api,request,login,runtime,state,save,record,upload,chat} from './server-client.mjs'

function redis(...args) {
  const script=`import pathlib, shlex, subprocess, json
lines=pathlib.Path('/etc/musuw-peter/redis.conf').read_text().splitlines()
password=next(shlex.split(line)[1] for line in lines if line.startswith('requirepass '))
args=json.loads(${JSON.stringify(JSON.stringify(args))})
command='AUTH '+json.dumps(password)+'\\n'+' '.join(json.dumps(x) for x in args)+'\\n'
r=subprocess.run(['docker','exec','-i','musuw-peter-redis-1','redis-cli','--raw'],input=command,text=True,capture_output=True,check=True)
lines=r.stdout.strip().splitlines()
if not lines or lines[0]!='OK': raise RuntimeError('Redis authentication failed')
print('\\n'.join(lines[1:]))
`
  return execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=15','musuw-build-x64','sudo python3 -'],{input:script,encoding:'utf8'}).trim()
}
const paused='asynq:{default}:paused'
async function artifact() {
  const response=await request(`/api/v1/sessions/${state.reportSession}/messages/${state.reportMessage}/artifacts/0/download`)
  assert.ok(response.ok)
  const bytes=Buffer.from(await response.arrayBuffer())
  const contents=JSON.parse(bytes.toString())
  assert.ok(JSON.stringify(contents).includes('12'))
  return createHash('sha256').update(bytes).digest('hex')
}
await login()
if(process.argv[2]==='before') {
  const snapshot={
    config:(await api('/api/v1/tenants/kv/customer-config')).data,
    agent:(await api(`/api/v1/agents/${state.salesAgent}`)).data.config,
    artifactHash:await artifact(),
  }
  writeFileSync(runtime+'/restart-snapshot.json',JSON.stringify(snapshot,null,2),{mode:0o600})
  assert.equal(redis('EXISTS',paused),'0','Do not overwrite an existing operator queue pause')
  assert.equal(redis('SET',paused,String(Date.now()),'NX'),'OK')
  try {
    const stamp=Date.now()
    const doc=(await upload(`/api/v1/knowledge-bases/${state.commonKB}/knowledge/file`,`restart-pending-${stamp}.txt`,`这是重启恢复验收资料。重启确认码 REBOOT-${stamp}，支持邮箱 support@example.test。`)).data
    state.restartDoc=doc.id;save()
    assert.equal((await api(`/api/v1/knowledge/${doc.id}`)).data.parse_status,'pending')
    assert.ok(Number(redis('LLEN','asynq:{default}:pending'))>=1)
    record('A real uploaded source is durably pending before the full-host reboot',{document:doc.id})
  } catch(error) {redis('DEL',paused);throw error}
} else if(['after','verify'].includes(process.argv[2])) {
  // Resume first; a failing later assertion must not strand user ingestion.
  const pendingSurvived=redis('EXISTS',paused)==='1' && Number(redis('LLEN','asynq:{default}:pending'))>=1
  redis('DEL',paused)
  if(process.argv[2]==='after') {
    assert.ok(pendingSurvived,'Redis queue and its pause marker must survive host reboot')
    record('Redis pending queue and native pause marker survived the full-host reboot')
  }
  const snapshot=JSON.parse(readFileSync(runtime+'/restart-snapshot.json','utf8'))
  assert.deepEqual((await api('/api/v1/tenants/kv/customer-config')).data,snapshot.config)
  assert.deepEqual((await api(`/api/v1/agents/${state.salesAgent}`)).data.config,snapshot.agent)
  assert.equal(await artifact(),snapshot.artifactHash)
  assert.equal((await api(`/api/v1/sessions/${state.alexKBSession}`)).data.customer_knowledge_base_id,state.alexKB)
  for(const key of ['commonKB','alexKB','benKB']) {
    assert.equal((await api(`/api/v1/knowledge/${state[key+'Doc']}`)).data.parse_status,'completed')
    const result=await api(`/api/v1/knowledgebase/${state[key]}/wiki/graph`)
    const graph=result.data || result
    assert.ok(graph.nodes.length>1 && graph.edges.length>0)
  }
  record('Full-host reboot preserves customer templates, agent settings, conversations, source records, Wiki graph and exact artifact bytes')
  let doc
  for(let attempt=0;attempt<90;attempt++) {
    doc=(await api(`/api/v1/knowledge/${state.restartDoc}`)).data
    if(doc.parse_status==='completed') break
    assert.notEqual(doc.parse_status,'failed',doc.error_message)
    await delay(2000)
  }
  assert.equal(doc.parse_status,'completed')
  record('Ingestion pending before reboot resumes and finishes through the real pipeline')
  const skills=(await api(`/api/v1/sandbox-configs/${state.sandbox}/skills`)).data
  assert.equal(skills.find(skill=>skill.name==='customer-report')?.status,'ready')
  const stream=await chat(state.reportSession,state.reportAgent,'这是服务器重启后的恢复验收。请调用 shell_exec 执行 printf PETER_RESTART_OK，并运行 ls /workspace/output 来查看之前的文件。返回工具结果，不要重新生成报表。')
  const events=stream.split('\n').filter(line=>line.startsWith('data:')).map(line=>JSON.parse(line.slice(5)))
  assert.ok(!events.some(event=>event.response_type==='error'))
  assert.ok(events.some(event=>event.response_type==='tool_result' && event.data?.tool_name==='shell_exec' && event.data?.exit_code===0 && event.data?.stdout?.includes('PETER_RESTART_OK')))
  record('Existing skill conversation can execute a real command again after full-host reboot')
} else throw Error('Use before or after')
