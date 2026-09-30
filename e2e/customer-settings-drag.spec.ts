import { expect, test, type Page } from '@playwright/test'

const initial = {
  statuses: ['待了解', '服务中', '已成交'],
  tags: ['课程', '预算', '周末'],
  templates: [],
}

async function openSettings(page: Page) {
  const saves: typeof initial[] = []
  await page.route('**/api/v1/tenants/kv/customer-config', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON()
      saves.push(body)
      return route.fulfill({ json: { success: true, data: body } })
    }
    return route.fulfill({ json: { success: true, data: initial } })
  })
  await page.goto('/e2e/customer-settings-drag-harness.html')
  await page.getByText('状态与标签', { exact: true }).click()
  await expect(page.locator('.choices[aria-label="客户状态"] .choice')).toHaveCount(3)
  return saves
}

async function order(page: Page, group: string) {
  return page.locator(`.choices[aria-label="${group}"] .choice > span`).allTextContents()
}

async function pointerDrag(page: Page, source: ReturnType<Page['locator']>, target: ReturnType<Page['locator']>) {
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('Drag source or target is not visible')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 1 })
  await page.mouse.up()
}

test('pointer dragging reorders statuses and tags and saves their new order', async ({ page }) => {
  const saves = await openSettings(page)
  const source = page.getByRole('button', { name: '拖动排序 待了解，第 1 项' })
  const target = page.locator('.choices[aria-label="客户状态"] .choice').filter({ hasText: '已成交' })
  await source.dragTo(target)
  expect(await order(page, '客户状态')).toEqual(['服务中', '已成交', '待了解'])

  const tagSource = page.getByRole('button', { name: '拖动排序 课程，第 1 项' })
  const tagTarget = page.locator('.choices[aria-label="客户标签"] .choice').filter({ hasText: '周末' })
  await tagSource.dragTo(tagTarget)
  expect(await order(page, '客户标签')).toEqual(['预算', '周末', '课程'])

  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => saves.length).toBe(1)
  expect(saves[0]).toEqual({
    ...initial,
    statuses: ['服务中', '已成交', '待了解'],
    tags: ['预算', '周末', '课程'],
  })
})

test('mouse down, move, and up on the handle reorders a status', async ({ page }) => {
  await openSettings(page)
  await pointerDrag(
    page,
    page.getByRole('button', { name: '拖动排序 待了解，第 1 项' }),
    page.locator('.choices[aria-label="客户状态"] .choice').filter({ hasText: '已成交' }),
  )
  expect(await order(page, '客户状态')).toEqual(['服务中', '已成交', '待了解'])
})

test('entering the target accepts an immediate drop without a dragover there', async ({ page }) => {
  await openSettings(page)
  const accepted = await page.evaluate(() => {
    const source = document.querySelector<HTMLButtonElement>('.choices[aria-label="客户状态"] .choice:first-child .drag-handle')!
    const target = document.querySelector<HTMLSpanElement>('.choices[aria-label="客户状态"] .choice:last-child > span')!
    const dataTransfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }))
    const enter = new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer })
    target.dispatchEvent(enter)
    if (enter.defaultPrevented) target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    return enter.defaultPrevented
  })
  expect(accepted).toBe(true)
  expect(await order(page, '客户状态')).toEqual(['服务中', '已成交', '待了解'])
})
