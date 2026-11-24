import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { ConfigInput, ConfigValues, ConfigView } from '../shared/contract.js'
import { AppError } from './errors.js'

export const DEFAULT_PREFIX = 'dsh-asset-archiver'

const TEMPLATE = `# dsh-asset-archiver configuration
# Private plugin: this file contains a plaintext AccessKey. Do not commit it or
# keep it in a shared directory.
aliyun:
  oss:
    endpoint: ""
    region: ""
    access-key-id: ""
    access-key-secret: ""
    bucket-name: ""
    prefix: "dsh-asset-archiver"
`

const EMPTY_CONFIG: ConfigValues = {
  endpoint: '',
  region: '',
  accessKeyId: '',
  accessKeySecret: '',
  bucketName: '',
  prefix: DEFAULT_PREFIX,
}

function stripComment(line: string): string {
  let quote: '"' | "'" | null = null
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (quote) {
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '#' && (index === 0 || /\s/.test(line[index - 1] ?? ''))) {
      return line.slice(0, index)
    }
  }
  return line
}

function unquote(raw: string): string {
  const value = raw.trim()
  if (value === '') return ''
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return String(JSON.parse(value))
    } catch {
      return value.slice(1, -1)
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

/** Minimal indentation-tolerant YAML reader for the fixed config shape. */
export function parseConfig(text: string): ConfigValues {
  const flat = new Map<string, string>()
  const stack: Array<{ key: string; indent: number }> = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine)
    if (line.trim() === '') continue
    const indent = (line.match(/^[ \t]*/)?.[0] ?? '').replace(/\t/g, '  ').length
    const match = line.trim().match(/^([^:]+):\s*(.*)$/)
    if (!match) continue
    const key = (match[1] ?? '').trim()
    const value = unquote(match[2] ?? '')
    while (stack.length > 0 && indent <= (stack[stack.length - 1]?.indent ?? -1)) stack.pop()
    const fullPath = [...stack.map((entry) => entry.key), key].join('.')
    if (value !== '') flat.set(fullPath, value)
    stack.push({ key, indent })
  }
  return {
    endpoint: flat.get('aliyun.oss.endpoint') ?? EMPTY_CONFIG.endpoint,
    region: flat.get('aliyun.oss.region') ?? EMPTY_CONFIG.region,
    accessKeyId: flat.get('aliyun.oss.access-key-id') ?? EMPTY_CONFIG.accessKeyId,
    accessKeySecret: flat.get('aliyun.oss.access-key-secret') ?? EMPTY_CONFIG.accessKeySecret,
    bucketName: flat.get('aliyun.oss.bucket-name') ?? EMPTY_CONFIG.bucketName,
    prefix: flat.get('aliyun.oss.prefix') || DEFAULT_PREFIX,
  }
}

export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

export function normalizePrefix(prefix: string | undefined): string {
  const value = (prefix ?? '').trim() || DEFAULT_PREFIX
  return value.replace(/^\/+|\/+$/g, '')
}

export function validateConfig(config: ConfigValues): string[] {
  const errors: string[] = []
  const endpoint = config.endpoint.trim()
  if (endpoint === '') errors.push('endpoint 不能为空')
  if (/^http:\/\//i.test(endpoint) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(endpoint)) {
    errors.push('endpoint 必须使用 HTTPS（仅允许 127.0.0.1/localhost 的 HTTP 本地调试地址）')
  }
  if (config.region.trim() === '') errors.push('region 不能为空')
  if (config.accessKeyId.trim() === '') errors.push('access-key-id 不能为空')
  if (config.accessKeySecret.trim() === '') errors.push('access-key-secret 不能为空')
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucketName.trim())) {
    errors.push('bucket-name 必须是 3-63 位小写字母、数字或短横线，且以字母/数字开头结尾')
  }
  const prefix = normalizePrefix(config.prefix)
  if (!/^[A-Za-z0-9._/-]+$/.test(prefix)) errors.push('prefix 只能包含字母、数字、. _ - /')
  if (prefix.includes('..') || prefix.includes('//')) errors.push('prefix 不能包含 .. 或连续 //')
  return errors
}

export function maskAccessKeyId(value: string): string {
  if (value === '') return ''
  if (value.length <= 8) return '********'
  return `${value.slice(0, 4)}****${value.slice(-3)}`
}

function serializeConfig(config: ConfigValues): string {
  const quote = (value: string): string => JSON.stringify(value)
  return [
    '# dsh-asset-archiver configuration',
    '# Private plugin: this file contains a plaintext AccessKey.',
    'aliyun:',
    '  oss:',
    `    endpoint: ${quote(config.endpoint.trim().replace(/\/+$/, ''))}`,
    `    region: ${quote(config.region.trim())}`,
    `    access-key-id: ${quote(config.accessKeyId.trim())}`,
    `    access-key-secret: ${quote(config.accessKeySecret.trim())}`,
    `    bucket-name: ${quote(config.bucketName.trim())}`,
    `    prefix: ${quote(normalizePrefix(config.prefix))}`,
    '',
  ].join('\n')
}

export interface ConfigStoreOptions {
  /** Defaults to DSH_HOME, then ~/.dsh. */
  homeDir?: string
}

export class ConfigStore {
  readonly homeDir: string

  constructor(options: ConfigStoreOptions = {}) {
    this.homeDir = options.homeDir ?? process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  }

  get dir(): string {
    return path.join(this.homeDir, 'dsh-asset-archiver')
  }

  get filePath(): string {
    return path.join(this.dir, 'config.yml')
  }

  async ensure(): Promise<void> {
    await fsp.mkdir(this.dir, { recursive: true })
    try {
      await fsp.access(this.filePath)
    } catch {
      await fsp.writeFile(this.filePath, TEMPLATE, { mode: 0o600 })
    }
  }

  async read(): Promise<ConfigValues> {
    await this.ensure()
    return parseConfig(await fsp.readFile(this.filePath, 'utf8'))
  }

  async save(input: ConfigInput): Promise<ConfigValues> {
    const current = await this.read()
    const next: ConfigValues = {
      endpoint: String(input.endpoint ?? current.endpoint).trim().replace(/\/+$/, ''),
      region: String(input.region ?? current.region).trim(),
      accessKeyId: String(input.accessKeyId ?? current.accessKeyId).trim(),
      accessKeySecret: String(input.accessKeySecret ?? '').trim() || current.accessKeySecret,
      bucketName: String(input.bucketName ?? current.bucketName).trim(),
      prefix: normalizePrefix(input.prefix ?? current.prefix),
    }
    const errors = validateConfig(next)
    if (errors.length > 0) {
      throw new AppError('E_CONFIG', '配置不完整或格式不正确', 400, { details: errors })
    }
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`
    await fsp.writeFile(temporary, serializeConfig(next), { mode: 0o600 })
    await fsp.rename(temporary, this.filePath)
    return next
  }

  async resolved(): Promise<ConfigValues> {
    const config = await this.read()
    const errors = validateConfig(config)
    if (errors.length > 0) {
      throw new AppError('E_NOT_CONFIGURED', `尚未完成对象存储配置：${errors.join('；')}`, 409, { details: errors })
    }
    return config
  }

  view(config: ConfigValues): ConfigView {
    const errors = validateConfig(config)
    return {
      configured: errors.length === 0,
      configPath: this.filePath,
      values: {
        endpoint: config.endpoint,
        region: config.region,
        accessKeyIdMasked: maskAccessKeyId(config.accessKeyId),
        accessKeySecretSet: config.accessKeySecret !== '',
        bucketName: config.bucketName,
        prefix: normalizePrefix(config.prefix),
      },
      errors,
    }
  }
}
