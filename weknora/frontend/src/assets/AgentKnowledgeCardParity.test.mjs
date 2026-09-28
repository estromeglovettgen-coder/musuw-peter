import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const kbCard = readFileSync(new URL('../views/knowledge/components/KnowledgeBaseListReferenceCard.vue', import.meta.url), 'utf8')
const agentList = readFileSync(new URL('../views/agent/AgentList.vue', import.meta.url), 'utf8')
const directoryTheme = readFileSync(new URL('./musuw-native-directory-reference.css', import.meta.url), 'utf8')
const finalTheme = readFileSync(new URL('./musuw-final-theme-closure.css', import.meta.url), 'utf8')

test('Agent cards follow the knowledge-card geometry for shared controls', () => {
  assert.match(kbCard, /border-radius:\s*12px;/)
  assert.match(kbCard, /top:\s*14px;\s*right:\s*42px;/)
  assert.match(kbCard, /gap:\s*6px;\s*flex-wrap:\s*wrap;/)

  assert.match(directoryTheme, /\.agent-card,[\s\S]*?border-radius:\s*12px\s*!important;/)
  assert.match(directoryTheme, /\.agent-card \.agent-favorite-star\s*\{[^}]*top:\s*14px\s*!important;[^}]*right:\s*42px\s*!important;/)
  assert.match(directoryTheme, /\.agent-card \.card-bottom\s*\{[^}]*gap:\s*6px\s*!important;[^}]*flex-wrap:\s*wrap\s*!important;/)
  assert.match(directoryTheme, /\.agent-card \.more-wrap\s*\{[^}]*border-radius:\s*6px\s*!important;/)
  assert.match(directoryTheme, /\.agent-card \.more-icon\s*\{[^}]*width:\s*16px\s*!important;[^}]*height:\s*16px\s*!important;/)
})

test('Agent cards omit web-search badges and reuse the knowledge-card divider in both themes', () => {
  assert.doesNotMatch(agentList, /class="feature-badge web-search"/)
  assert.match(kbCard, /\.visual-reference-kb-card__footer\s*\{[^}]*border-top:\s*1px solid #f3f4f6;/)
  assert.match(kbCard, /:root\[theme-mode="dark"\] \.visual-reference-kb-card__footer\s*\{[^}]*border-color:\s*#27272a;/)
  assert.match(finalTheme, /\.visual-reference-kb-card__footer,[\s\S]*?border-color:\s*var\(--mvc-line\)\s*!important;/)
  assert.match(agentList, /\.card-bottom\s*\{[^}]*margin-top:\s*12px;[^}]*padding-top:\s*12px;[^}]*border-top:\s*1px solid #f3f4f6;/)
  assert.match(agentList, /:root\[theme-mode="dark"\] \.agent-card \.card-bottom\s*\{[^}]*border-top-color:\s*var\(--mvc-line, #31343a\)\s*!important;/)
  assert.match(directoryTheme, /\.agent-card \.card-bottom,[\s\S]*?border-top:\s*1px solid #f3f4f6\s*!important;/)
  assert.match(directoryTheme, /:root\[theme-mode="dark"\] \.agent-card \.card-bottom\s*\{[^}]*border-top-color:\s*var\(--mvc-line, #31343a\)\s*!important;/)
})

test('the route-scoped Agent dark card keeps the KnowledgeBase resting shadow', () => {
  assert.match(kbCard, /:root\[theme-mode="dark"\] \.visual-reference-kb-card\s*\{[^}]*box-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 28%\);/)
  assert.match(
    agentList,
    /:root\[theme-mode="dark"\] \.agent-card,[\s\S]*?\.agent-card\.agent-mode-agent\s*\{[^}]*box-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 28%\)\s*!important;/,
  )
})
