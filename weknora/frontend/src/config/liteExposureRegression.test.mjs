import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

const router = read('../router/index.ts')
const chatResources = read('../stores/chatResources.ts')
const organizationStore = read('../stores/organization.ts')
const knowledgeBaseList = read('../views/knowledge/KnowledgeBaseList.vue')
const listUrlState = read('../composables/useListUrlState.ts')

test('edition probe remains retryable after a transient failure', () => {
  // A failed first probe must not permanently pin this SPA to the pre-probe
  // Standard surface. Success is the only path that marks the probe complete.
  assert.match(
    router,
    /if \(edition === 'lite' \|\| edition === 'standard'\) \{[\s\S]*?editionProbeDone = true[\s\S]*?\}/,
  )
  assert.match(router, /catch \{[\s\S]*editionProbeDone = false/)
  assert.match(router, /finally \{\s*editionProbePromise = null/)
  assert.doesNotMatch(router, /finally \{\s*editionProbeDone = true/)
})

test('Lite knowledge-base loading never requests or renders shared resources', () => {
  assert.match(
    chatResources,
    /if \(isLiteProductMode\(\)\) \{[\s\S]*?clearState\(\)[\s\S]*?\} else \{[\s\S]*?fetchSharedKnowledgeBases/,
  )
  assert.match(knowledgeBaseList, /legacyState\.sharedKbs = computed[\s\S]*authStore\.isLiteMode[\s\S]*\[\]/)
  assert.match(knowledgeBaseList, /legacyState\.showShareGroupHeaders = computed[\s\S]*authStore\.isLiteMode[\s\S]*false/)
  assert.doesNotMatch(knowledgeBaseList, /legacyState\.fetchList\s*=/)
  assert.match(organizationStore, /async function fetchOrganizations[\s\S]*?if \(isLiteProductMode\(\)\) \{[\s\S]*?clearState\(\)[\s\S]*?return/)
  assert.match(organizationStore, /async function fetchSharedKnowledgeBases[\s\S]*?if \(isLiteProductMode\(\)\) \{[\s\S]*?clearState\(\)[\s\S]*?return \[\]/)
  assert.match(
    listUrlState,
    /const liteMode = isLiteProductMode\(\)[\s\S]*?const initScope = liteMode \? opts\.defaultScope/,
  )
})

test('Lite edition reuses the existing organization cache reset', () => {
  assert.match(organizationStore, /function clearState\(\)/)
  assert.match(organizationStore, /clearState\s*\}/)
  assert.match(router, /useOrganizationStore/)
  assert.match(router, /organizationStore\.clearState\(\)/)
})
