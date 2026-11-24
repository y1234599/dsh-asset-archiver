import { promises as fsp } from 'node:fs'
import path from 'node:path'

import type { LocalSessionSummary, LocalWorkspaceSummary } from '../shared/contract.js'
import type { SessionBundle, SessionHeader, SessionLogSnapshot } from '../shared/schema.js'
import type { Logger } from './logger.js'
import { AppError } from './errors.js'
import {
  requireService,
  type HostContext,
  type SessionPersistence,
  type SessionQuery,
  type Workspace,
  type WorkspaceRegistry,
} from './dsh.js'

function headerOf(entry: unknown): SessionHeader | undefined {
  if (!entry || typeof entry !== 'object') return undefined
  const candidate = entry as { header?: unknown }
  if (candidate.header && typeof candidate.header === 'object') return candidate.header as SessionHeader
  const maybeHeader = entry as SessionHeader
  return typeof maybeHeader.id === 'string' ? maybeHeader : undefined
}

export async function listLocalWorkspaces(ctx: HostContext, logger: Logger): Promise<LocalWorkspaceSummary[]> {
  const registry = requireService<WorkspaceRegistry>(ctx, 'workspaceRegistry')
  const persistence = ctx.get<SessionPersistence>('sessionPersistence')
  const query = ctx.get<SessionQuery>('sessionQuery')

  let persisted: unknown[] = []
  if (persistence) {
    try {
      persisted = await persistence.list()
    } catch (error) {
      logger.warn('catalog.persistence_list_failed', { error })
    }
  }
  const headerById = new Map<string, SessionHeader>()
  for (const entry of persisted) {
    const header = headerOf(entry)
    if (header && typeof header.id === 'string') headerById.set(header.id, header)
  }

  const workspaces = registry.list()
  const sessionIds = [...new Set(workspaces.flatMap((workspace) => [...workspace.sessionIds]))]
  const titles = new Map<string, string>()
  if (query && sessionIds.length > 0) {
    try {
      const results = await query.readTitleSnapshots(sessionIds)
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value?.title?.title) {
          titles.set(result.sessionId, result.value.title.title)
        }
      }
    } catch (error) {
      logger.warn('catalog.title_projection_failed', { error })
    }
  }

  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.title,
    path: workspace.path,
    sessions: [...workspace.sessionIds].map((sessionId): LocalSessionSummary => ({
      id: sessionId,
      title: titles.get(sessionId) ?? sessionId,
      createdAt: headerById.get(sessionId)?.createdAt ?? null,
    })),
  }))
}

export async function readSessionBundle(ctx: HostContext, sessionId: string, title: string): Promise<SessionBundle> {
  const query = requireService<SessionQuery>(ctx, 'sessionQuery')
  const snapshot: SessionLogSnapshot = await query.readSession(sessionId)
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.session || !Array.isArray(snapshot.events)) {
    throw new AppError('E_CORRUPT', `会话日志结构异常：${sessionId}`, 422)
  }
  return {
    schemaVersion: 1,
    id: String(snapshot.session.id),
    title,
    header: snapshot.session,
    inheritedEventCount: Number(snapshot.inheritedEventCount) || 0,
    events: snapshot.events,
  }
}

export async function listLocalSessionIds(ctx: HostContext): Promise<Set<string>> {
  const persistence = ctx.get<SessionPersistence>('sessionPersistence')
  if (!persistence) return new Set()
  try {
    const entries = await persistence.list()
    const ids = entries
      .map((entry) => headerOf(entry)?.id)
      .filter((id): id is string => typeof id === 'string')
    return new Set(ids)
  } catch {
    return new Set()
  }
}

export async function resolveWorkspaceForTarget(
  ctx: HostContext,
  targetDir: string,
  workspaceName: string,
): Promise<Workspace> {
  const raw = targetDir.trim()
  if (raw === '') throw new AppError('E_TARGET', '请先选择本地工作区目录', 400)
  const absolute = path.resolve(raw)
  let stat
  try {
    stat = await fsp.stat(absolute)
  } catch {
    throw new AppError('E_TARGET', `本地目录不存在：${absolute}`, 400)
  }
  if (!stat.isDirectory()) throw new AppError('E_TARGET', `目标不是目录：${absolute}`, 400)
  const canonical = await fsp.realpath(absolute)

  const registry = requireService<WorkspaceRegistry>(ctx, 'workspaceRegistry')
  let workspace: Workspace | undefined
  try {
    workspace = await registry.resolveByPath(canonical)
  } catch {
    workspace = undefined
  }
  if (workspace) return workspace
  try {
    return await registry.create(canonical, workspaceName)
  } catch (error) {
    throw new AppError('E_TARGET', `无法创建本地工作区：${error instanceof Error ? error.message : String(error)}`, 400)
  }
}
