import { createRouter, createWebHistory } from 'vue-router'
import type { LocationQueryRaw, RouteLocationGeneric } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useOrganizationStore } from '@/stores/organization'
import { useSettingsStore } from '@/stores/settings'
import { getCurrentUser, userInfoFromApi } from '@/api/auth'
import { getSystemInfo } from '@/api/system'
import {
  AUTHENTICATED_HOME_PATH,
  handoffToExternalAuth,
  hasOIDCErrorCallback,
  hasPendingOIDCCallback,
} from '@/utils/nativeAuthHandoff'
import { useDeploymentCapabilitiesStore } from '@/stores/deploymentCapabilities'
import type { DeploymentCapabilityKey } from '@/config/deploymentCapabilities'
import { MessagePlugin } from 'tdesign-vue-next'
import i18n from '@/i18n'
import {
  buildSettingsRouteQuery,
  normalizeExposedIntegrationSettingsSection,
} from '@/config/settingsRoute'

/** Lite /桌面 WebView 硬刷新时可能只打开 `/`，用 session 记住上次页面以便恢复 */
const LITE_LAST_PATH_KEY = 'weknora_lite_last_path'
const CHECKOUT_INTENT_STORAGE_KEY = 'musuw.checkout.intent'
const LITE_SETTINGS_ROUTE_SECTIONS = new Set([
  'general',
  'usage',
  'models',
  'userprofile',
  'mymemory',
  'memory',
  'mcp',
  'integration-im',
  'integration-embed',
])

function authenticatedEntryPath(to: RouteLocationGeneric) {
  // The global OIDC callback handler must finish persisting the native session
  // before a stored checkout intent is consumed.
  if (hasPendingOIDCCallback(window.location.hash || '')) return AUTHENTICATED_HOME_PATH
  try {
    const raw = sessionStorage.getItem(CHECKOUT_INTENT_STORAGE_KEY)
    sessionStorage.removeItem(CHECKOUT_INTENT_STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) as { plan?: unknown; period?: unknown } : null
    const plan = to.query.plan ?? saved?.plan
    const period = to.query.period ?? saved?.period
    if (
      (plan === 'plus' || plan === 'pro' || plan === 'max') &&
      (period === 'monthly' || period === 'yearly')
    ) {
      return { path: '/plans', query: { plan, period } }
    }
  } catch {
    // Fall through to the normal authenticated home when storage is unavailable.
  }
  if (localStorage.getItem('weknora_lite_mode') === 'true') {
    const saved = sessionStorage.getItem(LITE_LAST_PATH_KEY)
    if (saved && isSafeLiteRestoreTarget(saved)) return saved
  }
  return AUTHENTICATED_HOME_PATH
}

function isLiteEdition(authStore: ReturnType<typeof useAuthStore>) {
  return authStore.isLiteMode || localStorage.getItem('weknora_lite_mode') === 'true'
}

let editionProbeDone = false
let editionProbePromise: Promise<void> | null = null
let resolvedLiteMode: boolean | null = null

function applyResolvedProductEdition(
  authStore: ReturnType<typeof useAuthStore>,
  isLite: boolean,
) {
  authStore.setLiteMode(isLite)
  if (!isLite) return

  // A Standard session may have populated organization/shared-resource stores
  // before the server edition probe resolves. Lite has no shared spaces, so
  // discard that in-memory state as soon as the authoritative edition arrives.
  const organizationStore = useOrganizationStore()
  organizationStore.clearState()
  authStore.setSelectedTenant(null)
  const settingsStore = useSettingsStore()
  settingsStore.applyLiteFirstRunDefaults()
}

async function ensureProductEdition(authStore: ReturnType<typeof useAuthStore>) {
  if (editionProbeDone) {
    if (resolvedLiteMode !== null) applyResolvedProductEdition(authStore, resolvedLiteMode)
    return
  }
  if (!editionProbePromise) {
    editionProbePromise = (async () => {
      try {
        const response = await getSystemInfo()
        const edition = String(response.data?.edition || '').trim().toLowerCase()
        if (edition === 'lite' || edition === 'standard') {
          const isLite = edition === 'lite'
          resolvedLiteMode = isLite
          applyResolvedProductEdition(authStore, isLite)
          editionProbeDone = true
        } else {
          // An empty/unknown payload is as inconclusive as a network failure;
          // retry it on the next navigation instead of pinning stale UI state.
          editionProbeDone = false
        }
      } catch {
        // Backend API authorization remains authoritative. A transient edition
        // probe failure must not sign the user out or break normal navigation.
        // Leave the probe retryable for the next navigation in this SPA.
        editionProbeDone = false
      } finally {
        editionProbePromise = null
      }
    })()
  }
  await editionProbePromise
}

/**
 * Musuw Lite only exposes chat, knowledge-base workflows, and the consumer
 * settings shell. Keep this as an allow-list so new upstream routes fail
 * closed until they are deliberately reviewed for the consumer product.
 */
function isAllowedLitePath(path: string) {
  return (
    path === '/knowledgeBase' ||
    path === '/plans' ||
    path === '/checkout' ||
    path === '/platform/creatChat' ||
    path.startsWith('/platform/chat/') ||
    path === '/platform/knowledge-bases' ||
    path.startsWith('/platform/knowledge-bases/') ||
    path === '/platform/marketplace' ||
    path.startsWith('/platform/marketplace/') ||
    path === '/platform/orders' ||
    path === '/platform/creator-products' ||
    path === '/platform/marketplace-admin' ||
    path === '/platform/agents' ||
    path === '/platform/settings' ||
    path === '/onboarding/workspace'
  )
}

function isSafeLiteRestoreTarget(path: string) {
  const pathname = path.split('?')[0]?.split('#')[0] || ''
  return isAllowedLitePath(pathname) && pathname !== '/plans' && pathname !== '/checkout'
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: authenticatedEntryPath,
    },
    {
      path: "/login",
      name: "login",
      component: () => import("../views/auth/Login.vue"),
      meta: { requiresAuth: false, requiresInit: false }
    },
    // Embed chat is a separate entry (embed.html + embed-main.ts), not this SPA.
    {
      path: "/register",
      name: "registerByInvite",
      // Share-link landing page reuses the Login form: the same Vue
      // component renders both modes and detects ?token=xxx on mount
      // to switch into invite-register flow. Avoids a parallel page
      // that would duplicate the OIDC / language-switch / styling
      // surface for one extra field.
      component: () => import("../views/auth/Login.vue"),
      meta: { requiresAuth: false, requiresInit: false }
    },
    {
      path: "/onboarding/workspace",
      name: "workspaceOnboarding",
      component: () => import("../views/auth/WorkspaceOnboarding.vue"),
      meta: { requiresAuth: true, requiresInit: false, requiresTenant: false }
    },
    {
      path: "/join",
      name: "joinOrganization",
      redirect: (to) => {
        const code = to.query.code as string
        return {
          path: '/platform/organizations',
          query: code ? { invite_code: code } : {},
        }
      },
      meta: { requiresInit: true, requiresAuth: true }
    },
    {
      path: "/knowledgeBase",
      name: "home",
      component: () => import("../views/knowledge/KnowledgeBase.vue"),
      meta: { requiresInit: true, requiresAuth: true }
    },
    {
      path: "/plans",
      name: "plans",
      component: () => import("../views/billing/Plans.vue"),
      meta: { requiresInit: true, requiresAuth: true }
    },
    {
      path: "/checkout",
      name: "checkout",
      component: () => import("../views/billing/Checkout.vue"),
      meta: { requiresInit: true, requiresAuth: true }
    },
    {
      path: "/pay",
      name: "paddlePaymentLink",
      component: () => import("../views/billing/PaymentLink.vue"),
      meta: { requiresInit: false, requiresAuth: false }
    },
    {
      path: "/retain",
      name: "paddleRetainLanding",
      component: () => import("../views/billing/RetainLanding.vue"),
      meta: { requiresInit: false, requiresAuth: false }
    },
    {
      path: "/platform",
      name: "Platform",
      redirect: authenticatedEntryPath,
      component: () => import("../views/platform/index.vue"),
      meta: { requiresInit: true, requiresAuth: true },
      children: [
        {
          path: "tenant",
          redirect: "/platform/settings"
        },
        {
          path: "settings",
          name: "settings",
          component: () => import("../views/settings/Settings.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "knowledge-bases",
          name: "knowledgeBaseList",
          component: () => import("../views/knowledge/KnowledgeBaseList.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "knowledge-bases/:kbId",
          name: "knowledgeBaseDetail",
          component: () => import("../views/knowledge/KnowledgeBase.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "knowledge-search",
          // 旧路径保留为重定向，打开全局命令面板（⌘K），带上可选的 q 参数
          redirect: (to) => {
            const q = to.query.q
            return {
              path: '/platform/knowledge-bases',
              query: typeof q === 'string' ? { cmdk: q } : { cmdk: '' },
            }
          },
        },
        {
          path: "marketplace",
          name: "marketplace",
          component: () => import("../views/marketplace/Marketplace.vue"),
          meta: { requiresInit: true, requiresAuth: true },
        },
        {
          path: "marketplace/:productId/knowledge-bases/:kbId",
          name: "marketplaceKnowledgeBase",
          component: () => import("../views/marketplace/MarketplaceKnowledgeBase.vue"),
          meta: { requiresInit: true, requiresAuth: true },
        },
        {
          path: "marketplace/:productId",
          name: "marketplaceProduct",
          component: () => import("../views/marketplace/ProductDetail.vue"),
          meta: { requiresInit: true, requiresAuth: true },
        },
        {
          path: "orders",
          name: "marketplaceOrders",
          component: () => import("../views/marketplace/Orders.vue"),
          meta: { requiresInit: true, requiresAuth: true },
        },
        {
          path: "creator-products",
          name: "creatorProducts",
          component: () => import("../views/marketplace/CreatorProducts.vue"),
          meta: { requiresInit: true, requiresAuth: true },
        },
        {
          path: "marketplace-admin",
          name: "marketplaceAdmin",
          component: () => import("../views/marketplace/AdminMarketplace.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiresSystemAdmin: true },
        },
        {
          path: "agents",
          name: "agentList",
          component: () => import("../views/agent/AgentList.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiredCapability: 'agents' }
        },
        {
          path: "integrations",
          redirect: (to) => {
            const tab = typeof to.query.tab === 'string' ? to.query.tab : undefined
            const incoming = typeof to.query.section === 'string' ? to.query.section : 'integrations'
            const rest = { ...to.query }
            delete rest.tab
            return {
              path: '/platform/settings',
              query: {
                ...rest,
                section: normalizeExposedIntegrationSettingsSection(incoming, tab),
              },
            }
          },
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "creatChat",
          name: "globalCreatChat",
          component: () => import("../views/creatChat/creatChat.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "knowledge-bases/:kbId/creatChat",
          name: "kbCreatChat",
          component: () => import("../views/creatChat/creatChat.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "chat/:chatid",
          name: "chat",
          component: () => import("../views/chat/index.vue"),
          meta: { requiresInit: true, requiresAuth: true }
        },
        {
          path: "organizations",
          name: "organizationList",
          component: () => import("../views/organization/OrganizationList.vue"),
          meta: { requiresInit: true, requiresAuth: true, requiredCapability: 'organizations' }
        },
        // Compatibility redirects for /platform/system/* URLs. System
        // administration surfaces live as dedicated sections inside the
        // standard Settings modal; keep stable URLs for bookmarks and
        // external links.
        {
          path: "system",
          redirect: { path: "/platform/settings", query: { section: "system-global" } },
          meta: { requiresInit: true, requiresAuth: true, requiresSystemAdmin: true },
        },
        {
          path: "system/settings",
          name: "systemSettings",
          redirect: { path: "/platform/settings", query: { section: "system-global" } },
          meta: { requiresInit: true, requiresAuth: true, requiresSystemAdmin: true },
        },
        {
          path: "system/admins",
          name: "systemAdmins",
          redirect: { path: "/platform/settings", query: { section: "system-global" } },
          meta: { requiresInit: true, requiresAuth: true, requiresSystemAdmin: true },
        },
        {
          path: "system/queues",
          name: "systemQueues",
          redirect: { path: "/platform/settings", query: { section: "runtime-queues" } },
          meta: { requiresInit: true, requiresAuth: true, requiresSystemAdmin: true },
        },
      ],
    },
    // Dev-only markdown rendering test page
    ...(import.meta.env.DEV ? [{
      path: '/platform/dev/markdown',
      name: 'markdownTest',
      component: () => import('../views/dev/MarkdownTestPage.vue'),
      meta: { requiresAuth: false, requiresInit: false }
    }] : []),
  ],
});

async function hydrateSessionFromToken(authStore: ReturnType<typeof useAuthStore>) {
  const token = localStorage.getItem('weknora_token')
  if (!token) return false

  if (!authStore.token) {
    authStore.setToken(token)
  }

  const storedRefreshToken = localStorage.getItem('weknora_refresh_token')
  if (storedRefreshToken && !authStore.refreshToken) {
    authStore.setRefreshToken(storedRefreshToken)
  }

  try {
    const response = await getCurrentUser()
    const user = response.data?.user
    if (!response.success || !user) {
      return false
    }

    authStore.setUser(userInfoFromApi(user, response.data?.tenant?.id))

    const tenant = response.data?.tenant
    if (tenant) {
      authStore.setTenant({
        id: String(tenant.id) || '',
        name: tenant.name || '',
        owner_id: tenant.owner_id || user.id || '',
        description: tenant.description,
        status: tenant.status,
        business: tenant.business,
        storage_quota: tenant.storage_quota,
        storage_used: tenant.storage_used,
        created_at: tenant.created_at || new Date().toISOString(),
        updated_at: tenant.updated_at || new Date().toISOString(),
      })
    } else {
      authStore.setTenant(null)
    }

    // Refresh memberships on every page load — same reason as
    // App.vue's syncOIDCUserContext: without this the auth store
    // would only ever see the snapshot from the original /auth/login
    // call, so role changes (and tenant-switch role lookups) would be
    // silently stale until the user logged out and back in.
    const memberships = response.data?.memberships
    if (Array.isArray(memberships)) {
      authStore.setMemberships(memberships)
    }

    const canCreateTenant = response.data?.capabilities?.can_create_tenant
    if (typeof canCreateTenant === 'boolean') {
      authStore.setCanCreateTenant(canCreateTenant)
    }

    authStore.setAutoAcceptInvitation(
      response.data?.capabilities?.auto_accept_invitation === true,
    )

    return true
  } catch {
    return false
  }
}

// 路由守卫：检查认证状态和系统初始化状态
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // A failed callback must leave before any route component can mount. In
  // particular, /login's ordinary signed-out guard would otherwise restart
  // /auth/start before App.vue consumes the error fragment.
  if (hasOIDCErrorCallback(window.location.hash || '')) {
    handoffToExternalAuth('error')
    next(false)
    return
  }

  // OIDC 回跳登录结果依赖 App.vue 在挂载后消费 URL hash。
  // 如果这里先按“未登录”拦截到 /login，会导致回调结果没有机会落盘。
  if (hasPendingOIDCCallback(window.location.hash || '')) {
    next()
    return
  }

  // Musnow owns human sign-in. Never mount WeKnora's password/OIDC form;
  // a browser navigation lets the same-origin auth shell establish the native
  // token exchange and then return here.
  if (to.path === '/login' || to.path === '/register') {
    if (!authStore.isLoggedIn) {
      const restored = await hydrateSessionFromToken(authStore)
      if (!restored) {
        handoffToExternalAuth('start')
        next(false)
        return
      }
    }

    next(authStore.hasValidTenant ? AUTHENTICATED_HOME_PATH : '/onboarding/workspace')
    return
  }

  if (to.path === '/') {
    next(authenticatedEntryPath(to))
    return
  }

  // Tenantless onboarding still requires a valid user token even though it
  // deliberately skips the normal tenant/system-initialization gates.
  if (to.path === '/onboarding/workspace') {
    if (!authStore.isLoggedIn) {
      const restored = await hydrateSessionFromToken(authStore)
      if (!restored) {
        handoffToExternalAuth('start')
        next(false)
        return
      }
    }
    await ensureProductEdition(authStore)
    if (authStore.hasValidTenant) {
      next('/platform/knowledge-bases')
    } else {
      next()
    }
    return
  }

  // 如果访问的是登录页面或初始化页面，直接放行
  if (to.meta.requiresAuth === false || to.meta.requiresInit === false) {
    next()
    return
  }

  // 检查用户认证状态
  if (to.meta.requiresAuth !== false) {
    if (!authStore.isLoggedIn) {
      const restored = await hydrateSessionFromToken(authStore)
      if (restored) {
        await ensureProductEdition(authStore)
        next(
          !authStore.hasValidTenant && to.meta.requiresTenant !== false
            ? '/onboarding/workspace'
            : to.fullPath,
        )
        return
      }

      handoffToExternalAuth('start')
      next(false)
      return
    }
  }

  // Resolve the server-owned Edition before evaluating browser exposure. This
  // closes both first-load discovery and stale localStorage after a Lite ↔ Standard switch.
  await ensureProductEdition(authStore)

  if (to.meta.requiresTenant !== false && !authStore.hasValidTenant) {
    next('/onboarding/workspace')
    return
  }

  // Product exposure gate for browser navigation. Client-side gating is only
  // UX hardening; the server applies the authoritative Lite API gate.
  if (isLiteEdition(authStore)) {
    if (!isAllowedLitePath(to.path)) {
      next(AUTHENTICATED_HOME_PATH)
      return
    }
    if (to.path === '/platform/settings') {
      const section = typeof to.query.section === 'string' ? to.query.section : ''
      const tab = typeof to.query.tab === 'string' ? to.query.tab : ''
      const normalizedSection = normalizeExposedIntegrationSettingsSection(
        section || 'general',
        tab || undefined,
      )
      if (
        normalizedSection.startsWith('integration-')
        && (normalizedSection !== section || Boolean(tab))
      ) {
        next({
          path: '/platform/settings',
          query: buildSettingsRouteQuery(normalizedSection, to.query) as LocationQueryRaw,
        })
        return
      }
      if (
        !LITE_SETTINGS_ROUTE_SECTIONS.has(normalizedSection)
        || (Boolean(tab) && normalizedSection !== 'models')
      ) {
        next({ path: '/platform/settings' })
        return
      }
    }
  }

  // 部署能力只描述“后端是否提供该功能”，不反映服务健康或是否已配置。
  // 探测失败时 Store 会 fail-open，真正的权限和可用性仍由后端接口校验。
  const deploymentCapabilities = useDeploymentCapabilitiesStore()
  await deploymentCapabilities.ensureLoaded()
  const requiredCapability = to.meta.requiredCapability as DeploymentCapabilityKey | undefined
  if (requiredCapability && !deploymentCapabilities.isSupported(requiredCapability)) {
    MessagePlugin.warning(i18n.global.t('settings.capabilityUnavailable'))
    next('/platform/knowledge-bases')
    return
  }

  // SystemAdmin gate — checked AFTER auth so a non-admin who's logged
  // out gets redirected to /login first (consistent with how the rest
  // of the auth flow works), and only an authenticated non-admin sees
  // the bounce. This is UI-only; the server enforces the real check.
  if (to.meta.requiresSystemAdmin === true) {
    if (!authStore.isSystemAdmin) {
      next(AUTHENTICATED_HOME_PATH)
      return
    }
  }

  next()
})

router.afterEach((to) => {
  if (!isLiteEdition(useAuthStore())) return
  if (to.path === '/login') return
  if (!isAllowedLitePath(to.path)) return
  if (to.path === '/platform/settings' && (to.query.section || to.query.tab)) return
  sessionStorage.setItem(LITE_LAST_PATH_KEY, to.fullPath)
})

export default router
