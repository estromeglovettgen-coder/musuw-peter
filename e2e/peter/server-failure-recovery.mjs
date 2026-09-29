import assert from 'node:assert/strict'
import {api,request,login,state,record,chat,save} from './server-client.mjs'
await login()
const skillsPath=`/api/v1/sandbox-configs/${state.sandbox}/skills`
const before=(await api(skillsPath)).data
const malformed=new FormData();malformed.set('file',new Blob(['this is not a zip']),'broken.zip')
const bad=await request(skillsPath,'POST',malformed)
assert.ok(bad.status>=400&&bad.status<500)
assert.equal((await api(skillsPath)).data.length,before.length)
record('Malformed skill archive is rejected without creating a broken installed skill')
const skill=before.find(s=>s.name==='customer-report');assert.ok(skill)
await api(`${skillsPath}/${skill.id}`,'PATCH',{enabled:false})
try{assert.equal((await api(`${skillsPath}/${skill.id}`)).data.enabled,false)}
finally{await api(`${skillsPath}/${skill.id}`,'PATCH',{enabled:true})}
assert.equal((await api(`${skillsPath}/${skill.id}`)).data.enabled,true)
record('Native skill enable/disable persists and restores cleanly')
const session=(await api('/api/v1/sessions','POST',{title:'沙箱异常恢复（验收）'})).data
state.failureRecoverySession=session.id;save()
const stream=await chat(session.id,state.reportAgent,'这是沙箱故障恢复验收。不要使用统计技能。请严格按顺序调用 shell_exec 三次：(1) command="exit 7"；(2) command="sleep 8", timeout_sec=1；(3) command="printf PETER_RECOVERED", timeout_sec=5。前两次错误是预期的，不要自动修正。最后简述三次实际工具结果。')
const results=stream.split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).filter(e=>e.response_type==='tool_result'&&e.data?.tool_name==='shell_exec').map(e=>e.data)
assert.equal(results[0]?.exit_code,7);assert.equal(results[1]?.killed,true);assert.ok(results[1].duration_ms<8000);assert.equal(results[2]?.exit_code,0);assert.equal(results[2]?.stdout,'PETER_RECOVERED')
console.log('Verified actual sandbox tool results:', results.map(r=>({exit:r.exit_code,killed:r.killed,duration:r.duration_ms})))
assert.match(stream,/PETER_RECOVERED/)
assert.match(stream,/exit.?code[^\n]{0,30}7|Exit code\*\*: 7|exit 7/i)
assert.match(stream,/timeout|timed out|deadline exceeded|Killed|超时/i)
const messages=(await api(`/api/v1/messages/${session.id}/load`)).data
const content=messages.filter(m=>m.role==='assistant').map(m=>m.content).join('\n')
assert.match(content,/PETER_RECOVERED/)
record('Real sandbox nonzero exit and deadline errors recover for a subsequent command',{session:session.id})
const binding=await request(`/api/v1/sessions/${state.alexKBSession}`,'PUT',{title:'Alex · 情况分析',customer_knowledge_base_id:state.benKB})
assert.ok(binding.ok) // Native updates allow only title/description; binding is ignored.
assert.equal((await api(`/api/v1/sessions/${state.alexKBSession}`)).data.customer_knowledge_base_id,state.alexKB)
record('Existing customer conversation binding cannot be reassigned to a different customer')
