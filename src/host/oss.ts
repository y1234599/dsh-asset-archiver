import OSS from 'ali-oss'

import type { ConfigValues } from '../shared/contract.js'
import { normalizePrefix } from './config.js'
import { AppError } from './errors.js'

export interface OssObject {
  key: string
  size: number
}

export interface OssListResult {
  keys: OssObject[]
  prefixes: string[]
}

export interface OssGateway {
  probe(prefix: string): Promise<{ latencyMs: number }>
  list(prefix: string, options?: { delimiter?: string }): Promise<OssListResult>
  getJson<T>(key: string): Promise<T | null>
  putJson(key: string, value: unknown): Promise<void>
  getBytes(key: string): Promise<Uint8Array | null>
  putBytes(key: string, body: Uint8Array, contentType?: string): Promise<void>
}

export type OssFactory = (config: ConfigValues) => OssGateway

function asOssError(error: unknown): { status?: number; code?: string; message: string } {
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown }
  return {
    status: typeof candidate?.status === 'number' ? candidate.status : undefined,
    code: typeof candidate?.code === 'string' ? candidate.code : undefined,
    message: typeof candidate?.message === 'string' ? candidate.message : String(error),
  }
}

export function mapOssError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const { status, code = '', message } = asOssError(error)
  if (code === 'AccessDenied' || code === 'InvalidAccessKeyId' || code === 'SignatureDoesNotMatch' || status === 403) {
    return new AppError('E_AUTH', `阿里云鉴权失败：${code || message}`, 502)
  }
  if (code === 'NoSuchBucket' || /NoSuchBucket/i.test(message)) {
    return new AppError('E_BUCKET', `存储桶不存在或地域不匹配：${code || message}`, 502)
  }
  if (code === 'NoSuchKey' || status === 404) {
    return new AppError('E_NOT_FOUND', `云端对象不存在：${code || message}`, 404)
  }
  if (status !== undefined && status >= 500) {
    return new AppError('E_NETWORK', `对象存储服务端错误：${message}`, 502, { retryable: true })
  }
  if (/timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(message)) {
    return new AppError('E_NETWORK', `网络请求失败：${message}`, 502, { retryable: true })
  }
  return new AppError('E_OSS', `对象存储请求失败：${message}`, 502)
}

export function createAliOssGateway(config: ConfigValues): OssGateway {
  const raw = config.endpoint.trim().replace(/\/+$/, '')
  const endpoint = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const client = new OSS({
    region: config.region.trim(),
    endpoint,
    accessKeyId: config.accessKeyId.trim(),
    accessKeySecret: config.accessKeySecret.trim(),
    bucket: config.bucketName.trim(),
    secure: !/^http:\/\//i.test(endpoint),
    timeout: 30_000,
  })

  return {
    async probe(prefix) {
      const started = Date.now()
      try {
        await client.list({ prefix: `${normalizePrefix(prefix)}/`, 'max-keys': 1 }, {})
        return { latencyMs: Date.now() - started }
      } catch (error) {
        throw mapOssError(error)
      }
    },

    async list(prefix, options = {}) {
      const keys: OssObject[] = []
      const prefixes: string[] = []
      let marker: string | undefined
      try {
        for (;;) {
          const result = await client.list({
            prefix,
            ...(options.delimiter === undefined ? {} : { delimiter: options.delimiter }),
            'max-keys': 1000,
            ...(marker === undefined ? {} : { marker }),
          }, {})
          for (const object of result.objects ?? []) {
            keys.push({ key: object.name, size: Number(object.size) || 0 })
          }
          for (const item of result.prefixes ?? []) prefixes.push(String(item))
          if (result.isTruncated !== true || result.nextMarker === undefined) break
          marker = result.nextMarker
        }
      } catch (error) {
        throw mapOssError(error)
      }
      return { keys, prefixes }
    },

    async putJson(key, value) {
      const body = Buffer.from(JSON.stringify(value), 'utf8')
      try {
        if (body.length > 5 * 1024 * 1024) {
          await client.multipartUpload(key, body, { mime: 'application/json' })
        } else {
          await client.put(key, body, { mime: 'application/json' })
        }
      } catch (error) {
        throw mapOssError(error)
      }
    },

    async getJson<T>(key: string): Promise<T | null> {
      let result: Awaited<ReturnType<typeof client.get>>
      try {
        result = await client.get(key)
      } catch (error) {
        const mapped = mapOssError(error)
        if (mapped.code === 'E_NOT_FOUND') return null
        throw mapped
      }
      try {
        return JSON.parse(result.content.toString('utf8')) as T
      } catch {
        throw new AppError('E_CORRUPT', `云端对象不是合法 JSON：${key}`, 422)
      }
    },

    async getBytes(key: string): Promise<Uint8Array | null> {
      try {
        const result = await client.get(key)
        return result.content
      } catch (error) {
        const mapped = mapOssError(error)
        if (mapped.code === 'E_NOT_FOUND') return null
        throw mapped
      }
    },

    async putBytes(key, body, contentType = 'application/octet-stream') {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body)
      try {
        if (buffer.length > 5 * 1024 * 1024) {
          await client.multipartUpload(key, buffer, { mime: contentType })
        } else {
          await client.put(key, buffer, { mime: contentType })
        }
      } catch (error) {
        throw mapOssError(error)
      }
    },
  }
}
