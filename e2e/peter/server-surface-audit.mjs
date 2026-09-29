// Read-only inventory of Peter-visible pages, including narrow-window layouts.
// Saves screenshots and geometry; does not change configuration or invoke AI.
import {chromium} from '../../.runtime/peter/deployment/browser/node_modules/playwright/index.mjs'
import {mkdirSync, writeFileSync} from 'node:fs'
import {runtime, origin, state} from './server-client.mjs'

const output = runtime + '/surface-audit'
mkdirSync(output, {recursive: true})
const browser = await chromium.launch({channel: 'chrome', headless: true})
const context = await browser.newContext({storageState: runtime + '/browser-auth.json', locale: 'zh-CN'})
const page = await context.newPage()
let pageErrors = [], failedRequests = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('response', response => {
  const url = new URL(response.url())
  if (response.status() >= 400 && url.origin === origin) failedRequests.push({path: url.pathname, status: response.status()})
})
await page.addLocatorHandler(page.getByRole('button', {name: '跳过引导', exact: true}).first(), button => button.click())
const pages = [
  ['chat', '/platform/creatChat'], ['customers', '/platform/customers'],
  ['customer', '/platform/customers/' + state.alexKB], ['libraries', '/platform/knowledge-bases'],
  ['agents', '/platform/agents'],
  ...['general','userprofile','models','mymemory','memory','mcp','integration-im','integration-embed','skills','sandbox','envvars'].map(section => [section, '/platform/settings?section=' + section]),
]
const results = []
try {
  for (const width of [1440, 1000, 820]) {
    await page.setViewportSize({width, height: 1000})
    for (const [name, path] of pages) {
      pageErrors = []; failedRequests = []
      await page.goto(origin + path, {waitUntil: 'domcontentloaded'})
      await page.getByText('工作区', {exact: true}).first().waitFor({timeout: 60000})
      await page.waitForTimeout(700) // allow layout and initial independent settings requests to settle
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        headings: [...document.querySelectorAll('h1,h2')].filter(x => x.getClientRects().length).map(x => x.textContent.trim()),
        unnamedButtons: [...document.querySelectorAll('button')].filter(x => x.getClientRects().length && !x.textContent.trim() && !x.getAttribute('aria-label') && !x.getAttribute('title')).map(x => x.className).slice(0, 15),
      }))
      const result = {name, width, path: new URL(page.url()).pathname, ...geometry, pageErrors: [...pageErrors], failedRequests: [...failedRequests]}
      results.push(result)
      console.log(JSON.stringify(result))
      await page.screenshot({path: `${output}/${name}-${width}.png`, fullPage: true})
      writeFileSync(output + '/results.json', JSON.stringify(results, null, 2))
    }
  }
} finally {
  await browser.close()
}
