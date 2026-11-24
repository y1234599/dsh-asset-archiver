import type { SessionBundle, SessionEvent, SessionHeader } from '../shared/schema.js'
import type { Logger } from './logger.js'
import { AppError } from './errors.js'
import {
  requireService,
  type Agents,
  type HostContext,
  type SessionPersistence,
  type SessionWriteHandle,
  type Workspace,
} from './dsh.js'

export interface RestoreResult {
  status: 'created' | 'skipped'
  id: string
  warning?: string
}

export function hostFormatVersion(ctx: HostContext): number | undefined {
  const persistence = ctx.get<SessionPersistence>('sessionPersistence')
  for (const candidate of [persistence?.formatVersion, persistence?.currentVersion]) {
    if (typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0) return candidate
  }
  return undefined
}

export function normalizeHeader(header: SessionHeader, workspacePath: string, knownLocalIds: Set<string>): SessionHeader {
  const source = header
  const normalized: SessionHeader = {
    version: Number.isSafeInteger(Number(source.version)) ? Number(source.version) : 4,
    id: String(source.id ?? ''),
    createdAt: Number.isSafeInteger(Number(source.createdAt)) ? Number(source.createdAt) : Date.now(),
    cwd: workspacePath,
    isSeeded: false,
    delegationDepth: Number.isSafeInteger(Number(source.delegationDepth)) ? Number(source.delegationDepth) : 0,
  }
  if (normalized.id === '') throw new AppError('E_CORRUPT', '会话包缺少 id', 422)
  if (source.parentSession && knownLocalIds.has(String(source.parentSession))) {
    normalized.parentSession = String(source.parentSession)
    if (source.origin === 'subagent') normalized.origin = 'subagent'
  }
  return normalized
}

function isSessionTakenError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : ''
  if (name === 'SessionAlreadyExistsError' || name === 'SessionAlreadyOwnedError') return true
  const message = error instanceof Error ? error.message : String(error)
  return /already exists|duplicate session|already owned by an active write handle/i.test(message)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function writeSessionDirect(
  ctx: HostContext,
  header: SessionHeader,
  events: readonly SessionEvent[],
  logger: Logger,
): Promise<void> {
  const persistence = requireService<SessionPersistence>(ctx, 'sessionPersistence')
  if (typeof persistence.create !== 'function') {
    throw new AppError('E_HOST', 'sessionPersistence.create 不可用', 500)
  }
  let handle: SessionWriteHandle | undefined
  try {
    handle = await persistence.create(header)
    await handle.append(events)
    if (typeof handle.flush === 'function') await handle.flush()
  } finally {
    if (handle && typeof handle.close === 'function') {
      try {
        await handle.close()
      } catch (error) {
        logger.warn('session.close_failed', { sessionId: header.id, error })
      }
    }
  }
}

export async function restoreSession(
  ctx: HostContext,
  workspace: Workspace,
  bundle: SessionBundle,
  knownLocalIds: Set<string>,
  logger: Logger,
): Promise<RestoreResult> {
  if (Number(bundle.schemaVersion) !== 1) {
    throw new AppError('E_UNSUPPORTED_BUNDLE', `会话包版本不受支持：${String(bundle.schemaVersion)}`, 422)
  }
  if (!Array.isArray(bundle.events)) throw new AppError('E_CORRUPT', '会话包缺少事件列表', 422)

  const header = normalizeHeader(bundle.header, workspace.path, knownLocalIds)
  if (knownLocalIds.has(header.id)) return { status: 'skipped', id: header.id }

  const currentVersion = hostFormatVersion(ctx)
  if (currentVersion !== undefined && currentVersion !== header.version) {
    throw new AppError(
      'E_FORMAT_VERSION',
      `云端会话格式为 V${header.version}，当前 DSH 支持 V${currentVersion}，无法直接导入`,
      422,
    )
  }

  const agents = ctx.get<Agents>('agents')
  let created = false
  let warning: string | undefined
  if (agents && typeof agents.create === 'function') {
    try {
      await agents.create({ sessionId: header.id, meta: header, seed: bundle.events })
      created = true
    } catch (error) {
      if (isSessionTakenError(error)) return { status: 'skipped', id: header.id }
      warning = `agents.create 失败，已回退到持久化直写：${messageOf(error)}`
      logger.warn('session.agents_create_failed', { sessionId: header.id, error })
    }
  }

  if (!created) {
    try {
      await writeSessionDirect(ctx, header, bundle.events, logger)
    } catch (error) {
      if (isSessionTakenError(error)) return { status: 'skipped', id: header.id }
      throw error
    }
  }

  knownLocalIds.add(header.id)
  if (typeof workspace.attachSession === 'function') {
    try {
      await workspace.attachSession(header.id)
    } catch (error) {
      warning = `会话已导入，但未能挂接到工作区：${messageOf(error)}`
      logger.warn('session.attach_failed', { sessionId: header.id, workspaceId: workspace.id, error })
    }
  }
  logger.info('session.restored', { sessionId: header.id, eventCount: bundle.events.length, fallback: !created })
  return { status: 'created', id: header.id, ...(warning === undefined ? {} : { warning }) }
}
