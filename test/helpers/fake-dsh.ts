import type { SessionEvent, SessionHeader } from '../../src/shared/schema.js'
import type {
  Agents,
  HostContext,
  SessionPersistence,
  SessionPersistenceEntry,
  SessionQuery,
  SessionWriteHandle,
  Workspace,
  WorkspaceRegistry,
} from '../../src/host/dsh.js'

export interface FakeSession {
  header: SessionHeader
  events: SessionEvent[]
}

export interface FakeState {
  workspaces: Workspace[]
  sessions: Map<string, FakeSession>
  restored: Map<string, FakeSession>
  titles: Map<string, string>
  attached: Array<{ workspaceId: string; sessionId: string }>
  /** Set false to exercise the sessionPersistence fallback. */
  useAgents: boolean
}

export interface FakeHost {
  ctx: HostContext
  state: FakeState
  registry: WorkspaceRegistry
  persistence: SessionPersistence
  query: SessionQuery
  agents: Agents
}

export interface FakeHostOptions {
  workspacePath?: string
}

function event(text: string): SessionEvent {
  return {
    type: 'user/message',
    seq: 0,
    time: 1,
    data: { role: 'user', content: [{ type: 'text', text }] },
  }
}

function session(id: string, text: string, createdAt: number): FakeSession {
  return {
    header: {
      version: 4,
      id,
      createdAt,
      cwd: 'C:\\demo',
      isSeeded: false,
      delegationDepth: 0,
    },
    events: [event(text)],
  }
}

export function createFakeHost(options: FakeHostOptions = {}): FakeHost {
  const workspace: Workspace = {
    id: 'ws-1',
    title: '演示工作区',
    path: options.workspacePath ?? 'C:\\demo',
    sessionIds: ['session-a', 'session-b'],
    async attachSession(sessionId) {
      state.attached.push({ workspaceId: workspace.id, sessionId })
    },
  }

  const state: FakeState = {
    workspaces: [workspace],
    sessions: new Map([
      ['session-a', session('session-a', 'hello a', 100)],
      ['session-b', session('session-b', 'hello b', 200)],
    ]),
    restored: new Map(),
    titles: new Map([
      ['session-a', '标题 a'],
      ['session-b', '标题 b'],
    ]),
    attached: [],
    useAgents: true,
  }

  const registry: WorkspaceRegistry = {
    list: () => [...state.workspaces],
    async create(canonicalPath, title) {
      const created: Workspace = {
        id: `ws-${state.workspaces.length + 1}`,
        title: title ?? canonicalPath,
        path: canonicalPath,
        sessionIds: [],
        async attachSession(sessionId) {
          state.attached.push({ workspaceId: created.id, sessionId })
        },
      }
      state.workspaces.push(created)
      return created
    },
    async resolveByPath(canonicalPath) {
      return state.workspaces.find((item) => item.path === canonicalPath)
    },
  }

  const persistence: SessionPersistence = {
    formatVersion: 4,
    async list() {
      const entries: SessionPersistenceEntry[] = [
        ...[...state.sessions.values()].map((item) => ({ header: item.header })),
        ...[...state.restored.values()].map((item) => ({ header: item.header })),
      ]
      return entries
    },
    async create(header): Promise<SessionWriteHandle> {
      const created: FakeSession = { header, events: [] }
      state.restored.set(header.id, created)
      return {
        async append(events) {
          created.events.push(...events)
        },
        async flush() {},
        async close() {},
      }
    },
  }

  const query: SessionQuery = {
    async readSession(sessionId) {
      const found = state.sessions.get(sessionId)
      if (!found) throw new Error(`missing session ${sessionId}`)
      return { session: found.header, inheritedEventCount: 0, events: found.events }
    },
    async readTitleSnapshots(ids) {
      return ids.map((sessionId) => ({
        sessionId,
        status: 'fulfilled' as const,
        value: { title: { title: state.titles.get(sessionId) ?? sessionId } },
      }))
    },
  }

  const agents: Agents = {
    async create({ sessionId, meta, seed }) {
      if (!state.useAgents) throw new Error('agents disabled')
      state.restored.set(sessionId, {
        header: {
          version: meta.version ?? 4,
          id: sessionId,
          createdAt: meta.createdAt ?? 1,
          cwd: meta.cwd,
          isSeeded: false,
          delegationDepth: meta.delegationDepth ?? 0,
        },
        events: [...seed],
      })
    },
  }

  const ctx: HostContext = {
    get<T>(service: string): T | undefined {
      const services: Record<string, unknown> = { workspaceRegistry: registry, sessionPersistence: persistence, sessionQuery: query }
      if (state.useAgents) services.agents = agents
      return services[service] as T | undefined
    },
    inject(_names, callback) {
      callback(ctx)
    },
    effect(callback) {
      callback()
    },
  }

  return { ctx, state, registry, persistence, query, agents }
}
