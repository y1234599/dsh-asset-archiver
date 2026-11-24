import React from 'react'

import { AssetArchiverWindow } from './components/AssetArchiverWindow.js'
import { ArchiveIcon } from './components/ArchiveIcon.js'
import type { ClientContext } from './context.js'
import { openAssetWindow } from './windowStore.js'

export const inject = ['slots'] as const

function EntryButton({ wide = true }: { wide?: boolean }): React.ReactElement {
  return (
    <button
      type="button"
      title="资产归档"
      aria-label="资产归档"
      onClick={openAssetWindow}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        minHeight: '28px',
        height: '28px',
        padding: wide ? '0 8px' : '0',
        width: wide ? 'auto' : '36px',
        border: '0',
        borderRadius: '6px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        fontSize: '12px',
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        flex: '0 0 auto',
      }}
    >
      <ArchiveIcon size={16} />
      {wide ? <span>资产归档</span> : null}
    </button>
  )
}

export function apply(ctx: ClientContext): void {
  // Footer entry: the slot is a list. A unique id plus a high order appends the
  // button after existing actions instead of claiming their position.
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'asset-archiver',
    order: 100,
    label: () => '资产归档',
  }, EntryButton))

  // Floating window rendered above the whole frame; opening it never changes
  // the conversation panel (same pattern as dsh-session-manager's panel dialog).
  function WindowSlot(): React.ReactElement {
    return <AssetArchiverWindow ctx={ctx} />
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'asset-archiver.window',
    order: 1000,
  }, WindowSlot))
}
