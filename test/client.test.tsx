import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import test from 'node:test'

import { apply, inject } from '../src/client/index.js'
import { App } from '../src/client/App.js'
import { DownloadResultPanel } from '../src/client/components/ResultPanels.js'
import { Switch } from '../src/client/components/Switch.js'
import { WorkspaceTable } from '../src/client/components/WorkspaceTable.js'
import { closeAssetWindow, openAssetWindow } from '../src/client/windowStore.js'
import type { DownloadResult, LocalWorkspaceSummary, WorkspaceFilesResult } from '../src/shared/contract.js'
import type { ClientContext, SlotRegistrationOptions } from '../src/client/context.js'

interface Registration {
  options: SlotRegistrationOptions
  component: React.ComponentType<{ wide?: boolean }>
}

function clientContext(registrations: Registration[] = []): ClientContext {
  return {
    slots: {
      inject(_name, callback) {
        callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    },
    get() {
      return undefined
    },
  }
}

test('client registers the footer entry and the overlay window', () => {
  assert.deepEqual([...inject], ['slots'])
  const registrations: Registration[] = []
  apply(clientContext(registrations))
  assert.equal(registrations.length, 2)

  const entry = registrations.find((item) => item.options.name === 'sidebar.footer.action')
  const overlay = registrations.find((item) => item.options.name === 'shell.overlay')
  assert.ok(entry, 'footer entry must be registered')
  assert.ok(overlay, 'overlay window must be registered')
  assert.equal(entry.options.id, 'asset-archiver')
  assert.equal(entry.options.order, 100)
  assert.equal(overlay.options.id, 'asset-archiver.window')
  assert.equal(overlay.options.order, 1000)
  assert.equal(registrations.some((item) => item.options.name === 'main'), false)

  const entryHtml = renderToString(React.createElement(entry.component, { wide: true }))
  assert.match(entryHtml, /资产归档/)

  const closed = renderToString(React.createElement(overlay.component, {}))
  assert.equal(closed, '')

  openAssetWindow()
  try {
    const opened = renderToString(React.createElement(overlay.component, {}))
    assert.match(opened, /role="dialog"/)
    assert.match(opened, /aria-modal="true"/)
    assert.match(opened, /width:50vw/)
    assert.match(opened, /height:70vh/)
    assert.match(opened, /资产归档/)
    assert.match(opened, /上传/)
    assert.match(opened, /拉取/)
    assert.match(opened, /设置/)
    assert.match(opened, /配置完成后可加载本地工作区/)
  } finally {
    closeAssetWindow()
  }
  assert.equal(renderToString(React.createElement(overlay.component, {})), '')

  const pageHtml = renderToString(React.createElement(App, {
    ctx: clientContext(),
    onClose: () => {},
  }))
  assert.match(pageHtml, /资产归档/)
  assert.match(pageHtml, /上传/)
  assert.match(pageHtml, /拉取/)
  assert.match(pageHtml, /设置/)
  assert.match(pageHtml, /配置完成后可加载本地工作区/)
})

test('workspace file panel renders files and the opt-in note', () => {
  const workspace: LocalWorkspaceSummary = {
    id: 'ws-1',
    name: '演示工作区',
    path: 'C:\\demo',
    sessions: [{ id: 'session-a', title: '标题 a', createdAt: 100 }],
  }
  const files: WorkspaceFilesResult = {
    files: [
      { path: 'src/a.ts', bytes: 12, tooLarge: false },
      { path: 'big.bin', bytes: 999, tooLarge: true },
    ],
    truncated: false,
    ignored: 1,
  }
  const html = renderToString(React.createElement(WorkspaceTable, {
    workspaces: [workspace],
    selected: new Set<string>(),
    expanded: new Set(['ws-1']),
    expandedFolders: new Set(['ws-1:src']),
    fileLists: new Map([['ws-1', files]]),
    loadingFiles: new Set<string>(),
    selectedFiles: new Map<string, ReadonlySet<string>>(),
    onToggle: () => {},
    onToggleExpand: () => {},
    onToggleFolder: () => {},
    onToggleFile: () => {},
    onSetFiles: () => {},
    onToggleAllFiles: () => {},
  }))
  assert.match(html, /src/)
  assert.match(html, /a\.ts/)
  assert.match(html, /勾选工作区后才能选择文件/)
  assert.match(html, /超过上限/)
  assert.match(html, /已忽略/)
  assert.match(html, /目录\/特殊文件/)
})

test('download result hides file counters when files were not pulled', () => {
  const base: DownloadResult = {
    workspace: { key: 'ws', name: '演示工作区', path: 'C:\\target' },
    created: 2,
    skipped: 0,
    failed: 0,
    files: { created: 0, skipped: 0, failed: 0, errors: [] },
    details: { created: [{ id: 'a' }, { id: 'b' }], skipped: [], failed: [] },
  }
  const offHtml = renderToString(React.createElement(DownloadResultPanel, { result: base }))
  assert.doesNotMatch(offHtml, /文件 新建/)
  const onHtml = renderToString(React.createElement(DownloadResultPanel, {
    result: { ...base, files: { created: 1, skipped: 0, failed: 0, errors: [] } },
  }))
  assert.match(onHtml, /文件 新建/)
})

test('file-sync switch exposes switch semantics and default state', () => {
  const off = renderToString(React.createElement(Switch, {
    checked: false,
    onChange: () => {},
    label: '拉取时同步工作区文件',
  }))
  assert.match(off, /role="switch"/)
  assert.match(off, /aria-checked="false"/)
  const on = renderToString(React.createElement(Switch, {
    checked: true,
    onChange: () => {},
    label: '拉取时同步工作区文件',
  }))
  assert.match(on, /aria-checked="true"/)
})
