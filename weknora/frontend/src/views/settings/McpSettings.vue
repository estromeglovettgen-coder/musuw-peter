<template>
  <div class="mcp-settings">
    <header class="visual-settings-page-header">
      <div class="visual-settings-page-header__copy">
        <h2 class="visual-settings-page-header__title">{{ $t('mcpSettings.title') }}</h2>
        <p class="visual-settings-page-header__description">
          {{ $t('mcpSettings.description') }}
        </p>
      </div>
    </header>

    <div v-if="loading" class="loading-container">
      <t-loading :text="$t('common.loading')" />
    </div>

    <template v-else>
      <div class="list-section-header">
        <h3>{{ $t('mcpSettings.configuredServices') }}</h3>
        <p>{{ $t('mcpSettings.manageAndTest') }}</p>
      </div>

      <div v-if="services.length === 0 && !authStore.hasRole('admin')" class="empty-state">
        <t-empty :description="$t('mcpSettings.empty')" />
      </div>

      <div v-else class="services-grid">
        <div
          v-for="service in services"
          :key="service.id"
          class="service-card"
          :class="[
            `service-card--${service.transport_type || 'unknown'}`,
            {
              'service-card--builtin': service.is_builtin,
              'service-card--clickable': isServiceCardClickable(),
            },
          ]"
          :role="isServiceCardClickable() ? 'button' : undefined"
          :tabindex="isServiceCardClickable() ? 0 : undefined"
          @click="onServiceCardClick($event, service)"
          @keydown.enter="onServiceCardClick($event, service)"
        >
          <div class="service-card__main">
            <div class="service-card__top">
              <div class="service-card__identity">
                <div
                  class="service-card__badge"
                  :aria-label="getTransportTypeLabel(service.transport_type)"
                >
                  <t-icon :name="getTransportTypeIcon(service.transport_type)" size="16px" />
                </div>
                <h3 class="service-card__title" :title="service.name">{{ service.name }}</h3>
              </div>
              <span
                v-if="service.is_builtin"
                class="service-card__pill service-card__pill--warning"
              >
                {{ $t('mcpSettings.builtin') }}
              </span>
              <span
                v-else
                class="service-card__status"
                :class="service.enabled ? 'service-card__status--on' : 'service-card__status--off'"
              >
                <span class="service-card__status-dot" />
                {{ service.enabled ? $t('common.on') : $t('common.off') }}
              </span>
            </div>
            <div class="service-card__type-row">
              <span class="service-card__type">{{ getTransportTypeLabel(service.transport_type) }}</span>
              <span class="service-card__sep" aria-hidden="true">·</span>
            </div>
            <p v-if="service.description" class="service-card__desc" :title="service.description">
              {{ service.description }}
            </p>
          </div>

          <div class="service-card__footer">
            <div v-if="service.url" class="service-card__url" :title="service.url">
              {{ service.url }}
            </div>
            <div
              v-if="(service.is_builtin ? getBuiltinServiceOptions() : getServiceOptions(service)).length > 0"
              class="service-card__actions"
              @click.stop
            >
              <t-dropdown
                :options="service.is_builtin ? getBuiltinServiceOptions() : getServiceOptions(service)"
                placement="bottom-right"
                attach="body"
                trigger="click"
                @click="(data: any) => handleMenuAction({ value: data.value }, service)"
              >
                <t-button variant="text" shape="square" size="small" class="service-card__more">
                  <t-icon name="ellipsis" />
                </t-button>
              </t-dropdown>
            </div>
          </div>
        </div>
        <button
          v-if="authStore.hasRole('admin')"
          type="button"
          class="service-card service-card--add"
          @click="handleAdd"
        >
          <span class="service-card--add__icon" aria-hidden="true">
            <add-icon />
          </span>
          <span class="service-card--add__label">{{ $t('mcpSettings.addService') }}</span>
        </button>
      </div>
    </template>

    <!-- Add/Edit Drawer -->
    <McpServiceDialog
      v-model:visible="dialogVisible"
      :service="currentService"
      :mode="dialogMode"
      @success="handleDialogSuccess"
      @created="handleDialogCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon } from 'tdesign-icons-vue-next'
import { useI18n } from 'vue-i18n'
import {
  listMCPServices,
  updateMCPService,
  deleteMCPService,
  type MCPService
} from '@/api/mcp-service'
import McpServiceDialog from './components/McpServiceDialog.vue'
import { useConfirmDelete } from '@/components/settings/useConfirmDelete'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const authStore = useAuthStore()
const confirmDelete = useConfirmDelete()

const services = ref<MCPService[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref<'add' | 'edit'>('add')
const currentService = ref<MCPService | null>(null)

// Load MCP services
const loadServices = async () => {
  loading.value = true
  try {
    services.value = await listMCPServices()
  } catch (error) {
    MessagePlugin.error(t('mcpSettings.toasts.loadFailed'))
    console.error('Failed to load MCP services:', error)
  } finally {
    loading.value = false
  }
}

// Handle add button click
const handleAdd = () => {
  currentService.value = null
  dialogMode.value = 'add'
  dialogVisible.value = true
}

const isServiceCardClickable = () => authStore.hasRole('admin')

const onServiceCardClick = (event: Event, service: MCPService) => {
  if (!isServiceCardClickable()) return
  if (event.type === 'keydown') {
    const ke = event as KeyboardEvent
    if (ke.key !== 'Enter' && ke.key !== ' ') return
    ke.preventDefault()
  }
  const target = event.target as HTMLElement | null
  if (target?.closest('.service-card__actions')) return
  handleEdit(service)
}

// Handle edit button click
const handleEdit = (service: MCPService) => {
  currentService.value = { ...service }
  dialogMode.value = 'edit'
  dialogVisible.value = true
}

// Handle dialog success (edit-mode update): close + refresh.
const handleDialogSuccess = () => {
  dialogVisible.value = false
  loadServices()
}

// Handle first create: keep the drawer open and flip it to edit mode bound to
// the newly created service, so OAuth authorization and "test connection"
// (both of which need a saved service id) are usable right away. The list is
// refreshed in the background; we prefer the freshly-fetched record so the
// edit form sees server-side fields (e.g. credential metadata).
const handleDialogCreated = async (created: MCPService) => {
  await loadServices()
  const full = services.value.find((s) => s.id === created.id) || created
  currentService.value = { ...full }
  dialogMode.value = 'edit'
}

// Handle toggle enabled/disabled
const handleToggleEnabled = async (service: MCPService) => {
  if (!service || !service.id) return

  const originalState = service.enabled
  try {
    await updateMCPService(service.id, { enabled: service.enabled })
    MessagePlugin.success(service.enabled ? t('mcpSettings.toasts.enabled') : t('mcpSettings.toasts.disabled'))
  } catch (error) {
    service.enabled = originalState
    MessagePlugin.error(t('mcpSettings.toasts.updateStateFailed'))
    console.error('Failed to update MCP service:', error)
  }
}

// Handle delete button click
const handleDelete = (service: MCPService) => {
  if (!service || !service.id) return

  confirmDelete({
    body: t('mcpSettings.deleteConfirmBody', { name: service.name || t('mcpSettings.unnamed') }),
    onConfirm: async () => {
      try {
        await deleteMCPService(service.id)
        MessagePlugin.success(t('mcpSettings.toasts.deleted'))
        loadServices()
      } catch (error) {
        MessagePlugin.error(t('mcpSettings.toasts.deleteFailed'))
        console.error('Failed to delete MCP service:', error)
      }
    }
  })
}

// Get service options for dropdown menu. MCP service mutations are all
// Admin+ in the backend matrix, so non-Admins see an empty action menu.
// 测试连接已挪到编辑抽屉的 footer，不再放在外层菜单里 — 单一入口减少
// 用户疑惑（"为什么有两个测试入口，结果一样吗？"）。
const getServiceOptions = (service: MCPService) => {
  if (!authStore.hasRole('admin')) {
    return []
  }
  return [
    {
      content: service.enabled ? t('common.off') : t('common.on'),
      value: 'toggle',
    },
    { content: t('common.edit'), value: 'edit' },
    { content: t('common.delete'), value: 'delete', theme: 'error' as const }
  ]
}

// Builtin: 仅编辑（同样 Admin+ only）。内置服务测试也通过抽屉的 footer 触发，
// 不再在外层菜单露出"测试连接"项。
const getBuiltinServiceOptions = () => {
  if (!authStore.hasRole('admin')) {
    return []
  }
  return [
    { content: t('common.edit'), value: 'edit' }
  ]
}

// Handle menu action. 'test' has been removed from the menu — testing now
// lives only in the editor drawer. We keep the switch's case list narrow
// so a stray 'test' from somewhere else falls through harmlessly.
const handleMenuAction = (data: { value: string }, service: MCPService) => {
  switch (data.value) {
    case 'toggle':
      // Flip the local model and reuse the toggle path so the API call,
      // optimistic UI, and rollback-on-failure all stay in one place.
      service.enabled = !service.enabled
      handleToggleEnabled(service)
      break
    case 'edit':
      handleEdit(service)
      break
    case 'delete':
      handleDelete(service)
      break
  }
}

// Get transport type icon. 复用 tdesign 自带 icon name；新增 transport 时同步加。
const getTransportTypeIcon = (transportType: string) => {
  switch (transportType) {
    case 'sse':
      return 'cast'
    case 'http-streamable':
      return 'link'
    case 'stdio':
      return 'code'
    default:
      return 'tools'
  }
}

// Get transport type label
const getTransportTypeLabel = (transportType: string) => {
  switch (transportType) {
    case 'sse':
      return 'SSE'
    case 'http-streamable':
      return 'HTTP Streamable'
    case 'stdio':
      return 'Stdio'
    default:
      return transportType
  }
}

onMounted(() => {
  loadServices()
})
</script>

<style scoped lang="less">
.mcp-settings {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--td-text-color-primary);
}

.section-header {
  padding-bottom: 16px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--td-component-stroke);

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.4;
  }

  .section-description {
    margin: 4px 0 0;
    color: var(--td-text-color-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
}

.loading-container {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  text-align: center;
}

.list-section-header {
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    line-height: 1.4;
  }

  p {
    margin: 2px 0 0;
    color: var(--td-text-color-placeholder);
    font-size: 11px;
    line-height: 1.45;
  }
}

.empty-state {
  display: flex;
  flex: 1;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  text-align: center;

  :deep(.t-empty__description) {
    margin: 0;
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }
}

.services-grid {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  padding-bottom: 16px;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .service-card--add {
    width: 100%;
    height: 100%;
  }
}

.service-card {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-width: 0;
  min-height: 140px;
  padding: 16px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 16px;
  background: var(--td-bg-color-container);
  text-align: left;
  transition: border-color 150ms ease, box-shadow 150ms ease;

  &--builtin {
    background: var(--td-bg-color-container);
  }

  &--clickable {
    cursor: pointer;

    &:hover {
      border-color: var(--td-component-border);
      box-shadow: 0 3px 10px rgb(15 23 42 / 6%);
    }

    &:focus-visible {
      outline: 2px solid var(--td-text-color-primary);
      outline-offset: 2px;
    }
  }

  &--builtin:not(.service-card--clickable):hover {
    border-color: var(--td-component-stroke);
    box-shadow: none;
  }

  &--add {
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 140px;
    border-style: dashed;
    background: color-mix(in srgb, var(--td-bg-color-secondarycontainer) 50%, transparent);
    color: var(--td-text-color-secondary);
    cursor: pointer;
    font: inherit;
    text-align: center;

    &:hover,
    &:focus-visible {
      color: var(--td-text-color-primary);
      border-color: var(--td-component-border);
      background: var(--td-bg-color-secondarycontainer);
    }

    &:focus-visible {
      outline: 2px solid var(--td-text-color-primary);
      outline-offset: 2px;
    }

    &__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid var(--td-component-stroke);
      border-radius: 999px;
      background: var(--td-bg-color-container);
      color: currentColor;
      transition: transform 150ms ease;
    }

    &:hover &__icon,
    &:focus-visible &__icon {
      transform: scale(1.05);
    }

    &__label {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
    }
  }
}

.service-card__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.service-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.service-card__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.service-card__badge {
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  background: var(--td-bg-color-component);
  color: var(--td-text-color-secondary);
}

.service-card__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-card__pill,
.service-card__status {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 2px 8px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 999px;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-placeholder);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
}

.service-card__status {
  &--on {
    border-color: rgb(16 185 129 / 25%);
    background: rgb(16 185 129 / 8%);
    color: var(--td-success-color-7, #118053);
  }
}

.service-card__pill--warning {
  border-color: rgb(245 158 11 / 25%);
  background: rgb(245 158 11 / 8%);
  color: var(--td-warning-color-7, #b85c00);
}

.service-card__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--td-gray-color-5);
}

.service-card__status--on .service-card__status-dot {
  background: var(--td-success-color, #118053);
}

.service-card__type-row {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 10px;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
}

.service-card__sep {
  color: var(--td-text-color-placeholder);
}

.service-card__desc {
  display: -webkit-box;
  min-height: 33px;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--td-text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.service-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--td-bg-color-component);
}

.service-card__url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--td-text-color-placeholder);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-card__actions {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 150ms ease;
}

.service-card:hover .service-card__actions,
.service-card:focus-within .service-card__actions,
.service-card__actions:focus-within {
  opacity: 1;
}

.service-card__more {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 8px;
  color: var(--td-text-color-placeholder);
  transition: background-color 150ms ease, color 150ms ease;

  &:hover,
  &:focus-visible {
    background: var(--td-bg-color-component);
    color: var(--td-text-color-primary);
  }
}

:root[theme-mode="dark"] .mcp-settings {
  color: var(--mvc-text, #f2f2f2);

  .section-header,
  .service-card__footer {
    border-color: var(--mvc-line, #31343a);
  }

  .section-header h2,
  .list-section-header h3,
  .service-card__title {
    color: var(--mvc-text-strong, #fff);
  }

  .section-description,
  .list-section-header p,
  .service-card__type-row,
  .service-card__desc {
    color: var(--mvc-muted, #c2c2c2);
  }
}

:root[theme-mode="dark"] .service-card {
  border-color: var(--mvc-line, #31343a);
  background: var(--mvc-surface, #1d1f23);
  color: var(--mvc-text, #f2f2f2);

  &--clickable:hover {
    border-color: var(--mvc-line-strong, #484c54);
    box-shadow: 0 4px 14px rgb(0 0 0 / 24%);
  }

  &--add {
    background: color-mix(in srgb, var(--mvc-surface, #1d1f23) 70%, transparent);
    color: var(--mvc-muted-strong, #dedede);

    &:hover,
    &:focus-visible {
      border-color: var(--mvc-line-strong, #484c54);
      background: var(--mvc-hover, #25272c);
      color: var(--mvc-text-strong, #fff);
    }

    &__icon {
      border-color: var(--mvc-line, #31343a);
      background: var(--mvc-surface-raised, #202227);
    }
  }

  .service-card__badge,
  .service-card__more:hover,
  .service-card__more:focus-visible {
    border-color: var(--mvc-line, #31343a);
    background: var(--mvc-hover, #25272c);
    color: var(--mvc-muted-strong, #dedede);
  }

  .service-card__url,
  .service-card__sep,
  .service-card__more {
    color: var(--mvc-faint, #9c9c9c);
  }

  .service-card__status--off {
    border-color: var(--mvc-line, #31343a);
    background: var(--mvc-hover, #25272c);
    color: var(--mvc-muted, #c2c2c2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .service-card,
  .service-card__actions,
  .service-card--add__icon {
    transition: none;
  }
}
</style>
