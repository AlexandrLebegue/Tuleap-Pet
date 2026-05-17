import { create } from 'zustand'
import { api } from '@renderer/lib/api'
import type { CppProjectInfo } from '../../../preload'

type Store = {
  project: CppProjectInfo
  loaded: boolean
  loading: boolean
  refresh: () => Promise<void>
  pick: () => Promise<CppProjectInfo>
  clear: () => Promise<void>
}

const EMPTY: CppProjectInfo = { path: null, exists: false, hasCMake: false, label: null }

export const useCppProject = create<Store>((set) => ({
  project: EMPTY,
  loaded: false,
  loading: false,

  refresh: async () => {
    set({ loading: true })
    try {
      const project = await api.projectRoot.get()
      set({ project, loaded: true, loading: false })
    } catch (err) {
      console.error('cppProject.refresh:', err)
      set({ loading: false })
    }
  },

  pick: async () => {
    set({ loading: true })
    try {
      const res = await api.projectRoot.pick()
      set({ project: res.project, loaded: true, loading: false })
      return res.project
    } catch (err) {
      console.error('cppProject.pick:', err)
      set({ loading: false })
      throw err
    }
  },

  clear: async () => {
    set({ loading: true })
    try {
      const project = await api.projectRoot.clear()
      set({ project, loaded: true, loading: false })
    } catch (err) {
      console.error('cppProject.clear:', err)
      set({ loading: false })
    }
  }
}))

export type { CppProjectInfo }
