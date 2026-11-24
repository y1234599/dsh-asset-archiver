import React from 'react'

import type {
  CloudWorkspaceSummary,
  ConfigView,
  DownloadResult,
  LocalWorkspaceSummary,
  UploadResult,
  WorkspaceFilesResult,
} from '../shared/contract.js'
import { request } from './api.js'
import { Banner, type BannerMessage } from './components/Banner.js'
import { Button } from './components/Button.js'
import { ConfigForm } from './components/ConfigForm.js'
import { DownloadResultPanel, UploadResultPanel } from './components/ResultPanels.js'
import { Switch } from './components/Switch.js'
import { WorkspaceTable } from './components/WorkspaceTable.js'
import type { ClientContext, LayoutService, UiWorkspaceService } from './context.js'
import { formatTime } from './format.js'
import { S } from './styles.js'

type Tab = 'upload' | 'pull' | 'settings'

function toggleSetEntry(current: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export interface AppProps {
  ctx: ClientContext
  /** Standalone window: close the window instead of switching the host panel. */
  onClose?: () => void
}

export function App({ ctx, onClose }: AppProps): React.ReactElement {
  const [tab, setTab] = React.useState<Tab>('upload')
  const [config, setConfig] = React.useState<ConfigView | null>(null)
  const [local, setLocal] = React.useState<LocalWorkspaceSummary[] | null>(null)
  const [cloud, setCloud] = React.useState<CloudWorkspaceSummary[] | null>(null)
  const [selectedLocal, setSelectedLocal] = React.useState<ReadonlySet<string>>(new Set())
  const [selectedCloud, setSelectedCloud] = React.useState('')
  const [includeFiles, setIncludeFiles] = React.useState(false)
  const [targetDir, setTargetDir] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [message, setMessage] = React.useState<BannerMessage | null>(null)
  const [uploadResult, setUploadResult] = React.useState<UploadResult | null>(null)
  const [downloadResult, setDownloadResult] = React.useState<DownloadResult | null>(null)
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set())
  const [expandedFolders, setExpandedFolders] = React.useState<ReadonlySet<string>>(new Set())
  const [fileLists, setFileLists] = React.useState<ReadonlyMap<string, WorkspaceFilesResult>>(new Map())
  const [loadingFiles, setLoadingFiles] = React.useState<ReadonlySet<string>>(new Set())
  const [selectedFiles, setSelectedFiles] = React.useState<ReadonlyMap<string, ReadonlySet<string>>>(new Map())

  const notifyError = (error: unknown): void => {
    setMessage({ tone: 'error', text: error instanceof Error ? error.message : String(error) })
  }

  const loadConfig = async (): Promise<ConfigView | null> => {
    try {
      const view = await request<ConfigView>('config/get')
      setConfig(view)
      return view
    } catch (error) {
      notifyError(error)
      return null
    }
  }

  const loadLocal = async (): Promise<void> => {
    setBusy('local')
    try {
      const data = await request<{ workspaces: LocalWorkspaceSummary[] }>('local/workspaces')
      setLocal(data.workspaces)
      setSelectedLocal(new Set(data.workspaces.map((workspace) => workspace.id)))
      setExpanded(new Set())
      setExpandedFolders(new Set())
      setFileLists(new Map())
      setSelectedFiles(new Map())
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  const loadCloud = async (): Promise<void> => {
    setBusy('cloud')
    try {
      const data = await request<{ workspaces: CloudWorkspaceSummary[] }>('cloud/workspaces')
      setCloud(data.workspaces)
      setSelectedCloud((current) => (
        data.workspaces.some((workspace) => workspace.key === current) ? current : ''
      ))
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  React.useEffect(() => {
    void (async () => {
      const view = await loadConfig()
      if (view?.configured) {
        await Promise.all([loadLocal(), loadCloud()])
      }
    })()
    // Bootstrap once; later refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clearFilesFor = (workspaceId: string): void => {
    setSelectedFiles((current) => {
      if (!current.has(workspaceId)) return current
      const next = new Map(current)
      next.delete(workspaceId)
      return next
    })
  }

  const toggleLocal = (workspaceId: string): void => {
    if (selectedLocal.has(workspaceId)) {
      setSelectedLocal((current) => {
        const next = new Set(current)
        next.delete(workspaceId)
        return next
      })
      clearFilesFor(workspaceId)
      return
    }
    setSelectedLocal((current) => {
      const next = new Set(current)
      next.add(workspaceId)
      return next
    })
  }

  const loadWorkspaceFiles = async (workspaceId: string): Promise<void> => {
    setLoadingFiles((current) => new Set(current).add(workspaceId))
    try {
      const result = await request<WorkspaceFilesResult>('local/files', { workspaceId })
      setFileLists((current) => {
        const next = new Map(current)
        next.set(workspaceId, result)
        return next
      })
    } catch (error) {
      notifyError(error)
    } finally {
      setLoadingFiles((current) => {
        const next = new Set(current)
        next.delete(workspaceId)
        return next
      })
    }
  }

  const toggleExpand = (workspaceId: string): void => {
    const willOpen = !expanded.has(workspaceId)
    setExpanded((current) => toggleSetEntry(current, workspaceId))
    if (willOpen && !fileLists.has(workspaceId) && !loadingFiles.has(workspaceId)) {
      void loadWorkspaceFiles(workspaceId)
    }
  }

  const toggleFolder = (workspaceId: string, folderPath: string): void => {
    setExpandedFolders((current) => toggleSetEntry(current, `${workspaceId}:${folderPath}`))
  }

  const setFiles = (workspaceId: string, paths: readonly string[], select: boolean): void => {
    if (!selectedLocal.has(workspaceId)) return
    setSelectedFiles((current) => {
      const next = new Map(current)
      const files = new Set(next.get(workspaceId) ?? [])
      for (const path of paths) {
        if (select) files.add(path)
        else files.delete(path)
      }
      if (files.size === 0) next.delete(workspaceId)
      else next.set(workspaceId, files)
      return next
    })
  }

  const toggleFile = (workspaceId: string, path: string): void => {
    if (!selectedLocal.has(workspaceId)) return
    const file = fileLists.get(workspaceId)?.files.find((entry) => entry.path === path)
    if (!file || file.tooLarge) return
    setSelectedFiles((current) => {
      const next = new Map(current)
      const files = new Set(next.get(workspaceId) ?? [])
      if (files.has(path)) files.delete(path)
      else files.add(path)
      if (files.size === 0) next.delete(workspaceId)
      else next.set(workspaceId, files)
      return next
    })
  }

  const toggleAllFiles = (workspaceId: string, selectAll: boolean): void => {
    if (!selectedLocal.has(workspaceId)) return
    const result = fileLists.get(workspaceId)
    if (!result) return
    setSelectedFiles((current) => {
      const next = new Map(current)
      if (selectAll) {
        next.set(workspaceId, new Set(result.files.filter((file) => !file.tooLarge).map((file) => file.path)))
      } else {
        next.delete(workspaceId)
      }
      return next
    })
  }

  const chooseDirectory = async (): Promise<void> => {
    const uiWorkspace = ctx.get<UiWorkspaceService>('uiWorkspace')
    if (uiWorkspace && typeof uiWorkspace.pickDirectory === 'function') {
      const picked = await uiWorkspace.pickDirectory()
      if (picked) setTargetDir(picked)
      return
    }
    const manual = window.prompt('请输入本地工作区目录的绝对路径')
    if (manual) setTargetDir(manual.trim())
  }

  const selectedFileCount = [...selectedFiles.values()].reduce((sum, files) => sum + files.size, 0)

  const runUpload = async (all: boolean): Promise<void> => {
    const workspaceIds = all
      ? (local ?? []).map((workspace) => workspace.id)
      : [...selectedLocal]
    const files = [...selectedFiles.entries()].flatMap(([workspaceId, paths]) => (
      [...paths].map((path) => ({ workspaceId, path }))
    ))
    if (!all && workspaceIds.length === 0) {
      setMessage({ tone: 'error', text: '请先勾选要上传的工作区' })
      return
    }
    setBusy('upload')
    setMessage(null)
    setUploadResult(null)
    try {
      const result = await request<UploadResult>('upload', { workspaceIds, files })
      setUploadResult(result)
      const filePart = result.summary.filesUploaded > 0 || result.summary.filesFailed > 0
        ? `，${result.summary.filesUploaded} 个文件成功${result.summary.filesFailed > 0 ? `，${result.summary.filesFailed} 个文件失败` : ''}`
        : ''
      setMessage({
        tone: result.summary.failed > 0 || result.summary.filesFailed > 0 ? 'error' : 'success',
        text: `上传完成：${result.summary.uploaded} 个会话成功${result.summary.failed > 0 ? `，${result.summary.failed} 个失败` : ''}${filePart}`,
      })
      await loadCloud()
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  const selectedWorkspace = cloud?.find((workspace) => workspace.key === selectedCloud) ?? null

  const selectCloud = (workspace: CloudWorkspaceSummary): void => {
    setSelectedCloud(workspace.key)
    setIncludeFiles(false)
    setTargetDir(workspace.localPath ?? '')
  }

  const runDownload = async (): Promise<void> => {
    if (!selectedWorkspace) {
      setMessage({ tone: 'error', text: '请先选择云端工作区' })
      return
    }
    if (!targetDir) {
      setMessage({ tone: 'error', text: '请先选择本地工作区目录' })
      return
    }
    setBusy('download')
    setMessage(null)
    setDownloadResult(null)
    try {
      const result = await request<DownloadResult>('download', {
        workspaceKey: selectedWorkspace.key,
        targetDir,
        includeFiles,
      })
      setDownloadResult(result)
      const filePart = includeFiles
        && (result.files.created > 0 || result.files.skipped > 0 || result.files.failed > 0)
        ? `；文件新建 ${result.files.created}、跳过 ${result.files.skipped}、失败 ${result.files.failed}`
        : ''
      setMessage({
        tone: result.failed > 0 || (includeFiles && result.files.failed > 0) ? 'error' : 'success',
        text: `拉取完成：会话新建 ${result.created}、跳过 ${result.skipped}、失败 ${result.failed}${filePart}`,
      })
      await loadLocal()
    } catch (error) {
      notifyError(error)
    } finally {
      setBusy('')
    }
  }

  const close = (): void => {
    if (onClose) {
      onClose()
      return
    }
    const layout = ctx.get<LayoutService>('layout')
    if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(null)
  }

  const status = config === null ? '加载中' : config.configured ? '已配置' : '未配置'
  const configWarning = config && !config.configured ? (
    <div style={{ ...S.dim, border: '1px solid var(--dsw-alias-state-warn-primary)', borderRadius: '8px', padding: '8px 10px' }}>
      对象存储尚未配置。请先到「设置」填写 endpoint、region、AccessKey 与 bucket。
    </div>
  ) : null

  const tabButton = (id: Tab, label: string): React.ReactElement => (
    <button type="button" style={S.tab(tab === id)} onClick={() => setTab(id)}>{label}</button>
  )

  const uploadTab = (
    <div style={S.body}>
      {configWarning}
      <div style={S.toolbar}>
        <Button disabled={busy !== ''} onClick={() => { void loadLocal() }}>
          {busy === 'local' ? '刷新中…' : '刷新本地工作区'}
        </Button>
        <Button disabled={busy !== '' || !config?.configured} onClick={() => { void runUpload(false) }}>
          {busy === 'upload'
            ? '上传中…'
            : `上传选中（${selectedLocal.size} 工作区${selectedFileCount > 0 ? ` / ${selectedFileCount} 文件` : ''}）`}
        </Button>
        <Button primary disabled={busy !== '' || !config?.configured} onClick={() => { void runUpload(true) }}>
          上传全部工作区
        </Button>
        {local ? <span style={S.dim}>共 {local.length} 个工作区，{local.reduce((sum, item) => sum + item.sessions.length, 0)} 个会话</span> : null}
      </div>
      <Banner message={message} />
      {!config?.configured ? (
        <div style={S.dim}>配置完成后可加载本地工作区。</div>
      ) : local === null ? (
        <div style={S.dim}>正在加载本地工作区…</div>
      ) : local.length === 0 ? (
        <div style={S.dim}>本地没有工作区。</div>
      ) : (
        <WorkspaceTable
          workspaces={local}
          selected={selectedLocal}
          expanded={expanded}
          expandedFolders={expandedFolders}
          fileLists={fileLists}
          loadingFiles={loadingFiles}
          selectedFiles={selectedFiles}
          onToggle={toggleLocal}
          onToggleExpand={toggleExpand}
          onToggleFolder={toggleFolder}
          onToggleFile={toggleFile}
          onSetFiles={setFiles}
          onToggleAllFiles={toggleAllFiles}
        />
      )}
      {uploadResult ? <UploadResultPanel result={uploadResult} /> : null}
    </div>
  )

  const pullTab = (
    <div style={S.body}>
      {configWarning}
      <div style={S.toolbar}>
        <Button disabled={busy !== ''} onClick={() => { void loadCloud() }}>
          {busy === 'cloud' ? '刷新中…' : '刷新云端工作区'}
        </Button>
        {cloud ? <span style={S.dim}>共 {cloud.length} 个云端工作区</span> : null}
      </div>
      <Banner message={message} />
      {!config?.configured ? (
        <div style={S.dim}>配置完成后可加载云端工作区。</div>
      ) : cloud === null ? (
        <div style={S.dim}>正在加载云端工作区…</div>
      ) : cloud.length === 0 ? (
        <div style={S.dim}>云端还没有工作区，请先上传。</div>
      ) : (
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minHeight: 0 }}>
          <div style={{ ...S.card, width: '320px', flex: '0 0 auto' }}>
            {cloud.map((workspace, index) => (
              <label
                key={workspace.key}
                style={{
                  ...S.row,
                  ...(index === cloud.length - 1 ? S.rowLast : {}),
                  background: selectedCloud === workspace.key ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
                }}
              >
                <input
                  type="radio"
                  name="asset-archiver-cloud"
                  checked={selectedCloud === workspace.key}
                  onChange={() => selectCloud(workspace)}
                />
                <div style={S.grow}>
                  <div style={S.strong}>{workspace.name}</div>
                  <div style={S.dim}>
                    {workspace.sessions.length} 个会话 · {workspace.fileCount ?? 0} 个文件
                    {workspace.localPath ? ' · 已有本地工作区' : ' · 新工作区'}
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div style={{ ...S.card, flex: '1 1 auto', minWidth: 0 }}>
            {selectedWorkspace === null ? (
              <div style={{ padding: '14px', ...S.dim }}>在左侧选择一个云端工作区。</div>
            ) : (
              <div>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--dsw-alias-border-l1)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div style={S.strong}>{selectedWorkspace.name}</div>
                    <Switch
                      checked={includeFiles}
                      onChange={setIncludeFiles}
                      label="拉取时同步工作区文件"
                      title={includeFiles
                        ? '已开启：拉取时同步工作区文件'
                        : '已关闭：仅拉取会话；打开后同步工作区文件'}
                    />
                    <span
                      style={{ ...S.dim, cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => setIncludeFiles((current) => !current)}
                    >
                      同步工作区文件
                    </span>
                  </div>
                  <div style={S.dim}>
                    最近更新：{formatTime(selectedWorkspace.updatedAt) || '未知'}
                    {' · '}{selectedWorkspace.fileCount ?? 0} 个文件
                  </div>
                </div>
                <div style={{ maxHeight: '220px', overflow: 'auto' }}>
                  {selectedWorkspace.sessions.length === 0 ? (
                    <div style={{ padding: '12px', ...S.dim }}>该工作区没有会话。</div>
                  ) : selectedWorkspace.sessions.map((session, index) => (
                    <div
                      key={session.id}
                      style={{ ...S.row, ...(index === selectedWorkspace.sessions.length - 1 ? S.rowLast : {}) }}
                    >
                      <span style={{ color: 'var(--dsw-alias-state-success-primary)' }}>✓</span>
                      <div style={S.grow}>
                        <div style={S.strong}>{session.title || session.id}</div>
                        <div style={S.dim}>{session.id}</div>
                      </div>
                      <span style={S.dim}>{session.eventCount ?? '?'} 条事件</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '10px 12px', borderTop: '1px solid var(--dsw-alias-border-l1)' }}>
                  <label style={{ ...S.field, marginBottom: '8px' }}>
                    <span style={S.label}>本地工作区目录</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input style={{ ...S.input, flex: '1 1 auto' }} readOnly value={targetDir} placeholder="请选择本地目录" />
                      <Button onClick={() => { void chooseDirectory() }}>选择目录…</Button>
                    </div>
                  </label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button primary disabled={busy !== ''} onClick={() => { void runDownload() }}>
                      {busy === 'download' ? '拉取中…' : '拉取该工作区'}
                    </Button>
                    <span style={S.dim}>
                      {includeFiles
                        ? '已开启文件同步；已存在的会话与文件会自动跳过'
                        : '仅拉取会话；打开上方开关可同步工作区文件'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {downloadResult ? <DownloadResultPanel result={downloadResult} /> : null}
    </div>
  )

  const settingsTab = (
    <div style={S.body}>
      <div style={S.dim}>配置保存到 DSH_HOME/dsh-asset-archiver/config.yml。</div>
      {config ? (
        <ConfigForm
          config={config}
          onSaved={(view) => {
            setConfig(view)
            void loadLocal()
            void loadCloud()
          }}
        />
      ) : (
        <div style={S.dim}>正在加载配置…</div>
      )}
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.header}>
        <span style={S.title}>资产归档</span>
        <span style={{
          fontSize: '11px',
          padding: '1px 7px',
          borderRadius: '999px',
          border: '1px solid var(--dsw-alias-border-l2)',
          color: config?.configured ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-warn-primary)',
        }}>
          {status}
        </span>
        <div style={{ flex: '1 1 auto' }} />
        <Button onClick={() => { void loadConfig(); void loadLocal(); void loadCloud() }}>刷新</Button>
        <Button onClick={close}>关闭</Button>
      </div>
      <div style={S.tabs}>
        {tabButton('upload', '上传')}
        {tabButton('pull', '拉取')}
        {tabButton('settings', '设置')}
      </div>
      {tab === 'upload' ? uploadTab : tab === 'pull' ? pullTab : settingsTab}
    </div>
  )
}
