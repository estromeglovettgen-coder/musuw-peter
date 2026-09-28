import { expect, test, type Page, type Route } from '@playwright/test'

type Session = {
  id: string
  title: string
  created_at: string
  updated_at: string
  is_pinned?: boolean
}

const sessions: Session[] = [
  {
    id: 'session-one',
    title: '第一条验收对话',
    created_at: '2026-09-10T08:00:00.000Z',
    updated_at: '2026-09-10T08:00:00.000Z',
  },
  {
    id: 'session-two',
    title: '第二条验收对话',
    created_at: '2026-09-10T07:00:00.000Z',
    updated_at: '2026-09-10T07:00:00.000Z',
  },
  {
    id: 'session-three',
    title: '第三条验收对话',
    created_at: '2026-09-10T06:00:00.000Z',
    updated_at: '2026-09-10T06:00:00.000Z',
  },
]

function makeSessions(count: number): Session[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `session-${String(index + 1).padStart(2, '0')}`,
    title: `分页验收对话 ${index + 1}`,
    created_at: `2026-09-${String(10 - Math.floor(index / 10)).padStart(2, '0')}T08:00:00.000Z`,
    updated_at: `2026-09-${String(10 - Math.floor(index / 10)).padStart(2, '0')}T08:00:00.000Z`,
  }))
}

type BatchRouteOptions = {
  failFirstDelete?: boolean
  failFirstSingleDelete?: boolean
  deferFirstSingleDelete?: boolean
  fixtureSessions?: Session[]
}

async function installApiFixture(page: Page, options: BatchRouteOptions = {}) {
  let remaining = [...(options.fixtureSessions ?? sessions)]
  let deleteAttempts = 0
  let singleDeleteAttempts = 0
  let releaseFirstSingleDelete: (() => void) | null = null
  const deleteBodies: Array<Record<string, unknown>> = []

  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname === '/api/v1/sessions' && request.method() === 'GET') {
      const page = Number(url.searchParams.get('page') || 1)
      const pageSize = Number(url.searchParams.get('page_size') || 30)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: remaining.slice((page - 1) * pageSize, page * pageSize),
          total: remaining.length,
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/sessions/batch' && request.method() === 'DELETE') {
      const body = request.postDataJSON() as Record<string, unknown> | null
      deleteBodies.push(body || {})
      deleteAttempts += 1
      if (options.failFirstDelete && deleteAttempts === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'synthetic failure' }),
        })
        return
      }

      const ids = Array.isArray(body?.ids) ? body.ids.map(String) : []
      remaining = remaining.filter((session) => !ids.includes(session.id))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
      return
    }

    if (/^\/api\/v1\/sessions\/[^/]+$/.test(url.pathname) && request.method() === 'DELETE') {
      const sessionId = decodeURIComponent(url.pathname.split('/').pop() || '')
      singleDeleteAttempts += 1
      if (options.failFirstSingleDelete && singleDeleteAttempts === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'synthetic failure' }),
        })
        return
      }
      if (options.deferFirstSingleDelete && singleDeleteAttempts === 1) {
        await new Promise<void>((resolve) => { releaseFirstSingleDelete = resolve })
      }
      remaining = remaining.filter((session) => session.id !== sessionId)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
      return
    }

    if (url.pathname === '/api/v1/auth/me' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: 'batch-acceptance-user',
              username: '批量删除验收用户',
              email: 'batch-acceptance@example.test',
              tenant_id: 42,
              is_active: true,
            },
            tenant: { id: 42, name: '批量删除验收空间' },
            memberships: [],
            capabilities: { can_create_tenant: false },
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/entitlements/current' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            plan: 'free',
            plan_status: 'active',
            storage_bytes: 0,
            storage_used: 0,
            monthly_openrouter_microusd: 0,
            openrouter_used_microusd: 0,
            openrouter_remaining_microusd: 0,
            openrouter_credits_status: 'unprovisioned',
            max_knowledge_bases: 1,
            max_documents_per_kb: 10,
            video_upload: false,
          },
          billing: { configured: false, portal_available: false },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    })
  })

  return {
    deleteBodies,
    get singleDeleteAttempts() {
      return singleDeleteAttempts
    },
    releaseFirstSingleDelete() {
      releaseFirstSingleDelete?.()
    },
    get deleteAttempts() {
      return deleteAttempts
    },
  }
}

async function openBatchModal(page: Page, expectedRows = sessions.length) {
  const collapsedSidebar = page.locator('.visual-sidebar.is-collapsed')
  if (await collapsedSidebar.count()) {
    await collapsedSidebar.locator('.visual-sidebar__collapsed-control').click()
  }
  await expect(page.locator('.visual-session-row')).toHaveCount(expectedRows)
  const firstRow = page.locator('.visual-session-row').first()
  await firstRow.hover()
  await firstRow.locator('.visual-session-row__more').click()
  await page.locator('.visual-session-menu__item').filter({ hasText: '批量管理' }).click()
  await expect(page.locator('.visual-batch-modal')).toBeVisible()
}

async function openDeleteConfirmation(page: Page) {
  await page.locator('.visual-batch-modal__delete').click()
  const dialog = page.locator('.t-dialog').filter({ hasText: '删除对话' }).last()
  await expect(dialog).toBeVisible()
  // Use the same actionability/hit-test that a real user click uses while the
  // TDesign enter transition settles. This catches the original 2500-vs-3000
  // overlay regression without forcing a click through an obscuring backdrop.
  await dialog.getByRole('button', { name: '删除对话', exact: true }).click({ trial: true })
  return dialog
}

test.describe('session batch management', () => {
  test('renders localized modal, keeps the confirmation clickable, and sends only selected IDs', async ({ page }) => {
    const fixture = await installApiFixture(page)
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(error.message))

    await page.goto('/e2e/session-batch-harness.html')
    await openBatchModal(page)

    await expect(page.locator('.visual-batch-modal')).not.toContainText('batchManage.title')
    await expect(page.locator('.visual-batch-modal__select-all')).toContainText('全选')
    await expect(page.locator('.visual-batch-modal__delete')).toContainText('删除对话 (0)')

    const rows = page.locator('.visual-batch-modal__row')
    await rows.nth(0).click()
    await rows.nth(1).click()
    await expect(page.locator('.visual-batch-modal__delete')).toContainText('删除对话 (2)')

    const dialog = await openDeleteConfirmation(page)
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    if (!dialogBox) throw new Error('confirmation dialog has no bounding box')
    const topmost = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y)
      return Boolean(target?.closest('.t-dialog'))
    }, { x: dialogBox.x + dialogBox.width / 2, y: dialogBox.y + dialogBox.height / 2 })
    expect(topmost, 'TDesign confirmation must be topmost at its own center').toBe(true)

    await dialog.getByRole('button', { name: '删除对话', exact: true }).click()
    await expect.poll(() => fixture.deleteBodies.length).toBe(1)
    expect(fixture.deleteBodies[0]).toEqual({ ids: ['session-one', 'session-two'] })
    await expect(page.locator('.visual-batch-modal')).toBeHidden()
    expect(consoleErrors).toEqual([])
  })

  test('keeps the selection for a retry after a failed batch delete', async ({ page }) => {
    const fixture = await installApiFixture(page, { failFirstDelete: true })
    await page.goto('/e2e/session-batch-harness.html')
    await openBatchModal(page)
    await page.locator('.visual-batch-modal__row').nth(0).click()

    let dialog = await openDeleteConfirmation(page)
    await dialog.getByRole('button', { name: '删除对话', exact: true }).click()
    await expect.poll(() => fixture.deleteAttempts).toBe(1)
    await expect(page.locator('.visual-batch-modal')).toBeVisible()
    await expect(page.locator('.visual-batch-modal__delete')).toContainText('删除对话 (1)')
    await expect(page.getByText('删除失败，请稍后再试')).toBeVisible()

    dialog = await openDeleteConfirmation(page)
    await dialog.getByRole('button', { name: '删除对话', exact: true }).click()
    await expect.poll(() => fixture.deleteAttempts).toBe(2)
    expect(fixture.deleteBodies).toEqual([{ ids: ['session-one'] }, { ids: ['session-one'] }])
    await expect(page.locator('.visual-batch-modal')).toBeHidden()
  })

  test('fits and remains actionable on a narrow mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const fixture = await installApiFixture(page)
    await page.goto('/e2e/session-batch-harness.html')
    await openBatchModal(page)

    const modal = page.locator('.visual-batch-modal')
    const box = await modal.boundingBox()
    expect(box).not.toBeNull()
    if (!box) throw new Error('batch modal has no bounding box')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

    await page.locator('.visual-batch-modal__row').first().click()
    const dialog = await openDeleteConfirmation(page)
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    expect(fixture.deleteBodies).toEqual([])
    await expect(page.locator('.visual-batch-modal')).toBeVisible()
  })

  test('loads the next session page before allowing a paginated selection', async ({ page }) => {
    const paginatedSessions = makeSessions(40)
    const fixture = await installApiFixture(page, { fixtureSessions: paginatedSessions })
    await page.goto('/e2e/session-batch-harness.html')
    await openBatchModal(page, 30)
    await expect(page.locator('.visual-batch-modal__load-more')).toBeVisible()
    await expect(page.locator('.visual-batch-modal__row')).toHaveCount(30)

    await page.locator('.visual-batch-modal__load-more').click()
    await expect(page.locator('.visual-batch-modal__row')).toHaveCount(40)
    await expect(page.locator('.visual-batch-modal__load-more')).toBeHidden()
    await page.locator('.visual-batch-modal__row').nth(39).click()
    await expect(page.locator('.visual-batch-modal__delete')).toContainText('删除对话 (1)')

    const dialog = await openDeleteConfirmation(page)
    await dialog.getByRole('button', { name: '删除对话', exact: true }).click()
    await expect.poll(() => fixture.deleteBodies.length).toBe(1)
    expect(fixture.deleteBodies[0]).toEqual({ ids: ['session-40'] })
  })

  test('select-all deletes the loaded page only and refills the remaining sessions', async ({ page }) => {
    const fixture = await installApiFixture(page, { fixtureSessions: makeSessions(40) })
    await page.goto('/e2e/session-batch-harness.html')
    await openBatchModal(page, 30)
    await page.locator('.visual-batch-modal__select-all').click()
    await expect(page.locator('.visual-batch-modal__delete')).toContainText('删除对话 (30)')

    const dialog = await openDeleteConfirmation(page)
    await dialog.getByRole('button', { name: '删除对话', exact: true }).click()
    await expect.poll(() => fixture.deleteBodies.length).toBe(1)
    expect(fixture.deleteBodies[0]).toEqual({
      ids: Array.from({ length: 30 }, (_, index) => `session-${String(index + 1).padStart(2, '0')}`),
    })
    await expect(page.locator('.visual-batch-modal')).toBeHidden()
    await expect(page.locator('.visual-session-row')).toHaveCount(10)
    await expect(page.getByText('分页验收对话 31', { exact: true })).toBeVisible()
    await expect(page.getByText('分页验收对话 01', { exact: true })).toBeHidden()
  })

  test('single-session delete ignores a repeated confirmation while the first request is pending', async ({ page }) => {
    const fixture = await installApiFixture(page, { deferFirstSingleDelete: true })
    await page.goto('/e2e/session-batch-harness.html')
    await expect(page.locator('.visual-session-row')).toHaveCount(sessions.length)

    const row = page.locator('.visual-session-row').first()
    const openSingleDeleteConfirmation = async () => {
      await row.hover()
      await row.locator('.visual-session-row__more').click()
      const deleteMenuItem = page.locator('.visual-session-menu__item').filter({ hasText: '删除记录' })
      await expect(deleteMenuItem).toBeVisible()
      await deleteMenuItem.click()
      await page.locator('.visual-session-confirm__button.is-danger').click()
    }

    await openSingleDeleteConfirmation()
    await expect.poll(() => fixture.singleDeleteAttempts).toBe(1)
    await expect(row.locator('.visual-session-row__more')).toHaveAttribute('aria-expanded', 'false')
    await page.waitForTimeout(300)

    await openSingleDeleteConfirmation()
    await page.waitForTimeout(200)
    expect(fixture.singleDeleteAttempts).toBe(1)

    fixture.releaseFirstSingleDelete()
    await expect(page.getByText('第一条验收对话', { exact: true })).toBeHidden()
    await expect(page.locator('.visual-session-row')).toHaveCount(sessions.length - 1)
  })

  test('single-session delete remains retryable after a failed request', async ({ page }) => {
    const fixture = await installApiFixture(page, { failFirstSingleDelete: true })
    await page.goto('/e2e/session-batch-harness.html')
    await expect(page.locator('.visual-session-row')).toHaveCount(sessions.length)

    const row = page.locator('.visual-session-row').first()
    const openSingleDeleteConfirmation = async () => {
      await row.hover()
      await row.locator('.visual-session-row__more').click()
      const deleteMenuItem = page.locator('.visual-session-menu__item').filter({ hasText: '删除记录' })
      await expect(deleteMenuItem).toBeVisible()
      await deleteMenuItem.click()
      await page.locator('.visual-session-confirm__button.is-danger').click()
    }

    await openSingleDeleteConfirmation()
    await expect.poll(() => fixture.singleDeleteAttempts).toBe(1)
    await expect(page.getByText('第一条验收对话', { exact: true })).toBeVisible()

    await page.waitForTimeout(300)
    await openSingleDeleteConfirmation()
    await expect.poll(() => fixture.singleDeleteAttempts).toBe(2)
    await expect(page.getByText('第一条验收对话', { exact: true })).toBeHidden()
  })

  test('a pending single-session delete does not block another session', async ({ page }) => {
    const fixture = await installApiFixture(page, { deferFirstSingleDelete: true })
    await page.goto('/e2e/session-batch-harness.html')
    await expect(page.locator('.visual-session-row')).toHaveCount(sessions.length)

    const openSingleDeleteConfirmation = async (row: ReturnType<typeof page.locator>) => {
      await row.hover()
      await row.locator('.visual-session-row__more').click()
      const deleteMenuItem = page.locator('.visual-session-menu__item').filter({ hasText: '删除记录' })
      await expect(deleteMenuItem).toBeVisible()
      await deleteMenuItem.click()
      await page.locator('.visual-session-confirm__button.is-danger').click()
    }

    await openSingleDeleteConfirmation(page.locator('.visual-session-row').nth(0))
    await expect.poll(() => fixture.singleDeleteAttempts).toBe(1)

    await openSingleDeleteConfirmation(page.locator('.visual-session-row').nth(1))
    await expect.poll(() => fixture.singleDeleteAttempts).toBe(2)
    await expect(page.getByText('第二条验收对话', { exact: true })).toBeHidden()

    fixture.releaseFirstSingleDelete()
    await expect(page.getByText('第一条验收对话', { exact: true })).toBeHidden()
    await expect(page.locator('.visual-session-row')).toHaveCount(sessions.length - 2)
  })
})
