import React from 'react'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  title?: string
}

export function Switch({ checked, onChange, label, disabled = false, title }: SwitchProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: '34px',
        height: '18px',
        minWidth: '34px',
        padding: 0,
        borderRadius: '9px',
        border: `1px solid ${checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)'}`,
        background: checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-layer-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transition: 'background .15s ease, border-color .15s ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '2px',
          left: '2px',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: checked ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-secondary)',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform .15s ease',
        }}
      />
    </button>
  )
}
