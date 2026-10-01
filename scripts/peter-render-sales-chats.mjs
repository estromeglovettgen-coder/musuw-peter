// Render authored business-demo conversations with exact text, using one
// reusable chat template. The source manifest preserves their provenance.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(process.argv[2] || 'artifacts/peter-sales-demo-20261001')
const source = JSON.parse(readFileSync(resolve(root, 'conversations.json'), 'utf8'))
if (source.provenance?.kind !== 'authored_business_demo') throw new Error('Source provenance is required')
const output = resolve(root, 'screenshots')
mkdirSync(output, { recursive: true })
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const avatar = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="14" r="7"/><path d="M7 35c0-9 6-14 13-14s13 5 13 14"/></svg>'
const styles = `
*{box-sizing:border-box}html,body{margin:0;background:#ededed;color:#171717;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}
.phone{width:750px}.status{height:56px;padding:12px 40px 0;display:flex;align-items:center;justify-content:space-between;font-size:25px;font-weight:600;background:#f5f5f5}
.signal{font-size:21px;letter-spacing:3px}.header{height:104px;display:flex;align-items:center;justify-content:space-between;background:#f5f5f5;padding:0 30px;border-bottom:1px solid #dcdcdc}
.back{width:60px;font-size:60px;font-weight:300;line-height:1}.name{font-size:35px;font-weight:600}.more{width:60px;font-size:37px;text-align:right;letter-spacing:3px}
.thread{padding:28px 22px 24px}.date{text-align:center;color:#8b8b8b;font-size:22px;margin:0 0 29px}
.message{display:flex;align-items:flex-start;gap:17px;margin-bottom:28px}.out{flex-direction:row-reverse}.avatar{height:70px;width:70px;flex-shrink:0;border-radius:9px;background:#c9d5d5;padding:13px;color:#576c6d}.out .avatar{background:#d3ded0;color:#65815b}.avatar svg{width:100%;height:100%;fill:currentColor}
.bubble{position:relative;max-width:530px;min-height:68px;padding:16px 20px;border-radius:9px;background:#fff;font-size:29px;line-height:1.52;overflow-wrap:anywhere;white-space:pre-wrap}
.bubble:before{content:"";position:absolute;top:23px;left:-10px;border-top:11px solid transparent;border-bottom:11px solid transparent;border-right:11px solid #fff}.out .bubble{background:#95ec69}.out .bubble:before{left:auto;right:-10px;border-right:0;border-left:11px solid #95ec69}
.separator{text-align:center;font-size:20px;color:#909090;margin:12px 0 25px}.source{text-align:center;font-size:18px;color:#919191;padding:6px 0 19px;letter-spacing:1px}
.composer{height:104px;padding:19px 22px;display:flex;gap:20px;align-items:center;border-top:1px solid #d8d8d8;background:#f7f7f7;font-size:47px}.composer .input{height:64px;border-radius:8px;background:white;flex:1}.voice{height:45px;width:45px;border:3px solid #2d2d2d;border-radius:50%;font-size:26px;display:grid;place-items:center}.smile{height:43px;width:43px;border:3px solid #2d2d2d;border-radius:50%;font-size:30px;line-height:36px;text-align:center}.plus{height:43px;width:43px;border:3px solid #2d2d2d;border-radius:50%;font-size:38px;line-height:34px;text-align:center}
`
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 750, height: 1800 }, deviceScaleFactor: 1 })
const manifest = { provenance: source.provenance, customers: [], count: 0 }
try {
  for (const [customerIndex, customer] of source.customers.entries()) {
    const rendered = { name: customer.name, files: [] }
    for (const [pageIndex, chat] of customer.pages.entries()) {
      const id = `${String(customerIndex + 1).padStart(2, '0')}-${String(pageIndex + 1).padStart(2, '0')}`
      const file = `${id}-${customer.name}-${chat.stage}.png`
      let previousTime = ''
      const messages = chat.messages.map((message, index) => {
        if (![customer.name, 'Peter'].includes(message.speaker)) throw new Error(`Unknown speaker ${message.speaker}`)
        const separator = index > 0 && message.time && previousTime && Number(message.time.replace(':', '')) - Number(previousTime.replace(':', '')) > 10
          ? `<div class="separator">${escape(message.time)}</div>` : ''
        previousTime = message.time || previousTime
        return `${separator}<div class="message ${message.speaker === 'Peter' ? 'out' : 'in'}" data-speaker="${escape(message.speaker)}"><div class="avatar">${avatar}</div><div class="bubble">${escape(message.text)}</div></div>`
      }).join('')
      const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><style>${styles}</style><div class="phone"><div class="status"><span>${escape(chat.time || chat.messages[0]?.time || '10:00')}</span><span class="signal">▮▮▮  ▰</span></div><div class="header"><span class="back">‹</span><span class="name">${escape(customer.name)}</span><span class="more">···</span></div><div class="thread"><div class="date">${escape(chat.date)} ${escape(chat.time || chat.messages[0]?.time || '')}</div>${messages}</div><div class="source">业务演示 · ${pageIndex + 1} / ${customer.pages.length}</div><div class="composer"><span class="voice">)))</span><span class="input"></span><span class="smile">⌣</span><span class="plus">+</span></div></div></html>`
      await page.setContent(html)
      await page.evaluate(() => document.fonts.ready)
      const height = await page.locator('.phone').evaluate(el => el.getBoundingClientRect().height)
      await page.setViewportSize({ width: 750, height: Math.ceil(height) })
      await page.locator('.phone').screenshot({ path: resolve(output, file) })
      rendered.files.push({ file, path: resolve(output, file), stage: chat.stage, date: chat.date, messages: chat.messages.length, width: 750, height: Math.ceil(height) })
      manifest.count++
    }
    manifest.customers.push(rendered)
  }
} finally {
  await browser.close()
}
if (!process.argv[2] && (manifest.count !== 50 || manifest.customers.length !== 10)) throw new Error('Expected 50 screenshots for 10 customers')
writeFileSync(resolve(root, 'screenshots.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Rendered ${manifest.count} screenshots for ${manifest.customers.length} customers into ${output}`)
