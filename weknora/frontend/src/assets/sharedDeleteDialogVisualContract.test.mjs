import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const nativeStyles = read('./musuw-native-directory-reference.css')
const agentList = read('../views/agent/AgentList.vue')
const knowledgeBaseList = read('../views/knowledge/KnowledgeBaseList.vue')

const sharedDialogRule = nativeStyles.match(
  /body \.t-dialog\.visual-confirm-dialog,\s*body \.t-dialog\.visual-kb-delete-dialog\s*\{([\s\S]*?)\}/,
)

test('shared delete dialogs collapse the TDesign root padding and height', () => {
  assert.ok(sharedDialogRule, 'missing shared delete dialog root rule')
  assert.match(sharedDialogRule[1], /padding:\s*0\s*!important/)
  assert.match(sharedDialogRule[1], /height:\s*auto\s*!important/)
  assert.match(sharedDialogRule[1], /min-height:\s*0\s*!important/)
})

test('agent and knowledge-base deletion keep the shared dialog visual contract', () => {
  assert.match(agentList, /dialog-class-name="visual-confirm-dialog"/)
  assert.match(knowledgeBaseList, /dialog-class-name="visual-kb-delete-dialog"/)
})
