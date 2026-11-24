/** Wire formats shared by the Host routes and the Client page. */

export interface ConfigValues {
  endpoint: string
  region: string
  accessKeyId: string
  accessKeySecret: string
  bucketName: string
  prefix: string
}

export interface ConfigInput {
  endpoint?: string
  region?: string
  accessKeyId?: string
  accessKeySecret?: string
  bucketName?: string
  prefix?: string
}

export interface MaskedConfigValues {
  endpoint: string
  region: string
  accessKeyIdMasked: string
  accessKeySecretSet: boolean
  bucketName: string
  prefix: string
}

export interface ConfigView {
  configured: boolean
  configPath: string
  values: MaskedConfigValues
  errors: string[]
}

export interface ConnectionTestResult {
  ok: true
  latencyMs: number
  bucket: string
  prefix: string
}

export interface LocalSessionSummary {
  id: string
  title: string
  createdAt: number | null
}

export interface LocalWorkspaceSummary {
  id: string
  name: string
  path: string
  sessions: LocalSessionSummary[]
}

export interface LocalTree {
  workspaces: LocalWorkspaceSummary[]
}

export interface CloudSessionSummary {
  id: string
  title?: string
  createdAt?: number | null
  eventCount?: number
}

export interface CloudWorkspaceSummary {
  key: string
  name: string
  updatedAt: string | null
  sessions: CloudSessionSummary[]
  fileCount: number
  localPath: string | null
  localWorkspaceId: string | null
}

export interface CloudWorkspaces {
  workspaces: CloudWorkspaceSummary[]
}

export interface WorkspaceFileEntry {
  path: string
  bytes: number
  tooLarge: boolean
}

export interface WorkspaceFilesResult {
  files: WorkspaceFileEntry[]
  truncated: boolean
  ignored: number
}

export interface UploadFileSelection {
  workspaceId: string
  path: string
}

export interface UploadRequest {
  workspaceIds?: string[]
  /** Workspace-relative files the user explicitly selected. */
  files?: UploadFileSelection[]
}

export interface ItemError {
  sessionId: string
  code: string
  message: string
}

export interface FileError {
  path: string
  code: string
  message: string
}

export interface UploadWorkspaceResult {
  workspaceId: string
  name: string
  key: string
  uploaded: number
  failed: number
  filesUploaded: number
  filesFailed: number
  errors: ItemError[]
  fileErrors: FileError[]
}

export interface UploadResult {
  workspaces: UploadWorkspaceResult[]
  summary: { uploaded: number; failed: number; filesUploaded: number; filesFailed: number }
}

export interface DownloadRequest {
  workspaceKey?: string
  targetDir?: string
  /** Pull workspace files in addition to sessions. Defaults to false. */
  includeFiles?: boolean
}

export interface DownloadResult {
  workspace: { key: string; name: string; path: string }
  created: number
  skipped: number
  failed: number
  files: {
    created: number
    skipped: number
    failed: number
    errors: FileError[]
  }
  details: {
    created: Array<{ id: string; warning?: string }>
    skipped: Array<{ id: string; reason: string }>
    failed: ItemError[]
  }
}

export type ErrorCode =
  | 'E_METHOD'
  | 'E_BAD_REQUEST'
  | 'E_LIMIT'
  | 'E_NOT_FOUND'
  | 'E_VALIDATION'
  | 'E_NOT_CONFIGURED'
  | 'E_CONFIG'
  | 'E_HOME'
  | 'E_AUTH'
  | 'E_BUCKET'
  | 'E_NETWORK'
  | 'E_OSS'
  | 'E_CORRUPT'
  | 'E_UNSUPPORTED_BUNDLE'
  | 'E_FORMAT_VERSION'
  | 'E_TARGET'
  | 'E_HOST'
  | 'E_INTERNAL'

export interface ApiErrorBody {
  code: ErrorCode
  message: string
  retryable: boolean
  details?: unknown
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorBody }

/** Route action names under /api-asset-archiver. */
export type RouteAction =
  | 'config/get'
  | 'config/save'
  | 'config/test'
  | 'local/workspaces'
  | 'local/files'
  | 'cloud/workspaces'
  | 'cloud/sessions'
  | 'upload'
  | 'download'

export interface AppStatus {
  version: string
  prefix: string
}
