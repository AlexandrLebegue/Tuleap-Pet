import { create } from 'zustand'
import type {
  ArtifactSummary,
  GenerationSource,
  MilestoneStatus,
  MilestoneSummary,
  SprintContent,
  SprintReviewProgressEvent,
  SprintReviewSlideType,
  TrackerSummary
} from '@shared/types'
import { api } from '@renderer/lib/api'

type GenerationMode = 'sprint' | 'custom'
type GenerationStatus = 'idle' | 'enriching' | 'summarizing' | 'generating' | 'done' | 'error'
type ExportStatus = 'idle' | 'rendering' | 'success' | 'cancelled' | 'error'

type Store = {
  // --- Sprint mode ---
  sprints: MilestoneSummary[]
  loadingSprints: boolean
  sprintsError: string | null
  statusFilter: MilestoneStatus
  selectedSprintId: number | null
  sprintContent: SprintContent | null
  loadingContent: boolean
  contentError: string | null

  // --- Custom mode ---
  mode: GenerationMode
  trackers: TrackerSummary[]
  loadingTrackers: boolean
  selectedTrackerId: number | null
  trackerArtifacts: ArtifactSummary[]
  loadingTrackerArtifacts: boolean
  selectedArtifactIds: number[]
  customLabel: string
  dateFrom: string | null
  dateTo: string | null

  // --- Generation ---
  generationStatus: GenerationStatus
  generationError: string | null
  markdown: string
  modelUsed: string | null
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null
  slideWarnings: { slide: SprintReviewSlideType; warning: string }[]

  // --- Progress ---
  pipelineProgress: SprintReviewProgressEvent[]
  currentSlide: SprintReviewSlideType | null
  slidesDone: number
  slidesTotal: number
  currentProgressLabel: string

  // --- Preview / Export ---
  previewHtml: string | null
  previewError: string | null
  exportStatus: ExportStatus
  exportError: string | null
  exportPath: string | null

  // --- Actions ---
  setMode: (mode: GenerationMode) => void
  loadSprints: (status?: MilestoneStatus) => Promise<void>
  selectSprint: (id: number | null) => Promise<void>
  loadTrackers: () => Promise<void>
  selectTracker: (id: number | null) => Promise<void>
  toggleArtifact: (id: number) => void
  clearArtifactSelection: () => void
  setCustomLabel: (label: string) => void
  setDateFrom: (date: string | null) => void
  setDateTo: (date: string | null) => void
  generate: (language?: 'fr' | 'en') => Promise<void>
  setMarkdown: (markdown: string) => void
  refreshPreview: () => Promise<void>
  exportPptx: () => Promise<void>
  reset: () => void
}

function progressLabel(event: SprintReviewProgressEvent): string {
  switch (event.type) {
    case 'enriching':
      return `Récupération des détails (${event.index}/${event.total})…`
    case 'summarizing':
      return 'Synthèse du sprint en cours…'
    case 'slide_start':
      return `Génération slide ${event.index}/${event.total} : ${event.slide.replace(/_/g, ' ')}…`
    case 'slide_done':
      return `Slide ${event.index}/${event.total} généré ✓`
    case 'slide_error':
      return `Slide ${event.index}/${event.total} — erreur`
    case 'assembling':
      return 'Assemblage de la présentation…'
    case 'done':
      return 'Génération terminée'
    default:
      return ''
  }
}

function autoSelectByDateRange(
  artifacts: ArtifactSummary[],
  from: string | null,
  to: string | null
): number[] {
  if (!from && !to) return []
  return artifacts
    .filter((a) => {
      if (!a.submittedOn) return false
      const date = a.submittedOn.slice(0, 10)
      if (from && date < from) return false
      if (to && date > to) return false
      return true
    })
    .map((a) => a.id)
}

export const useGeneration = create<Store>((set, get) => ({
  // Sprint mode
  sprints: [],
  loadingSprints: false,
  sprintsError: null,
  statusFilter: 'open',
  selectedSprintId: null,
  sprintContent: null,
  loadingContent: false,
  contentError: null,

  // Custom mode
  mode: 'sprint',
  trackers: [],
  loadingTrackers: false,
  selectedTrackerId: null,
  trackerArtifacts: [],
  loadingTrackerArtifacts: false,
  selectedArtifactIds: [],
  customLabel: '',
  dateFrom: null,
  dateTo: null,

  // Generation
  generationStatus: 'idle',
  generationError: null,
  markdown: '',
  modelUsed: null,
  usage: null,
  slideWarnings: [],

  // Progress
  pipelineProgress: [],
  currentSlide: null,
  slidesDone: 0,
  slidesTotal: 0,
  currentProgressLabel: '',

  // Preview / Export
  previewHtml: null,
  previewError: null,
  exportStatus: 'idle',
  exportError: null,
  exportPath: null,

  setMode: (mode) => set({ mode }),

  loadSprints: async (status?: MilestoneStatus) => {
    const finalStatus = status ?? get().statusFilter
    set({ loadingSprints: true, sprintsError: null, statusFilter: finalStatus })
    try {
      const sprints = await api.generation.listSprints(finalStatus)
      set({ sprints, loadingSprints: false })
    } catch (err) {
      set({
        loadingSprints: false,
        sprintsError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  selectSprint: async (id: number | null) => {
    set({
      selectedSprintId: id,
      sprintContent: null,
      contentError: null,
      generationStatus: 'idle',
      generationError: null,
      markdown: '',
      previewHtml: null,
      exportStatus: 'idle',
      exportError: null,
      exportPath: null,
      slideWarnings: [],
      pipelineProgress: [],
      currentSlide: null,
      slidesDone: 0,
      slidesTotal: 0
    })
    if (id === null) return
    set({ loadingContent: true })
    try {
      const content = await api.generation.getSprintContent(id)
      set({ sprintContent: content, loadingContent: false })
    } catch (err) {
      set({
        loadingContent: false,
        contentError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  loadTrackers: async () => {
    set({ loadingTrackers: true })
    try {
      const trackers = await api.tuleap.listTrackers()
      set({ trackers, loadingTrackers: false })
    } catch (err) {
      set({ loadingTrackers: false })
      console.error('Failed to load trackers:', err)
    }
  },

  selectTracker: async (id: number | null) => {
    set({ selectedTrackerId: id, trackerArtifacts: [], loadingTrackerArtifacts: id !== null, selectedArtifactIds: [], dateFrom: null, dateTo: null })
    if (id === null) return
    try {
      const artifacts = await api.generation.listTrackerArtifacts(id)
      set({ trackerArtifacts: artifacts, loadingTrackerArtifacts: false })
    } catch (err) {
      set({ loadingTrackerArtifacts: false })
      console.error('Failed to load tracker artifacts:', err)
    }
  },

  toggleArtifact: (id: number) => {
    const current = get().selectedArtifactIds
    if (current.includes(id)) {
      set({ selectedArtifactIds: current.filter((x) => x !== id) })
    } else {
      set({ selectedArtifactIds: [...current, id] })
    }
  },

  clearArtifactSelection: () => set({ selectedArtifactIds: [] }),

  setCustomLabel: (label: string) => set({ customLabel: label }),

  setDateFrom: (date: string | null) => {
    const { dateTo, trackerArtifacts } = get()
    const from = date
    const to = dateTo
    const selected = autoSelectByDateRange(trackerArtifacts, from, to)
    set({ dateFrom: date, selectedArtifactIds: selected })
  },

  setDateTo: (date: string | null) => {
    const { dateFrom, trackerArtifacts } = get()
    const from = dateFrom
    const to = date
    const selected = autoSelectByDateRange(trackerArtifacts, from, to)
    set({ dateTo: date, selectedArtifactIds: selected })
  },

  generate: async (language = 'fr') => {
    const { mode, selectedSprintId, selectedArtifactIds, customLabel } = get()

    let source: GenerationSource | null = null
    if (mode === 'sprint') {
      if (selectedSprintId === null) return
      source = { mode: 'sprint', milestoneId: selectedSprintId }
    } else {
      if (selectedArtifactIds.length === 0) return
      source = { mode: 'custom', artifactIds: selectedArtifactIds, label: customLabel || 'Présentation' }
    }

    set({
      generationStatus: 'enriching',
      generationError: null,
      markdown: '',
      previewHtml: null,
      exportStatus: 'idle',
      exportError: null,
      exportPath: null,
      slideWarnings: [],
      pipelineProgress: [],
      currentSlide: null,
      slidesDone: 0,
      slidesTotal: 0,
      currentProgressLabel: 'Initialisation…'
    })

    const unsubscribe = api.generation.subscribeProgress((event) => {
      set((state) => {
        const next: Partial<Store> = {
          pipelineProgress: [...state.pipelineProgress, event],
          currentProgressLabel: progressLabel(event)
        }
        if (event.type === 'enriching') {
          next.generationStatus = 'enriching'
        } else if (event.type === 'summarizing') {
          next.generationStatus = 'summarizing'
        } else if (event.type === 'slide_start') {
          next.generationStatus = 'generating'
          next.currentSlide = event.slide
          next.slidesTotal = event.total
        } else if (event.type === 'slide_done') {
          next.slidesDone = event.index
        }
        return next
      })
    })

    try {
      const result = await api.generation.generateSprintReview({ source, language })
      unsubscribe()
      set({
        markdown: result.markdown,
        modelUsed: result.model,
        usage: result.usage,
        slideWarnings: result.slideWarnings ?? [],
        generationStatus: 'done',
        currentProgressLabel: 'Génération terminée'
      })
      await get().refreshPreview()
    } catch (err) {
      unsubscribe()
      set({
        generationStatus: 'error',
        generationError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  setMarkdown: (markdown: string) => {
    set({ markdown, exportStatus: 'idle', exportPath: null })
  },

  refreshPreview: async () => {
    const md = get().markdown
    if (!md.trim()) {
      set({ previewHtml: null, previewError: null })
      return
    }
    try {
      const { html } = await api.marp.renderPreview(md)
      set({ previewHtml: html, previewError: null })
    } catch (err) {
      set({
        previewHtml: null,
        previewError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  exportPptx: async () => {
    const { markdown, mode, sprints, selectedSprintId, customLabel } = get()
    if (!markdown.trim()) return
    set({ exportStatus: 'rendering', exportError: null, exportPath: null })
    const label =
      mode === 'sprint'
        ? (sprints.find((s) => s.id === selectedSprintId)?.label ?? 'sprint-review')
        : (customLabel || 'presentation')
    const safeName = `${label}-sprint-review.pptx`.replace(/[^A-Za-z0-9._-]+/g, '_')
    const result = await api.marp.exportPptx({ markdown, suggestedName: safeName })
    if (result.ok) {
      set({ exportStatus: 'success', exportPath: result.outputPath })
    } else if ('cancelled' in result && result.cancelled) {
      set({ exportStatus: 'cancelled' })
    } else if ('error' in result) {
      set({ exportStatus: 'error', exportError: result.error })
    }
  },

  reset: () =>
    set({
      selectedSprintId: null,
      sprintContent: null,
      generationStatus: 'idle',
      generationError: null,
      markdown: '',
      previewHtml: null,
      previewError: null,
      exportStatus: 'idle',
      exportError: null,
      exportPath: null,
      modelUsed: null,
      usage: null,
      slideWarnings: [],
      pipelineProgress: [],
      currentSlide: null,
      slidesDone: 0,
      slidesTotal: 0,
      currentProgressLabel: '',
      selectedArtifactIds: [],
      customLabel: '',
      selectedTrackerId: null,
      trackerArtifacts: [],
      dateFrom: null,
      dateTo: null
    })
}))
