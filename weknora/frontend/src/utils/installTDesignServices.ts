import type { App, Plugin } from 'vue'
import { DialogPlugin, DrawerPlugin, LoadingPlugin, MessagePlugin, NotifyPlugin } from 'tdesign-vue-next'

const servicePlugins: Plugin[] = [DialogPlugin, DrawerPlugin, LoadingPlugin, MessagePlugin, NotifyPlugin]

/** Retain service context without globally installing every UI component. */
export function installTDesignServices(app: App): void {
  for (const plugin of servicePlugins) {
    app.use(plugin)
  }
}
