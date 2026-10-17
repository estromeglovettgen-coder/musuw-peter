import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp } from 'vue'
import { DialogPlugin, DrawerPlugin, LoadingPlugin, MessagePlugin, NotifyPlugin } from 'tdesign-vue-next'
import { installTDesignServices } from './installTDesignServices'

test('on-demand components retain every native service plugin and its application context', () => {
  const app = createApp({ render: () => null })
  installTDesignServices(app)
  for (const plugin of [DialogPlugin, DrawerPlugin, LoadingPlugin, MessagePlugin, NotifyPlugin]) {
    assert.equal(plugin._context, app._context)
  }
  for (const name of ['$dialog', '$drawer', '$loading', '$message', '$notify']) {
    assert.equal(typeof app.config.globalProperties[name], 'function', `${name} must remain available to existing consumers`)
  }
  assert.equal(Object.keys(app._context.components).length, 0, 'Service compatibility must not reinstall the full component library')
})
