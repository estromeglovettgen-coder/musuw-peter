import assert from 'node:assert/strict'
import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {runtime,state,save,record,login,api,upload} from './server-client.mjs'
const browser=await chromium.launch({channel:'chrome',headless:true})
const page=await browser.newPage({viewport:{width:900,height:400}})
await page.setContent('<html><body style="font:26px Arial;padding:30px"><h1>Alex 聊天记录（虚构验收）</h1><p>我更关心练习后的反馈，不只是理论讲解。</p><p>图片识别码：IMG-4582</p></body></html>')
const png=await page.screenshot({path:runtime+'/alex-image.png'})
await page.setContent('<html><body style="font:24px Arial;padding:30px"><h1>Service handbook</h1><p>Support reference code: HELP-280.</p><p>Support is available Monday to Friday.</p></body></html>')
const pdf=await page.pdf({path:runtime+'/service-handbook.pdf',format:'A4'})
await browser.close()
await login()
const debug=new FormData();debug.set('input','请读出图片中的识别码。');debug.set('file',new Blob([png],{type:'image/png'}),'alex-image.png')
const result=await api(`/api/v1/models/${state.visionModel}/debug`,'POST',debug)
assert.match(JSON.stringify(result),/IMG-4582/)
record('Real DeepSeek vision model reads a synthetic chat screenshot')
state.pdfDoc=(await upload(`/api/v1/knowledge-bases/${state.commonKB}/knowledge/file`,'service-handbook.pdf',pdf)).data.id;save()
record('PDF source accepted by the deployed native document pipeline',{document:state.pdfDoc})
