import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./KnowledgeBase.vue', import.meta.url), 'utf8')
// The active Musuw shell delegates the long-lived folder/navigation
// controller to its frozen business baseline. Assert the combined surface so
// the contract follows the actual runtime owner without weakening behavior.
const controller = readFileSync(new URL('../../assets/business-baselines/KnowledgeBase.pre-view.vue', import.meta.url), 'utf8')
const knowledgeSurface = `${source}\n${controller}`

test('referenced documents navigate to their containing folder before opening details', () => {
  const resolveFolder = knowledgeSurface.indexOf('await getKnowledgeDetails(targetId)')
  const selectFolder = knowledgeSurface.indexOf('selectedFolderPath.value = detail.folder_path || ROOT_FOLDER_PATH')
  const openDetails = knowledgeSurface.indexOf('openCardDetails(target)', selectFolder)

  assert.ok(resolveFolder >= 0, 'document details should be fetched to resolve folder_path')
  assert.ok(selectFolder > resolveFolder, 'the containing folder should be selected after details load')
  assert.ok(openDetails > selectFolder, 'the detail drawer should open after folder navigation')
})

test('a newer referenced-document navigation supersedes an older request', () => {
  assert.match(knowledgeSurface, /const request = \+\+autoOpenRequest/)
  assert.match(knowledgeSurface, /if \(request !== autoOpenRequest\) return;/)
})
