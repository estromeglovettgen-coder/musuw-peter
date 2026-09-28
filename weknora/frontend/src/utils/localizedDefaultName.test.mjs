import assert from 'node:assert/strict'
import test from 'node:test'
import { nextAvailableLocalizedName } from './localizedDefaultName.ts'

const format = (index) => `我的知识库（${index}）`

test('returns the localized base name when the loaded list does not use it', () => {
  assert.equal(nextAvailableLocalizedName('我的知识库', ['  ', null, '其他'], format), '我的知识库')
})

test('normalizes surrounding whitespace before checking loaded names', () => {
  assert.equal(nextAvailableLocalizedName('我的知识库', [' 我的知识库 '], format), '我的知识库（2）')
})

test('advances past every consecutive localized suffix', () => {
  assert.equal(
    nextAvailableLocalizedName('我的知识库', [
      '我的知识库',
      '我的知识库（2）',
      '我的知识库（3）',
      ' 我的知识库（3） ',
      '  ',
      '其他',
    ], format),
    '我的知识库（4）',
  )
})

test('fills the first missing suffix instead of using the loaded count', () => {
  assert.equal(
    nextAvailableLocalizedName('我的知识库', ['我的知识库', '我的知识库（3）'], format),
    '我的知识库（2）',
  )
})
