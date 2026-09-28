import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./DataSourceEditorDialog.vue', import.meta.url), 'utf8')
const template = source.slice(source.indexOf('<template>'))

test('Lite data-source creation hides deferred GitLab and Tencent IMA connectors', () => {
  assert.match(source, /const authStore = useAuthStore\(\)/)
  assert.match(source, /const LITE_DEFERRED_CONNECTOR_TYPES = new Set\(\['gitlab', 'ima'\]\)/)
  assert.match(source, /const visibleConnectorDefs = computed\(\(\) => \{[\s\S]*?authStore\.isLiteMode[\s\S]*?LITE_DEFERRED_CONNECTOR_TYPES/)
  assert.match(template, /v-for="def in visibleConnectorDefs"/)
})
test('Standard keeps the complete connector catalog and Lite can edit legacy rows', () => {
  assert.match(
    source,
    /if \(!authStore\.isLiteMode\) return connectorDefs\.value/,
  )
  assert.match(
    source,
    /const existingType = isEdit\.value \? props\.dataSource\?\.type : undefined/,
  )
  assert.match(
    source,
    /!LITE_DEFERRED_CONNECTOR_TYPES\.has\(def\.type\) \|\| def\.type === existingType/,
  )
})
