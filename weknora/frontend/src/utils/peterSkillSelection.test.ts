import assert from 'node:assert/strict'
import test from 'node:test'

import { checkedPeterSkills, updatePeterSkills } from './peterSkillSelection'

test('an existing all-skills agent displays every ready skill without changing its saved mode', () => {
  assert.deepEqual(checkedPeterSkills('all', [], ['report', 'summary']), ['report', 'summary'])
})

test('an existing selected-skills agent keeps only ready selections visible', () => {
  assert.deepEqual(checkedPeterSkills('selected', ['report', 'removed'], ['report']), ['report'])
  assert.deepEqual(checkedPeterSkills('none', ['report'], ['report']), [])
})

test('editing the checklist saves an explicit selection or disables skills', () => {
  assert.deepEqual(updatePeterSkills(['report']), { mode: 'selected', selected: ['report'] })
  assert.deepEqual(updatePeterSkills([]), { mode: 'none', selected: [] })
})
