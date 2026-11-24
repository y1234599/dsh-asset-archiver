import type { ApiErrorBody, ApiResponse } from '../shared/contract.js'

const API_ROOT = '/api-asset-archiver/'

export class ApiError extends Error {
  readonly code: string
  readonly details?: unknown

  constructor(body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.code = body.code
    if (body.details !== undefined) this.details = body.details
  }
}

export async function request<T>(action: string, body: unknown = {}): Promise<T> {
  const response = await fetch(API_ROOT + action, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  let payload: ApiResponse<T>
  try {
    payload = await response.json() as ApiResponse<T>
  } catch {
    throw new Error(`服务器返回了无法解析的响应（HTTP ${response.status}）`)
  }
  if (payload.ok !== true) throw new ApiError(payload.error)
  return payload.data
}
