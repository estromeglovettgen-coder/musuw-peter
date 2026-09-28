import { reportDiagnostic } from "../../../shared/client-diagnostics";
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router";
import TDesign from "tdesign-vue-next";
import "tdesign-vue-next/dist/tdesign.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/noto-sans-sc";
// One ordered application-presentation seam. Vendor styles and component
// behavior remain owned by TDesign and the existing Vue components.
import "@/assets/musuw-visual.less";
// vue-virtual-scroller ships its own tiny stylesheet — required for
// RecycleScroller/DynamicScroller to size their viewport correctly.
// Without it the scroller computes 0 height and renders no items.
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import i18n from "./i18n";
import { initTheme } from "@/composables/useTheme";
import { initFont } from "@/composables/useFont";
import { installTDesignIconOfflineGuard } from "@/utils/tdesign-icon-offline";
import { installAutofillGuard } from "@/utils/disable-autofill";
import { installReferenceTextareaAutosize } from "@/utils/referenceTextareaAutosize";
import { useAuthStore } from "@/stores/auth";
import { hasPendingOIDCCallback } from "@/utils/nativeAuthHandoff";

// 必须在 Vue 组件挂载之前执行，避免 tdesign-icons 运行时请求 tdesign.gtimg.com
installTDesignIconOfflineGuard();

initTheme();
initFont();
installReferenceTextareaAutosize();

async function bootstrap() {
  const app = createApp(App);

// 全局错误处理：捕获未处理的组件错误，防止白屏
app.config.errorHandler = (err, instance, info) => {
  console.error("[Musuw] Unhandled Vue error:", err, "\nComponent:", instance, "\nInfo:", info);
};

  app.use(TDesign);
  const pinia = createPinia();
  app.use(pinia);

  // Capabilities (can_create_tenant, auto_accept_invitation) are not cached
  // in localStorage — reconcile once before first paint when a session exists.
  const authStore = useAuthStore();
  // App.vue consumes a new OIDC session after mounting and reconciles it with
  // /auth/me. Checking an older token first can redirect away from that callback.
  if (localStorage.getItem("weknora_token") && !hasPendingOIDCCallback(window.location.hash)) {
    try {
      await authStore.refreshFromAuthMe();
    } catch {
      // best-effort; capabilities stay at defaults until the next refresh
    }
  }

  app.use(router);
  app.use(i18n);

  // 等首屏路由（含导航守卫、Lite 自动登录）完成后再挂载，避免先闪默认页再跳转
  await router.isReady();
  app.mount("#app");
  installAutofillGuard();
}

bootstrap().then(() => {
  reportDiagnostic({ phase: 'app.startup', outcome: 'ok', duration_ms: Math.min(120_000, Math.round(performance.now())) });
}, error => {
  reportDiagnostic({ phase: 'app.startup', outcome: 'error', duration_ms: Math.min(120_000, Math.round(performance.now())) });
  throw error; // Keep the entry shell's existing startup-failure feedback.
});
