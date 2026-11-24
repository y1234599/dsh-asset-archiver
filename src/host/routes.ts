import type { IncomingMessage, ServerResponse } from 'node:http'

import type { ConfigInput, DownloadRequest, RouteAction, UploadRequest } from '../shared/contract.js'
import type { AssetArchiverApp } from './app.js'
import { AppError, statusOf, toApiError } from './errors.js'
import type { Logger } from './logger.js'

export const ROUTE_PREFIX = '/api-asset-archiver'
const MAX_BODY_BYTES = 1_000_000

export interface RequestHandlerDeps {
  app: AssetArchiverApp
  logger: Logger
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new AppError('E_LIMIT', '请求体过大', 413)
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new AppError('E_LIMIT', '请求体过大', 413)
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new AppError('E_BAD_REQUEST', '请求体必须是 JSON 对象', 400)
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError('E_BAD_REQUEST', '请求体不是合法 JSON', 400)
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function configInput(body: Record<string, unknown>): ConfigInput {
  return {
    endpoint: optionalString(body.endpoint),
    region: optionalString(body.region),
    accessKeyId: optionalString(body.accessKeyId),
    accessKeySecret: optionalString(body.accessKeySecret),
    bucketName: optionalString(body.bucketName),
    prefix: optionalString(body.prefix),
  }
}

function uploadRequest(body: Record<string, unknown>): UploadRequest {
  const workspaceIds = Array.isArray(body.workspaceIds)
    ? body.workspaceIds.filter((id): id is string => typeof id === 'string')
    : undefined
  const files = Array.isArray(body.files)
    ? body.files
      .filter((item): item is { workspaceId: string; path: string } => {
        if (!item || typeof item !== 'object') return false
        const candidate = item as { workspaceId?: unknown; path?: unknown }
        return typeof candidate.workspaceId === 'string' && typeof candidate.path === 'string'
      })
      .map((item) => ({ workspaceId: item.workspaceId, path: item.path }))
    : undefined
  return {
    ...(workspaceIds === undefined ? {} : { workspaceIds }),
    ...(files === undefined ? {} : { files }),
  }
}

function downloadRequest(body: Record<string, unknown>): DownloadRequest {
  return {
    workspaceKey: optionalString(body.workspaceKey),
    targetDir: optionalString(body.targetDir),
    ...(typeof body.includeFiles === 'boolean' ? { includeFiles: body.includeFiles } : {}),
  }
}

async function dispatch(app: AssetArchiverApp, action: string, body: Record<string, unknown>): Promise<unknown> {
  switch (action as RouteAction) {
    case 'config/get':
      return app.getConfigView()
    case 'config/save':
      return app.saveConfig(configInput(body))
    case 'config/test':
      return app.testConnection(configInput(body))
    case 'local/workspaces':
      return app.listLocal()
    case 'local/files':
      return app.listWorkspaceFiles(String(body.workspaceId ?? ''))
    case 'cloud/workspaces':
      return app.listCloud()
    case 'cloud/sessions':
      return app.getCloudWorkspace(String(body.workspaceKey ?? ''))
    case 'upload':
      return app.upload(uploadRequest(body))
    case 'download':
      return app.download(downloadRequest(body))
    default:
      throw new AppError('E_NOT_FOUND', `未知接口：${action || '(empty)'}`, 404)
  }
}

export function createRequestHandler(deps: RequestHandlerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const started = Date.now()
    const requestId = Math.random().toString(36).slice(2, 10)
    const logger = deps.logger.child({ requestId })
    let action = ''
    try {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: { code: 'E_METHOD', message: '仅支持 POST', retryable: false } })
        logger.warn('route.method_rejected', { method: req.method })
        return
      }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      action = url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+|\/+$/g, '')
      const body = await readJson(req)
      const data = await dispatch(deps.app, action, body)
      sendJson(res, 200, { ok: true, data })
      logger.info('route.ok', { action, durationMs: Date.now() - started })
    } catch (error) {
      const status = statusOf(error)
      sendJson(res, status, { ok: false, error: toApiError(error) })
      if (status >= 500) {
        logger.error('route.failed', { action, status, durationMs: Date.now() - started, error })
      } else {
        logger.warn('route.rejected', { action, status, durationMs: Date.now() - started, error })
      }
    }
  }
}
