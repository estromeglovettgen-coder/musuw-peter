import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: `window.__RUNTIME_CONFIG__ = ${JSON.stringify({ auth: {
      publicOrigin: 'http://127.0.0.1:4190',
      supabaseUrl: 'https://auth-fixture.invalid',
      publishableKey: 'sb_publishable_auth_fixture',
      weknoraOAuthClientId: 'auth-fixture-client',
    } })};`,
  }));
  await page.route('https://auth-fixture.invalid/**', route => route.fulfill({ status: 401, json: {} }));
});

test('typing in the login form keeps the existing liquid background and WebGL context', async ({ page }, info) => {
  // Probe independently so a broken renderer cannot silently turn this into a fallback-only test.
  const supportsWebGL = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('webgl2', { antialias: true, alpha: true });
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  });
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let attempts = 0;
    Object.assign(window, { webglContextAttempts: () => attempts });
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl2') attempts++;
      return Reflect.apply(originalGetContext, this, [type, ...args]);
    };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/auth/start');
  await expect(page.locator('#email')).toBeVisible();
  const background = page.locator('.auth-liquid-ether');
  await expect(background).toHaveAttribute('data-renderer', supportsWebGL ? 'webgl' : 'static');
  const canvas = page.locator('.auth-liquid-ether canvas');
  await expect(canvas).toHaveCount(supportsWebGL ? 1 : 0);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const originalCanvas = supportsWebGL ? await canvas.elementHandle() : null;
  const originalBackground = await background.elementHandle();
  const attempts = await page.evaluate(() => (window as any).webglContextAttempts());
  expect(attempts).toBeGreaterThan(0);
  const before = await page.locator('.auth-showcase').boundingBox();
  const mutations = await page.locator('.auth-showcase-backdrop').evaluateHandle(backdrop => {
    const state = { canvasesAdded: 0, canvasesRemoved: 0, contextsLost: 0 };
    const observeContext = (canvas: HTMLCanvasElement) => {
      canvas.addEventListener('webglcontextlost', () => { state.contextsLost++; });
    };
    backdrop.querySelectorAll('canvas').forEach(observeContext);
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLCanvasElement) { state.canvasesAdded++; observeContext(node); }
        }
        for (const node of record.removedNodes) {
          if (node instanceof HTMLCanvasElement) state.canvasesRemoved++;
        }
      }
    }).observe(backdrop, { childList: true, subtree: true });
    return state;
  });

  await page.locator('#email').click();
  await page.locator('#email').pressSequentially('test@example.invalid', { delay: 40 });
  await page.locator('#password').click();
  await page.locator('#password').pressSequentially('fixture-password', { delay: 40 });
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const observed = await mutations.jsonValue();
  await info.attach('background-lifecycle.json', { body: JSON.stringify({ supportsWebGL, attempts, ...observed }), contentType: 'application/json' });
  expect(observed).toEqual({ canvasesAdded: 0, canvasesRemoved: 0, contextsLost: 0 });
  if (supportsWebGL) expect(await originalCanvas!.evaluate(node => node.isConnected)).toBe(true);
  expect(await originalBackground!.evaluate(node => node.isConnected)).toBe(true);
  expect(await page.evaluate(() => (window as any).webglContextAttempts())).toBe(attempts);
  await expect(background).toHaveAttribute('data-renderer', supportsWebGL ? 'webgl' : 'static');
  await expect(canvas).toHaveCount(supportsWebGL ? 1 : 0);
  expect(await page.locator('.auth-showcase').boundingBox()).toEqual(before);
  await expect(page.locator('.auth-showcase')).toHaveCSS('background-color', 'rgb(8, 8, 8)');
  await expect(page.locator('#email')).toHaveValue('test@example.invalid');
  await expect(page.locator('#password')).toHaveValue('fixture-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.locator('#password')).toHaveAttribute('type', 'text');
  expect(errors).toEqual([]);
});

test('unavailable WebGL keeps the black background and login form usable', async ({ page }, info) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let attempts = 0;
    Object.assign(window, { webglContextAttempts: () => attempts });
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') {
        attempts++;
        return null;
      }
      return Reflect.apply(originalGetContext, this, [type, ...args]);
    };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto('/auth/start');
    await expect(page.locator('#email')).toBeVisible();
    const background = page.locator('.auth-liquid-ether');
    await expect(background).toHaveAttribute('data-renderer', 'static');
    await expect(background.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.auth-showcase')).toHaveCSS('background-color', 'rgb(8, 8, 8)');
    const originalBackground = await background.elementHandle();
    const attempts = await page.evaluate(() => (window as any).webglContextAttempts());
    expect(attempts).toBeGreaterThan(0);
    await page.locator('#email').pressSequentially('test@example.invalid', { delay: 40 });
    await page.locator('#password').pressSequentially('fixture-password', { delay: 40 });
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await expect(page.locator('#email')).toHaveValue('test@example.invalid');
    await expect(page.locator('#password')).toHaveValue('fixture-password');
    await expect(background).toHaveAttribute('data-renderer', 'static');
    await expect(background.locator('canvas')).toHaveCount(0);
    expect(await originalBackground!.evaluate(node => node.isConnected)).toBe(true);
    expect(await page.evaluate(() => (window as any).webglContextAttempts())).toBe(attempts);
    expect(errors).toEqual([]);
  } finally {
    await info.attach('page-errors.json', { body: JSON.stringify(errors), contentType: 'application/json' });
  }
});
