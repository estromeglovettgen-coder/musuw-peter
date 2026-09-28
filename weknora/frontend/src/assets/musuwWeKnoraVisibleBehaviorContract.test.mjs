import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

/**
 * Three authorities coexist:
 * 1. @视觉文件 owns presentation of exposed surfaces.
 * 2. WeKnora main 81142df owns behavior inside those exposed capabilities.
 * 3. Musuw Lite owns which capabilities are exposed at all.
 *
 * Standard keeps the complete upstream source surface for reversible restore;
 * Lite is intentionally narrower and that narrowing is not a behavior bug.
 */

test('Standard WeKnora routes remain in source while Lite route exposure is fail-closed', () => {
  const router = read('../router/index.ts')

  // Reversible Standard source stays present.
  assert.ok(router.includes('path: "agents"'))
  assert.ok(router.includes('import("../views/agent/AgentList.vue")'))
  assert.ok(router.includes('path: "organizations"'))
  assert.ok(router.includes('import("../views/organization/OrganizationList.vue")'))
  assert.ok(router.includes('requiresSystemAdmin: true'))

  // Lite reachability is a deliberate product allow-list.
  assert.ok(router.includes('function isAllowedLitePath(path: string)'))
  for (const allowed of [
    "path === '/platform/creatChat'",
    "path.startsWith('/platform/chat/')",
    "path === '/platform/knowledge-bases'",
    "path.startsWith('/platform/knowledge-bases/')",
    "path === '/platform/agents'",
    "path === '/platform/settings'",
    "path === '/plans'",
    "path === '/checkout'",
  ]) assert.ok(router.includes(allowed), `Lite allow-list lost ${allowed}`)
  assert.match(router, /if \(!isAllowedLitePath\(to\.path\)\)[\s\S]*next\(AUTHENTICATED_HOME_PATH\)/)
  assert.match(router, /LITE_SETTINGS_ROUTE_SECTIONS[\s\S]*'integration-im'[\s\S]*'integration-embed'/)
  assert.match(router, /normalizeExposedIntegrationSettingsSection/)
  assert.match(router, /!LITE_SETTINGS_ROUTE_SECTIONS\.has\(normalizedSection\)/)
  assert.match(router, /await ensureProductEdition\(authStore\)/)
})

test('sidebar keeps Standard definitions while Lite exposes chat, knowledge bases, native Agents and marketplace', () => {
  const store = read('../stores/menu.ts')
  const sidebar = read('../components/menu.vue')

  assert.match(store, /liteVisiblePaths\s*=\s*new Set\(\['creatChat',\s*'knowledge-bases',\s*'agents',\s*'marketplace'\]\)/)
  assert.doesNotMatch(store, /path: 'orders'/)
  assert.match(store, /authStore\.isLiteMode && !liteVisiblePaths\.has\(item\.path\)/)
  for (const path of ['agents', 'organizations', 'settings', 'logout']) {
    assert.ok(store.includes(`path: '${path}'`), `Standard menu source lost ${path}`)
  }

  assert.ok(sidebar.includes("handleMenuClick('creatChat')"))
  assert.ok(sidebar.includes("handleMenuClick('knowledge-bases')"))
  assert.ok(sidebar.includes('<UserMenu />'))
})

test('Lite UserMenu cannot reopen management surfaces and keeps valid interactive DOM', () => {
  const userMenu = read('../components/UserMenu.vue')

  assert.match(userMenu, /class="visual-user-menu__account(?: [^"]*)?"/)
  assert.equal(
    /<button[^>]*class="visual-user-menu__account"[\s\S]{0,700}<button/.test(userMenu),
    false,
    'account container must not nest a button inside a button',
  )
  assert.ok(userMenu.includes("handleQuickNav('general')"))
  assert.ok(userMenu.includes("handleQuickNav('usage')"))
  assert.match(userMenu, /!authStore\.isLiteMode && canManageMembers/)
  assert.match(userMenu, /!authStore\.isLiteMode && canManageModels/)
  assert.match(userMenu, /<template v-if="!authStore\.isLiteMode">[\s\S]*handleSettings[\s\S]*openDocs[\s\S]*openGithub/)

  // Standard recovery remains source-complete.
  for (const token of [
    "handleQuickNav('userprofile')",
    "handleQuickNav('tenant')",
    "handleQuickNav('members')",
    "handleQuickNav('models')",
    'handleSystemAdmin',
    'reopenGuide',
    'switchToTenant',
    'openCreateTenantDialog',
    "handoffToExternalAuth('logout')",
  ]) assert.ok(userMenu.includes(token), `Standard UserMenu source lost ${token}`)
})

test('Lite Settings exposes member channels and retains manager settings; Standard remains recoverable', () => {
  const settings = read('../views/settings/Settings.vue')
  const general = read('../views/settings/GeneralSettings.vue')

  assert.match(settings, /normalizeExposedIntegrationSettingsSection/)
  assert.match(settings, /if \(!canManageSettingsNavigation\.value\) return integrationSectionKey\('im'\)/)
  assert.match(settings, /if \(!canManageSettingsNavigation\.value\) \{[\s\S]*return integrationItems\.filter/)
  assert.match(settings, /if \(authStore\.isLiteMode\) \{[\s\S]*if \(key === 'mcp'\) return authStore\.canAccessAllTenants \|\| authStore\.hasRole\('admin'\)[\s\S]*key === 'mymemory'[\s\S]*key === 'memory'/)
  assert.match(settings, /if \(authStore\.isLiteMode\) \{[\s\S]*key: 'general'[\s\S]*key: 'userprofile'[\s\S]*key: 'models'[\s\S]*key: 'mymemory'[\s\S]*key: 'memory'[\s\S]*key: 'mcp'[\s\S]*key: 'usage'[\s\S]*supportedIntegrationItems/)
  assert.match(settings, /INTEGRATION_PREVIEW_ITEMS[\s\S]*isExposedIntegrationTab/)
  assert.match(settings, /\{ key: 'models', icon: 'cpu', label: t\('settings\.modelManagement'\) \}/)
  assert.ok(settings.includes('<ModelSettings v-else-if="currentSection === \'models\'"'))
  assert.ok(settings.includes('UsageBillingSettings'))

  assert.ok(general.includes('id="visual-language-select"'))
  assert.ok(general.includes('handleLanguageChange'))
  assert.ok(general.includes('id="visual-theme-select"'))
  assert.ok(general.includes('id="visual-theme-color-select"'))
  for (const standardOnly of ['visual-sans-font-select', 'visual-mono-font-select']) {
    const index = general.indexOf(standardOnly)
    assert.ok(index >= 0, `Standard preference source lost ${standardOnly}`)
    assert.match(general.slice(Math.max(0, index - 260), index), /v-if="!authStore\.isLiteMode"/)
  }
  assert.match(general, /v-if="!authStore\.isLiteMode"[\s\S]*font\.fontSize/)

  // Complete Standard sections remain mounted in source, not deleted.
  for (const component of [
    'UserProfile', 'TenantInfo', 'TenantMembers', 'ChatHistorySettings', 'ModelSettings',
    'OllamaSettings', 'WeKnoraCloudSettings', 'IntegrationSettingsSection', 'VectorStoreSettings',
    'ParserEngineSettings', 'StorageEngineSettings', 'WebSearchSettings', 'McpSettings',
    'SystemSettings', 'RuntimeQueues', 'PlatformAPIKeys', 'SystemAuditLog', 'SystemInfo',
  ]) assert.ok(settings.includes(component), `Standard Settings source lost ${component}`)
})

test('exposed chat keeps native model/thinking/Agent behavior without exposing WebSearch management discovery', () => {
  const input = read('../components/Input-field.vue')
  const baseline = read('./business-baselines/Input-field.pre-view.vue')
  const resources = read('../stores/chatResources.ts')
  const commandPalette = read('../stores/commandPalette.ts')

  assert.ok(input.includes('<textarea'), 'reference native textarea topology disappeared')
  assert.equal(input.includes('<t-textarea'), false, 'composer must not restore vendor textarea wrapper')
  assert.ok(input.includes('v-for="model in availableModels"'))
  assert.ok(input.includes('reasoningOptions'))
  for (const token of ['handleSelectAgent', 'handleAgentNotReady', 'thinkingEnabled']) {
    assert.ok(baseline.includes(token), `allowed chat controller lost native behavior ${token}`)
  }

  // Lite now loads the native tenant Agent list but still does not fetch
  // cross-tenant shared Agents or web-search provider management surfaces.
  assert.match(resources, /if \(isLiteProductMode\(\)\)[\s\S]*await listAgents\(\{ creator \}\)/)
  assert.match(resources, /ensureKnowledgeBases\(force\),[\s\S]*ensureAgents\(force\),[\s\S]*ensureModels\(force\)/)
  assert.match(resources, /if \(isLiteProductMode\(\)\)[\s\S]*webSearchProviders\.value = \[\]/)
  assert.match(commandPalette, /if \(auth\.isLiteMode\) \{[\s\S]*open\.value = false[\s\S]*return/)
})

test('Knowledge Base keeps native scopes, sharing, Trace/Wiki/Graph-facing workflows', () => {
  const active = read('../views/knowledge/KnowledgeBaseList.vue')
  const controller = read('./business-baselines/KnowledgeBaseList.pre-view.vue')
  const detail = read('../views/knowledge/KnowledgeBase.vue')
  const documentMenu = read('../views/knowledge/components/DocumentActionMenu.vue')

  assert.ok(active.includes('<ListSpaceSidebar'))
  assert.ok(active.includes('v-model="spaceSelection"'))
  assert.ok(controller.includes("val === 'all' || val === 'mine' || val === 'favorites' || val === 'recents'"))
  assert.ok(controller.includes('listOrganizationSharedKnowledgeBases(val)'))
  assert.ok(controller.includes('orgStore.fetchSharedKnowledgeBases({ force })'))

  assert.ok(detail.includes('<WikiBrowser'))
  assert.ok(detail.includes("activeKbTab === 'graph'"))
  assert.match(detail, /@probe-trace="\(item(?:: any)?\) => probeTraceAvailable\(item\)"/)
  for (const token of ['trace', 'reparse', 'cancel', 'move', 'delete']) {
    assert.ok(documentMenu.toLowerCase().includes(token), `Knowledge Base document action lost ${token}`)
  }
})

test('reference-only demo actions are not invented as business behavior', () => {
  const batch = read('../components/SessionBatchManageModal.vue')
  assert.equal(batch.includes("emit('pin')"), false)
  assert.equal(batch.includes("emit('unpin')"), false)

  const bot = read('../views/chat/components/botmsg.vue')
  assert.equal(bot.includes('createReactionAPI'), false)
  assert.equal(bot.includes('createReceiptAPI'), false)
})

test('Lite chat keeps ordinary answers but hides generated artifact discovery and hydration', () => {
  const bot = read('../views/chat/components/botmsg.vue')
  assert.match(bot, /v-if="!authStore\.isLiteMode && \(hasArtifacts \|\| artifactsCollecting\)"/)
  assert.match(bot, /v-if="!authStore\.isLiteMode && hasArtifacts"/)
  assert.match(bot, /if \(authStore\.isLiteMode\) return \[\]/)
  assert.match(bot, /if \(!authStore\.isLiteMode\) await hydrateArtifactImages/)
  assert.match(bot, /!authStore\.isLiteMode && isArtifactRefHref/)
})

test('Graph and parsing Trace remain outside global paint ownership', () => {
  const bridge = read('./musuw-tdesign-overlay-bridge.css')
  const preference = read('./musuw-visual-preference-compat.css')
  const closure = read('./musuw-final-contract-closure.css')
  const finalTheme = read('./musuw-final-theme-closure.css')
  const detail = read('../views/knowledge/KnowledgeBase.vue')
  const wiki = read('../views/knowledge/wiki/WikiBrowser.vue')
  assert.equal(bridge.includes('body .t-popconfirm'), false, 'global popconfirm styling would leak into parsing Trace')
  assert.ok(bridge.includes('body .t-select__dropdown:not(.org-select-dropdown-popup)'))
  assert.ok(bridge.includes('not(.sandbox-backend-popup)'))
  assert.equal(preference.includes('body .t-popconfirm'), false, 'dark-mode popconfirm styling would leak into parsing Trace')
  assert.equal(finalTheme.includes('body .t-popconfirm'), false, 'final dark-theme closure would leak into parsing Trace')
  assert.equal(closure.includes('.wiki-graph'), false, 'final closure must not paint the graph to undo another global rule')
  assert.equal(closure.includes('.kp-proccfg-pop'), false, 'final closure must not paint parsing Trace')
  assert.ok(detail.includes("'is-graph-tab': activeKbTab === 'graph'"))
  assert.ok(wiki.includes("overlayClassName: 'wiki-graph-search-dropdown'"))
  assert.ok(wiki.includes('drawer-class-name="wiki-graph-drawer"'))
})
