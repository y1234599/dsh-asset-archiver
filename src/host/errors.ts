import type { ApiErrorBody, ErrorCode } from '../shared/contract.js'

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly retryable: boolean
  readonly details?: unknown

  constructor(
    code: ErrorCode,
    message: string,
    status = 400,
    options: { retryable?: boolean; details?: unknown } = {},
  ) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.retryable = options.retryable === true
    if (options.details !== undefined) this.details = options.details
  }
}

export function fail(
  code: ErrorCode,
  message: string,
  status = 400,
  options: { retryable?: boolean; details?: unknown } = {},
): never {
  throw new AppError(code, message, status, options)
}

export function toApiError(error: unknown): ApiErrorBody {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details === undefined ? {} : { details: error.details }),
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? '未知错误')
  return { code: 'E_INTERNAL', message, retryable: false }
}

export function statusOf(error: unknown): number {
  return error instanceof AppError ? error.status : 500
}
