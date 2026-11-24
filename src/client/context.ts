import type * as React from 'react'

export interface SlotRegistrationOptions {
  name: string
  id?: string
  key?: string
  order?: number
  label?: () => string
}

export interface SlotsService {
  inject(name: string, callback: () => unknown): void
  register(options: SlotRegistrationOptions, component: React.ComponentType<{ wide?: boolean }>): () => void
}

export interface LayoutService {
  selectPanel(panelId: string | null): void
}

export interface UiWorkspaceService {
  pickDirectory(): Promise<string | null>
}

export interface ClientContext {
  slots: SlotsService
  get<T>(name: string): T | undefined
}
