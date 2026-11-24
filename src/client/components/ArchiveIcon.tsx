import React from 'react'

export function ArchiveIcon({ size = 16 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 8h16v2H4z" />
      <path d="M6 10v9h12v-9" />
      <path d="M10 13h4" />
      <path d="M12 20v-5" />
      <path d="M9.5 16.5 12 14l2.5 2.5" />
    </svg>
  )
}
