import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {runtime,state,save,record,api,login} from './server-client.mjs'
import assert from 'node:assert/strict'
await login();
if(state.danaKB) { await api('/api/v1/knowledge-bases/'+state.danaKB,'DELETE'); delete state.danaKB; save() }
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({storageState:runtime+'/browser-auth.json',locale:'zh-CN'})
const page=await context.newPage()
page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('CONSOLE',m.text())})
page.on('pageerror',e=>console.log('PAGEERROR',e.stack))
page.on('framenavigated',f=>{if(f===page.mainFrame())console.log('NAV',f.url())})
await page.addLocatorHandler(page.getByRole('button',{name:'跳过引导',exact:true}).first(),b=>b.click())
try {
 await page.goto('https://62.234.188.55/platform/customers',{waitUntil:'domcontentloaded'})
 await page.getByRole('button',{name:'新建客户',exact:true}).click({timeout:60000})
 await page.getByPlaceholder('选择模板，一键套用配置').click()
 await page.getByText('课程咨询（验收模板）',{exact:true}).last().click()
 await page.getByPlaceholder('例如：Alex').fill('Dana（验收演示）')
 assert.equal(await page.getByPlaceholder('需要持续保留的背景或注意事项').inputValue(),'先确认具体困难，再介绍课程安排。')
 await page.locator('.visual-settings-nav__item').filter({hasText:'聊天资料'}).click()
 await page.locator('input[type=file]').setInputFiles({name:'Dana-chat.md',mimeType:'text/markdown',buffer:Buffer.from('# Dana 聊天记录（虚构）\nDana：我是老师，想改善表达。预算 700 元，每周六有时间。确认码 DANA-9032。')})
 const created=page.waitForResponse(r=>r.url().endsWith('/api/v1/knowledge-bases')&&r.request().method()==='POST'&&r.ok())
 await page.getByRole('button',{name:'创建客户',exact:true}).click()
 const customer=(await (await created).json()).data;state.danaKB=customer.id;save()
 await page.waitForURL(u=>u.pathname===`/platform/customers/${customer.id}`,{timeout:30000,waitUntil:'domcontentloaded'})
 await page.getByText('Dana（验收演示）',{exact:true}).first().waitFor()
 record('Browser creates customer from saved template, uploads source and opens detail',{kb:customer.id})
}finally{
 console.log('FINAL',page.url(),(await page.locator('body').innerText()).slice(-3000))
 await page.screenshot({path:runtime+'/browser-create.png'})
 await browser.close()
}
