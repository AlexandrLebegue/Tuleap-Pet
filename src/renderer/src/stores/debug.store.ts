import { create } from 'zustand'
import type { DebugLogEntry } from '../../../preload'

const MAX_ENTRIES = 500

type DebugStore = {
  entries: DebugLogEntry[]
  expanded: boolean
  addEntry: (entry: DebugLogEntry) => void
  toggle: () => void
  clear: () => void
}

export const useDebug = create<DebugStore>((set) => ({
  entries: [],
  expanded: false,
  addEntry: (entry) =>
    set((s) => ({
      entries: s.entries.length >= MAX_ENTRIES
        ? [...s.entries.slice(1), entry]
        : [...s.entries, entry]
    })),
  toggle: () => set((s) => ({ expanded: !s.expanded })),
  clear: () => set({ entries: [] })
}))
