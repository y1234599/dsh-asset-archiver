import type * as React from 'react'

type Style = React.CSSProperties

export interface Styles {
  page: Style
  header: Style
  title: Style
  tabs: Style
  tab: (active: boolean) => Style
  body: Style
  toolbar: Style
  card: Style
  row: Style
  rowLast: Style
  strong: Style
  dim: Style
  grow: Style
  field: Style
  label: Style
  input: Style
  code: Style
}

export const S: Styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    minHeight: 0,
    background: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
    fontSize: '13px',
    lineHeight: '20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 18px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    flex: '0 0 auto',
  },
  title: { fontSize: '15px', fontWeight: 600 },
  tabs: {
    display: 'flex',
    gap: '4px',
    padding: '8px 14px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    flex: '0 0 auto',
  },
  tab: (active) => ({
    border: `1px solid ${active ? 'var(--dsw-alias-border-l2)' : 'transparent'}`,
    background: active ? 'var(--dsw-alias-bg-layer-1)' : 'transparent',
    color: active ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
    borderRadius: '7px',
    padding: '4px 12px',
    fontSize: '13px',
    cursor: 'pointer',
  }),
  body: {
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'auto',
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  toolbar: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  card: {
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: '10px',
    background: 'var(--dsw-alias-bg-layer-1)',
    overflow: 'hidden',
    // Cards live in the scrollable page body; without this the column flex
    // layout shrinks the card instead of letting the body overflow and scroll.
    flexShrink: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--dsw-alias-border-l1)',
    cursor: 'pointer',
  },
  rowLast: { borderBottom: 'none' },
  strong: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  dim: {
    color: 'var(--dsw-alias-label-secondary)',
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  grow: { flex: '1 1 auto', minWidth: 0 },
  field: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' },
  label: { color: 'var(--dsw-alias-label-secondary)', fontSize: '12px' },
  input: {
    height: '30px',
    boxSizing: 'border-box',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: '7px',
    background: 'var(--dsw-alias-bg-base)',
    color: 'var(--dsw-alias-label-primary)',
    padding: '0 9px',
    fontSize: '13px',
    outline: 'none',
  },
  code: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '12px',
    background: 'var(--dsw-alias-bg-layer-2)',
    border: '1px solid var(--dsw-alias-border-l1)',
    borderRadius: '7px',
    padding: '2px 6px',
  },
}
