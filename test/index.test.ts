import assert from 'node:assert/strict'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import test from 'node:test'

import { apply } from '../src/host/index.js'
import type { HostContext } from '../src/host/dsh.js'

interface CapturedRoute {
  kind: string
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

function createHost(): { ctx: HostContext; routes: Map<string, CapturedRoute> } {
  const routes = new Map<string, CapturedRoute>()
  const webCtx = {
    webServer: {
      register(route: CapturedRoute) {
        routes.set(route.path, route)
        return () => {}
      },
    },
    effect(callback: () => void | (() => void)) {
      return callback()
    },
  }
  const ctx: HostContext = {
    get() {
      return undefined
    },
    inject(_names, callback) {
      callback(webCtx as unknown as HostContext)
    },
    effect(callback) {
      callback()
    },
  }
  return { ctx, routes }
}

test('host registers only the API route', () => {
  const { ctx, routes } = createHost()
  apply(ctx)
  assert.ok(routes.has('/api-asset-archiver'))
  assert.equal(routes.has('/asset-archiver-window'), false)
})

test('API route still owns POST request handling', async () => {
  const { ctx, routes } = createHost()
  apply(ctx)
  const route = routes.get('/api-asset-archiver')
  assert.ok(route)
  const request = Readable.from([]) as unknown as IncomingMessage
  request.method = 'GET'
  request.url = '/api-asset-archiver/config/get'
  request.headers = {}
  let status = 0
  let body = ''
  const response = {
    writeHead(code: number) {
      status = code
    },
    end(chunk: unknown) {
      body = String(chunk ?? '')
    },
  } as unknown as ServerResponse
  await route.handler(request, response)
  assert.equal(status, 405)
  assert.match(body, /E_METHOD/)
})
