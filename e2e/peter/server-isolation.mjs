import {api,request,login,origin,state,record,runtime} from './server-client.mjs'
import {randomBytes} from 'node:crypto'
import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
await login()
const path=runtime+'/isolation-account.json'
const account=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{username:'isolation-acceptance',email:'peter-isolation@example.test',password:'Pt9!'+randomBytes(16).toString('base64url')}
writeFileSync(path,JSON.stringify(account),{mode:0o600})
const user=(await api('/api/v1/system/admin/users/create','POST',account)).user
const signed=await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(account)}).then(r=>r.json())
assert.ok(signed.token)
const paths=[`/api/v1/knowledge-bases/${state.alexKB}`,`/api/v1/models/${state.chatModel}`,`/api/v1/sandbox-configs/${state.sandbox}`,`/api/v1/sessions/${state.reportSession}`,`/api/v1/sessions/${state.reportSession}/messages/${state.reportMessage}/artifacts/0/download`,'/api/v1/system/admin/list']
try{
 for(const path of paths){
  const result=await fetch(origin+path,{headers:{authorization:`Bearer ${signed.token}`}})
  const text=await result.text()
  console.log('DENIED',result.status,path)
  assert.ok([403,404].includes(result.status))
  assert.ok(!text.includes('ALEX-7319'))
 }
 record('Separate native account cannot read Peter customer, model, sandbox, session, artifact or system administration')
}finally{
 const removed=await request('/api/v1/system/admin/users/'+user.id,'DELETE')
 console.log('Temporary isolation account cleanup',removed.status)
 assert.equal(removed.status,202)
}
