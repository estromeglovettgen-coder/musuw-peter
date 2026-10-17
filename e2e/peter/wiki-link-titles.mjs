// Real Peter Wiki acceptance: read existing data; do not regenerate or edit it.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
const origin=process.env.PETER_FIRE_ORIGIN||'http://127.0.0.1:4217'
const out=process.env.PETER_FIRE_ARTIFACTS||'artifacts/fire-ui-implementation-20261017/wiki-links'
mkdirSync(out,{recursive:true})
const a=JSON.parse(readFileSync('.runtime/peter/deployment/account.json','utf8'))
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']})
const ctx=await browser.newContext({ignoreHTTPSErrors:true,locale:'zh-CN',viewport:{width:1440,height:1000}})
const errors=[],requests=[]
try{
 const auth=await(await ctx.request.post(origin+'/api/v1/auth/login',{data:{email:a.email,password:a.password}})).json();assert.equal(auth.success,true)
 await ctx.addInitScript(({token,refresh})=>{localStorage.setItem('weknora_token',token);localStorage.setItem('weknora_refresh_token',refresh);localStorage.setItem('locale','zh-CN')},{token:auth.token,refresh:auth.refresh_token})
 const page=await ctx.newPage();page.setDefaultTimeout(30000)
 await page.addLocatorHandler(page.locator('.guide__skip'),b=>b.click())
 page.on('pageerror',e=>errors.push(e.message))
 page.on('request',r=>{const u=new URL(r.url());if(u.pathname==='/api/v1/knowledge/batch'||/^\/api\/v1\/knowledgebase\/[^/]+\/wiki\/graph$/.test(u.pathname))requests.push(u.pathname)})
 const path='/platform/knowledge-bases/961f9976-ae42-4bc4-bafe-1dfa4506f0c9?tab=wiki&slug=concept/curiosity'
 const titles=['真男人不要输在表达上 · 第一章 第二节 生命力与所谓“生理性吸引”','第11课 · 头像评价与私信：降低距离、真实反馈与个人判断']
 for(const [mode,size] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
  await page.setViewportSize(size);await page.goto(origin+path,{waitUntil:'domcontentloaded'})
  await page.locator('.wiki-reader-title').filter({hasText:'好奇心'}).waitFor()
  for(const title of titles)await page.locator('.wiki-reader-footer .wiki-content-link').filter({hasText:title}).first().waitFor()
  const labels=await page.locator('.wiki-reader-footer-row').first().locator('.wiki-content-link').allTextContents()
  assert.equal(labels.some(label=>/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(label.trim())),false)
  await page.screenshot({path:out+'/backlinks-'+mode+'.png',fullPage:true,animations:'disabled'})
 }
 const summaryResponse=page.waitForResponse(r=>decodeURIComponent(new URL(r.url()).pathname).endsWith('/wiki/pages/summary/93c1599a-17f9-4045-b7a5-ed4a65f7cbd7'))
 await page.locator('.wiki-reader-footer .wiki-content-link').filter({hasText:titles[1]}).click()
 await page.locator('.wiki-reader-title').filter({hasText:'第11课'}).waitFor()
 const response=await summaryResponse;assert.equal(response.status(),200);const result=await response.json();assert.equal((result.data||result).slug,'summary/93c1599a-17f9-4045-b7a5-ed4a65f7cbd7')
 assert.deepEqual(errors,[])
 assert.equal(requests.filter(p=>p.endsWith('/wiki/graph')).length,0)
 writeFileSync(out+'/acceptance.json',JSON.stringify({accepted:true,origin,desktop:true,mobile:true,click_correct_summary:true,errors,batch_requests:requests.filter(p=>p==='/api/v1/knowledge/batch').length,graph_requests:0},null,2))
 console.log('PASS Chinese backlink titles on desktop/mobile, original summary link, no graph API or page error')
}finally{await browser.close()}
