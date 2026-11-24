import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { AssetArchiverApp } from '../src/host/app.js'
import { ConfigStore } from '../src/host/config.js'
import { createLogger } from '../src/host/logger.js'
import { createRequestHandler } from '../src/host/routes.js'
import type { ConfigView, DownloadResult, LocalTree, UploadResult, WorkspaceFilesResult } from '../src/shared/contract.js'
import type { WorkspaceManifest } from '../src/shared/schema.js'
import { createFakeHost } from './helpers/fake-dsh.js'
import { createMemoryOss } from './helpers/memory-oss.js'

const VALID_CONFIG = {
  endpoint: 'oss-cn-hangzhou.aliyuncs.com',
  region: 'oss-cn-hangzhou',
  accessKeyId: 'LTAI5tExampleKey',
  accessKeySecret: 'example-secret',
  bucketName: 'my-bucket',
  prefix: 'dsh-asset-archiver',
}

async function temporaryDir(prefix: string): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefix))
}

interface InvokeResult {
  status: number
  payload: Record<string, unknown>
}

function createInvoker(handler: ReturnType<typeof createRequestHandler>) {
  return async (action: string, body: unknown = {}, method = 'POST'): Promise<InvokeResult> => {
    const payload = Buffer.from(JSON.stringify(body ?? {}))
    const request = Readable.from([payload]) as unknown as IncomingMessage
    request.method = method
    request.url = `/api-asset-archiver/${action}`
    request.headers = { 'content-length': String(payload.length) }
    let status = 0
    let text = ''
    const response = {
      writeHead(code: number) {
        status = code
      },
      end(chunk: unknown) {
        text = String(chunk ?? '')
      },
    } as unknown as ServerResponse
    await handler(request, response)
    return { status, payload: JSON.parse(text) as Record<string, unknown> }
  }
}

test('routes cover config, local files, upload, cloud and download', async () => {
  const home = await temporaryDir('dsh-asset-archiver-routes-home-')
  const source = await temporaryDir('dsh-asset-archiver-routes-source-')
  const target = await temporaryDir('dsh-asset-archiver-routes-target-')
  await fsp.mkdir(path.join(source, 'src'), { recursive: true })
  await fsp.writeFile(path.join(source, 'README.md'), '# demo')
  await fsp.writeFile(path.join(source, 'src', 'a.ts'), 'export const a = 1')
  const fake = createFakeHost({ workspacePath: source })
  const oss = createMemoryOss()
  const logger = createLogger({ level: 'error', sink: () => {} })
  const app = new AssetArchiverApp(fake.ctx, {
    configStore: new ConfigStore({ homeDir: home }),
    ossFactory: () => oss,
    logger,
  })
  const invoke = createInvoker(createRequestHandler({ app, logger }))

  let result = await invoke('config/get')
  assert.equal(result.status, 200)
  const initial = result.payload.data as ConfigView
  assert.equal(initial.configured, false)
  await fsp.access(initial.configPath)

  result = await invoke('config/save', VALID_CONFIG)
  assert.equal(result.status, 200)
  assert.equal((result.payload.data as ConfigView).configured, true)

  result = await invoke('local/workspaces')
  assert.equal(result.status, 200)
  const local = result.payload.data as LocalTree
  assert.equal(local.workspaces.length, 1)
  assert.equal(local.workspaces[0]?.sessions[0]?.title, '标题 a')

  result = await invoke('local/files', { workspaceId: 'ws-1' })
  assert.equal(result.status, 200)
  const fileList = result.payload.data as WorkspaceFilesResult
  assert.deepEqual(fileList.files.map((file) => file.path), ['README.md', 'src/a.ts'])

  result = await invoke('upload', {
    workspaceIds: ['ws-1'],
    files: [{ workspaceId: 'ws-1', path: 'src/a.ts' }],
  })
  assert.equal(result.status, 200)
  const uploaded = result.payload.data as UploadResult
  assert.equal(uploaded.summary.uploaded, 2)
  assert.equal(uploaded.summary.failed, 0)
  assert.equal(uploaded.summary.filesUploaded, 1)
  assert.equal(uploaded.summary.filesFailed, 0)
  assert.equal([...oss.objects.keys()].filter((key) => key.includes('/sessions/')).length, 2)
  const manifestObjectKey = [...oss.objects.keys()].find((key) => key.endsWith('/manifest.json'))
  assert.ok(manifestObjectKey)
  const firstManifest = await oss.getJson<WorkspaceManifest>(manifestObjectKey)
  assert.deepEqual(firstManifest?.files?.map((file) => file.path), ['src/a.ts'])
  assert.ok([...oss.objects.keys()].some((key) => key.endsWith('/files/src/a.ts')))

  // Uploading sessions again must keep the existing workspace file index.
  result = await invoke('upload', { workspaceIds: ['ws-1'] })
  assert.equal(result.status, 200)
  const secondManifest = await oss.getJson<WorkspaceManifest>(manifestObjectKey)
  assert.deepEqual(secondManifest?.files?.map((file) => file.path), ['src/a.ts'])

  result = await invoke('cloud/workspaces')
  assert.equal(result.status, 200)
  const cloud = result.payload.data as { workspaces: Array<{ key: string; name: string; sessions: unknown[]; fileCount: number }> }
  assert.equal(cloud.workspaces.length, 1)
  const workspace = cloud.workspaces[0]!
  assert.equal(workspace.name, '演示工作区')
  assert.equal(workspace.sessions.length, 2)
  assert.equal(workspace.fileCount, 1)

  // Simulate a different device: no local sessions, no local workspaces.
  fake.state.sessions.clear()
  fake.state.titles.clear()
  fake.state.workspaces.length = 0
  fake.state.restored.clear()
  fake.state.attached.length = 0

  result = await invoke('download', { workspaceKey: workspace.key, targetDir: target })
  assert.equal(result.status, 200)
  const downloaded = result.payload.data as DownloadResult
  assert.equal(downloaded.created, 2)
  assert.equal(downloaded.failed, 0)
  assert.equal(downloaded.files.created, 0, 'files must stay off by default')
  const canonicalTarget = await fsp.realpath(target)
  for (const id of ['session-a', 'session-b']) {
    const restored = fake.state.restored.get(id)
    assert.ok(restored, `${id} should be restored`)
    assert.equal(restored.header.cwd, canonicalTarget)
  }
  assert.deepEqual(fake.state.attached.map((item) => item.sessionId).sort(), ['session-a', 'session-b'])
  await assert.rejects(fsp.access(path.join(target, 'src', 'a.ts')), 'file should not be pulled while the switch is off')

  result = await invoke('download', { workspaceKey: workspace.key, targetDir: target, includeFiles: true })
  assert.equal(result.status, 200)
  const withFiles = result.payload.data as DownloadResult
  assert.equal(withFiles.skipped, 2)
  assert.equal(withFiles.files.created, 1)
  const downloadedFile = await fsp.readFile(path.join(target, 'src', 'a.ts'), 'utf8')
  assert.equal(downloadedFile, 'export const a = 1')

  result = await invoke('download', { workspaceKey: workspace.key, targetDir: target, includeFiles: true })
  assert.equal(result.status, 200)
  const secondDownload = result.payload.data as DownloadResult
  assert.equal(secondDownload.skipped, 2)
  assert.equal(secondDownload.files.skipped, 1)

  result = await invoke('config/get', {}, 'GET')
  assert.equal(result.status, 405)

  result = await invoke('unknown')
  assert.equal(result.status, 404)
  assert.equal((result.payload.error as { code: string }).code, 'E_NOT_FOUND')
})

test('invalid config saves return E_CONFIG', async () => {
  const home = await temporaryDir('dsh-asset-archiver-routes-home-')
  const fake = createFakeHost()
  const logger = createLogger({ level: 'error', sink: () => {} })
  const app = new AssetArchiverApp(fake.ctx, {
    configStore: new ConfigStore({ homeDir: home }),
    ossFactory: () => createMemoryOss(),
    logger,
  })
  const invoke = createInvoker(createRequestHandler({ app, logger }))
  const result = await invoke('config/save', { endpoint: 'http://insecure.example.com' })
  assert.equal(result.status, 400)
  assert.equal((result.payload.error as { code: string }).code, 'E_CONFIG')
})
