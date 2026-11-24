/**
 * Structured Host logging. Logs are one JSON object per line on stderr.
 * Secret-bearing keys and AccessKey-shaped strings are redacted before write.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

export interface Logger {
  debug(event: string, fields?: LogFields): void
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields): void
  child(fields: LogFields): Logger
}

export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLogger
  },
}

const SECRET_KEY = /(secret|password|token|access[-_]?key|authorization)/i
const ACCESS_KEY_SHAPE = /LTAI[A-Za-z0-9]{6,}/g

export function redactText(text: string): string {
  return text.replace(ACCESS_KEY_SHAPE, 'LTAI****')
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]'
  if (typeof value === 'string') return redactText(value)
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message) }
  }
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redactValue(item, depth + 1)
    }
    return out
  }
  return value
}

export interface LoggerOptions {
  level?: LogLevel
  sink?: (line: string) => void
  base?: LogFields
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info'
  const sink = options.sink ?? ((line: string) => process.stderr.write(line + '\n'))
  const base = options.base ?? {}

  const write = (entryLevel: LogLevel, event: string, fields: LogFields, inherited: LogFields) => {
    if (LEVEL_WEIGHT[entryLevel] < LEVEL_WEIGHT[level]) return
    const record = {
      ts: new Date().toISOString(),
      level: entryLevel,
      event,
      ...(redactValue({ ...inherited, ...fields }) as Record<string, unknown>),
    }
    sink(JSON.stringify(record))
  }

  const make = (inherited: LogFields): Logger => ({
    debug: (event, fields) => write('debug', event, fields ?? {}, inherited),
    info: (event, fields) => write('info', event, fields ?? {}, inherited),
    warn: (event, fields) => write('warn', event, fields ?? {}, inherited),
    error: (event, fields) => write('error', event, fields ?? {}, inherited),
    child: (fields) => make({ ...inherited, ...fields }),
  })

  return make(base)
}
