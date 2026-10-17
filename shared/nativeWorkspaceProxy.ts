type NativeProxy = {
  on(event: 'proxyReq', listener: (request: { removeHeader(name: string): void }) => void): unknown
}

/** Native workspaces authenticate with Bearer tokens, not localhost cookies. */
export function nativeWorkspaceProxy(target: string, native: boolean) {
  return { target, changeOrigin: true, secure: false,
    ...(native ? { configure(proxy: NativeProxy) {
      proxy.on('proxyReq', request => request.removeHeader('cookie'))
    } } : {}),
  }
}
