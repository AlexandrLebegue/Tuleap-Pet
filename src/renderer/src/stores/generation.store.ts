import { create } from 'zustand'
import type { MilestoneStatus, MilestoneSummary, SprintContent } from '@shared/types'
import { api } from '@renderer/lib/api'

type GenerationStatus = 'idle' | 'fetching' | 'generating' | 'done' | 'error'
type ExportStatus = 'idle' | 'rendering' | 'success' | 'cancelled' | 'error'

type Store = {
  sprints: MilestoneSummary[]
  loadingSprints: boolean
  sprintsError: string | null
  statusFilter: MilestoneStatus

  selectedSprintId: number | null
  sprintContent: SprintContent | null
  loadingContent: boolean
  contentError: string | null

  generationStatus: GenerationStatus
  generationError: string | null
  markdown: string
  modelUsed: string | null
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null

  previewHtml: string | null
  previewError: string | null

  exportStatus: ExportStatus
  exportError: string | null
  exportPath: string | null

  loadSprints: (status?: MilestoneStatus) => Promise<void>
  selectSprint: (id: number | null) => Promise<void>
  generate: (language?: 'fr' | 'en') => Promise<void>
  setMarkdown: (markdown: string) => void
  refreshPreview: () => Promise<void>
  exportPptx: () => Promise<void>
  reset: () => void
}

export const useGeneration = create<Store>((set, get) => ({
  sprints: [],
  loadingSprints: false,
  sprintsError: null,
  statusFilter: 'open',

  selectedSprintId: null,
  sprintContent: null,
  loadingContent: false,
  contentError: null,

  generationStatus: 'idle',
  generationError: null,
  markdown: '',
  modelUsed: null,
  usage: null,

  previewHtml: null,
  previewError: null,

  exportStatus: 'idle',
  exportError: null,
  exportPath: null,

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
      exportPath: null
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

  generate: async (language = 'fr') => {
    const id = get().selectedSprintId
    if (id === null) return
    set({
      generationStatus: 'generating',
      generationError: null,
      markdown: '',
      previewHtml: null,
      exportStatus: 'idle',
      exportError: null,
      exportPath: null
    })
    try {
      const result = await api.generation.generateSprintReview({ milestoneId: id, language })
      set({
        markdown: result.markdown,
        modelUsed: result.model,
        usage: result.usage,
        generationStatus: 'done'
      })
      await get().refreshPreview()
    } catch (err) {
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
    const md = get().markdown
    const sprint = get().sprints.find((s) => s.id === get().selectedSprintId)
    if (!md.trim() || !sprint) return
    set({ exportStatus: 'rendering', exportError: null, exportPath: null })
    const safeName = `${sprint.label}-sprint-review.pptx`.replace(/[^A-Za-z0-9._-]+/g, '_')
    const result = await api.marp.exportPptx({ markdown: md, suggestedName: safeName })
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
      usage: null
    })
}))
