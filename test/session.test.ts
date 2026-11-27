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

test('normalizeHeader rewrites cwd, keeps the preset, and drops remote-only references', () => {
  const header = normalizeHeader(bundle('session-x', 4, 'missing-parent').header, 'D:\\target', new Set())
  assert.equal(header.cwd, 'D:\\target')
  assert.equal(header.parentSession, undefined)
  assert.equal(header.origin, undefined)
  assert.equal(header.agentPreset, 'remote-preset')
})

test('normalizeHeader keeps a locally known parent', () => {
  const header = normalizeHeader(bundle('session-x', 4, 'parent-1').header, '/target', new Set(['parent-1']))
  assert.equal(header.parentSession, 'parent-1')
  assert.equal(header.origin, 'subagent')
})

test('normalizeHeader leaves a missing preset missing', () => {
  const source = { ...bundle('session-x').header }
  delete source.agentPreset
  const header = normalizeHeader(source, '/target', new Set())
  assert.equal(header.agentPreset, undefined)
})

test('restoreSession writes through sessionPersistence and attaches to the workspace', async () => {
  const fake = createFakeHost()
  const workspace = fake.state.workspaces[0]!
  const known = new Set<string>()
  const result = await restoreSession(fake.ctx, workspace, bundle('session-new'), known, logger)
  assert.equal(result.status, 'created')
  assert.equal(known.has('session-new'), true)
  const restored = fake.state.restored.get('session-new')
  assert.ok(restored)
  assert.equal(restored.header.cwd, workspace.path)
  assert.equal(restored.header.agentPreset, 'remote-preset')
  assert.equal(restored.events.length, 1)
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

test('restoreSession preserves a preset that resolves on the target', async () => {
  const fake = createFakeHost({
    agentPresets: {
      async resolve(id) {
        if (id === 'remote-preset' || id === undefined) return { id: 'remote-preset' }
        throw new Error(`unknown preset ${id}`)
      },
    },
  })
  const workspace = fake.state.workspaces[0]!
  const result = await restoreSession(fake.ctx, workspace, bundle('session-preset'), new Set(), logger)
  assert.equal(result.status, 'created')
  assert.equal(result.warning, undefined)
  assert.equal(fake.state.restored.get('session-preset')?.header.agentPreset, 'remote-preset')
})

test('restoreSession falls back to the default preset when the recorded one is absent', async () => {
  const fake = createFakeHost({
    agentPresets: {
      async resolve(id) {
        if (id === 'standard' || id === undefined) return { id: 'standard' }
        throw new Error(`unknown preset ${id}`)
      },
    },
  })
  const workspace = fake.state.workspaces[0]!
  const result = await restoreSession(fake.ctx, workspace, bundle('session-fallback-preset'), new Set(), logger)
  assert.equal(result.status, 'created')
  assert.match(result.warning ?? '', /已改用默认预设 standard/)
  assert.equal(fake.state.restored.get('session-fallback-preset')?.header.agentPreset, 'standard')
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
