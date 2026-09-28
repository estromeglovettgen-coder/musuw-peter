import { expect, test, type Page } from '@playwright/test'

type Plan = 'free' | 'plus' | 'pro' | 'max'

// Mount the production menu, plans, checkout, Pinia stores and API client.
// Replace only the authenticated API and external Paddle SDK boundaries.
async function mockBilling(page: Page, plan: Plan, source = 'complimentary') {
  const requests: Array<{ path: string; body: any }> = []
  await page.addInitScript(() => {
    ;(window as any).PaddleBillingV1 = {
      Environment: { set() {} },
      Initialize() {},
      Update() {},
      PricePreview: async ({ items }: any) => ({ data: {
        currencyCode: 'USD',
        details: { lineItems: items.map(({ priceId }: any) => ({
          price: { id: priceId }, formattedUnitTotals: { subtotal: '$20.00' }, formattedTotals: { total: '$20.00' },
        })) },
      } }),
      Checkout: {
        open({ transactionId, settings }: any) {
          const frame = document.createElement('iframe')
          frame.title = 'Paddle checkout'
          frame.dataset.transactionId = transactionId
          document.querySelector(`.${settings.frameTarget}`)?.append(frame)
        },
        close() {},
      },
    }
  })
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'POST') requests.push({ path, body: route.request().postDataJSON() })
    if (path === '/api/v1/entitlements/current') return route.fulfill({ json: { data: {
      plan, plan_status: source === 'complimentary' ? 'complimentary' : 'active', plan_source: source,
      storage_bytes: 32_212_254_720, storage_used: 0, openrouter_credits_status: 'unprovisioned',
      monthly_openrouter_microusd: 10_000_000, openrouter_remaining_microusd: 10_000_000,
    }, billing: {
      configured: true, environment: 'sandbox', client_token: 'test_fixture',
      portal_available: source === 'paddle', can_manage_billing: source === 'paddle',
      catalog: Object.fromEntries(['plus', 'pro', 'max'].map(tier => [tier, {
        monthly: { price_id: `pri_${tier}_monthly` }, yearly: { price_id: `pri_${tier}_yearly` },
      }])),
    } } })
    if (path.endsWith('/checkout-intent')) return route.fulfill({ json: { transaction_id: 'txn_fixture', pending: true } })
    if (path.endsWith('/subscription-upgrade/preview')) return route.fulfill({ json: {
      plan: 'max', period: 'monthly', action: 'charge', prorated_subtotal: '2000', prorated_tax: '0',
      due_today: '2000', recurring_total: '4000', currency_code: 'USD', next_billed_at: '2026-10-11T00:00:00Z',
    } })
    return route.fulfill({ json: { success: true, data: {} } })
  })
  return requests
}

test('normal Free purchase opens the first subscription checkout', async ({ page }) => {
  const requests = await mockBilling(page, 'free', 'free')
  await page.goto('/e2e/billing-harness.html')
  const plus = page.locator('.plan-card').filter({ has: page.getByRole('heading', { name: 'Plus', exact: true }) })
  await expect(plus.getByRole('button')).toBeEnabled()
  await plus.getByRole('button').click()
  await expect(page.getByTitle('Paddle checkout')).toHaveAttribute('data-transaction-id', 'txn_fixture')
  expect(requests.map(request => request.path)).toEqual(['/api/v1/billing/paddle/checkout-intent'])
  expect(requests[0].body).toMatchObject({ plan: 'plus', billing_period: 'monthly' })
})

test('normal paid Pro upgrade opens a Max prorated subscription preview', async ({ page }) => {
  const requests = await mockBilling(page, 'pro', 'paddle')
  await page.goto('/e2e/billing-harness.html')
  const max = page.locator('.plan-card').filter({ has: page.getByRole('heading', { name: 'Max', exact: true }) })
  await expect(max.getByRole('button')).toBeEnabled()
  await max.getByRole('button').click()
  await expect(page.locator('.checkout-page__confirm-upgrade')).toBeVisible()
  await expect(page.locator('.checkout-page__totals')).toContainText('$20.00')
  await expect(page.getByTitle('Paddle checkout')).toHaveCount(0)
  expect(requests.map(request => request.path)).toEqual(['/api/v1/billing/paddle/subscription-upgrade/preview'])
  expect(requests[0].body).toEqual({ plan: 'max' })
})

for (const [plan, source, label] of [
  ['free', 'free', '升级套餐'],
  ['plus', 'paddle', '升级套餐'],
  ['pro', 'paddle', '升级套餐'],
  ['max', 'paddle', '查看套餐'],
  ['plus', 'complimentary', '升级套餐'],
  ['pro', 'complimentary', '升级套餐'],
  ['max', 'complimentary', '查看套餐'],
] as const) {
  test(`${source} ${plan} menu shows ${label}`, async ({ page }) => {
    await mockBilling(page, plan, source)
    await page.goto('/e2e/billing-harness.html?path=' + encodeURIComponent('/platform/knowledge-bases'))
    await page.locator('.visual-user-menu__trigger').click()
    await expect(page.locator('.visual-user-menu__billing-item')).toHaveText(label)
  })
}
