import type { OssGateway, OssListResult } from '../../src/host/oss.js'

export interface MemoryOss extends OssGateway {
  objects: Map<string, Buffer>
}

export function createMemoryOss(): MemoryOss {
  const objects = new Map<string, Buffer>()

  return {
    objects,
    async probe() {
      return { latencyMs: 1 }
    },
    async list(prefix: string, options: { delimiter?: string } = {}): Promise<OssListResult> {
      const keys: Array<{ key: string; size: number }> = []
      const prefixes = new Set<string>()
      for (const key of [...objects.keys()].sort()) {
        if (!key.startsWith(prefix)) continue
        if (options.delimiter) {
          const rest = key.slice(prefix.length)
          const index = rest.indexOf(options.delimiter)
          if (index >= 0) {
            prefixes.add(prefix + rest.slice(0, index + 1))
            continue
          }
        }
        keys.push({ key, size: objects.get(key)?.length ?? 0 })
      }
      return { keys, prefixes: [...prefixes] }
    },
    async getJson<T>(key: string): Promise<T | null> {
      const value = objects.get(key)
      return value === undefined ? null : JSON.parse(value.toString('utf8')) as T
    },
    async putJson(key: string, value: unknown): Promise<void> {
      objects.set(key, Buffer.from(JSON.stringify(value), 'utf8'))
    },
    async getBytes(key: string): Promise<Uint8Array | null> {
      return objects.get(key) ?? null
    },
    async putBytes(key: string, body: Uint8Array): Promise<void> {
      objects.set(key, Buffer.from(body))
    },
  }
}
