// Whole application startup with only browser facilities and free HTTP boundaries
// substituted. No local server, credentials, provider endpoint or real images.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { parseHTML } = require(process.env.ALPHAI_TEST_DOM_MODULE || 'linkedom');

async function main() {
  const { window } = parseHTML(fs.readFileSync(`${__dirname}/site/index.html`, 'utf8'));
  const document = window.document;
  let readyState = 'loading';
  Object.defineProperty(document, 'readyState', { get: () => readyState });
  const saved = new Map([['aiShowcase.modelChoice', 'modelflare-image25-sunburst']]);
  const localStorage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: key => saved.delete(key)
  };
  const location = {
    hostname: '127.0.0.1', origin: 'http://127.0.0.1:5173',
    href: 'http://127.0.0.1:5173/', search: '', protocol: 'http:', reload() {}
  };
  window.location = location;
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  window.matchMedia = () => ({ matches: false });
  document.querySelectorAll('canvas').forEach(canvas => {
    canvas.getContext = () => ({ clearRect() {}, drawImage() {}, fillRect() {} });
  });
  // linkedom does not implement the native select value setter.
  document.querySelectorAll('select').forEach(select => {
    let value = select.querySelector('option[selected]')?.getAttribute('value')
      || select.querySelector('option')?.getAttribute('value') || '';
    Object.defineProperty(select, 'value', { get: () => value, set: next => { value = String(next); } });
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.showModal = () => { dialog.open = true; };
    dialog.close = () => { dialog.open = false; };
  });

  const roles = ['face', 'hair', 'pose', 'background', 'jewelry', 'body', 'upper', 'lower', 'shoes']
    .map(id => ({ id, label: id, allowMultipleSources: id === 'face' }));
  const config = {
    publicMode: true, requireLogin: false, registrationEnabled: false,
    asyncGenerationEnabled: false, generationPaused: true, generationSubmitted: false,
    defaultModelChoice: 'quickrouter-image25-sunburst',
    modelOptions: [
      { id: 'quickrouter-image25-sunburst', label: 'QuickRouter · GPT Image 2.5 Sunburst', tokenCost: 1 },
      { id: 'modelflare-image25', label: 'GPT Image 2.5 Flare', tokenCost: 1 },
      { id: 'modelflare-image25-sunburst', label: 'GPT Image 2.5 Sunburst', tokenCost: 1 }
    ],
    referenceWorkflow: { roles, providerReferenceLimit: null, requestTargetBytes: null }
  };
  const calls = [];
  const startupErrors = [];
  const fetch = async (url, options = {}) => {
    assert(['/api/config', '/api/prompt'].includes(url), `Unexpected network boundary: ${url}`);
    calls.push(url);
    const draft = options.body ? JSON.parse(options.body) : null;
    const result = url === '/api/config' ? config : {
      prompt: `整体协调规则\n${draft.prompt || '参考图合成'}`,
      valid: draft.promptMode === 'custom' ? Boolean(draft.prompt) : draft.images.length >= 2,
      errors: draft.promptMode === 'custom' || draft.images.length >= 2 ? [] : ['至少两张参考图']
    };
    return { ok: true, status: 200, text: async () => JSON.stringify(result) };
  };
  const context = vm.createContext({
    window, document, localStorage, location, URL, URLSearchParams, AbortController,
    TextEncoder, TextDecoder, Blob, Element: window.Element, Image: class {},
    Event: window.Event, setTimeout, clearTimeout, setInterval, clearInterval,
    performance, console: { log: console.log, warn() {}, error: (...args) => startupErrors.push(args) },
    navigator: {}, fetch, atob, crypto: require('node:crypto').webcrypto
  });
  const run = source => vm.runInContext(source, context);
  try {
    run(fs.readFileSync(`${__dirname}/site/fire-components.js`, 'utf8'));
    const application = fs.readFileSync(`${__dirname}/site/script.js`, 'utf8');
    assert(/\ninit\(\);\s*$/.test(application), 'Test must execute the actual application startup');
    run(application.replace(/\ninit\(\);\s*$/, '\nglobalThis.applicationStartup = init();'));
    run(fs.readFileSync(`${__dirname}/site/workbench.js`, 'utf8'));
    readyState = 'interactive';
    document.dispatchEvent(new window.Event('DOMContentLoaded'));
    await context.applicationStartup;
    await new Promise(resolve => setTimeout(resolve, 250));

    assert.equal(startupErrors.length, 0, startupErrors.map(args => args.join(' ')).join('\n'));
    assert.equal(document.body.classList.contains('auth-pending'), false);
    assert.equal(document.querySelector('#generate-button').disabled, true);
    assert.equal(run('selectedPromptMode()'), 'default');
    assert.equal(document.querySelectorAll('[data-fire-choices-for="ratio"] .fire-choice').length, 4);
    const modelChoices = [...document.querySelectorAll('[data-fire-choices-for="model-choice"] .fire-choice')];
    assert.equal(modelChoices.length, 3, 'Dynamic config must reach the visible model chooser');
    assert.equal(modelChoices[0].getAttribute('aria-checked'), 'true', 'Existing users migrate to the configured QuickRouter default');
    assert.equal(run('els.modelChoice.value'), 'quickrouter-image25-sunburst');
    modelChoices[1].dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(run('els.modelChoice.value'), 'modelflare-image25');
    assert.equal(modelChoices[1].getAttribute('aria-checked'), 'true');
    await run('loadSiteConfig(); loadConnectionSettings();');
    assert.equal(run('els.modelChoice.value'), 'modelflare-image25', 'An explicit later route choice survives config reload after the one-time migration');
    assert.equal(run('els.size.value'), '1k');
    assert.equal(run('els.count.value'), '1');

    const click = selector => document.querySelector(selector).dispatchEvent(new window.Event('click', { bubbles: true }));
    click('[data-workbench-view="free"]');
    assert.equal(run('selectedPromptMode()'), 'custom');
    click('[data-workbench-view="materials"]');
    assert.equal(run('selectedPromptMode()'), 'custom');
    click('[data-upload-references]');
    assert.equal(run('selectedPromptMode()'), 'custom', 'Reusing the upload route must preserve free creation');
    click('#workbench-settings-button');
    assert.equal(document.querySelector('#workbench-settings-dialog').open, true);
    assert(calls.includes('/api/config'));
    assert(calls.every(url => url === '/api/config' || url === '/api/prompt'));
    console.log('fire workbench full startup: actual scripts, delayed config model choices, selected values, free/material routes and settings passed; zero provider calls');
  } finally {
    run('clearTimeout(promptPreviewTimer); promptPreviewController?.abort();');
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
