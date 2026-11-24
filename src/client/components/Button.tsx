import React from 'react'

export interface ButtonProps {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  disabled?: boolean
  title?: string
}

export function Button({ children, onClick, primary = false, disabled = false, title }: ButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: '28px',
        padding: '0 12px',
        borderRadius: '7px',
        fontSize: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        border: primary ? '1px solid var(--dsw-alias-brand-primary)' : '1px solid var(--dsw-alias-border-l2)',
        background: primary ? 'var(--dsw-alias-brand-primary)' : 'transparent',
        color: primary ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-primary)',
      }}
    >
      {children}
    </button>
  )
}
