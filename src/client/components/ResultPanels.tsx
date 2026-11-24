import React from 'react'

import type { DownloadResult, UploadResult } from '../../shared/contract.js'
import { S } from '../styles.js'

export function UploadResultPanel({ result }: { result: UploadResult }): React.ReactElement {
  return (
    <div style={S.card}>
      <div style={{ padding: '8px 12px', ...S.dim }}>
        上传完成：{result.summary.uploaded} 个会话成功，{result.summary.failed} 个失败；
        {' '}{result.summary.filesUploaded} 个文件成功，{result.summary.filesFailed} 个失败
      </div>
      {result.workspaces.map((workspace, index) => (
        <div
          key={workspace.workspaceId}
          style={{ ...S.row, ...(index === result.workspaces.length - 1 ? S.rowLast : {}) }}
        >
          <div style={S.grow}>
            <div style={S.strong}>{workspace.name}</div>
            {workspace.errors.length > 0 ? (
              <div style={{ ...S.dim, color: 'var(--dsw-alias-state-error-primary)' }}>
                {workspace.errors.map((error) => `${error.sessionId}: ${error.message}`).join('；')}
              </div>
            ) : null}
            {workspace.fileErrors.length > 0 ? (
              <div style={{ ...S.dim, color: 'var(--dsw-alias-state-error-primary)' }}>
                {workspace.fileErrors.map((error) => `${error.path}: ${error.message}`).join('；')}
              </div>
            ) : null}
          </div>
          <span style={S.dim}>
            会话 {workspace.uploaded}/{workspace.failed} · 文件 {workspace.filesUploaded}/{workspace.filesFailed}
          </span>
        </div>
      ))}
    </div>
  )
}

export function DownloadResultPanel({ result }: { result: DownloadResult }): React.ReactElement {
  const showsFiles = result.files.created > 0 || result.files.skipped > 0 || result.files.failed > 0
  return (
    <div style={S.card}>
      <div style={{ padding: '8px 12px', ...S.dim }}>目标：{result.workspace.path}</div>
      <div style={{ ...S.row, ...S.rowLast }}>
        <span>
          会话 新建 {result.created} / 跳过 {result.skipped} / 失败 {result.failed}
          {showsFiles ? (
            <>
              {' · '}文件 新建 {result.files.created} / 跳过 {result.files.skipped} / 失败 {result.files.failed}
            </>
          ) : null}
        </span>
        {result.details.failed.length > 0 ? (
          <span style={{ color: 'var(--dsw-alias-state-error-primary)' }}>
            {result.details.failed.map((error) => `${error.sessionId}: ${error.message}`).join('；')}
          </span>
        ) : null}
      </div>
      {result.files.errors.length > 0 ? (
        <div style={{ padding: '8px 12px', ...S.dim, color: 'var(--dsw-alias-state-error-primary)' }}>
          {result.files.errors.map((error) => `${error.path}: ${error.message}`).join('；')}
        </div>
      ) : null}
      {result.details.created.some((item) => item.warning) ? (
        <div style={{ padding: '8px 12px', ...S.dim, color: 'var(--dsw-alias-state-warn-primary)' }}>
          {result.details.created.filter((item) => item.warning).map((item) => `${item.id}: ${item.warning}`).join('；')}
        </div>
      ) : null}
    </div>
  )
}
