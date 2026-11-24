import React from 'react'

import type { LocalWorkspaceSummary, WorkspaceFilesResult } from '../../shared/contract.js'
import {
  buildFileTree,
  selectablePathsOf,
  selectionStateOf,
  type FileTreeFolder,
  type FileTreeNode,
} from '../fileTree.js'
import { formatBytes } from '../format.js'
import { S } from '../styles.js'

interface WorkspaceTableProps {
  workspaces: LocalWorkspaceSummary[]
  selected: ReadonlySet<string>
  expanded: ReadonlySet<string>
  expandedFolders: ReadonlySet<string>
  fileLists: ReadonlyMap<string, WorkspaceFilesResult>
  loadingFiles: ReadonlySet<string>
  selectedFiles: ReadonlyMap<string, ReadonlySet<string>>
  onToggle: (workspaceId: string) => void
  onToggleExpand: (workspaceId: string) => void
  onToggleFolder: (workspaceId: string, folderPath: string) => void
  onToggleFile: (workspaceId: string, path: string) => void
  onSetFiles: (workspaceId: string, paths: readonly string[], selected: boolean) => void
  onToggleAllFiles: (workspaceId: string, selectAll: boolean) => void
}

function LinkButton(props: {
  children: React.ReactNode
  disabled?: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        border: 0,
        background: 'transparent',
        color: props.disabled ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-brand-primary)',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        fontSize: '12px',
        padding: '0 2px',
      }}
    >
      {props.children}
    </button>
  )
}

function TriCheckbox(props: {
  checked: boolean
  indeterminate: boolean
  disabled: boolean
  onChange: () => void
  label: string
}): React.ReactElement {
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = props.indeterminate
  }, [props.indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={props.label}
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
    />
  )
}

interface TreeContext {
  workspaceId: string
  enabled: boolean
  selected: ReadonlySet<string>
  expandedFolders: ReadonlySet<string>
  onToggleFolder: (workspaceId: string, folderPath: string) => void
  onToggleFile: (workspaceId: string, path: string) => void
  onSetFiles: (workspaceId: string, paths: readonly string[], selected: boolean) => void
}

function folderKey(workspaceId: string, folderPath: string): string {
  return `${workspaceId}:${folderPath}`
}

function FileRow(props: {
  ctx: TreeContext
  node: Extract<FileTreeNode, { kind: 'file' }>
  depth: number
}): React.ReactElement {
  const { ctx, node, depth } = props
  return (
    <label
      style={{
        ...S.row,
        padding: '4px 8px',
        paddingLeft: `${12 + depth * 16}px`,
        cursor: node.tooLarge || !ctx.enabled ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        disabled={node.tooLarge || !ctx.enabled}
        checked={ctx.selected.has(node.path)}
        onChange={() => ctx.onToggleFile(ctx.workspaceId, node.path)}
      />
      <div style={S.grow}>
        <div style={{ ...S.strong, fontSize: '12px' }}>{node.name}</div>
      </div>
      <span style={S.dim}>{formatBytes(node.bytes)}</span>
      {node.tooLarge ? (
        <span style={{ ...S.dim, color: 'var(--dsw-alias-state-warn-primary)' }}>超过上限</span>
      ) : null}
    </label>
  )
}

function FolderRow(props: {
  ctx: TreeContext
  node: FileTreeFolder
  depth: number
}): React.ReactElement {
  const { ctx, node, depth } = props
  const open = ctx.expandedFolders.has(folderKey(ctx.workspaceId, node.path))
  const state = selectionStateOf(node.selectablePaths, ctx.selected)
  return (
    <div style={{ ...S.row, padding: '4px 8px', paddingLeft: `${12 + depth * 16}px`, cursor: 'default' }}>
      <TriCheckbox
        checked={state === 'all'}
        indeterminate={state === 'some'}
        disabled={!ctx.enabled || node.selectablePaths.length === 0}
        onChange={() => ctx.onSetFiles(ctx.workspaceId, node.selectablePaths, state !== 'all')}
        label={`选择文件夹 ${node.path}`}
      />
      <button
        type="button"
        aria-expanded={open}
        onClick={() => ctx.onToggleFolder(ctx.workspaceId, node.path)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flex: '1 1 auto',
          minWidth: 0,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: 'inherit',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        <span style={{ ...S.dim, width: '12px', flex: '0 0 auto' }}>{open ? '▾' : '▸'}</span>
        <span style={{ ...S.strong, fontSize: '12px', flex: '1 1 auto' }}>{node.name}</span>
        <span style={S.dim}>{node.fileCount} 个文件</span>
      </button>
    </div>
  )
}

function TreeNodes(props: { ctx: TreeContext; nodes: FileTreeNode[]; depth: number }): React.ReactElement {
  const { ctx, nodes, depth } = props
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'file') {
          return <FileRow key={node.path} ctx={ctx} node={node} depth={depth} />
        }
        const open = ctx.expandedFolders.has(folderKey(ctx.workspaceId, node.path))
        return (
          <React.Fragment key={node.path}>
            <FolderRow ctx={ctx} node={node} depth={depth} />
            {open ? <TreeNodes ctx={ctx} nodes={node.children} depth={depth + 1} /> : null}
          </React.Fragment>
        )
      })}
    </>
  )
}

function FilePanel(props: {
  workspace: LocalWorkspaceSummary
  enabled: boolean
  expanded: boolean
  result: WorkspaceFilesResult | undefined
  loading: boolean
  files: ReadonlySet<string>
  expandedFolders: ReadonlySet<string>
  onToggleFolder: (folderPath: string) => void
  onToggleFile: (path: string) => void
  onSetFiles: (paths: readonly string[], selected: boolean) => void
  onToggleAllFiles: (selectAll: boolean) => void
}): React.ReactElement | null {
  if (!props.expanded) return null
  if (props.loading) {
    return <div style={{ padding: '4px 0 10px 24px', ...S.dim }}>正在读取工作区文件…</div>
  }
  if (!props.result) {
    return <div style={{ padding: '4px 0 10px 24px', ...S.dim }}>文件列表不可用。</div>
  }
  const selectable = selectablePathsOf(props.result.files)
  const allSelected = selectable.length > 0 && selectable.every((path) => props.files.has(path))
  const tree = buildFileTree(props.result.files)
  const ctx: TreeContext = {
    workspaceId: props.workspace.id,
    enabled: props.enabled,
    selected: props.files,
    expandedFolders: props.expandedFolders,
    onToggleFolder: (_workspaceId, path) => props.onToggleFolder(path),
    onToggleFile: (_workspaceId, path) => props.onToggleFile(path),
    onSetFiles: (_workspaceId, paths, selected) => props.onSetFiles(paths, selected),
  }

  return (
    <div style={{ padding: '0 0 10px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 0 6px' }}>
        <span style={S.dim}>
          文件：已选 {props.files.size} / 共 {props.result.files.length}
          {props.result.truncated ? '（列表已截断）' : ''}
        </span>
        <LinkButton
          disabled={!props.enabled || selectable.length === 0}
          onClick={() => props.onToggleAllFiles(true)}
        >
          {allSelected ? '已全选' : '全选'}
        </LinkButton>
        <LinkButton disabled={!props.enabled} onClick={() => props.onToggleAllFiles(false)}>清空</LinkButton>
      </div>
      {!props.enabled ? (
        <div style={{ ...S.dim, paddingBottom: '4px' }}>勾选工作区后才能选择文件；仅勾选工作区不会上传文件。</div>
      ) : (
        <div style={{ ...S.dim, paddingBottom: '4px' }}>勾选文件夹会选中其下全部可上传文件。</div>
      )}
      {props.result.files.length === 0 ? (
        <div style={{ ...S.dim, paddingBottom: '4px' }}>工作区没有可上传的文件。</div>
      ) : (
        <div style={{ border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '8px', maxHeight: '280px', overflow: 'auto' }}>
          <TreeNodes ctx={ctx} nodes={tree} depth={0} />
        </div>
      )}
      {props.result.ignored > 0 ? (
        <div style={{ ...S.dim, paddingTop: '4px' }}>已忽略 {props.result.ignored} 个目录/特殊文件。</div>
      ) : null}
    </div>
  )
}

export function WorkspaceTable(props: WorkspaceTableProps): React.ReactElement {
  const { workspaces, selected, expanded, fileLists, loadingFiles, selectedFiles } = props
  return (
    <div style={S.card}>
      {workspaces.map((workspace, index) => {
        const workspaceSelected = selected.has(workspace.id)
        const files = selectedFiles.get(workspace.id) ?? new Set<string>()
        return (
          <div
            key={workspace.id}
            style={{ borderBottom: index === workspaces.length - 1 ? 'none' : '1px solid var(--dsw-alias-border-l1)' }}
          >
            <div style={{ ...S.row, borderBottom: 'none', cursor: 'default' }}>
              <input
                type="checkbox"
                checked={workspaceSelected}
                onChange={() => props.onToggle(workspace.id)}
              />
              <button
                type="button"
                onClick={() => props.onToggleExpand(workspace.id)}
                aria-expanded={expanded.has(workspace.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flex: '1 1 auto',
                  minWidth: 0,
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{ ...S.dim, width: '12px', flex: '0 0 auto' }}>
                  {expanded.has(workspace.id) ? '▾' : '▸'}
                </span>
                <span style={S.grow}>
                  <span style={{ ...S.strong, display: 'block' }}>{workspace.name}</span>
                  <span style={{ ...S.dim, display: 'block' }}>{workspace.path}</span>
                </span>
                <span style={S.dim}>
                  {workspace.sessions.length} 会话{files.size > 0 ? ` · ${files.size} 文件` : ''}
                </span>
              </button>
            </div>
            <FilePanel
              workspace={workspace}
              enabled={workspaceSelected}
              expanded={expanded.has(workspace.id)}
              result={fileLists.get(workspace.id)}
              loading={loadingFiles.has(workspace.id)}
              files={files}
              expandedFolders={props.expandedFolders}
              onToggleFolder={(folderPath) => props.onToggleFolder(workspace.id, folderPath)}
              onToggleFile={(path) => props.onToggleFile(workspace.id, path)}
              onSetFiles={(paths, select) => props.onSetFiles(workspace.id, paths, select)}
              onToggleAllFiles={(selectAll) => props.onToggleAllFiles(workspace.id, selectAll)}
            />
          </div>
        )
      })}
    </div>
  )
}
