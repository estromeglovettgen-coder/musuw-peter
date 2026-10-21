import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./operations-main.ts', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '').replace('void i18nReady', 'return i18nReady')
const start = new Function('createApp', 'createPinia', 'OperationsApp', 'i18n', 'i18nReady', 'installTDesignIconOfflineGuard', 'installTDesignServices', 'console', source)

for (const failed of [false, true]) {
  test(`operations still mounts with complete fallback messages when locale load ${failed ? 'fails' : 'succeeds'}`, async () => {
    const mounted = []
    const app = { config: {}, use() {}, mount(target) { mounted.push(target) } }
    const locale = { global: { locale: { value: 'ko-KR' } } }
    const ready = failed ? Promise.reject(new Error('dictionary download failed')) : Promise.resolve()
    const done = start(() => app, () => ({}), {}, locale, ready, () => {}, () => {}, {error() {}, warn() {}})
    assert.equal(mounted.length, 0)
    await done
    assert.deepEqual(mounted, ['#operations-app'])
    assert.equal(locale.global.locale.value, failed ? 'zh-CN' : 'ko-KR')
  })
}
