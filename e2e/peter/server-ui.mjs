import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {runtime,state,record} from './server-client.mjs'
import assert from 'node:assert/strict'
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({storageState:runtime+'/browser-auth.json',locale:'zh-CN',viewport:{width:1440,height:1000}})
const page=await context.newPage(); const errors=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
await page.addLocatorHandler(page.getByRole('button',{name:'跳过引导',exact:true}).first(),b=>b.click())
const go=async path=>{await page.goto('https://62.234.188.55'+path,{waitUntil:'domcontentloaded'});await page.getByText('工作区',{exact:true}).first().waitFor({timeout:60000})}
try{
 await go('/platform/customers/'+state.alexKB)
 await page.getByRole('heading',{name:'客户画像',exact:true}).waitFor({timeout:60000})
 assert.match(await page.locator('.customer-profile-markdown').innerText(),/Alex|亚历克斯/)
 for (let i=0;i<2;i++) {
  await page.locator('.customer-project-tabs').getByRole('link',{name:'Wiki',exact:true}).click()
  await page.locator('.wiki-browser').waitFor({timeout:60000})
  assert.equal(await page.locator('.wiki-graph').count(),0)
  await page.locator('.customer-project-tabs').getByRole('link',{name:'图谱',exact:true}).click()
  await page.locator('.wiki-graph-canvas canvas').first().waitFor({timeout:60000})
  assert.equal(await page.locator('.customer-project-tabs a').count(),6)
 }
 await page.reload({waitUntil:'domcontentloaded'})
 await page.locator('.wiki-graph-canvas canvas').first().waitFor({timeout:60000})
 await page.locator('.customer-project-tabs').getByRole('link',{name:'Wiki',exact:true}).click()
 await page.goBack({waitUntil:'domcontentloaded'})
 await page.locator('.wiki-graph-canvas canvas').first().waitFor()
 await page.goForward({waitUntil:'domcontentloaded'})
 await page.locator('.wiki-browser').waitFor()
 assert.equal(await page.locator('.wiki-graph').count(),0)
 record('Production bundle opens customer detail; Wiki/graph tabs, refresh and history stay consistent')
 await go('/platform/knowledge-bases')
 await page.getByText('销售方法（验收演示）',{exact:true}).first().waitFor()
 assert.equal(await page.getByText('Alex（验收演示）',{exact:true}).count(),0)
 record('Customer libraries are separated from the public knowledge library list')
 await go('/platform/creatChat')
 const composer=page.locator('.visual-chat-composer__textarea')
 await composer.fill('@')
 await page.locator('.visual-mention-menu').waitFor()
 console.log('MENTIONS',await page.locator('.visual-mention-menu').innerText())
 await page.locator('.visual-mention-group-entry').filter({hasText:'客户'}).click()
 await page.locator('.visual-mention-item').filter({hasText:'Alex（验收演示）'}).click()
 const chip=page.locator('.visual-chat-resource__link').filter({hasText:'Alex（验收演示）'})
 assert.ok((await chip.getAttribute('href')).includes('/customers/'+state.alexKB))
 await chip.click()
 await page.getByRole('heading',{name:'Alex（验收演示）',exact:true}).waitFor()
 record('Home-page @ customer selection and clickable resource chip open the bound customer')
 for(const section of ['models','sandbox','skills','envvars']) {
  await go('/platform/settings?section='+section)
  console.log('SETTINGS',section,(await page.locator('body').innerText()).slice(-2500))
  await page.screenshot({path:runtime+'/settings-'+section+'.png',fullPage:true})
 }
 assert.deepEqual(errors,[])
 record('Model, sandbox, skills and personal credentials settings render without console errors')
}finally{
 console.log('FINAL',page.url(),(await page.locator('body').innerText()).slice(-2500),'ERRORS',errors)
 await page.screenshot({path:runtime+'/browser-ui-final.png',fullPage:true})
 await context.storageState({path:runtime+'/browser-auth.json'})
 await browser.close()
}
