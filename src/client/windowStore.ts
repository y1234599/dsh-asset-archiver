import React from 'react'

let open = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) listener()
}

export function openAssetWindow(): void {
  if (open) return
  open = true
  emit()
}

export function closeAssetWindow(): void {
  if (!open) return
  open = false
  emit()
}

export function isAssetWindowOpen(): boolean {
  return open
}

export function subscribeAssetWindow(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAssetWindowOpen(): boolean {
  return React.useSyncExternalStore(subscribeAssetWindow, isAssetWindowOpen, isAssetWindowOpen)
}
