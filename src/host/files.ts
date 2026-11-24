/**
 * Workspace-file enumeration and safe reads/writes.
 *
 * Only regular files are listed or transferred. Symlinks, VCS directories and
 * node_modules are skipped so a workspace selection can never expand into a
 * multi-gigabyte checkout or escape the workspace root.
 */

import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

import type { WorkspaceFileEntry, WorkspaceFilesResult } from '../shared/contract.js'
import { AppError } from './errors.js'

export const MAX_WORKSPACE_FILES = 2_000
export const MAX_FILE_BYTES = 100 * 1024 * 1024

const IGNORED_DIRS = new Set(['node_modules', '.git', '.hg', '.svn'])
const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db'])

export interface ListFilesOptions {
  maxFiles?: number
  maxFileBytes?: number
}

export interface ReadFileOptions {
  maxFileBytes?: number
}

export interface ReadFileResult {
  path: string
  bytes: Buffer
  sha256: string
  contentType: string
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
}

export function contentTypeFor(relativePath: string): string {
  return MIME_BY_EXTENSION[path.extname(relativePath).toLowerCase()] ?? 'application/octet-stream'
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export function normalizeRelativePath(input: string): string {
  if (typeof input !== 'string') throw new AppError('E_CORRUPT', '文件路径不是字符串', 422)
  const raw = input.replace(/\\/g, '/').trim()
  if (raw === '') throw new AppError('E_CORRUPT', '文件路径为空', 422)
  if (raw.includes('\0')) throw new AppError('E_CORRUPT', '文件路径包含非法字符', 422)
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new AppError('E_CORRUPT', `文件路径必须是工作区相对路径：${input}`, 422)
  }
  const segments: string[] = []
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') throw new AppError('E_CORRUPT', `文件路径不能包含 ..：${input}`, 422)
    segments.push(segment)
  }
  if (segments.length === 0) throw new AppError('E_CORRUPT', `文件路径为空：${input}`, 422)
  return segments.join('/')
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function realRoot(root: string): Promise<string> {
  try {
    const resolved = await fsp.realpath(path.resolve(root))
    const stat = await fsp.stat(resolved)
    if (!stat.isDirectory()) throw new Error('not a directory')
    return resolved
  } catch {
    throw new AppError('E_TARGET', `工作区目录不存在或不可访问：${root}`, 400)
  }
}

export async function listWorkspaceFiles(
  root: string,
  options: ListFilesOptions = {},
): Promise<WorkspaceFilesResult> {
  const rootPath = await realRoot(root)
  const maxFiles = options.maxFiles ?? MAX_WORKSPACE_FILES
  const maxFileBytes = options.maxFileBytes ?? MAX_FILE_BYTES
  const files: WorkspaceFileEntry[] = []
  const stack: string[] = [rootPath]
  let ignored = 0
  let truncated = false

  while (stack.length > 0 && !truncated) {
    const dir = stack.pop() as string
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      ignored += 1
      continue
    }
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true
        break
      }
      const absolute = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        ignored += 1
        continue
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          ignored += 1
          continue
        }
        stack.push(absolute)
        continue
      }
      if (!entry.isFile()) {
        ignored += 1
        continue
      }
      if (IGNORED_FILES.has(entry.name)) {
        ignored += 1
        continue
      }
      let size = 0
      try {
        size = (await fsp.stat(absolute)).size
      } catch {
        ignored += 1
        continue
      }
      const relativePath = path.relative(rootPath, absolute).split(path.sep).join('/')
      files.push({ path: relativePath, bytes: size, tooLarge: size > maxFileBytes })
    }
  }

  files.sort((left, right) => left.path.localeCompare(right.path))
  return { files, truncated, ignored }
}

export async function readWorkspaceFile(
  root: string,
  relativePath: string,
  options: ReadFileOptions = {},
): Promise<ReadFileResult> {
  const normalized = normalizeRelativePath(relativePath)
  const rootPath = await realRoot(root)
  const target = path.join(rootPath, ...normalized.split('/'))
  if (!isWithin(rootPath, target)) {
    throw new AppError('E_CORRUPT', `文件路径越界：${relativePath}`, 422)
  }
  let stat
  try {
    stat = await fsp.lstat(target)
  } catch {
    throw new AppError('E_NOT_FOUND', `工作区文件不存在：${normalized}`, 404)
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new AppError('E_VALIDATION', `不是普通文件：${normalized}`, 400)
  }
  const maxFileBytes = options.maxFileBytes ?? MAX_FILE_BYTES
  if (stat.size > maxFileBytes) {
    throw new AppError('E_LIMIT', `文件超过单文件上限（${Math.round(maxFileBytes / 1024 / 1024)} MB）：${normalized}`, 413)
  }
  const bytes = await fsp.readFile(target)
  return {
    path: normalized,
    bytes,
    sha256: sha256Hex(bytes),
    contentType: contentTypeFor(normalized),
  }
}

export type WriteFileResult = 'created' | 'exists'

export async function workspaceFileExists(root: string, relativePath: string): Promise<boolean> {
  const normalized = normalizeRelativePath(relativePath)
  const rootPath = await realRoot(root)
  const target = path.join(rootPath, ...normalized.split('/'))
  if (!isWithin(rootPath, target)) return false
  try {
    const stat = await fsp.lstat(target)
    return stat.isFile() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

export async function writeWorkspaceFile(
  root: string,
  relativePath: string,
  data: Uint8Array,
): Promise<WriteFileResult> {
  const normalized = normalizeRelativePath(relativePath)
  const rootPath = await realRoot(root)
  const target = path.join(rootPath, ...normalized.split('/'))
  if (!isWithin(rootPath, target)) {
    throw new AppError('E_CORRUPT', `文件路径越界：${relativePath}`, 422)
  }
  const parent = path.dirname(target)
  await fsp.mkdir(parent, { recursive: true })
  const parentPath = await fsp.realpath(parent)
  if (parentPath !== rootPath && !isWithin(rootPath, parentPath)) {
    throw new AppError('E_TARGET', `目标目录越界：${relativePath}`, 400)
  }
  try {
    const existing = await fsp.lstat(target)
    if (existing.isSymbolicLink()) throw new AppError('E_TARGET', `目标文件是符号链接：${normalized}`, 400)
    return 'exists'
  } catch (error) {
    if (error instanceof AppError) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  try {
    await fsp.writeFile(target, data, { flag: 'wx' })
    return 'created'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return 'exists'
    throw error
  }
}
