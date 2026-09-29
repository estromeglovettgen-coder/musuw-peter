import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {origin, runtime, state} from './server-client.mjs'

const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({storageState:runtime+'/browser-auth.json',locale:'zh-CN',viewport:{width:1440,height:1000}})
const results=[]
async function check(name,run) {
  const page=await context.newPage()
  try { await run(page); results.push({name,pass:true}); console.log('PASS',name) }
  catch(error) {results.push({name,pass:false,error:error.message});console.log('FAIL',name,error.message)}
  finally {await page.close();writeFileSync(runtime+'/customer-feedback.json',JSON.stringify(results,null,2))}
}
const customer=origin+'/platform/customers/'+state.alexKB
try {
  await check('Only the visible customer tab is announced as current',async page=>{
    await page.goto(customer+'?tab=wiki',{waitUntil:'domcontentloaded'})
    await page.locator('.wiki-browser').waitFor({timeout:60000})
    assert.equal(await page.locator('.customer-project-tabs a[aria-current="page"]').count(),1)
    assert.equal(await page.locator('.customer-project-tabs a[aria-current="page"]').innerText(),'Wiki')
  })
  await check('Keyboard-focused conversation action is visible and has a name',async page=>{
    await page.goto(customer,{waitUntil:'domcontentloaded'})
    const action=page.locator('.visual-session-row__more').first()
    await action.waitFor({timeout:60000});await action.focus();await delay(200)
    assert.ok(await action.getAttribute('aria-label'))
    assert.equal(await action.evaluate(x=>getComputedStyle(x).opacity),'1')
  })
  await check('Customer overview refreshes after parsing while Wiki generation is still running',async page=>{
    let pagesCalls=0,statsCalls=0
    const wikiBase=origin+'/api/v1/knowledgebase/'+state.alexKB+'/wiki'
    await page.route(wikiBase+'/pages?*',async route=>{
      const response=await route.fetch();const value=await response.json();pagesCalls++
      if(pagesCalls===1) { const result=value.data||value; result.pages=[];result.total=0;result.total_pages=0 }
      await route.fulfill({response,json:value})
    })
    await page.route(wikiBase+'/stats',async route=>{
      const response=await route.fetch();const value=await response.json();statsCalls++
      const result=value.data||value;result.pending_tasks=statsCalls===1 ? 1 : 0;result.is_active=statsCalls===1
      await route.fulfill({response,json:value})
    })
    await page.goto(customer,{waitUntil:'domcontentloaded'})
    await page.getByRole('heading',{name:'客户画像',exact:true}).waitFor({timeout:60000})
    await page.locator('.customer-profile-markdown').waitFor({timeout:12000})
    assert.ok(pagesCalls>=2 && statsCalls>=2,'overview must follow the existing Wiki processing status until completion')
  })
  await check('A failed follow-up save retains the entered record for retry',async page=>{
    await page.goto(customer+'?tab=timeline',{waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'添加记录',exact:true}).click({timeout:60000})
    const title=page.getByPlaceholder('例如：9 月 28 日课程咨询')
    const content=page.getByPlaceholder('粘贴聊天原文或记录实际发生的情况，可注明沟通时间与说话人。')
    await title.fill('错误反馈测试（不入库）');await content.fill('模拟保存失败后必须保留的跟进原文。')
    let intercepted=false
    await page.route(origin+'/api/v1/knowledge-bases/'+state.alexKB+'/knowledge/manual',async route=>{
      intercepted=true
      await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:{code:503,message:'验收：保存暂时不可用'}})})
    })
    await page.getByRole('button',{name:'保存并整理',exact:true}).click()
    await page.getByText('验收：保存暂时不可用',{exact:false}).first().waitFor({timeout:5000})
    assert.ok(intercepted)
    assert.equal(await title.inputValue(),'错误反馈测试（不入库）')
    assert.equal(await content.inputValue(),'模拟保存失败后必须保留的跟进原文。')
  })
  await check('Customer overview respects a disabled Wiki without making failing requests',async page=>{
    let wikiCalls=0
    await page.route(origin+'/api/v1/knowledge-bases/'+state.alexKB,async route=>{
      const response=await route.fetch();const value=await response.json()
      value.data.indexing_strategy.wiki_enabled=false
      await route.fulfill({response,json:value})
    })
    await page.route(origin+'/api/v1/knowledgebase/'+state.alexKB+'/wiki/**',async route=>{
      wikiCalls++
      await route.fulfill({status:400,json:{error:'Wiki feature is not enabled for this knowledge base'}})
    })
    await page.goto(customer,{waitUntil:'domcontentloaded'})
    await page.getByText('未启用 Wiki 整理',{exact:true}).waitFor({timeout:60000})
    assert.equal(wikiCalls,0)
    assert.equal(await page.locator('.customer-profile-markdown').count(),0)
    assert.equal(await page.getByText('部分资料未能读取，可刷新重试。',{exact:true}).count(),0)
  })
}finally{await browser.close()}
assert.ok(results.every(x=>x.pass),`${results.filter(x=>!x.pass).length} customer feedback checks failed`)
