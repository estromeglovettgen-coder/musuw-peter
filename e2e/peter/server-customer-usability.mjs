// Live browser checks with controlled response delays/errors. These fault
// injections affect only this browser; server data is not changed.
import assert from 'node:assert/strict'
import {writeFileSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {origin, runtime} from './server-client.mjs'

const browser = await chromium.launch({channel:'chrome', headless:true})
const context = await browser.newContext({storageState:runtime+'/browser-auth.json', locale:'zh-CN', viewport:{width:820,height:1000}})
const page = await context.newPage()
const results = []
const listURL = origin + '/api/v1/knowledge-bases'
const open = async () => {
  await page.goto(origin+'/platform/customers', {waitUntil:'domcontentloaded'})
  await page.locator('.customer-table tbody tr').first().waitFor({timeout:60000})
}
async function check(name, run) {
  try { await open(); await run(); results.push({name, pass:true}); console.log('PASS',name) }
  catch(error) { results.push({name, pass:false, error:error.message}); console.log('FAIL',name,error.message) }
  finally { await page.unroute(listURL); writeFileSync(runtime+'/customer-usability.json',JSON.stringify(results,null,2)) }
}
try {
  await check('Narrow customer search retains a usable width', async () => {
    const box = await page.getByPlaceholder('搜索姓名、标签或联系方式').boundingBox()
    assert.ok(box.width >= 200, `search width is ${box.width}px`)
  })
  await check('Customer search accepts surrounding whitespace and case differences', async () => {
    await page.getByPlaceholder('搜索姓名、标签或联系方式').fill('  aLeX  ')
    assert.equal(await page.locator('.customer-table tbody tr').count(),1)
    assert.match(await page.locator('.customer-table').innerText(),/Alex/)
  })
  await check('No-match state lets Peter clear filters in one action', async () => {
    await page.getByPlaceholder('搜索姓名、标签或联系方式').fill('NO_CUSTOMER_MATCH_6294')
    await page.getByRole('button',{name:'清除筛选',exact:true}).click({timeout:2000})
    assert.ok(await page.locator('.customer-table tbody tr').count()>=3)
  })
  await check('Refreshing keeps existing rows visible while waiting and after an error', async () => {
    let release
    const gate = new Promise(resolve => {release=resolve})
    let entered
    const requested = new Promise(resolve=>{entered=resolve})
    await page.route(listURL,async route => {
      entered(); await gate
      await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:{code:503,message:'验收：暂时不可用'}})})
    })
    try {
      await page.getByRole('button',{name:'刷新',exact:true}).click()
      await requested
      assert.ok(await page.locator('.customer-table tbody tr').count()>=3,'rows disappeared during refresh')
    } finally { release() }
    await page.getByRole('button',{name:'重新加载',exact:true}).waitFor()
    assert.ok(await page.locator('.customer-table tbody tr').count()>=3,'rows disappeared after refresh error')
    await page.unroute(listURL)
    await page.getByRole('button',{name:'重新加载',exact:true}).click()
    await page.getByRole('button',{name:'重新加载',exact:true}).waitFor({state:'hidden'})
  })
  await page.screenshot({path:runtime+'/customer-usability-final.png',fullPage:true})
} finally { await delay(50); await browser.close() }
assert.ok(results.every(x=>x.pass), `${results.filter(x=>!x.pass).length} customer usability checks failed`)
