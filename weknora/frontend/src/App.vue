<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { MessagePlugin, NotifyPlugin } from "tdesign-vue-next";
import ManualKnowledgeEditor from "@/components/manual-knowledge-editor.vue";
import { useAuthStore } from "@/stores/auth";
import { useCurrentEntitlementStore } from "@/stores/entitlement";
import { useSettingsStore } from "@/stores/settings";
import { getCurrentUser, userInfoFromApi } from "@/api/auth";
import { getPaddlePublicConfig } from "@/api/entitlement";
import { consumePendingTenantSwitchToast } from "@/utils/tenantSwitch";
import { useRoleLabel } from "@/composables/useRoleLabel";
import { notifyLoginSuccess } from "@/utils/loginNotify";
import { renderWorkspaceNotifyContent } from "@/utils/workspaceNotifyContent";
import { handoffToExternalAuth } from "@/utils/nativeAuthHandoff";
import { initializePaddlePaymentLink } from "@/utils/paddleCheckout";

// TDesign locale configs
import enUSConfig from "tdesign-vue-next/esm/locale/en_US";
import zhCNConfig from "tdesign-vue-next/esm/locale/zh_CN";
import koKRConfig from "tdesign-vue-next/esm/locale/ko_KR";
import ruRUConfig from "tdesign-vue-next/esm/locale/ru_RU";

const { locale, t, tm } = useI18n();
const { formatRole, roleIcon } = useRoleLabel();
const router = useRouter();
const authStore = useAuthStore();
const entitlementStore = useCurrentEntitlementStore();
const settingsStore = useSettingsStore();

const tdLocaleMap: Record<string, object> = {
  "en-US": enUSConfig,
  "zh-CN": zhCNConfig,
  "ko-KR": koKRConfig,
  "ru-RU": ruRUConfig,
};

const tdGlobalConfig = computed(() => tdLocaleMap[locale.value] || enUSConfig);

const decodeOIDCResult = (encoded: string) => {
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

const clearOIDCCallbackState = (path = "/") => {
  window.history.replaceState({}, document.title, path);
};

const applyOIDCUserContext = (
  { user, tenant, memberships, capabilities }: any,
  applyCapabilities = true,
) => {
  authStore.setUser(userInfoFromApi(user, tenant?.id));
  if (tenant) {
    authStore.setTenant({
      id: String(tenant.id) || "",
      name: tenant.name || "",
      owner_id: tenant.owner_id || user.id || "",
      description: tenant.description,
      status: tenant.status,
      business: tenant.business,
      storage_quota: tenant.storage_quota,
      storage_used: tenant.storage_used,
      created_at: tenant.created_at || new Date().toISOString(),
      updated_at: tenant.updated_at || new Date().toISOString(),
    });
  } else {
    authStore.setTenant(null);
  }
  // Refresh memberships so currentTenantRole reflects any role change
  // since the last login (e.g. an Owner demoted us to Viewer in a
  // peer tenant). Without this, memberships stay frozen at the
  // login-time snapshot and the UI silently lies about our authority.
  if (Array.isArray(memberships)) {
    authStore.setMemberships(memberships);
  }
  if (applyCapabilities && typeof capabilities?.can_create_tenant === "boolean") {
    authStore.setCanCreateTenant(capabilities.can_create_tenant);
  }
  // Same active-vs-home reconciliation as Login.vue: if the OIDC login
  // landed us in a non-home tenant (because the backend honoured a
  // remembered last-active-tenant preference) make sure X-Tenant-ID
  // override is set; otherwise drop any stale override.
  const activeIdNum = tenant?.id != null ? Number(tenant.id) : NaN;
  const homeIdNum = user.tenant_id != null ? Number(user.tenant_id) : NaN;
  if (Number.isFinite(activeIdNum) && Number.isFinite(homeIdNum) && activeIdNum !== homeIdNum) {
    authStore.setSelectedTenant(activeIdNum, tenant?.name || null);
  } else {
    authStore.setSelectedTenant(null, null);
  }
};

type OIDCReconciliationGuard = {
  token: string;
  selectedTenantId: number | null;
};

const captureOIDCReconciliationGuard = (): OIDCReconciliationGuard => ({
  token: authStore.token,
  selectedTenantId: authStore.selectedTenantId,
});

const isCurrentOIDCReconciliationGuard = (guard: OIDCReconciliationGuard) =>
  authStore.token === guard.token && authStore.selectedTenantId === guard.selectedTenantId;

const syncOIDCUserContext = async (guard?: OIDCReconciliationGuard) => {
  const currentUserResponse = await getCurrentUser();
  // A slow response from a previous login or tenant selection must never
  // repopulate state after logout, re-login, or a workspace switch.
  if (guard && !isCurrentOIDCReconciliationGuard(guard)) return;
  if (!currentUserResponse.success || !currentUserResponse.data?.user) {
    throw new Error(currentUserResponse.message || "Failed to get user information");
  }

  applyOIDCUserContext(currentUserResponse.data);
};

const persistOIDCLoginResponse = async (response: any) => {
  if (!response.token) {
    throw new Error(response.message || "OIDC login failed");
  }

  authStore.setToken(response.token);
  if (response.refresh_token) {
    authStore.setRefreshToken(response.refresh_token);
  }

  const hasCompleteOIDCCallbackSnapshot =
    typeof response.user?.id === "string" &&
    response.user.id.trim() !== "" &&
    Array.isArray(response.memberships);
  if (hasCompleteOIDCCallbackSnapshot) {
    // The callback snapshot was assembled by the backend after it issued the
    // local session. Use it immediately so slow clients do not pay for a
    // redundant serial /auth/me round trip. Workspace creation stays
    // fail-closed until the authoritative capability refresh succeeds.
    authStore.setCanCreateTenant(false);
    applyOIDCUserContext(response, false);
    const reconciliationGuard = captureOIDCReconciliationGuard();
    void syncOIDCUserContext(reconciliationGuard).catch((error) => {
      console.warn("OIDC user context reconciliation failed:", error);
    });
  } else {
    // Older or incomplete callback payloads retain the authoritative blocking
    // path rather than entering the application with partial identity state.
    await syncOIDCUserContext();
  }

  // OIDC may have been initiated from an invitation link. Redeem the
  // short-lived token only after the native session is durable, then enter the
  // normal workspace surface. A failed/expired token must not strand a valid
  // session on the callback page.
  const pendingInviteToken = sessionStorage.getItem("weknora_pending_invite_token");
  if (pendingInviteToken) {
    sessionStorage.removeItem("weknora_pending_invite_token");
    const result = await authStore.acceptInvitationByTokenAndRefresh(pendingInviteToken);
    await nextTick();
    if (result.ok) MessagePlugin.success(t("inviteRegister.joined"));
    else MessagePlugin.warning(t("inviteRegister.invalidBody"));
    router.replace("/platform/knowledge-bases");
    return;
  }

  await nextTick();
  // Re-enter through `/` so a validated checkout intent captured by the auth
  // shell is consumed only after the native session is durable.
  router.replace(authStore.hasValidTenant ? "/" : "/onboarding/workspace");
};

const handleGlobalOIDCCallback = async () => {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return;

  const params = new URLSearchParams(hash);
  const oidcError = params.get("oidc_error");
  const oidcResult = params.get("oidc_result");

  if (!oidcError && !oidcResult) return;

  if (oidcError) {
    handoffToExternalAuth("error");
    return;
  }

  try {
    if (!oidcResult) {
      handoffToExternalAuth("error");
      return;
    }

    const response = decodeOIDCResult(oidcResult);
    if (response.success) {
      clearOIDCCallbackState("/");
      await persistOIDCLoginResponse(response);
      notifyLoginSuccess(response, t, tm, formatRole, roleIcon);
      return;
    }

    handoffToExternalAuth("error");
  } catch (error: any) {
    console.error("Global OIDC callback handling failed:", error);
    authStore.logout();
    handoffToExternalAuth("error");
  }
};

let updateCheckTimer: ReturnType<typeof setInterval> | null = null;

// Pending invitations are a Standard workspace-management surface. Lite does
// not expose invitations, so it must neither show their badge nor poll the
// backend route that the product gate intentionally denies.
let invitationPollTimer: ReturnType<typeof setInterval> | null = null;
const INVITATION_POLL_INTERVAL_MS = 2 * 60 * 1000;

const startInvitationPolling = () => {
  if (invitationPollTimer || !authStore.isLoggedIn || authStore.isLiteMode) return;
  // Immediate fetch so the badge is correct before the first tick.
  authStore.fetchPendingInvitationCount();
  invitationPollTimer = setInterval(() => {
    if (!authStore.isLoggedIn || authStore.isLiteMode) return;
    authStore.fetchPendingInvitationCount();
  }, INVITATION_POLL_INTERVAL_MS);
};

const stopInvitationPolling = () => {
  if (invitationPollTimer) {
    clearInterval(invitationPollTimer);
    invitationPollTimer = null;
  }
};

// Retain is part of Paddle.js itself. Initialize it once across the SPA so the
// public login surface can receive recovery links and authenticated product
// pages can show provider-owned recovery UI. The only customer identity comes
// from the authenticated entitlement response; logout clears it with
// Paddle.Update through the existing singleton.
let paddleRetainSyncSequence = 0;
const getPaddleRetainScope = () => {
  const userId = String(authStore.currentUserId || "").trim();
  const tenantId = authStore.effectiveTenantId;
  return authStore.isLoggedIn && userId && tenantId != null
    ? `${userId}:${String(tenantId)}`
    : "";
};

const syncPaddleRetain = async () => {
  const sequence = ++paddleRetainSyncSequence;
  const scope = getPaddleRetainScope();
  const isCurrent = () => sequence === paddleRetainSyncSequence && scope === getPaddleRetainScope();
  try {
    const config = await getPaddlePublicConfig();
    if (!isCurrent()) return;
    if (
      !config.configured ||
      (config.environment !== "sandbox" && config.environment !== "live") ||
      !config.client_token
    ) return;

    let pwCustomerId: string | undefined;
    if (scope) {
      // Entitlement is the single customer-identity source for the app. Keep
      // its scope-aware snapshot and deduped request instead of issuing a
      // second GET from the root component.
      await entitlementStore.ensureFresh();
      if (!isCurrent() || !entitlementStore.entitlement) return;
      pwCustomerId = entitlementStore.billing?.pw_customer_id;
    }

    await initializePaddlePaymentLink({
      environment: config.environment,
      clientToken: config.client_token,
      pwCustomerId,
    });
    // Retain initialization is asynchronous and may outlive a logout or
    // workspace switch. Do not let a stale completion publish identity into
    // the current session; the watcher will start the current sequence.
    if (!isCurrent()) return;
  } catch {
    // Paddle is optional outside Musuw's fixed production overlay. Checkout
    // pages retry through the same singleton and expose their own error state.
  }
};

// React to login/logout and product-edition changes. When the server reports
// Lite, stop an existing Standard invitation poll immediately.
watch(
  () => [authStore.isLoggedIn, authStore.isLiteMode] as const,
  ([logged, lite]) => {
    if (logged && !lite) startInvitationPolling();
    else stopInvitationPolling();
  },
  { immediate: true },
);

watch(
  () => [authStore.isLoggedIn, authStore.effectiveTenantId] as const,
  () => { void syncPaddleRetain(); },
  { immediate: true },
);

// 切换空间后会 hard reload；切换前 stash 的 toast 这里 consume 并弹出，
// 这样 toast 显示在新页面上，duration 才真正生效。
const showPendingTenantSwitchToast = () => {
  const pending = consumePendingTenantSwitchToast();
  if (!pending) return;
  const templateKey = pending.role
    ? "tenant.switchSuccessContentWithRole"
    : "tenant.switchSuccessContent";
  // Use tm() not t() — vue-i18n v11's `t()` replaces unspecified named
  // placeholders with empty strings, which would strip {name}/{role}
  // before the chip renderer can split on them. tm() returns the raw
  // message verbatim.
  const rawTemplate = tm(templateKey);
  const template = typeof rawTemplate === "string" ? rawTemplate : "";
  NotifyPlugin.success({
    title: t("tenant.switchSuccessTitle"),
    content: renderWorkspaceNotifyContent({
      template,
      name: pending.name,
      roleLabel: pending.role,
      roleEnum: pending.roleEnum,
      roleIconName: pending.roleEnum ? roleIcon(pending.roleEnum) : undefined,
    }),
    duration: 6000,
    closeBtn: true,
  });
};

const checkDesktopForUpdates = () => {
  const desktopApp = (
    window as Window & {
      go?: { main?: { App?: { AutoCheckForUpdates?: () => void } } };
    }
  ).go?.main?.App;
  desktopApp?.AutoCheckForUpdates?.();
};

onMounted(() => {
  handleGlobalOIDCCallback();
  showPendingTenantSwitchToast();

  // Auto check for updates on startup
  setTimeout(() => {
    if (settingsStore.isAutoCheckUpdateEnabled) {
      checkDesktopForUpdates();
    }
  }, 2000);

  // Periodically check for updates (every 4 hours)
  updateCheckTimer = setInterval(
    () => {
      if (settingsStore.isAutoCheckUpdateEnabled) {
        checkDesktopForUpdates();
      }
    },
    4 * 60 * 60 * 1000,
  );
});

onUnmounted(() => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }
  stopInvitationPolling();
});
</script>
<template>
  <t-config-provider :globalConfig="tdGlobalConfig">
    <div id="app">
      <RouterView />
      <ManualKnowledgeEditor />
    </div>
  </t-config-provider>
</template>
<style>
html {
  /* Keep the browser chrome in sync with the selected workspace theme. */
  color-scheme: light dark;
  background: var(--musuw-canvas);
}

body,
html,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  font-size: 14px;
  font-family: var(--app-font-family);
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: var(--musuw-canvas);
  color: var(--td-text-color-primary);
}

body {
  line-height: 1.5;
}

button,
input,
textarea,
select {
  font: inherit;
}

::selection {
  background: var(--musuw-accent-soft);
  color: var(--musuw-ink-strong);
}

#app {
  /* 独立合成层，减轻 WebKit 全量重绘时整窗与内容的撕裂感（桌面 WebView 尤其明显） */
  isolation: isolate;
  transform: translateZ(0);
  backface-visibility: hidden;
}
</style>
