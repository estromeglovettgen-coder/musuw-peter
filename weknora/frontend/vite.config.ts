import { fileURLToPath, URL } from 'node:url'
import { resolve, dirname, basename } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { defineConfig, transformWithEsbuild, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { compileScript, parse } from '@vue/compiler-sfc'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const pkg = require('./package.json') as { version?: string }
const FRONTEND_VERSION = pkg.version ?? 'unknown'

function resolveFrontendCommit(): string {
  const fromEnv = process.env.VITE_FRONTEND_COMMIT || process.env.GITHUB_SHA
  if (fromEnv) {
    return fromEnv.slice(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

const FRONTEND_COMMIT = resolveFrontendCommit()

/**
 * Compile frozen pre-rebuild SFCs as headless controller modules.
 *
 * The baseline files live under src/assets/business-baselines only as immutable
 * source snapshots, so their original relative imports must NOT resolve from
 * that archive directory. Each baseline is therefore compiled as a virtual TS
 * module located beside the original SFC it came from. This preserves the exact
 * import semantics of the original business script while keeping the archived
 * template/style out of the runtime module graph.
 */
function businessControllerPlugin(): Plugin {
  const virtualSuffix = '.business-controller.ts'
  const virtualToBaseline = new Map<string, string>()
  const originalSourceByBaseline = new Map<string, string>([
    ['Input-field.pre-view.vue', resolve(__dirname, 'src/components/Input-field.vue')],
    ['KnowledgeBase.pre-view.vue', resolve(__dirname, 'src/views/knowledge/KnowledgeBase.vue')],
    ['KnowledgeBaseList.pre-view.vue', resolve(__dirname, 'src/views/knowledge/KnowledgeBaseList.vue')],
    ['ChatIndex.pre-view.vue', resolve(__dirname, 'src/views/chat/index.vue')],
    ['manual-knowledge-editor.pre-view.vue', resolve(__dirname, 'src/components/manual-knowledge-editor.vue')],
    ['menu.pre-view.vue', resolve(__dirname, 'src/components/menu.vue')],
  ])

  return {
    name: 'musuw-business-controller',
    enforce: 'pre',
    async resolveId(source, importer) {
      const normalizedSource = source.replaceAll('\\', '/')
      if (!normalizedSource.includes('/business-baselines/') || !normalizedSource.endsWith('.pre-view.vue')) {
        return null
      }

      const baseline = await this.resolve(source, importer, { skipSelf: true })
      if (!baseline) return null

      const originalSource = originalSourceByBaseline.get(basename(baseline.id))
      if (!originalSource) {
        throw new Error(`No original source mapping for frozen business baseline: ${baseline.id}`)
      }

      const virtualId = `${originalSource}${virtualSuffix}`
      virtualToBaseline.set(virtualId, baseline.id)
      return virtualId
    },
    async load(id) {
      const baselinePath = virtualToBaseline.get(id)
      if (!baselinePath || !id.endsWith(virtualSuffix)) return null
      this.addWatchFile(baselinePath)

      const originalFilename = id.slice(0, -virtualSuffix.length)
      const source = readFileSync(baselinePath, 'utf8')
      const { descriptor, errors } = parse(source, { filename: originalFilename })
      if (errors.length) {
        throw new Error(`Failed to parse business controller ${baselinePath}: ${errors.join('\n')}`)
      }
      if (!descriptor.scriptSetup) {
        throw new Error(`Business controller ${baselinePath} must contain <script setup>.`)
      }

      const scopeId = createHash('sha256').update(originalFilename).digest('hex').slice(0, 8)
      const compiled = compileScript(descriptor, {
        id: scopeId,
        inlineTemplate: false,
      })
      const transformed = await transformWithEsbuild(compiled.content, originalFilename, {
        loader: descriptor.scriptSetup.lang === 'ts' ? 'ts' : 'js',
        target: 'esnext',
        sourcemap: false,
      })
      return transformed.code
    },
    handleHotUpdate({ file, server }) {
      const modules = [...virtualToBaseline.entries()]
        .filter(([, baselinePath]) => baselinePath === file)
        .flatMap(([id]) => {
          const module = server.moduleGraph.getModuleById(id)
          if (!module) return []
          server.moduleGraph.invalidateModule(module)
          return [module]
        })
      if (modules.length) return modules
    },
  }
}

/** Dev parity with nginx: serve embed.html for /embed/:channelId (not the main SPA). */
function embedHtmlDevFallback(): Plugin {
  return {
    name: 'embed-html-dev-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const raw = req.url ?? ''
        const qIdx = raw.indexOf('?')
        const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw
        const qs = qIdx >= 0 ? raw.slice(qIdx) : ''
        if (process.env.VITE_WORKSPACE_PROFILE === 'peter' && /^\/auth\/(start|error|logout)\/?$/.test(path)) {
          req.url = `/auth/index.html${qs}`
        }
        if (path.startsWith('/embed/') && path !== '/embed.html' && !path.includes('.')) {
          req.url = `/embed.html${qs}`
        }
        next()
      })
    },
  }
}
const DEV_PROXY_TARGET =
  process.env.VITE_DEV_PROXY_TARGET ||
  process.env.FRONTEND_BACKEND_URL ||
  'http://localhost:8080'

// The retained Google/email shell is a separate Vite app in development but
// remains same-origin through this standard Vite proxy.  It is opt-in so
// upstream standalone frontend development keeps its original topology.
const AUTH_DEV_TARGET = process.env.VITE_AUTH_DEV_TARGET

function resolveVueOfficePptxEntry(): string {
  try {
    const pkgDir = dirname(require.resolve('@vue-office/pptx/package.json'))
    const candidates = [
      resolve(pkgDir, 'lib/v3/index.js'),
      resolve(pkgDir, 'lib/index.js'),
      resolve(pkgDir, 'lib/v3/vue-office-pptx.mjs'),
    ]
    const matched = candidates.find((candidate) => existsSync(candidate))
    return matched ?? '@vue-office/pptx'
  } catch {
    return '@vue-office/pptx'
  }
}

export default defineConfig({
  define: {
    __FRONTEND_VERSION__: JSON.stringify(FRONTEND_VERSION),
    __FRONTEND_COMMIT__: JSON.stringify(FRONTEND_COMMIT),
  },
  build: {
    modulePreload: {
      resolveDependencies(_filename, deps, { hostId }) {
        // Embed iframe bootstraps with token exchange only; defer heavy chat chunks.
        if (hostId?.includes('embed')) {
          return deps.filter((dep) => !(
            dep.includes('vendor-mermaid')
            || dep.includes('vendor-highlight')
            || dep.includes('vendor-markdown')
            || dep.includes('vendor-tdesign')
            || dep.includes('botmsg')
            || dep.includes('usermsg')
            || dep.includes('EmbedBotMessage')
            || dep.includes('EmbedUserMessage')
            || dep.includes('AgentStreamDisplay')
            || dep.includes('EmbedChatCore')
            || dep.includes('vendor-markdown')
            || dep.includes('fonts-')
          ))
        }
        return deps
      },
    },
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed.html'),
        operations: resolve(__dirname, 'operations.html'),
      },
      output: {
        // Keep shared Vue/DOMPurify dependencies out of optional rendering chunks;
        // otherwise importing them at startup also downloads Mermaid and Highlight.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // Do not match '/dagre': it also matches @antv/layout's internal
          // Dagre class and creates a G6 → Mermaid → G6 initialization cycle.
          if (id.includes('mermaid')) {
            return 'vendor-mermaid'
          }
          if (id.includes('marked') || id.includes('katex')) {
            return 'vendor-markdown'
          }
          if (id.includes('highlight.js')) {
            return 'vendor-highlight'
          }
        },
      },
    },
  },
  plugins: [
    businessControllerPlugin(),
    vue(),
    vueJsx(),
    embedHtmlDevFallback(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@vue-office/pptx': resolveVueOfficePptxEntry(),
    },
  },
  server: {
    port: 5173,
    host: true,
    // 代理配置，用于开发环境
    proxy: {
      '/api': {
        target: DEV_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/files': {
        target: DEV_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/r': {
        target: DEV_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      ...(AUTH_DEV_TARGET
        ? {
            '/auth': {
              target: AUTH_DEV_TARGET,
              changeOrigin: true,
              secure: false,
              ws: true,
            },
            '/oauth': {
              target: AUTH_DEV_TARGET,
              changeOrigin: true,
              rewrite: (path) => `/auth${path}`,
              secure: false,
              ws: true,
            },
          }
        : {}),
    }
  },
  // `vite preview` 用生产构建产物(dist)本地起服务，是最接近 release 镜像的环境：
  // 同样的压缩 / 拆包 / CSS 加载顺序，可提前暴露只在生产构建出现的问题
  // （如主题变量被打包顺序覆盖）。用法：npm run build && npm run preview
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': {
        target: DEV_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      },
      '/files': {
        target: DEV_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
