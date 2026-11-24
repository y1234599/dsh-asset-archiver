import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cloudRoot,
  disambiguateWorkspaceKey,
  encodeSessionId,
  encodeWorkspaceKey,
  manifestKey,
  sessionKey,
  workspacePrefixBase,
} from '../src/host/keys.js'

test('workspace keys keep readable names and avoid separators', () => {
  const key = encodeWorkspaceKey('我的 工作区')
  assert.equal(key, '我的_工作区')
  assert.ok(!key.includes('/'))
})

test('unsafe characters are replaced and dot-only keys are prefixed', () => {
  assert.equal(encodeWorkspaceKey('a/b:c'), 'a_2f_b_3a_c')
  assert.equal(encodeWorkspaceKey('..'), '_..')
})

test('workspace keys stay bounded and duplicate names disambiguate', () => {
  const key = encodeWorkspaceKey('工作区'.repeat(80))
  assert.ok(key.length <= 120)
  assert.notEqual(disambiguateWorkspaceKey(key, 'C:\\a'), disambiguateWorkspaceKey(key, 'C:\\b'))
})

test('session ids are encoded only when unsafe', () => {
  assert.equal(encodeSessionId('session-1e2f'), 'session-1e2f')
  assert.notEqual(encodeSessionId('a/b'), 'a/b')
})

test('cloud keys are rooted at the configured prefix', () => {
  assert.equal(cloudRoot('/custom/'), 'custom')
  assert.equal(cloudRoot(''), 'dsh-asset-archiver')
  assert.equal(workspacePrefixBase('custom'), 'custom/v1/workspaces/')
  assert.equal(manifestKey('custom', 'ws'), 'custom/v1/workspaces/ws/manifest.json')
  assert.equal(sessionKey('custom', 'ws', 'session-a'), 'custom/v1/workspaces/ws/sessions/session-a.json')
})
