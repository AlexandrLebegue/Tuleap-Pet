import { create } from 'zustand'
import type { ArtifactDetail, ArtifactSummary, TrackerSummary } from '@shared/types'
import { api } from '@renderer/lib/api'

const PAGE_SIZE = 50

type Store = {
  trackers: TrackerSummary[]
  loadingTrackers: boolean
  trackersError: string | null

  selectedTrackerId: number | null
  artifacts: ArtifactSummary[]
  artifactsTotal: number
  artifactsOffset: number
  loadingArtifacts: boolean
  artifactsError: string | null

  artifactDetail: ArtifactDetail | null
  loadingDetail: boolean
  detailError: string | null

  loadTrackers: () => Promise<void>
  selectTracker: (id: number | null) => Promise<void>
  loadArtifacts: (offset?: number) => Promise<void>
  openArtifact: (id: number) => Promise<void>
  closeArtifact: () => void
}

export const useProject = create<Store>((set, get) => ({
  trackers: [],
  loadingTrackers: false,
  trackersError: null,

  selectedTrackerId: null,
  artifacts: [],
  artifactsTotal: 0,
  artifactsOffset: 0,
  loadingArtifacts: false,
  artifactsError: null,

  artifactDetail: null,
  loadingDetail: false,
  detailError: null,

  loadTrackers: async () => {
    set({ loadingTrackers: true, trackersError: null })
    try {
      const trackers = await api.tuleap.listTrackers()
      set({ trackers, loadingTrackers: false })
    } catch (err) {
      set({
        loadingTrackers: false,
        trackersError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  selectTracker: async (id: number | null) => {
    set({
      selectedTrackerId: id,
      artifacts: [],
      artifactsTotal: 0,
      artifactsOffset: 0,
      artifactsError: null
    })
    if (id !== null) {
      await get().loadArtifacts(0)
    }
  },

  loadArtifacts: async (offset = 0) => {
    const { selectedTrackerId } = get()
    if (selectedTrackerId === null) return
    set({ loadingArtifacts: true, artifactsError: null })
    try {
      const page = await api.tuleap.listArtifacts({
        trackerId: selectedTrackerId,
        limit: PAGE_SIZE,
        offset
      })
      set({
        artifacts: page.items,
        artifactsTotal: page.total,
        artifactsOffset: page.offset,
        loadingArtifacts: false
      })
    } catch (err) {
      set({
        loadingArtifacts: false,
        artifactsError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  openArtifact: async (id: number) => {
    set({ artifactDetail: null, loadingDetail: true, detailError: null })
    try {
      const detail = await api.tuleap.getArtifact(id)
      set({ artifactDetail: detail, loadingDetail: false })
    } catch (err) {
      set({
        loadingDetail: false,
        detailError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  closeArtifact: () => set({ artifactDetail: null, detailError: null })
}))

export const PROJECT_PAGE_SIZE = PAGE_SIZE
