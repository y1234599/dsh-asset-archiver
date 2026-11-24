/**
 * Cloud object naming. A workspace name is the business identifier; only one
 * OSS key segment is derived from it. Unsafe characters are replaced so the
 * segment never contains a path separator or a control character.
 */

import { createHash } from 'node:crypto'

import { DEFAULT_PREFIX } from './config.js'

function hash8(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 8)
}

export function encodeWorkspaceKey(name: string): string {
  const normalized = name.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (normalized === '') return 'unnamed-workspace'
  let encoded = Array.from(normalized)
    .map((char) => {
      if (char === ' ') return '_'
      if (/[/\\:*?"<>|]/.test(char) || (char.codePointAt(0) ?? 0) < 32) {
        return `_${(char.codePointAt(0) ?? 0).toString(16)}_`
      }
      return char
    })
    .join('')
  if (encoded === '.' || encoded === '..') encoded = `_${encoded}`
  if (encoded.length > 120) encoded = `${encoded.slice(0, 100)}~${hash8(normalized)}`
  return encoded
}

/** Suffix used only when two local workspaces share a display name. */
export function disambiguateWorkspaceKey(key: string, localPath: string): string {
  return `${key}~${hash8(localPath)}`
}

export function decodeWorkspaceKey(key: string): string {
  return key
}

export function encodeSessionId(sessionId: string): string {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(sessionId) ? sessionId : encodeURIComponent(sessionId)
}

export function cloudRoot(prefix: string | undefined): string {
  return (prefix ?? '').trim().replace(/^\/+|\/+$/g, '') || DEFAULT_PREFIX
}

export function workspacePrefixBase(prefix: string | undefined): string {
  return `${cloudRoot(prefix)}/v1/workspaces/`
}

export function workspacePrefix(prefix: string | undefined, workspaceKey: string): string {
  return `${workspacePrefixBase(prefix)}${workspaceKey}/`
}

export function manifestKey(prefix: string | undefined, workspaceKey: string): string {
  return `${workspacePrefix(prefix, workspaceKey)}manifest.json`
}

export function sessionKey(prefix: string | undefined, workspaceKey: string, sessionId: string): string {
  return `${workspacePrefix(prefix, workspaceKey)}sessions/${encodeSessionId(sessionId)}.json`
}

/** One OSS object per workspace file, keyed by its workspace-relative path. */
export function fileKey(prefix: string | undefined, workspaceKey: string, relativePath: string): string {
  const encoded = relativePath.split('/').map((segment) => encodeURIComponent(segment)).join('/')
  return `${workspacePrefix(prefix, workspaceKey)}files/${encoded}`
}
