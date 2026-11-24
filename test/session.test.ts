import assert from 'node:assert/strict'
import test from 'node:test'

import { createLogger } from '../src/host/logger.js'
import { normalizeHeader, restoreSession } from '../src/host/session-restore.js'
import type { SessionBundle, SessionHeader } from '../src/shared/schema.js'
import { createFakeHost } from './helpers/fake-dsh.js'

const logger = createLogger({ level: 'error', sink: () => {} })

function bundle(id: string, version = 4, parentSession?: string): SessionBundle {
  const header: SessionHeader = {
    version,
    id,
    createdAt: 100,
    cwd: 'C:\\remote',
    isSeeded: false,
    delegationDepth: 0,
    agentPreset: 'remote-preset',
    ...(parentSession === undefined ? {} : { parentSession, origin: 'subagent' }),
  }
  return {
    schemaVersion: 1,
    id,
    title: id,
    header,
    inheritedEventCount: 0,
    events: [{ type: 'user/message', seq: 0, time: 1, data: { role: 'user', content: [{ type: 'text', text: 'hi' }] } }],
  }
}

test('normalizeHeader rewrites cwd and drops remote-only references', () => {
  const header = normalizeHeader(bundle('session-x', 4, 'missing-parent').header, 'D:\\target', new Set())
  assert.equal(header.cwd, 'D:\\target')
  assert.equal(header.parentSession, undefined)
  assert.equal(header.origin, undefined)
  assert.equal(header.agentPreset, undefined)
})

test('normalizeHeader keeps a locally known parent', () => {
  const header = normalizeHeader(bundle('session-x', 4, 'parent-1').header, '/target', new Set(['parent-1']))
  assert.equal(header.parentSession, 'parent-1')
  assert.equal(header.origin, 'subagent')
})

test('restoreSession creates through agents and attaches to the workspace', async () => {
  const fake = createFakeHost()
  const workspace = fake.state.workspaces[0]!
  const known = new Set<string>()
  const result = await restoreSession(fake.ctx, workspace, bundle('session-new'), known, logger)
  assert.equal(result.status, 'created')
  assert.equal(known.has('session-new'), true)
  const restored = fake.state.restored.get('session-new')
  assert.ok(restored)
  assert.equal(restored.header.cwd, workspace.path)
  assert.deepEqual(fake.state.attached, [{ workspaceId: workspace.id, sessionId: 'session-new' }])
})

test('restoreSession skips an existing local id', async () => {
  const fake = createFakeHost()
  const workspace = fake.state.workspaces[0]!
  const result = await restoreSession(fake.ctx, workspace, bundle('session-a'), new Set(['session-a']), logger)
  assert.equal(result.status, 'skipped')
  assert.equal(fake.state.restored.has('session-a'), false)
})

test('restoreSession rejects a format mismatch', async () => {
  const fake = createFakeHost()
  const workspace = fake.state.workspaces[0]!
  await assert.rejects(
    restoreSession(fake.ctx, workspace, bundle('session-v3', 3), new Set(), logger),
    (error: unknown) => (error as { code?: string }).code === 'E_FORMAT_VERSION',
  )
})

test('restoreSession rejects an unsupported bundle version', async () => {
  const fake = createFakeHost()
  const workspace = fake.state.workspaces[0]!
  const unsupported = { ...bundle('session-x'), schemaVersion: 2 } as unknown as SessionBundle
  await assert.rejects(
    restoreSession(fake.ctx, workspace, unsupported, new Set(), logger),
    (error: unknown) => (error as { code?: string }).code === 'E_UNSUPPORTED_BUNDLE',
  )
})

test('restoreSession falls back to sessionPersistence when agents are unavailable', async () => {
  const fake = createFakeHost()
  fake.state.useAgents = false
  const workspace = fake.state.workspaces[0]!
  const known = new Set<string>()
  const result = await restoreSession(fake.ctx, workspace, bundle('session-fallback'), known, logger)
  assert.equal(result.status, 'created')
  const restored = fake.state.restored.get('session-fallback')
  assert.ok(restored)
  assert.equal(restored.events.length, 1)
  assert.deepEqual(fake.state.attached, [{ workspaceId: workspace.id, sessionId: 'session-fallback' }])
})
