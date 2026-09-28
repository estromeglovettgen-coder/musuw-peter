<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { MessagePlugin } from 'tdesign-vue-next'
import { getCurrentUser, logout as logoutApi, userInfoFromApi } from '@/api/auth'
import { useI18n } from 'vue-i18n'
import CreateTenantDialog from '@/components/CreateTenantDialog.vue'
import {
  navigateAfterTenantSwitch,
  persistLastActiveTenantPreference,
  stashTenantSwitchToast,
} from '@/utils/tenantSwitch'
import type { TenantInfo } from '@/api/tenant'
import { useRoleLabel, useHomeTenant } from '@/composables/useRoleLabel'
import { getRootZoom, rectToCssPx, cssViewportSize } from '@/utils/zoom'
import { openNewUserGuide } from '@/config/contextualGuides'
import { SETTINGS_MANAGEMENT_SHORTCUT_MIN_ROLE } from '@/config/settingsAccess'
import { handoffToExternalAuth } from '@/utils/nativeAuthHandoff'
import { useCurrentEntitlementStore } from '@/stores/entitlement'

const { t } = useI18n()
const router = useRouter()
const uiStore = useUIStore()
const authStore = useAuthStore()
const entitlementStore = useCurrentEntitlementStore()
const { entitlement, loading: entitlementLoading } = storeToRefs(entitlementStore)
const { formatRole, roleIcon } = useRoleLabel()
const { homeTenantId, isHomeTenant } = useHomeTenant()

const activeTenantName = computed(() => authStore.selectedTenantName || authStore.tenant?.name || '')
const currentRoleLabel = computed(() => formatRole(authStore.currentTenantRole))
const currentRoleIcon = computed(() => roleIcon(authStore.currentTenantRole))
const showTenantIdentityLine = computed(() => {
  if (authStore.isLiteMode) return false
  if (authStore.canAccessAllTenants) return true
  return (authStore.memberships ?? []).length > 1
})
const canManageMembers = computed(() =>
  authStore.canAccessAllTenants || authStore.hasRole(SETTINGS_MANAGEMENT_SHORTCUT_MIN_ROLE.members),
)
const canManageModels = computed(() =>
  authStore.canAccessAllTenants || authStore.isSystemAdmin ||
  authStore.hasRole(SETTINGS_MANAGEMENT_SHORTCUT_MIN_ROLE.models),
)

const menuRef = ref<HTMLElement>()
const tenantMenuItemRef = ref<HTMLElement>()
const menuVisible = ref(false)
const tenantSubmenuOpen = ref(false)
const tenantSubmenuStyle = ref<Record<string, string>>({})
let tenantSubmenuHideTimer: ReturnType<typeof setTimeout> | null = null

const userInfo = ref({ username: t('common.defaultUser'), email: 'user@example.com', avatar: '' })
const userName = computed(() => userInfo.value.username)
const userEmail = computed(() => userInfo.value.email)
const userAvatar = computed(() => userInfo.value.avatar)
const userInitial = computed(() => userName.value.charAt(0).toUpperCase())
const billingIsFree = computed(() =>
  entitlement.value?.plan === 'free'
  // Keep the Lite upgrade affordance stable while the entitlement request is
  // in flight. A failed request still falls back to the neutral plans action
  // instead of guessing that the user is on the free plan.
  || (!entitlement.value && entitlementLoading.value && authStore.isLiteMode),
)
const billingCanUpgrade = computed(() =>
  entitlement.value ? entitlement.value.plan !== 'max' : billingIsFree.value,
)
const clampPercent = (value: number) => Math.round(Math.max(0, Math.min(100, value)))
const usageRemainingPercent = computed<number | null>(() => {
  const data = entitlement.value
  if (!data || data.openrouter_credits_status === 'unavailable' || data.openrouter_credits_status === 'pending') return null
  if (data.openrouter_credits_status === 'unprovisioned') return 100
  const total = Number(data.monthly_openrouter_microusd)
  const remaining = Number(data.openrouter_remaining_microusd)
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(remaining)) return null
  return clampPercent((remaining / total) * 100)
})
const handleTriggerClick = () => {
  if (uiStore.sidebarCollapsed) {
    uiStore.expandSidebar()
    menuVisible.value = false
    return
  }
  menuVisible.value = !menuVisible.value
  if (menuVisible.value) void loadEntitlement()
}
const handleQuickNav = (section: string, query: Record<string, string> = {}) => {
  menuVisible.value = false
  uiStore.openSettings()
  router.push({ path: '/platform/settings', query: { section, ...query } })
}
const openPlans = () => {
  menuVisible.value = false
  void router.push('/plans')
}
const handleSettings = () => {
  menuVisible.value = false
  uiStore.openSettings()
  router.push('/platform/settings')
}
const handleSystemAdmin = () => {
  menuVisible.value = false
  uiStore.openSettings('system-global')
  router.push({ path: '/platform/settings', query: { section: 'system-global' } })
}
const closeAll = () => {
  tenantSubmenuOpen.value = false
  menuVisible.value = false
}

const createTenantDialogVisible = ref(false)
const openCreateTenantDialog = () => {
  closeAll()
  if (!authStore.canCreateTenant) {
    MessagePlugin.info(t('tenant.create.disabled'))
    return
  }
  createTenantDialogVisible.value = true
}
const onTenantCreated = async (newTenant: TenantInfo) => {
  await authStore.refreshFromAuthMe()
  authStore.setSelectedTenant(newTenant.id, newTenant.name)
  const persist = persistLastActiveTenantPreference(newTenant.id)
  Promise.race([persist, new Promise((resolve) => setTimeout(resolve, 300))])
    .finally(() => navigateAfterTenantSwitch())
}

type Membership = { tenant_id: number; tenant_name?: string; role: string }
const switchableMemberships = computed<Membership[]>(() => authStore.memberships ?? [])
const showTenantSwitcher = computed(() => switchableMemberships.value.length >= 1)
const isCurrentTenant = (id: number) => {
  const active = authStore.effectiveTenantId
  return active != null && Number(active) === Number(id)
}
const tenantDisplayName = (membership: Membership) =>
  membership.tenant_name && membership.tenant_name.trim() !== ''
    ? membership.tenant_name
    : `#${membership.tenant_id}`
const tenantInitial = (membership: Membership) =>
  (tenantDisplayName(membership).trim().charAt(0) || '?').toUpperCase()
const switchToTenant = (membership: Membership) => {
  if (isCurrentTenant(membership.tenant_id)) {
    closeAll()
    return
  }
  const home = homeTenantId.value
  const switchingToHome = home !== null && home === membership.tenant_id
  authStore.setSelectedTenant(membership.tenant_id, tenantDisplayName(membership))
  closeAll()
  stashTenantSwitchToast({
    name: tenantDisplayName(membership),
    role: formatRole(membership.role) || undefined,
    roleEnum: membership.role || undefined,
  })
  const persist = persistLastActiveTenantPreference(switchingToHome ? null : membership.tenant_id)
  Promise.race([persist, new Promise((resolve) => setTimeout(resolve, 400))])
    .finally(() => navigateAfterTenantSwitch())
}

let lastTenantSubmenuMembershipRefresh = 0
const TENANT_SUBMENU_MEMBERSHIP_REFRESH_MS = 2000
const showTenantSubmenu = () => {
  if (tenantSubmenuHideTimer) {
    clearTimeout(tenantSubmenuHideTimer)
    tenantSubmenuHideTimer = null
  }
  positionTenantSubmenu()
  tenantSubmenuOpen.value = true
  clampFloatingToViewport('.visual-user-tenant-submenu', tenantSubmenuStyle)
  const now = Date.now()
  if (now - lastTenantSubmenuMembershipRefresh >= TENANT_SUBMENU_MEMBERSHIP_REFRESH_MS) {
    lastTenantSubmenuMembershipRefresh = now
    void authStore.refreshFromAuthMe()
  }
}
const scheduleHideTenantSubmenu = () => {
  if (tenantSubmenuHideTimer) clearTimeout(tenantSubmenuHideTimer)
  tenantSubmenuHideTimer = setTimeout(() => {
    tenantSubmenuOpen.value = false
    tenantSubmenuHideTimer = null
  }, 180)
}
const positionTenantSubmenu = () => {
  const element = tenantMenuItemRef.value
  if (!element) return
  const zoom = getRootZoom()
  const rect = rectToCssPx(element.getBoundingClientRect(), zoom)
  const { width: viewportWidth } = cssViewportSize(zoom)
  const panelWidth = 264
  const gap = 8
  const margin = 8
  let left = rect.right + gap
  if (left + panelWidth + margin > viewportWidth) left = Math.max(margin, rect.left - panelWidth - gap)
  tenantSubmenuStyle.value = { left: `${left}px`, top: `${Math.max(margin, rect.top)}px` }
}
const clampFloatingToViewport = (selector: string, target: { value: Record<string, string> }) => {
  requestAnimationFrame(() => {
    const panel = document.querySelector(selector) as HTMLElement | null
    if (!panel) return
    const margin = 8
    const { height: viewportHeight } = cssViewportSize()
    const maxTop = viewportHeight - panel.offsetHeight - margin
    const currentTop = parseFloat(target.value.top || '0') || 0
    if (currentTop > maxTop) {
      target.value = { ...target.value, top: `${Math.max(margin, maxTop)}px` }
    }
  })
}

const reopenGuide = () => {
  menuVisible.value = false
  openNewUserGuide()
}
const openDocs = () => {
  menuVisible.value = false
  window.open('https://github.com/estromeglovettgen-coder/musuw/tree/main/weknora/docs', '_blank')
}
const openGithub = () => {
  menuVisible.value = false
  window.open('https://github.com/estromeglovettgen-coder/musuw', '_blank')
}
const handleLogout = async () => {
  menuVisible.value = false
  try { await logoutApi() } catch (error) { console.error('Logout API failed:', error) }
  authStore.logout()
  MessagePlugin.success(t('auth.logout'))
  handoffToExternalAuth('logout')
}

const loadUserInfo = async () => {
  try {
    const response = await getCurrentUser()
    if (response.success && response.data?.user) {
      const user = response.data.user
      userInfo.value = {
        username: user.username || t('common.info'),
        email: user.email || 'user@example.com',
        avatar: user.avatar || '',
      }
      authStore.setUser(userInfoFromApi(user))
      if (response.data.tenant) {
        authStore.setTenant({
          id: String(response.data.tenant.id),
          name: response.data.tenant.name,
          owner_id: user.id,
          created_at: response.data.tenant.created_at,
          updated_at: response.data.tenant.updated_at,
        })
      } else {
        authStore.setTenant(null)
      }
      if (Array.isArray(response.data.memberships)) authStore.setMemberships(response.data.memberships)
      const canCreateTenant = response.data.capabilities?.can_create_tenant
      if (typeof canCreateTenant === 'boolean') authStore.setCanCreateTenant(canCreateTenant)
    }
  } catch (error) {
    console.error('Failed to load user info:', error)
  }
}

const loadEntitlement = () => entitlementStore.refresh()

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Node
  if (menuRef.value?.contains(target)) return
  const floatingTenantMenu = document.querySelector('.visual-user-tenant-submenu')
  if (floatingTenantMenu?.contains(target)) return
  menuVisible.value = false
  tenantSubmenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  loadUserInfo()
  void entitlementStore.ensureFresh()
})
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  if (tenantSubmenuHideTimer) clearTimeout(tenantSubmenuHideTimer)
})
</script>

<template>
  <div ref="menuRef" class="visual-user-menu" :class="{ 'is-collapsed': uiStore.sidebarCollapsed }">
    <button type="button" class="visual-user-menu__trigger" data-guide="user-menu" :aria-expanded="menuVisible" @click="handleTriggerClick">
      <span class="visual-user-menu__avatar">
        <img v-if="userAvatar && !authStore.isLiteMode" :src="userAvatar" :alt="$t('common.avatar')" />
        <span v-else>{{ userInitial }}</span>
      </span>
      <template v-if="!uiStore.sidebarCollapsed">
        <span class="visual-user-menu__identity">
          <template v-if="showTenantIdentityLine">
            <strong :title="activeTenantName">{{ activeTenantName || userName }}</strong>
            <small><span v-if="userName && userName !== activeTenantName">{{ userName }}</span><span v-if="userName && userName !== activeTenantName && currentRoleLabel"> · </span><span v-if="currentRoleLabel">{{ currentRoleLabel }}</span></small>
          </template>
          <template v-else>
            <strong>{{ userName }}</strong>
            <small>{{ userEmail }}</small>
          </template>
        </span>
        <t-icon name="chevron-down" class="visual-user-menu__caret" :class="{ 'is-open': menuVisible }" />
      </template>
    </button>

    <div v-if="menuVisible && !uiStore.sidebarCollapsed" class="visual-user-menu__dropdown" @click.stop>
        <div
          class="visual-user-menu__account is-clickable"
          role="button"
          tabindex="0"
          @click="handleQuickNav('userprofile')"
          @keydown.enter.prevent="handleQuickNav('userprofile')"
          @keydown.space.prevent="handleQuickNav('userprofile')"
        >
          <span class="visual-user-menu__avatar is-small"><img v-if="userAvatar && !authStore.isLiteMode" :src="userAvatar" alt="" /><span v-else>{{ userInitial }}</span></span>
          <span class="visual-user-menu__account-copy"><strong>{{ userName }}</strong></span>
          <button v-if="!authStore.isLiteMode" type="button" class="visual-user-menu__guide" :title="$t('newUserGuide.reopen')" :aria-label="$t('newUserGuide.reopen')" @click.stop="reopenGuide"><t-icon name="help-circle" /></button>
        </div>

        <div
          v-if="!authStore.isLiteMode"
          ref="tenantMenuItemRef"
          class="visual-user-menu__tenant"
          :class="{ 'is-open': tenantSubmenuOpen, 'is-clickable': showTenantSwitcher }"
          @mouseenter="showTenantSwitcher && showTenantSubmenu()"
          @mouseleave="showTenantSwitcher && scheduleHideTenantSubmenu()"
        >
          <t-icon name="system-sum" />
          <span class="visual-user-menu__tenant-copy"><strong :title="activeTenantName || userName">{{ activeTenantName || userName }}</strong><small v-if="currentRoleLabel">{{ currentRoleLabel }}</small></span>
          <t-icon v-if="showTenantSwitcher" name="chevron-right" class="visual-user-menu__tenant-trail" />
        </div>

        <div class="visual-user-menu__divider visual-user-menu__divider--dashed" />
        <button type="button" class="visual-user-menu__item visual-user-menu__usage-item" @click="handleQuickNav('usage')">
          <t-icon name="chart-line" />
          <span>{{ $t('entitlement.usageMenu') }}</span>
          <small v-if="entitlementLoading && !entitlement">{{ $t('common.loading') }}</small>
          <small v-else-if="usageRemainingPercent !== null">{{ usageRemainingPercent }}% {{ $t('entitlement.remaining') }}</small>
          <small v-else-if="entitlement?.openrouter_credits_status === 'pending'">{{ $t('entitlement.billingPendingShort') }}</small>
        </button>
        <button type="button" class="visual-user-menu__item visual-user-menu__billing-item" :class="{ 'is-free': billingIsFree }" @click="openPlans">
          <t-icon v-if="billingIsFree" name="arrow-up" /><t-icon v-else name="crown" /><span>{{ billingCanUpgrade ? $t('entitlement.upgradePlan') : $t('entitlement.viewPlans') }}</span>
        </button>
        <button type="button" class="visual-user-menu__item" @click="handleQuickNav('general')"><t-icon name="setting" /><span>{{ authStore.isLiteMode ? $t('general.settings') : $t('general.personalSettings') }}</span></button>
        <button v-if="!authStore.isLiteMode" type="button" class="visual-user-menu__item" @click="handleQuickNav('tenant')"><t-icon name="user-circle" /><span>{{ $t('settings.workspaceSettings') }}</span></button>
        <button v-if="!authStore.isLiteMode && canManageMembers" type="button" class="visual-user-menu__item" @click="handleQuickNav('members')"><t-icon name="usergroup" /><span>{{ $t('tenantMember.title') }}</span></button>
        <button v-if="!authStore.isLiteMode && canManageModels" type="button" class="visual-user-menu__item" @click="handleQuickNav('models')"><t-icon name="control-platform" /><span>{{ $t('settings.modelManagement') }}</span></button>

        <template v-if="!authStore.isLiteMode">
          <div class="visual-user-menu__divider" />
          <button type="button" class="visual-user-menu__item" @click="handleSettings"><t-icon name="setting" /><span>{{ $t('general.allSettings') }}</span></button>
          <button v-if="authStore.isSystemAdmin" type="button" class="visual-user-menu__item" @click="handleSystemAdmin"><t-icon name="server" /><span>{{ $t('settings.system') }}</span></button>

          <div class="visual-user-menu__divider" />
          <button type="button" class="visual-user-menu__item" @click="openDocs"><t-icon name="help-circle" /><span>{{ $t('general.helpAndDocs') }}</span><t-icon name="jump" class="visual-user-menu__external" /></button>
          <button type="button" class="visual-user-menu__item" @click="openGithub"><t-icon name="logo-github" /><span>{{ $t('common.github') }}</span><t-icon name="jump" class="visual-user-menu__external" /></button>
        </template>

        <div v-if="!authStore.isLiteMode" class="visual-user-menu__divider" />
        <button type="button" class="visual-user-menu__item is-danger" @click="handleLogout"><t-icon name="logout" /><span>{{ $t('auth.logout') }}</span></button>
    </div>

    <Teleport to="body">
      <div
        v-if="tenantSubmenuOpen"
        class="visual-user-tenant-submenu"
        :style="tenantSubmenuStyle"
        @mouseenter="showTenantSubmenu"
        @mouseleave="scheduleHideTenantSubmenu"
      >
        <header>{{ $t('tenant.switcher.menuLabel') }}</header>
        <div class="visual-user-tenant-submenu__list">
          <button v-for="membership in switchableMemberships" :key="membership.tenant_id" type="button" class="visual-user-tenant-submenu__item" :class="{ 'is-current': isCurrentTenant(membership.tenant_id) }" @click="switchToTenant(membership)">
            <span class="visual-user-tenant-submenu__avatar">{{ tenantInitial(membership) }}<small v-if="isHomeTenant(membership.tenant_id)"><t-icon name="home" /></small></span>
            <span class="visual-user-tenant-submenu__copy"><strong>{{ tenantDisplayName(membership) }}</strong><small>{{ formatRole(membership.role) }}<span v-if="isCurrentTenant(membership.tenant_id)"> · {{ $t('tenant.switcher.currentBadge') }}</span></small></span>
            <t-icon v-if="isCurrentTenant(membership.tenant_id)" name="check" />
          </button>
          <p v-if="switchableMemberships.length === 0">{{ $t('tenant.switcher.empty') }}</p>
        </div>
        <button v-if="authStore.canCreateTenant" type="button" class="visual-user-tenant-submenu__create" @click="openCreateTenantDialog"><t-icon name="add" /><span>{{ $t('tenant.create.action') }}</span></button>
      </div>
    </Teleport>

    <CreateTenantDialog v-model:visible="createTenantDialogVisible" @created="onTenantCreated" />
  </div>
</template>

<style lang="less" scoped>
.visual-user-menu { position: relative; width: 100%; min-width: 0; }
.visual-user-menu__trigger { width: 100%; min-width: 0; min-height: 42px; padding: 6px; border: 0; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; background: transparent; color: #111827; font: inherit; text-align: left; cursor: pointer; transition: all 150ms ease; }
.visual-user-menu__trigger:hover { background: rgb(229 231 235 / 50%); }
.visual-user-menu__trigger[aria-expanded='true'] { background: rgb(229 231 235 / 90%); box-shadow: 0 1px 2px rgb(0 0 0 / 5%); }
.visual-user-menu.is-collapsed .visual-user-menu__trigger { justify-content: center; padding: 6px 2px; }
.visual-user-menu__avatar { flex: 0 0 30px; width: 30px; height: 30px; overflow: hidden; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #000; color: #fff; font-size: 12px; line-height: 1; font-weight: 700; box-shadow: 0 1px 2px rgb(0 0 0 / 5%); position: relative; }
.visual-user-menu.is-collapsed .visual-user-menu__avatar { flex-basis: 32px; width: 32px; height: 32px; }
.visual-user-menu__avatar.is-small { flex-basis: 24px; width: 24px; height: 24px; background: #000; font-weight: 500; }
.visual-user-menu__avatar img { width: 100%; height: 100%; object-fit: cover; }
.visual-user-menu__identity { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: 1px; }
.visual-user-menu__identity strong,.visual-user-menu__identity small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-user-menu__identity strong { color: #111827; font-size: 12px; line-height: 16px; font-weight: 700; }
.visual-user-menu__identity small { max-width: 150px; color: #9ca3af; font-size: 10px; line-height: 14px; font-weight: 400; }
.visual-user-menu__caret { flex: 0 0 14px; width: 14px; height: 14px; font-size: 14px; color: #9ca3af; transition: transform 200ms ease; }
.visual-user-menu__caret.is-open { transform: rotate(180deg); color: #374151; }
.visual-user-menu__dropdown { position: absolute; left: 0; right: 0; bottom: 56px; z-index: 3000; max-height: min(620px, calc(100vh - 88px)); overflow-y: auto; padding: 6px; box-sizing: border-box; border: 1px solid rgb(229 231 235 / 90%); border-radius: 16px; background: #fff; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%),0 8px 10px -6px rgb(0 0 0 / 10%); display: flex; flex-direction: column; gap: 2px; text-align: left; }
.visual-user-menu__account { width: 100%; min-height: 40px; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 12px; background: transparent; display: flex; align-items: center; gap: 8px; color: #374151; font: inherit; text-align: left; cursor: default; }
.visual-user-menu__account.is-clickable { cursor: pointer; }
.visual-user-menu__account.is-clickable:hover { background: #f3f4f6; }
.visual-user-menu__account-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.visual-user-menu__account-copy strong,.visual-user-menu__account-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visual-user-menu__account-copy strong { color: #111827; font-size: 12px; line-height: 16px; font-weight: 500; }
.visual-user-menu__account-copy small { color: #9ca3af; font-size: 10px; line-height: 14px; }
.visual-user-menu__guide { flex: 0 0 26px; width: 26px; height: 26px; padding: 5px; border: 0; border-radius: 8px; background: transparent; color: #9ca3af; cursor: pointer; }
.visual-user-menu__guide:hover { background: #e5e7eb; color: #374151; }
.visual-user-menu__tenant { min-height: 40px; padding: 7px 9px; border-radius: 12px; display: flex; align-items: center; gap: 9px; color: #4b5563; }
.visual-user-menu__tenant.is-clickable { cursor: default; }
.visual-user-menu__tenant.is-open,.visual-user-menu__tenant.is-clickable:hover { background: #f3f4f6; color: #111827; }
.visual-user-menu__tenant > :deep(.t-icon:first-child) { flex: 0 0 16px; font-size: 16px; }
.visual-user-menu__tenant-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.visual-user-menu__tenant-copy strong { overflow: hidden; color: #111827; font-size: 11px; line-height: 16px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.visual-user-menu__tenant-copy small { color: #9ca3af; font-size: 9px; line-height: 13px; }
.visual-user-menu__tenant-trail { flex: 0 0 12px; font-size: 12px; color: #9ca3af; }
.visual-user-menu__divider { height: 1px; margin: 4px; background: #f3f4f6; }
.visual-user-menu__divider--dashed { height: 0; border-top: 1px dashed #e5e7eb; background: transparent; }
.visual-user-menu__item { width: 100%; min-height: 40px; box-sizing: border-box; padding: 8px 12px; border: 0; border-radius: 12px; display: flex; align-items: center; gap: 8px; background: transparent; color: #4b5563; font: inherit; font-size: 12px; line-height: 16px; font-weight: 400; text-align: left; cursor: pointer; }
.visual-user-menu__item:hover { background: #f3f4f6; color: #111827; }
.visual-user-menu__item.visual-user-menu__usage-item { gap: 8px; }
.visual-user-menu__usage-item > small { flex: 0 0 auto; margin-left: auto; color: #8b919b; font-size: 10px; line-height: 14px; font-weight: 500; white-space: nowrap; }
.visual-user-menu__billing-item { color: #1f2937; }
.visual-user-menu__billing-item:hover { color: #111827; }
.visual-user-menu__billing-item:disabled { opacity: .55; cursor: wait; }
.visual-user-menu__item.is-danger { color: #dc2626; }
.visual-user-menu__item.is-danger:hover { background: #fef2f2; }
.visual-user-menu__item :deep(.t-icon) { flex: 0 0 16px; width: 16px; height: 16px; font-size: 16px; }
.visual-user-menu__item > span { min-width: 0; flex: 1; }
.visual-user-menu__external { margin-left: auto; flex-basis: 12px !important; width: 12px !important; height: 12px !important; font-size: 12px !important; color: #9ca3af; }
@media (prefers-reduced-motion: reduce) { .visual-user-menu__trigger { transition: none !important; } }
</style>

<style lang="less">
.visual-user-tenant-submenu { position: fixed; z-index: 10020; width: 264px; max-height: min(420px,calc(100vh - 16px)); overflow: hidden; box-sizing: border-box; padding: 8px; border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; color: #374151; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 10%),0 8px 10px -6px rgb(0 0 0 / 10%); }
.visual-user-tenant-submenu > header { padding: 4px 7px 7px; color: #9ca3af; font-size: 10px; line-height: 14px; font-weight: 600; }
.visual-user-tenant-submenu__list { max-height: 310px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.visual-user-tenant-submenu__item { width: 100%; min-height: 42px; padding: 6px 7px; border: 0; border-radius: 11px; display: flex; align-items: center; gap: 9px; background: transparent; color: #4b5563; font: inherit; text-align: left; cursor: pointer; }
.visual-user-tenant-submenu__item:hover,.visual-user-tenant-submenu__item.is-current { background: #f3f4f6; color: #111827; }
.visual-user-tenant-submenu__avatar { flex: 0 0 28px; width: 28px; height: 28px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; position: relative; background: #111827; color: #fff; font-size: 10px; font-weight: 700; }
.visual-user-tenant-submenu__avatar small { position: absolute; right: -3px; bottom: -3px; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #e5e7eb; color: #374151; }
.visual-user-tenant-submenu__avatar small .t-icon { font-size: 7px; }
.visual-user-tenant-submenu__copy { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.visual-user-tenant-submenu__copy strong { overflow: hidden; color: #111827; font-size: 11px; line-height: 16px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.visual-user-tenant-submenu__copy small { color: #9ca3af; font-size: 9px; line-height: 13px; }
.visual-user-tenant-submenu__item > .t-icon { flex: 0 0 14px; font-size: 14px; color: #6b7280; }
.visual-user-tenant-submenu__list > p { margin: 18px 8px; color: #9ca3af; font-size: 10px; text-align: center; }
.visual-user-tenant-submenu__create { width: 100%; min-height: 34px; margin-top: 6px; padding: 7px 9px; border: 0; border-top: 1px solid #f3f4f6; border-radius: 9px; display: flex; align-items: center; gap: 8px; background: transparent; color: #4b5563; font: inherit; font-size: 11px; cursor: pointer; }
.visual-user-tenant-submenu__create:hover { background: #f3f4f6; color: #111827; }
</style>
