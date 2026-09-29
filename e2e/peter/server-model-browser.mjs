import assert from 'node:assert/strict'
import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {runtime, record} from './server-client.mjs'
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext({storageState:runtime+'/browser-auth.json',locale:'zh-CN',viewport:{width:1440,height:1000}})
const page=await context.newPage(), errors=[]
page.on('pageerror',error=>errors.push(error.message))
await page.addLocatorHandler(page.getByRole('button',{name:'跳过引导',exact:true}).first(),button=>button.click())
try {
  await page.goto('https://62.234.188.55/platform/settings?section=models',{waitUntil:'domcontentloaded'})
  await page.locator('.visual-model-card').filter({has:page.getByRole('heading',{name:'DeepSeek Flash',exact:true})}).click({timeout:60000})
  await page.getByRole('button',{name:'测试连接',exact:true}).click()
  await page.locator('.footer-test-message.success').waitFor({timeout:120000})
  await page.screenshot({path:runtime+'/browser-model-connection.png',fullPage:true})
  await page.locator('.setting-drawer__footer').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('button',{name:'测试连接',exact:true}).waitFor({state:'hidden'})
  await page.reload({waitUntil:'domcontentloaded'})
  await page.locator('.visual-model-card').filter({has:page.getByRole('heading',{name:'DeepSeek Flash',exact:true})}).click({timeout:60000})
  await page.getByRole('button',{name:'测试连接',exact:true}).click()
  await page.locator('.footer-test-message.success').waitFor({timeout:120000})
  assert.deepEqual(errors,[])
  record('Browser model connection test and edit/save/reload retain the encrypted DeepSeek credential')
} finally { await browser.close() }
