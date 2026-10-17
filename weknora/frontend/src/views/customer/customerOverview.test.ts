import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { selectCustomerOverview } from './customerOverview'

describe('customer overview Wiki selection', () => {
  const pages = [
    { page_type: 'entity', title: '彼得', slug: 'entity/peter' },
    { page_type: 'entity', title: '亚历克斯', slug: 'entity/alex' },
    { page_type: 'summary', title: 'Alex 原始聊天', slug: 'summary/chat' },
  ]
  it('matches a translated customer title through its slug rather than the first entity', () => {
    assert.equal(selectCustomerOverview(pages, 'Alex（演示）')?.slug, 'entity/alex')
  })
  it('uses a document summary when no entity is identified as the customer', () => {
    assert.equal(selectCustomerOverview(pages.slice(0,1).concat(pages.slice(2)), 'Alex')?.slug, 'summary/chat')
  })
  it('does not show an unrelated person when no summary exists', () => {
    assert.equal(selectCustomerOverview(pages.slice(0,1), 'Alex'), undefined)
  })
  it('keeps an explicit user selection', () => {
    assert.equal(selectCustomerOverview(pages, 'Alex', 'entity/custom')?.slug, 'entity/custom')
  })
  it('does not match partial names', () => {
    assert.equal(selectCustomerOverview([{page_type:'entity', title:'Bobby', slug:'entity/bobby'}], 'Bob'), undefined)
  })
  it('recognizes both legacy customer and renamed target overview titles', () => {
    const summary = { page_type: 'summary', title: '沟通记录', slug: 'summary/chat' }
    for (const suffix of ['客户画像', '目标画像', '客户资料', '目标资料']) {
      const overview = { page_type: 'entity', title: `Alex · ${suffix}`, slug: 'entity/person-17' }
      assert.equal(selectCustomerOverview([summary, overview], 'Alex'), overview, suffix)
    }
  })
})
