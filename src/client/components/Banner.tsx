import React from 'react'

export type BannerTone = 'error' | 'success' | 'info'

export interface BannerMessage {
  tone: BannerTone
  text: string
}

const COLORS: Record<BannerTone, string> = {
  error: 'var(--dsw-alias-state-error-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
  info: 'var(--dsw-alias-label-secondary)',
}

export function Banner({ message }: { message: BannerMessage | null }): React.ReactElement | null {
  if (!message) return null
  const color = COLORS[message.tone]
  return (
    <div
      role={message.tone === 'error' ? 'alert' : 'status'}
      style={{
        border: `1px solid ${color}`,
        color,
        borderRadius: '8px',
        padding: '8px 10px',
        fontSize: '12px',
        whiteSpace: 'pre-wrap',
      }}
    >
      {message.text}
    </div>
  )
}
