import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {runtime,state,record,api,login,save} from './server-client.mjs'
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
const browser=await chromium.launch({headless:true,channel:'chrome'})
const context=await browser.newContext({locale:'zh-CN',storageState:runtime+'/browser-auth.json',viewport:{width:1440,height:1000}})
const page=await context.newPage()
const errors=[]
page.on('pageerror',e=>{errors.push(e.stack);console.log('PAGEERROR',e.stack)})
page.on('response',r=>{if(r.status()>=400 && r.url().includes('/api/'))console.log('HTTP',r.status(),r.url().replace(/\?.*/,''))})
await page.addLocatorHandler(page.getByRole('button',{name:'跳过引导',exact:true}).first(),async button=>{await button.click()})
const go=async path=>{await page.goto('https://62.234.188.55'+path,{waitUntil:'domcontentloaded'});await page.getByText('工作区',{exact:true}).first().waitFor({timeout:60000})}
try {
  await go('/platform/customers')
  await page.getByText('Alex（验收演示）',{exact:true}).waitFor({timeout:30000})
  await page.getByRole('button',{name:'客户设置',exact:true}).click()
  const edit = page.getByRole('button',{name:'编辑模板 课程咨询（验收模板）',exact:true});
  await page.getByText('客户类型模板',{exact:true}).waitFor();
  if(await edit.count()) await edit.click(); else await page.getByRole('button',{name:'新建模板',exact:true}).click()
  console.log('TEMPLATE', (await page.locator('body').innerText()).slice(-11000))
  console.log('FIELDS',await page.locator('input,textarea').evaluateAll(xs=>xs.map(x=>({tag:x.tagName,type:x.type,placeholder:x.placeholder,value:x.type==='password'?'':x.value}))))
  await page.screenshot({path:runtime+'/customer-template-editor.png',fullPage:true})
  for (const label of ['图像处理','音频处理','模型配置','知识图谱','Wiki 与检索']) {
    await page.locator('.visual-settings-nav__item').filter({hasText:label}).click()
    console.log('SECTION',label,(await page.locator('.kb-settings-scroll').innerText()).slice(0,1000))
  }
  record('Customer template editor and image/audio/model/graph sections render in browser')
  await page.locator('.visual-settings-nav__item').filter({hasText:'模板配置'}).click()
  await page.getByPlaceholder('例如：课程咨询、学员交付').fill('课程咨询（验收模板）')
  await page.getByPlaceholder('这套模板适用于哪些客户').fill('首次课程咨询：保留原话、分析时间与费用顾虑。')
  await page.getByPlaceholder('需要持续保留的背景或注意事项').fill('先确认具体困难，再介绍课程安排。')
  await page.getByRole('button',{name:'完成配置',exact:true}).click();
  await page.getByRole('button',{name:'完成配置',exact:true}).waitFor({state:'hidden'})
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/tenants/kv/customer-config') && r.request().method()==='PUT' && r.ok()),page.getByRole('button',{name:'保存',exact:true}).click()])
  await login()
  const config=(await api('/api/v1/tenants/kv/customer-config')).data
  assert.ok(config.templates.find(t=>t.name==='课程咨询（验收模板）'))
  record('Customer template created and persisted entirely through browser')
  await page.getByRole('button',{name:'客户设置',exact:true}).click()
  await page.getByText('状态与标签',{exact:true}).click()
  await page.getByRole('button',{name:/拖动排序 待了解/}).dragTo(page.locator('.choice').filter({hasText:'服务中'}))
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/v1/tenants/kv/customer-config') && r.request().method()==='PUT' && r.ok()),page.getByRole('button',{name:'保存',exact:true}).click()])
  const ordered=(await api('/api/v1/tenants/kv/customer-config')).data
  assert.equal(ordered.statuses[0],'待了解')
  record('Customer status drag-and-drop order persisted')
  await page.getByRole('button',{name:'新建客户',exact:true}).click()
  await page.locator('input[placeholder="选择模板，一键套用配置"]').click()
  await page.getByText('课程咨询（验收模板）',{exact:true}).last().click()
  await page.getByPlaceholder('例如：Alex').fill('Casey（验收演示）')
  assert.equal(await page.getByPlaceholder('需要持续保留的背景或注意事项').inputValue(),'先确认具体困难，再介绍课程安排。')
  await page.locator('.visual-settings-nav__item').filter({hasText:'聊天资料'}).click()
  await page.locator('input[type=file]').setInputFiles({name:'Casey-chat.md',mimeType:'text/markdown',buffer:Buffer.from('# Casey 聊天记录（虚构）\nCasey：我是老师，想改善表达。预算 700 元，每周六有时间。确认码 CASEY-9032。')})
  const created=page.waitForResponse(r=>r.url().endsWith('/api/v1/knowledge-bases')&&r.request().method()==='POST'&&r.ok())
  await page.getByRole('button',{name:'创建客户',exact:true}).click()
  const customer=(await (await created).json()).data; state.caseyKB=customer.id; save()
  await page.waitForURL('**/platform/customers/'+customer.id,{timeout:60000})
  await page.getByText('Casey（验收演示）',{exact:true}).first().waitFor()
  assert.equal(customer.customer_profile.note,'先确认具体困难，再介绍课程安排。')
  record('One-click customer template with optional source upload creates a real customer', {kb:customer.id})
  assert.deepEqual(errors,[])

} finally {
  console.log('FINAL_DOM', (await page.locator('body').innerText()).slice(-4500))
  await page.screenshot({path:runtime+'/browser-final.png',fullPage:true})
  await context.storageState({path:runtime+'/browser-auth.json'})
  writeFileSync(runtime+'/browser-errors.json',JSON.stringify(errors,null,2))
  await browser.close()
}
