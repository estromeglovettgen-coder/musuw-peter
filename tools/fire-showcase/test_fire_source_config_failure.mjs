// Configuration is an authorization boundary in the embedded native host.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(process.env.FIRE_SHOWCASE_APP_TEST_SOURCE || new URL('site/script.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('async function loadSiteConfig()'), app.indexOf('\nfunction saveAuthUser('));

for (const [name, fetch] of [
  ['HTTP 502', async () => ({ ok: false, status: 502 })],
  ['network loss', async () => { throw new Error('offline fixture'); }],
  ['invalid JSON', async () => ({ ok: true, text: async () => '<html>upstream error</html>' })]
]) {
  test(`native config ${name} rejects instead of falling back to an unauthenticated editor`, async () => {
    let initialized = false;
    const context = vm.createContext({
      window: { FireShowcaseHost: {} }, state: { siteConfig: { requireLogin: true } }, fetch,
      apiUrl: path => path, readJsonResponse: async response => JSON.parse(await response.text()),
      initializeDurableGeneration() { initialized = true; },
      renderModelOptions() {}, updateReferenceRoleUi() {}, schedulePromptPreview() {}
    });
    vm.runInContext(source, context);
    await assert.rejects(() => vm.runInContext('loadSiteConfig()', context));
    assert.equal(initialized, false);
    assert.equal(vm.runInContext('state.siteConfig.requireLogin', context), true);
  });
}
