import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const requireFrontend = createRequire(new URL('../weknora/frontend/package.json', import.meta.url))
const { buildSync } = requireFrontend('esbuild')

function mountModule(workspace: boolean): string {
  const contents = workspace
    ? `import { createApp, h } from 'vue'; createApp({render: () => h('main', 'Application ready')}).mount('#app');`
    : `import { createElement } from 'react'; import { createRoot } from 'react-dom/client'; createRoot(document.getElementById('root')).render(createElement('main', null, 'Application ready'));`
  return buildSync({
    stdin: { contents, resolveDir: fileURLToPath(new URL('../weknora/frontend/', import.meta.url)) },
    bundle: true, write: false, format: 'esm', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  }).outputFiles[0].text
}

// The browser receives the actual entry HTML. Only network dependencies are
// fixtures, so config/module outages require no real credentials or services.
for (const [name, entry] of [['workspace', 'weknora/frontend/index.html'], ['sign-in', 'auth/index.html']]) {
  const file = process.env.MUSUW_STARTUP_BUILT === '1' ? entry.replace('index.html', 'dist/index.html') : entry
  const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const mainTag = html.match(/<script\b[^>]*>/g)?.find(tag => /type=["']module["']/.test(tag))
  const mainSource = mainTag?.match(/src=["']([^"']+)["']/)?.[1]
  if (!mainSource) throw new Error(`Module entry missing in ${file}`)
  const mainPath = new URL(mainSource, 'http://musuw-startup.test/').pathname
  const mount = mountModule(name === 'workspace')

  async function fixture(page: Page, mode: 'config-pending' | 'module-pending' | 'module-fail' | 'runtime-fail' | 'ready') {
    let current = mode
    await page.route('**/*', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: html })
      if (path === '/config.js' && current === 'config-pending') return
      if (path === mainPath) {
        if (current === 'module-pending') return
        if (current === 'module-fail') return route.abort('failed')
        return route.fulfill({ contentType: 'application/javascript', body: current === 'runtime-fail' ? "Promise.reject(new Error('fixture bootstrap failure'))" : mount })
      }
      return route.fulfill({ contentType: path.endsWith('.css') ? 'text/css' : 'application/javascript', body: '' })
    })
    return { ready() { current = 'ready' } }
  }

  test(`${name}: renders feedback while configuration is unavailable`, async ({ page }) => {
    await fixture(page, 'config-pending')
    await page.goto('http://musuw-startup.test/', { waitUntil: 'commit' })
    await expect(page.getByText('正在打开 Musuw…')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  })

  test(`${name}: slow module gives a retry without declaring the session invalid`, async ({ page }) => {
    await page.clock.install()
    await fixture(page, 'module-pending')
    await page.goto('http://musuw-startup.test/', { waitUntil: 'commit' })
    await expect(page.getByText('正在打开 Musuw…')).toBeVisible()
    await page.clock.fastForward(10_001)
    await expect(page.getByText('连接比平时慢，你可以继续等待或重试。')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
  })

  for (const failure of ['module-fail', 'runtime-fail'] as const) {
    test(`${name}: ${failure} recovers through reload and framework mount removes feedback`, async ({ page }) => {
      const network = await fixture(page, failure)
      await page.goto('http://musuw-startup.test/', { waitUntil: 'commit' })
      await expect(page.getByText('页面未能加载，请检查网络后重试。')).toBeVisible()
      network.ready()
      await page.getByRole('button', { name: '重试' }).click()
      await expect(page.getByText('Application ready')).toBeVisible()
      await expect(page.locator('#musuw-startup')).toHaveCount(0)
      await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error')))
      await expect(page.getByText('Application ready')).toBeVisible()
      await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0)
    })
  }

  test(`${name}: saved English preference and reduced motion are respected`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('locale', 'en-US'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await fixture(page, 'module-pending')
    await page.goto('http://musuw-startup.test/', { waitUntil: 'commit' })
    await expect(page.getByText('Opening Musuw…')).toBeVisible()
    expect(await page.locator('.startup-progress').evaluate(node => getComputedStyle(node).animationName)).toBe('none')
  })
}
