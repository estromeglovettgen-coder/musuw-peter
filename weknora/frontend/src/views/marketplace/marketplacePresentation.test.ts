import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMonthlyAmount, annualAmountForMonthly, formatMarketPrice, isFreeMarketProduct, marketStatusKey, sortMarketProducts } from './marketplacePresentation.ts'

test('creator pricing accepts exact cents and previews a year as ten monthly charges', () => {
  assert.equal(parseMonthlyAmount('19.99'), 1999)
  assert.equal(annualAmountForMonthly(1999), 19990)
  assert.equal(parseMonthlyAmount('0.29'), 29)
  assert.equal(parseMonthlyAmount('0'), 0)
  assert.equal(parseMonthlyAmount('0.00'), 0)
  assert.equal(annualAmountForMonthly(0), 0)
  for (const invalid of ['', '-1', '1e3', '1.001', 'abc']) assert.equal(parseMonthlyAmount(invalid), null)
  assert.equal(formatMarketPrice(19990, 'USD', 'en-US'), '$199.90')
})

test('featured products precede ordinary products and test items never displace them', () => {
  const products = [
    { id: 'test', featured: true, fixture: true },
    { id: 'regular', featured: false, fixture: false },
    { id: 'taylor', featured: true, fixture: false },
  ]
  assert.deepEqual(sortMarketProducts(products).map(p => p.id), ['taylor', 'regular', 'test'])
  assert.equal(products[0].id, 'test')
})

test('free presentation requires zero prices for both intervals and maps the free access status', () => {
  assert.equal(isFreeMarketProduct({ monthly_amount: 0, yearly_amount: 0 }), true)
  for (const product of [undefined, null, { monthly_amount: 100, yearly_amount: 1000 }, { monthly_amount: 0, yearly_amount: 1000 }, { monthly_amount: 100, yearly_amount: 0 }]) {
    assert.equal(isFreeMarketProduct(product), false)
  }
  assert.equal(marketStatusKey('free'), 'creatorMarketplace.status.free')
})
