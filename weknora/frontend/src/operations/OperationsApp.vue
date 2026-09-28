<template>
  <div class="ops-shell">
    <aside class="ops-sidebar">
      <div class="ops-brand">
        <div class="ops-brand__mark">M</div>
        <div>
          <strong>Musuw</strong>
          <span>Operations</span>
        </div>
      </div>

      <nav class="ops-nav" aria-label="运营中台导航">
        <button
          v-for="item in navigation"
          :key="item.key"
          type="button"
          class="ops-nav__item"
          :class="{ 'ops-nav__item--active': currentPage === item.key }"
          :aria-current="currentPage === item.key ? 'page' : undefined"
          @click="navigate(item.key)"
        >
          <component :is="item.icon" size="19" :stroke-width="1.8" />
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="ops-sidebar__footer">
        <div class="ops-runtime-state">
          <span class="ops-runtime-state__dot" :class="{ 'is-ready': config?.providers.weknora.available }" />
          <div>
            <strong>{{ config?.providers.weknora.available ? '管理 API 已连接' : '管理 API 不可用' }}</strong>
            <span>平台密钥仅由运营服务读取</span>
          </div>
        </div>
        <div class="ops-template-credit">Musuw · Operations</div>
      </div>
    </aside>

    <section class="ops-workspace">
      <header class="ops-topbar">
        <div class="ops-topbar__context">
          <span>运营中台</span>
          <span>/</span>
          <strong>{{ activeNavigation.label }}</strong>
        </div>
        <div class="ops-topbar__actions">
          <t-popup placement="bottom-right" trigger="click">
            <button
              class="ops-environment"
              type="button"
              :class="`is-${config?.target || 'test'}`"
            >
              <span class="ops-environment__dot" />
              {{ config?.environment || '连接中' }}
              <ChevronDownIcon size="15" />
            </button>
            <template #content>
              <div class="ops-env-menu">
                <button type="button" class="is-current">
                  <span>{{ config?.environment || '当前环境' }}</span>
                  <CheckIcon size="16" />
                </button>
                <button
                  type="button"
                  :class="{ 'is-production': alternateTarget === 'production' }"
                  :disabled="!config"
                  @click="switchEnvironment(alternateTarget)"
                >
                  <span>{{ alternateTargetLabel }}</span>
                  <ChevronDownIcon size="15" class="ops-env-menu__switch-icon" />
                </button>
                <p>两个环境常驻运行，点击后立即切换并保留当前页面。</p>
              </div>
            </template>
          </t-popup>
          <button class="ops-icon-button" type="button" aria-label="刷新当前页面" :disabled="refreshing" @click="refresh">
            <RefreshIcon size="18" :class="{ 'ops-spin': refreshing }" />
          </button>
          <div class="ops-operator">
            <div class="ops-operator__avatar">OP</div>
            <div>
              <strong>运营会话</strong>
              <span>SameSite + CSRF 防护</span>
            </div>
          </div>
        </div>
      </header>

      <main class="ops-main">
        <div v-if="bootstrapError" class="ops-bootstrap-error">
          <t-alert theme="error" title="运营中台启动失败" :message="bootstrapError">
            <template #operation>
              <t-button size="small" @click="bootstrap">重试</t-button>
            </template>
          </t-alert>
        </div>
        <component
          v-else
          :is="activeNavigation.component"
          :config="config"
          :refresh-key="refreshKey"
          @busy="setBusy"
        />
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  CheckIcon,
  ChevronDownIcon,
  CloudIcon,
  DashboardIcon,
  FileIcon,
  MoneyIcon,
  RefreshIcon,
  SettingIcon,
  SystemLogIcon,
  UserSafetyIcon,
  UsergroupIcon,
} from 'tdesign-icons-vue-next'
import { operationsApi } from './api'
import { useOperationsReadRecovery } from './useOperationsReadRecovery'
import type { EnvironmentTarget, OperationsConfig } from './types'
import OverviewPage from './pages/OverviewPage.vue'
import UsersPage from './pages/UsersPage.vue'
import KnowledgePage from './pages/KnowledgePage.vue'
import BillingPage from './pages/BillingPage.vue'
import IdentityPage from './pages/IdentityPage.vue'
import StoragePage from './pages/StoragePage.vue'
import LogsPage from './pages/LogsPage.vue'
import ModelsPolicyPage from './pages/ModelsPolicyPage.vue'

type PageKey = 'overview' | 'users' | 'knowledge' | 'model-policy' | 'billing' | 'identity' | 'storage' | 'logs'

const navigation = [
  { key: 'overview' as const, label: '概览', icon: markRaw(DashboardIcon), component: markRaw(OverviewPage) },
  { key: 'users' as const, label: '用户', icon: markRaw(UsergroupIcon), component: markRaw(UsersPage) },
  { key: 'knowledge' as const, label: '知识库与文档', icon: markRaw(FileIcon), component: markRaw(KnowledgePage) },
  { key: 'model-policy' as const, label: '模型策略', icon: markRaw(SettingIcon), component: markRaw(ModelsPolicyPage) },
  { key: 'billing' as const, label: '账单', icon: markRaw(MoneyIcon), component: markRaw(BillingPage) },
  { key: 'identity' as const, label: '身份', icon: markRaw(UserSafetyIcon), component: markRaw(IdentityPage) },
  { key: 'storage' as const, label: '存储', icon: markRaw(CloudIcon), component: markRaw(StoragePage) },
  { key: 'logs' as const, label: '日志与追踪', icon: markRaw(SystemLogIcon), component: markRaw(LogsPage) },
]

const validPages = new Set<PageKey>(navigation.map((item) => item.key))
const initialHash = window.location.hash.replace(/^#\/?/, '') as PageKey
const currentPage = ref<PageKey>(validPages.has(initialHash) ? initialHash : 'overview')
const config = ref<OperationsConfig | null>(null)
const bootstrapError = ref('')
const bootstrapLoading = ref(false)
const refreshKey = ref(0)
const busyChildren = ref(0)
const refreshing = computed(() => busyChildren.value > 0)
const activeNavigation = computed(() => navigation.find((item) => item.key === currentPage.value) || navigation[0])
const alternateTarget = computed<EnvironmentTarget>(() => (config.value?.target === 'production' ? 'test' : 'production'))
const environmentLabel = (target: EnvironmentTarget) => (target === 'production' ? 'PRODUCTION' : 'TEST')
const alternateTargetLabel = computed(() => environmentLabel(alternateTarget.value))

const environmentPorts: Record<EnvironmentTarget, string> = {
  test: '4186',
  production: '4187',
}

function navigate(page: PageKey) {
  currentPage.value = page
  window.location.hash = `/${page}`
  document.querySelector('.ops-main')?.scrollTo({ top: 0, behavior: 'instant' })
}

function handleHashChange() {
  const page = window.location.hash.replace(/^#\/?/, '') as PageKey
  if (validPages.has(page)) currentPage.value = page
}

async function bootstrap() {
  if (bootstrapLoading.value) return
  bootstrapLoading.value = true
  bootstrapError.value = ''
  try {
    config.value = await operationsApi.config()
  } catch (error) {
    bootstrapError.value = error instanceof Error ? error.message : '无法加载运营配置'
  } finally {
    bootstrapLoading.value = false
  }
}

useOperationsReadRecovery(bootstrapError, bootstrapLoading, bootstrap)

function refresh() {
  if (refreshing.value) return
  refreshKey.value += 1
}

function setBusy(value: boolean) {
  busyChildren.value = Math.max(0, busyChildren.value + (value ? 1 : -1))
}

function switchEnvironment(target: EnvironmentTarget) {
  if (!config.value || target === config.value.target) return
  const targetUrl = new URL(window.location.href)
  targetUrl.port = environmentPorts[target]
  window.location.assign(targetUrl.href)
}

onMounted(() => {
  window.addEventListener('hashchange', handleHashChange)
  if (!window.location.hash) window.history.replaceState(null, '', '#/overview')
  bootstrap()
})

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', handleHashChange)
})
</script>
