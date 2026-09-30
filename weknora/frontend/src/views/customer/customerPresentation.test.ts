import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { customerFieldsForSave, customerLegacyFields, customerVisibleNote, customerVisibleTags } from './customerPresentation'

const emptyProfile = () => ({ status: '', tags: [] as string[], contact: '', note: '', shared_knowledge_base_ids: [] as string[], wiki_slug: '' })

describe('customer fields in the simplified workspace', () => {
  it('shows a saved legacy status as an ordinary tag without duplicating it', () => {
    assert.deepEqual(customerVisibleTags({ status: '沟通中', tags: ['已咨询', '沟通中'] }), ['沟通中', '已咨询'])
    assert.deepEqual(customerVisibleTags({ status: '', tags: ['已咨询'] }), ['已咨询'])
  })

  it('shows legacy description and note in one field without repeating the same text', () => {
    assert.equal(customerVisibleNote('下周跟进', '想了解课程'), '想了解课程\n\n下周跟进')
    assert.equal(customerVisibleNote('想了解课程，下周跟进', '想了解课程'), '想了解课程，下周跟进')
    assert.equal(customerVisibleNote('', '想了解课程'), '想了解课程')
  })

  it('preserves native legacy fields when only another customer field changes', () => {
    const old = { ...emptyProfile(), status: '沟通中', tags: Array.from({ length: 30 }, (_, i) => `标签${i}`), note: '旧备注'.repeat(3900) }
    const legacy = customerLegacyFields(old, '旧说明')
    const edited = { ...old, contact: '新联系方式', status: '', tags: legacy.visibleTags, note: legacy.visibleNote }
    const saved = customerFieldsForSave(edited, legacy)
    assert.equal(saved.profile.status, '沟通中')
    assert.equal(saved.profile.tags.length, 30)
    assert.equal(saved.profile.note, old.note)
    assert.equal(saved.description, '旧说明')
    assert.equal(saved.profile.contact, '新联系方式')
  })

  it('stores changed tags and notes in the unified fields', () => {
    const old = { ...emptyProfile(), status: '待了解', tags: ['首次咨询'], note: '原备注' }
    const legacy = customerLegacyFields(old, '原说明')
    const saved = customerFieldsForSave({ ...old, status: '', tags: ['新标签'], note: '新备注' }, legacy)
    assert.deepEqual(saved.profile.tags, ['新标签'])
    assert.equal(saved.profile.status, '')
    assert.equal(saved.profile.note, '新备注')
    assert.equal(saved.description, '')
  })
})
