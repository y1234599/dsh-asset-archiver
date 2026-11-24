import React from 'react'

import { App } from '../App.js'
import type { ClientContext } from '../context.js'
import { closeAssetWindow, useAssetWindowOpen } from '../windowStore.js'

/**
 * In-app floating window modeled on dsh-session-manager's panel dialog: a
 * full-viewport backdrop with a centered dialog, rendered through the Host's
 * `shell.overlay` slot. It never replaces the conversation panel.
 */
export function AssetArchiverWindow({ ctx }: { ctx: ClientContext }): React.ReactElement | null {
  const open = useAssetWindowOpen()

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeAssetWindow()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        background: 'rgba(0, 0, 0, 0.45)',
        pointerEvents: 'auto',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeAssetWindow()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="资产归档"
        style={{
          width: '50vw',
          height: '70vh',
          minWidth: 0,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '12px',
          border: '1px solid var(--dsw-alias-border-l2)',
          background: 'var(--dsw-alias-bg-base)',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.28)',
        }}
      >
        <App ctx={ctx} onClose={closeAssetWindow} />
      </div>
    </div>
  )
}
