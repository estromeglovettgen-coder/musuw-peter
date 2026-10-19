import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('all native onboarding entry points apply the Fire guide policy', () => {
  for (const [component, tour] of [
    ['NewUserGuide', 'global'],
    ['AgentCreateContextualGuide', 'agentCreate'],
    ['KbCreateContextualGuide', 'kbCreate'],
  ]) {
    const source = read(`../components/${component}.vue`)
    assert.match(source, /import \{ workspaceGuideSteps \} from '@\/config\/workspaceGuides'/)
    assert.ok(source.includes(`workspaceGuideSteps(authStore.isLiteMode ? liteSteps : standardSteps, '${tour}')`), component)
  }
  const modelGuide = read('../components/TenantModelsGuide.vue')
  assert.match(modelGuide, /const tryOpen = \(\) => \{\s*if \(isPeterWorkspace \|\|/)
  assert.match(modelGuide, /if \(isPeterWorkspace \|\| !val \|\| isLite\)/)
})

test('Fire agent list retains Taylor and custom agents without a model setup detour', () => {
  const source = read('../views/agent/AgentList.vue')
  assert.match(source, /if \(isPeterWorkspace && agent\?\.is_builtin && agent\.id !== 'fire-taylor'\) return false/)
  assert.match(source, /const searchable = isPeterWorkspace \? \[name, description\] : \[name, description, model\]/)
  assert.match(source, /const handleCreateAgent = async \(\) => \{\s*if \(isPeterWorkspace\) \{[\s\S]*?openCreateModal\(\)\s*return/)
  assert.match(source, /<div v-if="!isPeterWorkspace" class="shared-detail-row">\s*<span class="shared-detail-label">\{\{ \$t\('agent\.shareScope\.chatModel'\)/)
  assert.match(source, /<div v-if="!isPeterWorkspace && sharedAgentUsesKb" class="shared-detail-row">/)
})
