import { AssetArchiverApp } from './app.js'
import type { HostContext } from './dsh.js'
import { createLogger } from './logger.js'
import { createRequestHandler, ROUTE_PREFIX } from './routes.js'

interface WebServer {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>
  }): () => void
}

interface WebServerContext extends HostContext {
  webServer: WebServer
}

/**
 * Host half. Routes are registered only while `webServer` is available, so a
 * headless profile keeps the plugin loadable without HTTP.
 */
export function apply(ctx: HostContext): void {
  const logger = createLogger()
  const app = new AssetArchiverApp(ctx, { logger })

  ctx.inject(['webServer'], (webCtx) => {
    const target = webCtx as WebServerContext
    webCtx.effect(() => target.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: createRequestHandler({ app, logger }),
    }))
  })
}

export const name = 'dsh-asset-archiver'
