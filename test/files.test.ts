import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  contentTypeFor,
  listWorkspaceFiles,
  normalizeRelativePath,
  readWorkspaceFile,
  sha256Hex,
  workspaceFileExists,
  writeWorkspaceFile,
} from '../src/host/files.js'

async function workspaceFixture(): Promise<string> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-asset-archiver-files-'))
  await fsp.mkdir(path.join(root, 'src'), { recursive: true })
  await fsp.mkdir(path.join(root, 'node_modules'), { recursive: true })
  await fsp.mkdir(path.join(root, '.git'), { recursive: true })
  await fsp.writeFile(path.join(root, 'README.md'), '# hello')
  await fsp.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1')
  await fsp.writeFile(path.join(root, 'node_modules', 'pkg.js'), 'ignored')
  await fsp.writeFile(path.join(root, '.git', 'config'), 'ignored')
  return root
}

test('listWorkspaceFiles lists regular files and skips ignored directories', async () => {
  const root = await workspaceFixture()
  const result = await listWorkspaceFiles(root)
  assert.deepEqual(result.files.map((file) => file.path), ['README.md', 'src/a.ts'])
  assert.equal(result.truncated, false)
  assert.ok(result.ignored >= 2)
  assert.deepEqual(result.files.find((file) => file.path === 'README.md')?.bytes, 7)
})

test('listWorkspaceFiles marks oversized files and truncates at the cap', async () => {
  const root = await workspaceFixture()
  const oversized = await listWorkspaceFiles(root, { maxFileBytes: 5 })
  assert.equal(oversized.files.find((file) => file.path === 'README.md')?.tooLarge, true)

  const truncated = await listWorkspaceFiles(root, { maxFiles: 1 })
  assert.equal(truncated.files.length, 1)
  assert.equal(truncated.truncated, true)
})

test('normalizeRelativePath rejects absolute and traversal paths', () => {
  assert.equal(normalizeRelativePath('src/a.ts'), 'src/a.ts')
  assert.equal(normalizeRelativePath('src\\a.ts'), 'src/a.ts')
  for (const bad of ['', '../x', 'a/../../b', '/etc/passwd', 'C:\\Windows\\x', 'a\0b']) {
    assert.throws(() => normalizeRelativePath(bad), /E_CORRUPT|文件路径/, bad)
  }
})

test('readWorkspaceFile returns bytes, hash and content type', async () => {
  const root = await workspaceFixture()
  const file = await readWorkspaceFile(root, 'src/a.ts')
  assert.equal(file.bytes.toString('utf8'), 'export const a = 1')
  assert.equal(file.sha256, sha256Hex(file.bytes))
  assert.equal(file.contentType, 'text/plain; charset=utf-8')
  assert.equal(contentTypeFor('image.PNG'), 'image/png')
  await assert.rejects(readWorkspaceFile(root, '../outside.txt'), (error: unknown) => (error as { code?: string }).code === 'E_CORRUPT')
})

test('writeWorkspaceFile creates a file once and never overwrites', async () => {
  const root = await workspaceFixture()
  assert.equal(await workspaceFileExists(root, 'dist/out.txt'), false)
  assert.equal(await writeWorkspaceFile(root, 'dist/out.txt', Buffer.from('one')), 'created')
  assert.equal(await workspaceFileExists(root, 'dist/out.txt'), true)
  assert.equal(await writeWorkspaceFile(root, 'dist/out.txt', Buffer.from('two')), 'exists')
  assert.equal((await fsp.readFile(path.join(root, 'dist', 'out.txt'), 'utf8')), 'one')
  await assert.rejects(
    writeWorkspaceFile(root, '../escape.txt', Buffer.from('x')),
    (error: unknown) => (error as { code?: string }).code === 'E_CORRUPT',
  )
})
