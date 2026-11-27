/**
 * Structural types for the DSH Host services this plugin consumes.
 * They intentionally describe only the members used here, so a compatible
 * host can evolve without forcing this plugin to import host packages.
 */

import type { SessionEvent, SessionHeader, SessionLogSnapshot } from '../shared/schema.js'
import { AppError } from './errors.js'

export interface HostContext {
  get<T = unknown>(name: string): T | undefined
  inject(names: readonly string[], callback: (ctx: HostContext) => void): void
  effect(callback: () => void | (() => void)): void
}

export interface Workspace {
  readonly id: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly string[]
  attachSession(sessionId: string): Promise<void>
  detachSession?(sessionId: string): Promise<void>
  setTitle?(title: string): Promise<void>
}

export interface WorkspaceRegistry {
  list(): Workspace[]
  create(path: string, title?: string): Promise<Workspace>
  resolveByPath(path: string): Promise<Workspace | undefined>
}

export interface SessionPersistenceEntry {
  header?: SessionHeader
}

export interface SessionWriteHandle {
  append(events: readonly SessionEvent[]): Promise<void>
  flush?(): Promise<void>
  close?(): Promise<void>
}

export interface SessionPersistence {
  list(): Promise<Array<SessionPersistenceEntry | SessionHeader>>
  create(header: SessionHeader): Promise<SessionWriteHandle>
  stat?(sessionId: string): Promise<unknown>
  readonly formatVersion?: number
  readonly currentVersion?: number
}

export interface SessionTitleObservation {
  sessionId: string
  status: 'fulfilled' | 'rejected'
  value?: { title?: { title?: string } }
}

export interface SessionQuery {
  readSession(sessionId: string): Promise<SessionLogSnapshot>
  readTitleSnapshots(sessionIds: readonly string[]): Promise<SessionTitleObservation[]>
}

/** The preset roster used to decide whether a migrated preset still resolves. */
export interface AgentPresets {
  resolve(id?: string): Promise<{ id: string }>
}

export function requireService<T>(ctx: HostContext, name: string): T {
  const service = ctx.get<T>(name)
  if (service === undefined || service === null) {
    throw new AppError('E_HOST', `当前 DSH 缺少 ${name} 服务，无法继续`, 500)
  }
  return service
}
