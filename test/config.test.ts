import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { ConfigStore, maskAccessKeyId, parseConfig, validateConfig } from '../src/host/config.js'
import type { ConfigValues } from '../src/shared/contract.js'

const VALID: ConfigValues = {
  endpoint: 'oss-cn-hangzhou.aliyuncs.com',
  region: 'oss-cn-hangzhou',
  accessKeyId: 'LTAI5tExampleKey',
  accessKeySecret: 'example-secret',
  bucketName: 'my-bucket',
  prefix: 'dsh-asset-archiver',
}

async function tempHome(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-asset-archiver-config-'))
}

test('parseConfig reads the nested shape and defaults', () => {
  const config = parseConfig([
    '# comment',
    'aliyun:',
    '  oss:',
    '    endpoint: "oss-cn-hangzhou.aliyuncs.com"',
    '    region: oss-cn-hangzhou',
    "    access-key-id: 'LTAI5tExampleKey'",
    '    access-key-secret: example-secret',
    '    bucket-name: my-bucket',
  ].join('\n'))
  assert.equal(config.endpoint, 'oss-cn-hangzhou.aliyuncs.com')
  assert.equal(config.accessKeyId, 'LTAI5tExampleKey')
  assert.equal(config.accessKeySecret, 'example-secret')
  assert.equal(config.prefix, 'dsh-asset-archiver')
})

test('validateConfig accepts a complete config', () => {
  assert.deepEqual(validateConfig(VALID), [])
})

test('validateConfig rejects insecure endpoints, bad buckets and empty secrets', () => {
  const errors = validateConfig({
    ...VALID,
    endpoint: 'http://example.com',
    bucketName: 'Bad_Name',
    accessKeySecret: '',
  })
  assert.equal(errors.length, 3)
})

test('maskAccessKeyId keeps a short hint', () => {
  assert.equal(maskAccessKeyId('LTAI5tExampleKey'), 'LTAI****Key')
  assert.equal(maskAccessKeyId(''), '')
})

test('ConfigStore creates, saves and reloads config, keeping the old secret on blank input', async () => {
  const home = await tempHome()
  const store = new ConfigStore({ homeDir: home })
  const initial = await store.read()
  assert.equal(initial.endpoint, '')
  await fsp.access(store.filePath)

  const saved = await store.save(VALID)
  assert.equal(saved.bucketName, 'my-bucket')
  const updated = await store.save({ endpoint: 'https://oss-cn-beijing.aliyuncs.com', accessKeySecret: '' })
  assert.equal(updated.endpoint, 'https://oss-cn-beijing.aliyuncs.com')
  assert.equal(updated.accessKeySecret, 'example-secret')
  assert.equal(store.view(updated).configured, true)

  const reloaded = await store.read()
  assert.equal(reloaded.accessKeyId, VALID.accessKeyId)
})

test('ConfigStore rejects an incomplete save with E_CONFIG', async () => {
  const home = await tempHome()
  const store = new ConfigStore({ homeDir: home })
  await assert.rejects(
    store.save({ endpoint: 'http://insecure.example.com' }),
    (error: unknown) => (error as { code?: string }).code === 'E_CONFIG',
  )
})

test('ConfigStore.resolved rejects an unconfigured store with E_NOT_CONFIGURED', async () => {
  const home = await tempHome()
  const store = new ConfigStore({ homeDir: home })
  await assert.rejects(
    store.resolved(),
    (error: unknown) => (error as { code?: string }).code === 'E_NOT_CONFIGURED',
  )
})
