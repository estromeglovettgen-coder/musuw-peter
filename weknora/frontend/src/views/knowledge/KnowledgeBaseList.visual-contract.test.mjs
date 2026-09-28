import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const knowledgeBaseList = read('./KnowledgeBaseList.vue')
const agentList = read('../agent/AgentList.vue')
const nativeDirectoryReference = read('../../assets/musuw-native-directory-reference.css')

const compact = (value) => value.replace(/\s+/g, '')

function rule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return compact(source.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`))?.[0] || '')
}

test('knowledge-base create action mirrors the Agent header button geometry and light colors', () => {
  const kbRule = rule(knowledgeBaseList, '.visual-kb-list__create')
  const agentRule = rule(agentList, '.agent-create-header-btn')
  const agentLabelRule = rule(agentList, '.agent-create-header-label')

  assert.ok(kbRule, 'knowledge-base create button must keep a local style owner')
  assert.ok(agentRule, 'Agent header create button must keep its reference style owner')
  assert.ok(agentLabelRule, 'Agent header create button label must keep its reference typography')
  for (const token of [
    'height:34px!important',
    'padding:014px',
    'border-color:#111827',
    'border-radius:12px!important',
    'gap:6px',
    'background:#111827!important',
    'color:#fff!important',
    'box-shadow:01px2pxrgb(000/8%)',
  ]) {
    assert.ok(kbRule.includes(token), `KB create button lost shared token ${token}`)
    assert.ok(agentRule.includes(token), `Agent create button lost shared token ${token}`)
  }
  for (const token of ['font-size:12px', 'font-weight:700', 'line-height:16px']) {
    assert.ok(kbRule.includes(token), `KB create button lost shared typography token ${token}`)
    assert.ok(agentLabelRule.includes(token), `Agent create button lost shared typography token ${token}`)
  }

  assert.match(
    compact(knowledgeBaseList),
    /\.visual-kb-list__create:deep\(\.t-icon\)\{[^}]*font-size:16px/,
    'KB create button icon must use the Agent header icon size',
  )
  assert.match(
    compact(agentList),
    /<t-iconname="add"size="16px"/,
    'Agent header create button icon size is the reference contract',
  )
})

test('legacy compact header rules do not override the Agent creation reference', () => {
  const compactReference = compact(nativeDirectoryReference)

  assert.match(
    compactReference,
    /\.agent-list-content\.header-action-btn:not\(\.agent-create-header-btn\),/,
    'the legacy header action selector must exclude the Agent creation button',
  )
  assert.doesNotMatch(
    compactReference,
    /\.agent-list-content\.header-action-btn,\.org-list-content\.header-action-btn\{/,
    'the legacy selector must not regain control of Agent creation geometry or shadow',
  )
})

test('knowledge-base create action mirrors the Agent header button dark colors', () => {
  for (const token of [
    'border-color:#f4f4f5!important',
    'background:#f4f4f5!important',
    'color:#18181b!important',
  ]) {
    assert.match(
      compact(knowledgeBaseList),
      new RegExp(`:root\\[theme-mode="dark"\\]\\.visual-kb-list__create[\\s\\S]*?\\{[^}]*${token}`),
      `KB create button lost dark token ${token}`,
    )
    assert.match(
      compact(agentList),
      new RegExp(`:root\\[theme-mode="dark"\\]\\.agent-create-header-btn[\\s\\S]*?\\{[^}]*${token}`),
      `Agent create button lost dark token ${token}`,
    )
  }
})
