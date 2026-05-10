import { create } from 'zustand'
import type { ArtifactDetail, ArtifactSummary, TrackerFields, TrackerSummary } from '@shared/types'
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

  // Kanban
  viewMode: 'table' | 'kanban'
  trackerFields: TrackerFields | null
  loadingFields: boolean
  allArtifacts: ArtifactSummary[]
  loadingAllArtifacts: boolean
  allArtifactsError: string | null
  movingArtifactId: number | null
  createArtifactError: string | null

  loadTrackers: () => Promise<void>
  selectTracker: (id: number | null) => Promise<void>
  loadArtifacts: (offset?: number) => Promise<void>
  openArtifact: (id: number) => Promise<void>
  closeArtifact: () => void

  setViewMode: (mode: 'table' | 'kanban') => void
  loadTrackerFields: () => Promise<void>
  loadAllArtifacts: () => Promise<void>
  createArtifact: (
    title: string,
    description: string | null,
    statusBindValueId: number | null
  ) => Promise<void>
  moveArtifactStatus: (artifactId: number, statusBindValueId: number) => Promise<void>
  updateArtifact: (args: {
    title: string
    description: string | null
    statusBindValueId: number | null
  }) => Promise<void>
  updatingArtifact: boolean
  updateArtifactError: string | null
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

  viewMode: 'table',
  trackerFields: null,
  loadingFields: false,
  allArtifacts: [],
  loadingAllArtifacts: false,
  allArtifactsError: null,
  movingArtifactId: null,
  createArtifactError: null,
  updatingArtifact: false,
  updateArtifactError: null,

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
      artifactsError: null,
      viewMode: 'table',
      trackerFields: null,
      allArtifacts: [],
      allArtifactsError: null
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
    // Ensure tracker fields are available (needed for the edit form)
    if (get().trackerFields === null && !get().loadingFields) {
      void get().loadTrackerFields()
    }
  },

  closeArtifact: () => set({ artifactDetail: null, detailError: null }),

  setViewMode: (mode) => {
    set({ viewMode: mode })
    if (mode === 'kanban') {
      const { allArtifacts, trackerFields, loadingAllArtifacts, loadingFields } = get()
      if (allArtifacts.length === 0 && !loadingAllArtifacts) {
        void get().loadAllArtifacts()
      }
      if (trackerFields === null && !loadingFields) {
        void get().loadTrackerFields()
      }
    }
  },

  loadTrackerFields: async () => {
    const { selectedTrackerId } = get()
    if (selectedTrackerId === null) return
    set({ loadingFields: true })
    try {
      const fields = await api.tuleap.getTrackerFields(selectedTrackerId)
      set({ trackerFields: fields, loadingFields: false })
    } catch (err) {
      set({ loadingFields: false })
      console.error('loadTrackerFields error:', err)
    }
  },

  loadAllArtifacts: async () => {
    const { selectedTrackerId } = get()
    if (selectedTrackerId === null) return
    set({ loadingAllArtifacts: true, allArtifactsError: null })
    try {
      const all: ArtifactSummary[] = []
      let offset = 0
      while (true) {
        const page = await api.tuleap.listArtifacts({
          trackerId: selectedTrackerId,
          limit: 50,
          offset
        })
        all.push(...page.items)
        if (all.length >= page.total || page.items.length === 0) break
        offset += page.items.length
      }
      set({ allArtifacts: all, loadingAllArtifacts: false })
    } catch (err) {
      set({
        loadingAllArtifacts: false,
        allArtifactsError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  createArtifact: async (title, description, statusBindValueId) => {
    const { selectedTrackerId, trackerFields } = get()
    if (selectedTrackerId === null || trackerFields === null) return
    if (trackerFields.titleFieldId === null) {
      set({ createArtifactError: 'Ce tracker ne possède pas de champ titre sémantique.' })
      return
    }
    set({ createArtifactError: null })
    try {
      const created = await api.tuleap.createArtifact({
        trackerId: selectedTrackerId,
        titleFieldId: trackerFields.titleFieldId,
        title,
        statusFieldId: trackerFields.statusFieldId,
        statusBindValueId,
        descriptionFieldId: trackerFields.descriptionFieldId,
        description
      })
      set((s) => ({
        allArtifacts: [...s.allArtifacts, created],
        artifacts:
          s.artifacts.length < PAGE_SIZE ? [...s.artifacts, created] : s.artifacts,
        artifactsTotal: s.artifactsTotal + 1
      }))
    } catch (err) {
      set({ createArtifactError: err instanceof Error ? err.message : String(err) })
      throw err
    }
  },

  updateArtifact: async ({ title, description, statusBindValueId }) => {
    const { artifactDetail, trackerFields, artifactsOffset } = get()
    if (!artifactDetail || !trackerFields) return
    set({ updatingArtifact: true, updateArtifactError: null })
    try {
      await api.tuleap.updateArtifact({
        artifactId: artifactDetail.id,
        titleFieldId: trackerFields.titleFieldId,
        title,
        descriptionFieldId: trackerFields.descriptionFieldId,
        description,
        statusFieldId: trackerFields.statusFieldId,
        statusBindValueId
      })
      // Refresh detail and artifact list
      const [detail] = await Promise.all([
        api.tuleap.getArtifact(artifactDetail.id),
        get().loadArtifacts(artifactsOffset)
      ])
      set({ artifactDetail: detail, updatingArtifact: false })
    } catch (err) {
      set({
        updatingArtifact: false,
        updateArtifactError: err instanceof Error ? err.message : String(err)
      })
      throw err
    }
  },

  moveArtifactStatus: async (artifactId, statusBindValueId) => {
    const { trackerFields, allArtifacts } = get()
    if (
      trackerFields === null ||
      trackerFields.statusFieldId === null ||
      trackerFields.statusField === null
    ) return

    const statusLabel =
      trackerFields.statusField.bindValues.find((v) => v.id === statusBindValueId)?.label ?? null
    const prevArtifacts = allArtifacts
    const optimistic = allArtifacts.map((a) =>
      a.id === artifactId ? { ...a, status: statusLabel } : a
    )
    set({ movingArtifactId: artifactId, allArtifacts: optimistic })

    try {
      await api.tuleap.updateArtifactStatus({
        artifactId,
        statusFieldId: trackerFields.statusFieldId,
        statusBindValueId
      })
    } catch (err) {
      set({ allArtifacts: prevArtifacts })
      console.error('moveArtifactStatus error:', err)
    } finally {
      set({ movingArtifactId: null })
    }
  }
}))

export const PROJECT_PAGE_SIZE = PAGE_SIZE
