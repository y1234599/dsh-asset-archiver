import type {
  CloudSessionSummary,
  CloudWorkspaceSummary,
  CloudWorkspaces,
  ConfigInput,
  ConfigValues,
  ConfigView,
  ConnectionTestResult,
  DownloadRequest,
  DownloadResult,
  FileError,
  ItemError,
  LocalTree,
  UploadFileSelection,
  UploadRequest,
  UploadResult,
  UploadWorkspaceResult,
  WorkspaceFilesResult,
} from '../shared/contract.js'
import type { ManifestFile, ManifestSession, SessionBundle, WorkspaceManifest } from '../shared/schema.js'
import { ConfigStore, normalizePrefix, validateConfig } from './config.js'
import {
  listLocalSessionIds,
  listLocalWorkspaces,
  readSessionBundle,
  resolveWorkspaceForTarget,
} from './catalog.js'
import { requireService, type HostContext, type WorkspaceRegistry } from './dsh.js'
import { AppError } from './errors.js'
import {
  fileKey,
  manifestKey,
  sessionKey,
  workspacePrefixBase,
  encodeWorkspaceKey,
  disambiguateWorkspaceKey,
} from './keys.js'
import type { Logger } from './logger.js'
import { noopLogger } from './logger.js'
import {
  listWorkspaceFiles as listFilesOnDisk,
  normalizeRelativePath,
  readWorkspaceFile,
  sha256Hex,
  workspaceFileExists,
  writeWorkspaceFile,
} from './files.js'
import { createAliOssGateway, type OssFactory, type OssGateway } from './oss.js'
import { restoreSession } from './session-restore.js'

export interface AssetArchiverOptions {
  configStore?: ConfigStore
  ossFactory?: OssFactory
  logger?: Logger
  now?: () => Date
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorOf(sessionId: string, error: unknown): ItemError {
  return {
    sessionId,
    code: error instanceof AppError ? error.code : 'E_INTERNAL',
    message: messageOf(error),
  }
}

function fileErrorOf(path: string, error: unknown): FileError {
  return {
    path,
    code: error instanceof AppError ? error.code : 'E_INTERNAL',
    message: messageOf(error),
  }
}

export function mergeConfigInput(current: ConfigValues, input: ConfigInput): ConfigValues {
  return {
    endpoint: String(input.endpoint ?? current.endpoint).trim().replace(/\/+$/, ''),
    region: String(input.region ?? current.region).trim(),
    accessKeyId: String(input.accessKeyId ?? '').trim() || current.accessKeyId,
    accessKeySecret: String(input.accessKeySecret ?? '').trim() || current.accessKeySecret,
    bucketName: String(input.bucketName ?? current.bucketName).trim(),
    prefix: normalizePrefix(input.prefix ?? current.prefix),
  }
}

export class AssetArchiverApp {
  readonly configStore: ConfigStore
  readonly logger: Logger
  private readonly ossFactory: OssFactory
  private readonly now: () => Date

  constructor(private readonly ctx: HostContext, options: AssetArchiverOptions = {}) {
    this.configStore = options.configStore ?? new ConfigStore()
    this.logger = options.logger ?? noopLogger
    this.ossFactory = options.ossFactory ?? createAliOssGateway
    this.now = options.now ?? (() => new Date())
  }

  async getConfigView(): Promise<ConfigView> {
    return this.configStore.view(await this.configStore.read())
  }

  async saveConfig(input: ConfigInput): Promise<ConfigView> {
    return this.configStore.view(await this.configStore.save(input))
  }

  async testConnection(input: ConfigInput = {}): Promise<ConnectionTestResult> {
    const current = await this.configStore.read()
    const candidate = mergeConfigInput(current, input)
    const errors = validateConfig(candidate)
    if (errors.length > 0) {
      throw new AppError('E_CONFIG', errors.join('；'), 400, { details: errors })
    }
    const gateway = this.ossFactory(candidate)
    const { latencyMs } = await gateway.probe(candidate.prefix)
    return {
      ok: true,
      latencyMs,
      bucket: candidate.bucketName,
      prefix: normalizePrefix(candidate.prefix),
    }
  }

  async listLocal(): Promise<LocalTree> {
    const workspaces = await listLocalWorkspaces(this.ctx, this.logger)
    return {
      workspaces: workspaces.map((workspace) => ({
        ...workspace,
        sessions: workspace.sessions.map((session) => ({ ...session })),
      })),
    }
  }

  async listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFilesResult> {
    const id = String(workspaceId ?? '').trim()
    if (id === '') throw new AppError('E_VALIDATION', '缺少 workspaceId', 400)
    const registry = requireService<WorkspaceRegistry>(this.ctx, 'workspaceRegistry')
    const workspace = registry.list().find((candidate) => candidate.id === id)
    if (!workspace) throw new AppError('E_NOT_FOUND', `本地工作区不存在：${id}`, 404)
    return listFilesOnDisk(workspace.path)
  }

  private async gateway(): Promise<{ oss: OssGateway; config: ConfigValues }> {
    const config = await this.configStore.resolved()
    return { oss: this.ossFactory(config), config }
  }

  private async cloudWorkspace(oss: OssGateway, prefix: string, key: string): Promise<CloudWorkspaceSummary> {
    const manifest = await oss.getJson<WorkspaceManifest>(`${workspacePrefixBase(prefix)}${key}/manifest.json`)
    const sessions: CloudSessionSummary[] = Array.isArray(manifest?.sessions)
      ? manifest.sessions.map((session) => ({
        id: String(session.id),
        ...(session.title === undefined ? {} : { title: session.title }),
        ...(session.createdAt === undefined ? {} : { createdAt: session.createdAt }),
        ...(session.eventCount === undefined ? {} : { eventCount: session.eventCount }),
      }))
      : []
    return {
      key,
      name: manifest?.workspace?.name ?? key,
      updatedAt: manifest?.updatedAt ?? null,
      sessions,
      fileCount: Array.isArray(manifest?.files) ? manifest.files.length : 0,
      localPath: null,
      localWorkspaceId: null,
    }
  }

  async listCloud(): Promise<CloudWorkspaces> {
    const { oss, config } = await this.gateway()
    const base = workspacePrefixBase(config.prefix)
    const { prefixes } = await oss.list(base, { delimiter: '/' })
    const local = await listLocalWorkspaces(this.ctx, this.logger).catch(() => [])
    const localByName = new Map(local.map((workspace) => [workspace.name, workspace]))
    const workspaces = await Promise.all(prefixes.map(async (prefix) => {
      const key = prefix.slice(base.length).replace(/\/+$/, '')
      if (key === '') return null
      const workspace = await this.cloudWorkspace(oss, config.prefix, key)
      const match = localByName.get(workspace.name)
      return {
        ...workspace,
        localPath: match?.path ?? null,
        localWorkspaceId: match?.id ?? null,
      }
    }))
    return { workspaces: workspaces.filter((workspace): workspace is CloudWorkspaceSummary => workspace !== null) }
  }

  async getCloudWorkspace(workspaceKey: string): Promise<CloudWorkspaceSummary> {
    const key = workspaceKey.trim()
    if (key === '') throw new AppError('E_VALIDATION', '缺少 workspaceKey', 400)
    const { oss, config } = await this.gateway()
    const workspace = await this.cloudWorkspace(oss, config.prefix, key)
    if (workspace.sessions.length === 0 && workspace.updatedAt === null) {
      throw new AppError('E_NOT_FOUND', `云端工作区不存在：${key}`, 404)
    }
    return workspace
  }

  async upload(request: UploadRequest = {}): Promise<UploadResult> {
    const { oss, config } = await this.gateway()
    const local = await listLocalWorkspaces(this.ctx, this.logger)
    const requestedWorkspaceIds = Array.isArray(request.workspaceIds)
      ? request.workspaceIds.filter((id): id is string => typeof id === 'string')
      : []
    const fileSelections: UploadFileSelection[] = Array.isArray(request.files)
      ? request.files.filter((item): item is UploadFileSelection => (
        typeof item === 'object'
        && item !== null
        && typeof (item as UploadFileSelection).workspaceId === 'string'
        && typeof (item as UploadFileSelection).path === 'string'
      ))
      : []
    const selected = new Set<string>(requestedWorkspaceIds)
    if (requestedWorkspaceIds.length > 0) {
      for (const selection of fileSelections) selected.add(selection.workspaceId)
    }
    const targets = requestedWorkspaceIds.length > 0
      ? local.filter((workspace) => selected.has(workspace.id))
      : local
    if (targets.length === 0) throw new AppError('E_VALIDATION', '没有可上传的工作区', 400)

    const filesByWorkspace = new Map<string, string[]>()
    for (const selection of fileSelections) {
      const list = filesByWorkspace.get(selection.workspaceId) ?? []
      list.push(selection.path)
      filesByWorkspace.set(selection.workspaceId, list)
    }

    const nameCounts = new Map<string, number>()
    for (const workspace of local) nameCounts.set(workspace.name, (nameCounts.get(workspace.name) ?? 0) + 1)

    const results: UploadWorkspaceResult[] = []
    for (const workspace of targets) {
      const baseKey = encodeWorkspaceKey(workspace.name)
      const key = (nameCounts.get(workspace.name) ?? 0) > 1
        ? disambiguateWorkspaceKey(baseKey, workspace.path)
        : baseKey
      const manifestPath = manifestKey(config.prefix, key)
      const existing = await oss.getJson<WorkspaceManifest>(manifestPath)
      if (existing && Number(existing.schemaVersion) !== 1) {
        throw new AppError('E_UNSUPPORTED_BUNDLE', `云端清单版本不受支持：${String(existing.schemaVersion)}`, 422)
      }
      const sessionsById = new Map<string, ManifestSession>()
      if (Array.isArray(existing?.sessions)) {
        for (const session of existing.sessions) {
          if (typeof session?.id === 'string') sessionsById.set(session.id, session)
        }
      }
      const errors: ItemError[] = []
      for (const session of workspace.sessions) {
        try {
          const bundle = await readSessionBundle(this.ctx, session.id, session.title)
          await oss.putJson(sessionKey(config.prefix, key, session.id), bundle)
          sessionsById.set(session.id, {
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            eventCount: bundle.events.length,
          })
        } catch (error) {
          errors.push(errorOf(session.id, error))
          this.logger.warn('upload.session_failed', { workspaceKey: key, sessionId: session.id, error })
        }
      }
      const sessions = [...sessionsById.values()]
      const filesByPath = new Map<string, ManifestFile>()
      if (existing?.schemaVersion === 1 && Array.isArray(existing.files)) {
        for (const file of existing.files) {
          if (typeof file?.path === 'string') filesByPath.set(file.path, file)
        }
      }

      const fileErrors: FileError[] = []
      let filesUploaded = 0
      const requestedFiles = [...new Set(filesByWorkspace.get(workspace.id) ?? [])]
      for (const selectedPath of requestedFiles) {
        try {
          const relativePath = normalizeRelativePath(selectedPath)
          const file = await readWorkspaceFile(workspace.path, relativePath)
          await oss.putBytes(fileKey(config.prefix, key, relativePath), file.bytes, file.contentType)
          filesByPath.set(relativePath, {
            path: relativePath,
            bytes: file.bytes.length,
            sha256: file.sha256,
            contentType: file.contentType,
            uploadedAt: this.now().toISOString(),
          })
          filesUploaded += 1
        } catch (error) {
          fileErrors.push(fileErrorOf(selectedPath, error))
          this.logger.warn('upload.file_failed', { workspaceKey: key, path: selectedPath, error })
        }
      }

      const files = [...filesByPath.values()].sort((left, right) => left.path.localeCompare(right.path))
      if (sessions.length > 0 || files.length > 0) {
        const manifest: WorkspaceManifest = {
          schemaVersion: 1,
          workspace: { key, name: workspace.name },
          sessions,
          ...(files.length > 0 ? { files } : {}),
          updatedAt: this.now().toISOString(),
        }
        await oss.putJson(manifestPath, manifest)
      }

      results.push({
        workspaceId: workspace.id,
        name: workspace.name,
        key,
        uploaded: sessions.length,
        failed: errors.length,
        filesUploaded,
        filesFailed: fileErrors.length,
        errors,
        fileErrors,
      })
      this.logger.info('upload.workspace_done', {
        workspaceKey: key,
        uploaded: sessions.length,
        failed: errors.length,
        filesUploaded,
        filesFailed: fileErrors.length,
      })
    }

    const summary = results.reduce((acc, item) => ({
      uploaded: acc.uploaded + item.uploaded,
      failed: acc.failed + item.failed,
      filesUploaded: acc.filesUploaded + item.filesUploaded,
      filesFailed: acc.filesFailed + item.filesFailed,
    }), { uploaded: 0, failed: 0, filesUploaded: 0, filesFailed: 0 })
    return { workspaces: results, summary }
  }

  async download(request: DownloadRequest = {}): Promise<DownloadResult> {
    const key = String(request.workspaceKey ?? '').trim()
    if (key === '') throw new AppError('E_VALIDATION', '请选择云端工作区', 400)
    const targetDir = String(request.targetDir ?? '').trim()
    if (targetDir === '') throw new AppError('E_TARGET', '请选择本地工作区目录', 400)

    const { oss, config } = await this.gateway()
    const manifest = await oss.getJson<WorkspaceManifest>(manifestKey(config.prefix, key))
    if (!manifest) throw new AppError('E_NOT_FOUND', `云端工作区不存在：${key}`, 404)
    if (Number(manifest.schemaVersion) !== 1) {
      throw new AppError('E_UNSUPPORTED_BUNDLE', `云端清单版本不受支持：${String(manifest.schemaVersion)}`, 422)
    }

    const workspace = await resolveWorkspaceForTarget(
      this.ctx,
      targetDir,
      manifest.workspace?.name ?? key,
    )
    const knownLocalIds = await listLocalSessionIds(this.ctx)
    const created: Array<{ id: string; warning?: string }> = []
    const skipped: Array<{ id: string; reason: string }> = []
    const failed: ItemError[] = []

    for (const meta of manifest.sessions) {
      const sessionId = String(meta.id ?? '')
      if (sessionId === '') continue
      try {
        if (knownLocalIds.has(sessionId)) {
          skipped.push({ id: sessionId, reason: 'local-exists' })
          continue
        }
        const bundle = await oss.getJson<SessionBundle>(
          sessionKey(config.prefix, key, sessionId),
        )
        if (!bundle) {
          failed.push({ sessionId, code: 'E_NOT_FOUND', message: '会话对象不存在' })
          continue
        }
        const result = await restoreSession(this.ctx, workspace, bundle, knownLocalIds, this.logger)
        if (result.status === 'created') {
          created.push(result.warning === undefined ? { id: result.id } : { id: result.id, warning: result.warning })
        } else {
          skipped.push({ id: result.id, reason: 'local-exists' })
        }
      } catch (error) {
        failed.push(errorOf(sessionId, error))
        this.logger.warn('download.session_failed', { workspaceKey: key, sessionId, error })
      }
    }

    const fileErrors: FileError[] = []
    let filesCreated = 0
    let filesSkipped = 0
    const manifestFiles = Array.isArray(manifest.files) ? manifest.files : []
    if (request.includeFiles === true) {
      for (const file of manifestFiles) {
        const rawPath = typeof file?.path === 'string' ? file.path : ''
        try {
          const relativePath = normalizeRelativePath(rawPath)
          if (await workspaceFileExists(workspace.path, relativePath)) {
            filesSkipped += 1
            continue
          }
          const bytes = await oss.getBytes(fileKey(config.prefix, key, relativePath))
          if (!bytes) {
            fileErrors.push({ path: relativePath, code: 'E_NOT_FOUND', message: '文件对象不存在' })
            continue
          }
          if (file.sha256 && sha256Hex(bytes) !== file.sha256) {
            fileErrors.push({ path: relativePath, code: 'E_CORRUPT', message: '文件哈希不一致' })
            continue
          }
          const status = await writeWorkspaceFile(workspace.path, relativePath, bytes)
          if (status === 'created') filesCreated += 1
          else filesSkipped += 1
        } catch (error) {
          fileErrors.push(fileErrorOf(rawPath || '(invalid)', error))
          this.logger.warn('download.file_failed', { workspaceKey: key, path: rawPath, error })
        }
      }
    }

    this.logger.info('download.workspace_done', {
      workspaceKey: key,
      created: created.length,
      skipped: skipped.length,
      failed: failed.length,
      filesCreated,
      filesSkipped,
      filesFailed: fileErrors.length,
    })
    return {
      workspace: { key, name: workspace.title, path: workspace.path },
      created: created.length,
      skipped: skipped.length,
      failed: failed.length,
      files: {
        created: filesCreated,
        skipped: filesSkipped,
        failed: fileErrors.length,
        errors: fileErrors,
      },
      details: { created, skipped, failed },
    }
  }
}
