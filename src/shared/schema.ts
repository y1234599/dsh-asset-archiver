/** Stored JSON schemas. `schemaVersion` is the compatibility gate. */

export interface SessionHeader {
  version: number
  id: string
  createdAt: number
  cwd?: string
  parentSession?: string
  isSeeded: boolean
  delegationDepth?: number
  agentPreset?: string
  origin?: 'subagent'
}

export interface SessionEvent {
  type: string
  seq: number
  time: number
  data: unknown
  [key: string]: unknown
}

export interface SessionLogSnapshot {
  session: SessionHeader
  inheritedEventCount: number
  events: SessionEvent[]
}

export interface SessionBundle {
  schemaVersion: 1
  id: string
  title: string
  header: SessionHeader
  inheritedEventCount: number
  events: SessionEvent[]
}

export interface ManifestSession {
  id: string
  title?: string
  createdAt?: number | null
  eventCount?: number
}

export interface ManifestFile {
  /** Workspace-relative path using `/` separators. */
  path: string
  bytes: number
  sha256: string
  contentType?: string
  uploadedAt?: string
}

export interface WorkspaceManifest {
  schemaVersion: 1
  workspace: { key: string; name: string }
  sessions: ManifestSession[]
  /** Optional for older manifests written before workspace-file support. */
  files?: ManifestFile[]
  updatedAt: string
}

export const BUNDLE_SCHEMA_VERSION = 1 as const
export const MANIFEST_SCHEMA_VERSION = 1 as const
