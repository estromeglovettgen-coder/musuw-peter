import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {runtime,state,save,record,login,api} from './server-client.mjs'
import assert from 'node:assert/strict'
await login()
const before=(await api(`/api/v1/knowledge-bases/${state.alexKB}/knowledge?page=1&page_size=100`)).data || []
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({storageState:runtime+'/browser-auth.json',locale:'zh-CN',viewport:{width:1440,height:1000}})
const page=await context.newPage();const errors=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await page.addLocatorHandler(page.getByRole('button',{name:'跳过引导',exact:true}).first(),b=>b.click())
try{
 await page.goto('https://62.234.188.55/platform/creatChat',{waitUntil:'domcontentloaded'})
 await page.locator('.visual-chat-composer__combined-picker').click({timeout:60000})
 await page.locator('.visual-model-selector__chat-row.is-agent').hover()
 await page.getByRole('option').filter({hasText:'Peter 销售助手'}).click()
 await page.locator('.visual-chat-composer__textarea').fill('@')
 await page.locator('.visual-mention-group-entry').filter({hasText:'客户'}).click()
 await page.locator('.visual-mention-item').filter({hasText:'Alex（验收演示）'}).click()
 await page.locator('.visual-chat-composer__native-file').setInputFiles(runtime+'/alex-image.png')
 await page.locator('.visual-chat-composer__textarea').fill('请识别本次聊天截图里的识别码和需求，再检索当前客户资料，说出已确认的预算。不要使用其他客户的信息。')
 const responsePromise=page.waitForResponse(r=>r.url().includes('/api/v1/agent-chat/')&&r.request().method()==='POST',{timeout:180000})
 await page.locator('.visual-chat-composer__send').click()
 const response=await responsePromise
 assert.ok(response.ok())
 await response.finished()
 state.imageChatSession=page.url().split('/chat/')[1];save()
 const session=(await api('/api/v1/sessions/'+state.imageChatSession)).data
 assert.equal(session.customer_knowledge_base_id,state.alexKB)
 const messages=(await api(`/api/v1/messages/${state.imageChatSession}/load`)).data
 const answer=messages.filter(m=>m.role==='assistant').map(m=>m.content).join('\n')
 console.log('ANSWER',answer)
 assert.match(answer,/IMG-4582/);assert.match(answer,/800/)
 const after=(await api(`/api/v1/knowledge-bases/${state.alexKB}/knowledge?page=1&page_size=100`)).data || []
 const added=after.filter(d=>!before.some(b=>b.id===d.id))
 assert.ok(added.some(d=>/alex-image/.test(d.file_name||d.title)), 'original screenshot must be in customer sources')
 state.archivedImageDoc=added.find(d=>/alex-image/.test(d.file_name||d.title)).id;save()
 assert.deepEqual(errors,[])
 record('Browser @ customer + screenshot produces grounded DeepSeek reply, immutable binding and original source archival',{session:state.imageChatSession,document:state.archivedImageDoc})
}finally{
 console.log('FINAL',page.url(),(await page.locator('body').innerText()).slice(-3500),'ERRORS',errors)
 await page.screenshot({path:runtime+'/browser-chat.png',fullPage:true})
 await context.storageState({path:runtime+'/browser-auth.json'})
 await browser.close()
}
