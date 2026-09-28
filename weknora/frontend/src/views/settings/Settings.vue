<template>
  <VisualSettingsShell
    :visible="visible"
    :dialog-label="$t('general.settings')"
    :content-label="activeNavLabel"
    :route-mode="isSettingsRoute"
    :content-wide="currentSection === 'members'"
    :content-full="SYSTEM_ADMIN_SECTIONS.has(currentSection) || isIntegrationSection(currentSection)"
    @close="handleClose"
  >
    <template #nav>
      <button
        v-for="item in filteredNavItems"
        :key="item.key"
        type="button"
        class="visual-settings-nav__item"
        :class="{ 'is-active': currentSection === item.key }"
        :aria-current="currentSection === item.key ? 'page' : undefined"
        @click="handleNavClick(item)"
      >
        <span>{{ item.label }}</span>
      </button>
      <p v-if="filteredNavItems.length === 0" class="visual-settings-nav__empty">
        {{ $t('general.noMatchingSettings') }}
      </p>
    </template>

    <section v-if="!canSeeSection(currentSection)" class="visual-settings-role-denied" aria-hidden="true">
      <t-icon name="lock-on" />
    </section>

    <template v-else>
      <GeneralSettings v-if="currentSection === 'general'" />
      <UsageBillingSettings v-else-if="currentSection === 'usage'" />
      <OllamaSettings v-else-if="currentSection === 'ollama'" />
      <WeKnoraCloudSettings v-else-if="currentSection === 'weknoracloud'" />
      <ModelSettings v-else-if="currentSection === 'models'" :initial-type="currentModelType" />
      <WebSearchSettings v-else-if="currentSection === 'websearch'" />
      <ChatHistorySettings v-else-if="currentSection === 'chathistory'" />
      <MemoryWorkspaceSettings v-else-if="currentSection === 'memory'" />
      <MemorySettings v-else-if="currentSection === 'mymemory'" />
      <EnvVarSettings v-else-if="currentSection === 'envvars'" />
      <VectorStoreSettings v-else-if="currentSection === 'vectorstore'" />
      <ParserEngineSettings v-else-if="currentSection === 'parser'" />
      <StorageEngineSettings v-else-if="currentSection === 'storage'" />
      <SandboxSettings v-else-if="currentSection === 'sandbox'" />
      <SkillSettings
        v-else-if="currentSection === 'skills'"
        :initial-sandbox-id="currentSubSection"
      />
      <SystemInfo v-else-if="currentSection === 'system'" />
      <SystemSettings v-else-if="currentSection === 'system-global'" />
      <RuntimeQueues v-else-if="currentSection === 'runtime-queues'" />
      <PlatformAPIKeys v-else-if="currentSection === 'platform-api-keys'" />
      <SystemAuditLog v-else-if="currentSection === 'system-audit-log'" />
      <UserProfile v-else-if="currentSection === 'userprofile'" />
      <TenantInfo v-else-if="currentSection === 'tenant'" />
      <TenantMembers v-else-if="currentSection === 'members'" />
      <IntegrationSettingsSection
        v-else-if="isPublicIntegrationSection(currentSection)"
        :tab="integrationTabFromSection(currentSection)"
      />
      <McpSettings v-else-if="currentSection === 'mcp'" />
    </template>
  </VisualSettingsShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { LocationQueryRaw } from 'vue-router'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useDeploymentCapabilitiesStore } from '@/stores/deploymentCapabilities'
import { useI18n } from 'vue-i18n'
import { MessagePlugin } from 'tdesign-vue-next'
import SystemInfo from './SystemInfo.vue'
import TenantInfo from './TenantInfo.vue'
import UserProfile from './UserProfile.vue'
import GeneralSettings from './GeneralSettings.vue'
import UsageBillingSettings from './UsageBillingSettings.vue'
import ModelSettings from './ModelSettings.vue'
import OllamaSettings from './OllamaSettings.vue'
import McpSettings from './McpSettings.vue'
import WebSearchSettings from './WebSearchSettings.vue'
import ChatHistorySettings from './ChatHistorySettings.vue'
import MemorySettings from './MemorySettings.vue'
import EnvVarSettings from './EnvVarSettings.vue'
import MemoryWorkspaceSettings from './MemoryWorkspaceSettings.vue'
import VectorStoreSettings from './VectorStoreSettings.vue'
import ParserEngineSettings from './ParserEngineSettings.vue'
import StorageEngineSettings from './StorageBackendSettings.vue'
import SandboxSettings from './SandboxSettings.vue'
import SkillSettings from './SkillSettings.vue'
import WeKnoraCloudSettings from './WeKnoraCloudSettings.vue'
import TenantMembers from './TenantMembers.vue'
import SystemSettings from '@/views/system/SystemSettings.vue'
import RuntimeQueues from '@/views/system/RuntimeQueues.vue'
import PlatformAPIKeys from '@/views/system/PlatformAPIKeys.vue'
import SystemAuditLog from '@/views/system/SystemAuditLog.vue'
import IntegrationSettingsSection from '@/views/integrations/IntegrationSettingsSection.vue'
import {
  INTEGRATION_PREVIEW_ITEMS,
  INTEGRATION_TAB_CAPABILITY,
  INTEGRATION_TAB_MIN_ROLE,
  isExposedIntegrationTab,
} from '@/config/integrations'
import {
  canAccessSettingsNavigationSection,
  SETTINGS_SECTION_MIN_ROLE,
  SYSTEM_ADMIN_SETTINGS_SECTIONS,
} from '@/config/settingsAccess'
import { filterSettingsNavigation } from './settingsNavigation'
import VisualSettingsShell from './components/VisualSettingsShell.vue'
import { SETTINGS_SECTION_CAPABILITY } from '@/config/deploymentCapabilities'
import { SKILL_ICON } from '@/types/mention'
import {
  buildSettingsRouteQuery,
  integrationSectionKey,
  integrationTabFromSection,
  isIntegrationSection,
  normalizeExposedIntegrationSettingsSection,
  settingsQueryUnchanged,
} from '@/config/settingsRoute'

const route = useRoute()
const router = useRouter()
const uiStore = useUIStore()
const authStore = useAuthStore()
const deploymentCapabilities = useDeploymentCapabilitiesStore()
const { t } = useI18n()

const currentSection = ref<string>('general')
const currentSubSection = ref<string>('')
const settingsSearchQuery = ref('')

type NavItem = {
  key: string
  icon: string
  label: string
  emoji?: string
}

const SYSTEM_ADMIN_SECTIONS = SYSTEM_ADMIN_SETTINGS_SECTIONS

const canManageSettingsNavigation = computed(() =>
  authStore.isSystemAdmin || authStore.canAccessAllTenants || authStore.hasRole('admin'),
)

const isPublicIntegrationSection = (section: string): boolean => (
  isIntegrationSection(section)
  && isExposedIntegrationTab(integrationTabFromSection(section))
)

const normalizeSettingsSection = (section: string) => {
  const normalized = normalizeExposedIntegrationSettingsSection(
    section,
    route.query.tab as string | undefined,
  )
  if (!authStore.isLiteMode || isPublicIntegrationSection(normalized)) return normalized
  if (!canManageSettingsNavigation.value) return integrationSectionKey('im')
  if (
    normalized === 'general'
    || normalized === 'usage'
    || normalized === 'userprofile'
    || normalized === 'models'
    || normalized === 'mymemory'
    || normalized === 'memory'
    || normalized === 'mcp'
  ) {
    return normalized
  }
  return 'general'
}

const syncSettingsRoute = (sectionKey: string) => {
  if (route.path !== '/platform/settings') return
  const query = buildSettingsRouteQuery(sectionKey, route.query)
  if (settingsQueryUnchanged(route.query, query)) return
  void router.replace({
    path: '/platform/settings',
    query: query as LocationQueryRaw,
  })
}

const isSectionSupported = (key: string): boolean => {
  if (isIntegrationSection(key)) {
    if (!isPublicIntegrationSection(key)) return false
    return deploymentCapabilities.isSupported(
      INTEGRATION_TAB_CAPABILITY[integrationTabFromSection(key)],
    )
  }
  return deploymentCapabilities.isSupported(SETTINGS_SECTION_CAPABILITY[key])
}

const canSeeSection = (key: string): boolean => {
  if (!canAccessSettingsNavigationSection(
    key,
    canManageSettingsNavigation.value,
    authStore.isLiteMode,
  )) {
    return false
  }
  if (isIntegrationSection(key)) {
    if (!isPublicIntegrationSection(key) || !authStore.canManageChannels) return false
    const min = INTEGRATION_TAB_MIN_ROLE[integrationTabFromSection(key)]
    if (!min) return true
    if (authStore.canAccessAllTenants) return true
    return authStore.hasRole(min)
  }
  if (authStore.isLiteMode) {
    if (key === 'mcp') return authStore.canAccessAllTenants || authStore.hasRole('admin')
    return key === 'general'
      || key === 'usage'
      || key === 'userprofile'
      || key === 'models'
      || key === 'mymemory'
      || key === 'memory'
  }
  if (SYSTEM_ADMIN_SECTIONS.has(key)) return authStore.isSystemAdmin
  const min = SETTINGS_SECTION_MIN_ROLE[key] ?? 'viewer'
  if (authStore.canAccessAllTenants) return true
  return authStore.hasRole(min)
}

const navItems = computed<NavItem[]>(() => {
  const integrationItems: NavItem[] = INTEGRATION_PREVIEW_ITEMS
    .filter((item) => isExposedIntegrationTab(item.key))
    .map((item) => ({
      key: integrationSectionKey(item.key),
      icon: item.icon.type === 'icon' ? item.icon.name : 'integration',
      emoji: item.icon.type === 'emoji' ? item.icon.value : undefined,
      label: t(`integrations.tabs.${item.key}`),
    }))

  if (authStore.isLiteMode) {
    if (!canManageSettingsNavigation.value) {
      return integrationItems.filter((item) => canSeeSection(item.key) && isSectionSupported(item.key))
    }
    const liteItems: NavItem[] = [
      { key: 'general', icon: 'setting', label: t('general.title') },
      { key: 'userprofile', icon: 'user', label: t('userProfile.title') },
      { key: 'models', icon: 'cpu', label: t('modelSettings.sceneModels.navTitle') },
      { key: 'mymemory', icon: 'bookmark', label: t('memorySettings.title') },
      { key: 'memory', icon: 'bulletpoint', label: t('memoryWorkspaceSettings.title') },
      ...(authStore.canAccessAllTenants || authStore.hasRole('admin')
        ? [{ key: 'mcp', icon: 'tools', label: t('settings.mcpService') }]
        : []),
      { key: 'usage', icon: 'chart-line', label: t('entitlement.usageTitle') },
    ]
    const supportedIntegrationItems = integrationItems.filter(
      (item) => canSeeSection(item.key) && isSectionSupported(item.key),
    )
    return [...liteItems, ...supportedIntegrationItems]
  }

  // Behavior authority is the fixed main commit 81142df. Keep every compatible
  // settings capability while rendering it through Musuw's visual shell.
  const all: NavItem[] = [
    { key: 'general', icon: 'setting', label: t('general.title') },
    { key: 'usage', icon: 'chart-line', label: t('entitlement.usageTitle') },
    { key: 'userprofile', icon: 'user', label: t('userProfile.title') },
    { key: 'tenant', icon: 'user-circle', label: t('settings.tenantInfo') },
    { key: 'members', icon: 'usergroup', label: t('tenantMember.title') },
    { key: 'chathistory', icon: 'chat', label: t('chatHistorySettings.title') },
    { key: 'models', icon: 'cpu', label: t('settings.modelManagement') },
    { key: 'ollama', icon: 'server', label: 'Ollama' },
    { key: 'weknoracloud', icon: 'cloud', label: 'Musuw Cloud' },
    { key: 'memory', icon: 'bulletpoint', label: t('memoryWorkspaceSettings.title') },
    { key: 'mymemory', icon: 'bookmark', label: t('memorySettings.title') },
    { key: 'envvars', icon: 'key', label: t('envVarSettings.title') },
    { key: 'vectorstore', icon: 'data-base', label: t('settings.vectorStoreEngine') },
    { key: 'parser', icon: 'file-search', label: t('settings.parserEngine') },
    { key: 'storage', icon: 'cloud', label: t('settings.storageEngine') },
    { key: 'sandbox', icon: 'code', label: t('settings.sandbox.title') },
    { key: 'skills', icon: SKILL_ICON, label: t('settings.skills.title') },
    { key: 'websearch', icon: 'search', label: t('settings.webSearchConfig') },
    { key: 'mcp', icon: 'tools', label: t('settings.mcpService') },
    { key: 'system-global', icon: 'server', label: t('settings.system') },
    { key: 'runtime-queues', icon: 'queue', label: t('settings.taskQueue') },
    { key: 'platform-api-keys', icon: 'secured', label: t('platformApiKeys.title') },
    { key: 'system-audit-log', icon: 'history', label: t('system.globalSettings.audit.tabLabel') },
    { key: 'system', icon: 'info-circle', label: t('settings.versionInfo') },
    ...integrationItems,
  ]

  if (!authStore.currentTenantRole && !authStore.canAccessAllTenants && !authStore.isSystemAdmin) return []
  return all.filter((item) => canSeeSection(item.key) && isSectionSupported(item.key))
})

const filteredNavItems = computed(() => filterSettingsNavigation(navItems.value, settingsSearchQuery.value))
const activeNavLabel = computed(() => navItems.value.find((item) => item.key === currentSection.value)?.label || t('general.settings'))
const isSettingsRoute = computed(() => route.path === '/platform/settings')
const visible = computed(() => route.path === '/platform/settings' || uiStore.showSettingsModal)

const currentModelType = computed(() => {
  if (currentSection.value !== 'models') return null
  if (currentSubSection.value) return currentSubSection.value
  if (route.path === '/platform/settings' && typeof route.query.tab === 'string') return route.query.tab
  return uiStore.settingsInitialSubSection || null
})

const handleNavClick = (item: NavItem) => {
  currentSection.value = item.key
  currentSubSection.value = ''
  syncSettingsRoute(item.key)
}

const handleClose = () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  uiStore.closeSettings()
  if (route.path === '/platform/settings') {
    const section = route.query.section
    if (
      section === 'system-global'
      || section === 'runtime-queues'
      || section === 'platform-api-keys'
      || section === 'system-audit-log'
    ) {
      void router.replace('/platform/knowledge-bases')
    } else {
      const previousPath = router.options.history.state.back
      const previousRoutePath = typeof previousPath === 'string' ? previousPath.split(/[?#]/, 1)[0] : ''
      if (previousRoutePath.startsWith('/platform/') && previousRoutePath !== '/platform/settings') {
        router.back()
      } else {
        void router.replace('/platform/knowledge-bases')
      }
    }
  }
}

watch(() => uiStore.settingsInitialSection, (section) => {
  if (!section || !visible.value) return
  const normalizedSection = normalizeSettingsSection(section)
  if (deploymentCapabilities.loaded && !isSectionSupported(normalizedSection)) {
    MessagePlugin.warning(t('settings.capabilityUnavailable'))
    const fallback = navItems.value[0]?.key || 'general'
    currentSection.value = fallback
    currentSubSection.value = ''
    syncSettingsRoute(fallback)
    return
  }
  currentSection.value = normalizedSection
  currentSubSection.value = authStore.isLiteMode ? '' : (uiStore.settingsInitialSubSection || '')
  syncSettingsRoute(normalizedSection)
}, { immediate: true })

watch(() => uiStore.settingsInitialSubSection, (sub) => {
  if (uiStore.settingsInitialSection === 'skills' && visible.value) {
    currentSubSection.value = sub || ''
  }
})

watch(
  () => [visible.value, route.path, route.query.section, route.query.tab, deploymentCapabilities.loaded] as const,
  ([isVisible, path, section, tab, capabilitiesLoaded]) => {
    if (!isVisible || path !== '/platform/settings') return
    if (typeof section !== 'string') {
      syncSettingsRoute(currentSection.value || 'general')
      return
    }
    const normalizedSection = normalizeSettingsSection(section)
    if (normalizedSection !== section || (isIntegrationSection(normalizedSection) && tab)) {
      syncSettingsRoute(normalizedSection)
    }
    if (capabilitiesLoaded && !isSectionSupported(normalizedSection)) {
      MessagePlugin.warning(t('settings.capabilityUnavailable'))
      const fallback = navItems.value[0]?.key || 'general'
      currentSection.value = fallback
      currentSubSection.value = ''
      syncSettingsRoute(fallback)
      return
    }
    currentSection.value = normalizedSection
    currentSubSection.value = authStore.isLiteMode ? '' : (
      normalizedSection === 'models' && typeof tab === 'string' ? tab : ''
    )
  },
  { immediate: true },
)

watch(navItems, (items) => {
  if (!items.some((item) => item.key === currentSection.value)) {
    const fallback = items[0]?.key || 'general'
    currentSection.value = fallback
    currentSubSection.value = ''
    syncSettingsRoute(fallback)
  }
}, { immediate: true })

const handleSettingsNav = (event: Event) => {
  const detail = event instanceof CustomEvent ? event.detail : null
  if (!detail?.section) return
  const normalizedSection = normalizeSettingsSection(String(detail.section))
  if (deploymentCapabilities.loaded && !isSectionSupported(normalizedSection)) {
    MessagePlugin.warning(t('settings.capabilityUnavailable'))
    currentSection.value = navItems.value[0]?.key || 'general'
    currentSubSection.value = ''
    return
  }
  currentSection.value = normalizedSection
  currentSubSection.value = authStore.isLiteMode ? '' : (detail.subsection ? String(detail.subsection) : '')
  syncSettingsRoute(normalizedSection)
}

onMounted(() => {
  window.addEventListener('settings-nav', handleSettingsNav as EventListener)
})

watch(currentSection, () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})

onUnmounted(() => {
  window.removeEventListener('settings-nav', handleSettingsNav as EventListener)
})
</script>
