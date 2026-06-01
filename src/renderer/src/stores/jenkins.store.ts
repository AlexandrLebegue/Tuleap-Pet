import { create } from 'zustand'
import { api } from '@renderer/lib/api'
import type {
  JenkinsBuildDetail,
  JenkinsBuildSummary,
  JenkinsConnectionTestResult,
  JenkinsDiscoveredJob,
  JenkinsFailureAnalysis,
  JenkinsJob,
  JenkinsNode,
  JenkinsQueueItem,
  JenkinsTtmExportProgress,
  JenkinsTtmExportResult
} from '@shared/types'

type ConnectionStatus = 'unknown' | 'testing' | 'ok' | 'error'

type Store = {
  connectionStatus: ConnectionStatus
  connectionResult: JenkinsConnectionTestResult | null

  jobs: JenkinsJob[]
  loadingJobs: boolean
  jobsError: string | null
  currentFolder: string | null
  folderStack: string[]

  selectedJobName: string | null
  buildHistory: JenkinsBuildSummary[]
  loadingHistory: boolean
  historyError: string | null

  buildDetail: JenkinsBuildDetail | null
  loadingDetail: boolean
  detailError: string | null

  investigation: JenkinsFailureAnalysis | null
  investigating: boolean
  investigationError: string | null

  queue: JenkinsQueueItem[]
  loadingQueue: boolean
  queueError: string | null

  nodes: JenkinsNode[]
  loadingNodes: boolean
  nodesError: string | null
  nodesPermission: boolean

  testConnection: () => Promise<void>
  loadJobs: (folder?: string) => Promise<void>
  enterFolder: (folderName: string) => Promise<void>
  exitFolder: () => Promise<void>
  selectJob: (name: string) => Promise<void>
  clearSelectedJob: () => void
  openBuildDetail: (jobName: string, buildNumber: number) => Promise<void>
  closeBuildDetail: () => void
  investigateFailure: (jobName: string, buildNumber: number) => Promise<void>
  clearInvestigation: () => void
  loadQueue: () => Promise<void>
  loadNodes: () => Promise<void>

  ttmExporting: boolean
  ttmProgress: JenkinsTtmExportProgress | null
  ttmResult: JenkinsTtmExportResult | null
  ttmError: string | null
  exportToTtm: (args: { jobName: string; buildNumber: number; branchName: string; buildUrl: string }) => Promise<void>
  clearTtmExport: () => void

  discovered: JenkinsDiscoveredJob[]
  discovering: boolean
  discoverError: string | null
  discoverAll: (folder?: string) => Promise<void>
  clearDiscovered: () => void
}

export const useJenkins = create<Store>((set, get) => ({
  connectionStatus: 'unknown',
  connectionResult: null,

  jobs: [],
  loadingJobs: false,
  jobsError: null,
  currentFolder: null,
  folderStack: [],

  selectedJobName: null,
  buildHistory: [],
  loadingHistory: false,
  historyError: null,

  buildDetail: null,
  loadingDetail: false,
  detailError: null,

  investigation: null,
  investigating: false,
  investigationError: null,

  queue: [],
  loadingQueue: false,
  queueError: null,

  nodes: [],
  loadingNodes: false,
  nodesError: null,
  nodesPermission: true,

  ttmExporting: false,
  ttmProgress: null,
  ttmResult: null,
  ttmError: null,

  discovered: [],
  discovering: false,
  discoverError: null,

  testConnection: async () => {
    set({ connectionStatus: 'testing' })
    try {
      const result = await api.jenkins.testConnection()
      set({ connectionResult: result, connectionStatus: result.ok ? 'ok' : 'error' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        connectionStatus: 'error',
        connectionResult: { ok: false, error: message, kind: 'unknown' }
      })
    }
  },

  loadJobs: async (folder?: string) => {
    set({ loadingJobs: true, jobsError: null })
    try {
      const jobs = await api.jenkins.listJobs(folder ? { folder } : undefined)
      set({ jobs, loadingJobs: false })
    } catch (err) {
      set({
        loadingJobs: false,
        jobsError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  enterFolder: async (folderName: string) => {
    const { folderStack } = get()
    set({ folderStack: [...folderStack, folderName], currentFolder: folderName })
    await get().loadJobs(folderName)
  },

  exitFolder: async () => {
    const { folderStack } = get()
    const newStack = folderStack.slice(0, -1)
    const parent = newStack[newStack.length - 1] ?? null
    set({ folderStack: newStack, currentFolder: parent })
    await get().loadJobs(parent ?? undefined)
  },

  selectJob: async (name: string) => {
    set({
      selectedJobName: name,
      buildHistory: [],
      loadingHistory: true,
      historyError: null,
      buildDetail: null
    })
    try {
      const history = await api.jenkins.getBuildHistory({ jobName: name, limit: 25 })
      set({ buildHistory: history, loadingHistory: false })
    } catch (err) {
      set({
        loadingHistory: false,
        historyError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  clearSelectedJob: () => {
    set({ selectedJobName: null, buildHistory: [], buildDetail: null, historyError: null })
  },

  openBuildDetail: async (jobName: string, buildNumber: number) => {
    set({ loadingDetail: true, detailError: null, buildDetail: null, investigation: null })
    try {
      const detail = await api.jenkins.getBuildDetail({ jobName, buildNumber })
      set({ buildDetail: detail, loadingDetail: false })
    } catch (err) {
      set({
        loadingDetail: false,
        detailError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  closeBuildDetail: () => {
    set({ buildDetail: null, detailError: null, investigation: null })
  },

  investigateFailure: async (jobName: string, buildNumber: number) => {
    set({ investigating: true, investigationError: null, investigation: null })
    try {
      const result = await api.jenkins.investigateFailure({ jobName, buildNumber })
      if ('ok' in result && result.ok === false) {
        set({ investigating: false, investigationError: result.error })
      } else {
        set({ investigating: false, investigation: result as JenkinsFailureAnalysis })
      }
    } catch (err) {
      set({
        investigating: false,
        investigationError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  clearInvestigation: () => {
    set({ investigation: null, investigationError: null })
  },

  loadQueue: async () => {
    set({ loadingQueue: true, queueError: null })
    try {
      const queue = await api.jenkins.getQueue()
      set({ queue, loadingQueue: false })
    } catch (err) {
      set({
        loadingQueue: false,
        queueError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  loadNodes: async () => {
    set({ loadingNodes: true, nodesError: null, nodesPermission: true })
    try {
      const nodes = await api.jenkins.getNodes()
      set({ nodes, loadingNodes: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const isPermission = message.includes('403') || message.includes('auth')
      set({
        loadingNodes: false,
        nodesError: isPermission ? null : message,
        nodesPermission: !isPermission
      })
    }
  },

  exportToTtm: async (args) => {
    set({ ttmExporting: true, ttmProgress: null, ttmResult: null, ttmError: null })
    const unsub = api.jenkinsTtm.subscribeProgress((event) => {
      set({ ttmProgress: event })
    })
    try {
      const result = await api.jenkinsTtm.export(args)
      if (result.ok) {
        set({ ttmExporting: false, ttmResult: result })
      } else {
        set({ ttmExporting: false, ttmError: result.error })
      }
    } catch (err) {
      set({
        ttmExporting: false,
        ttmError: err instanceof Error ? err.message : String(err)
      })
    } finally {
      unsub()
    }
  },

  clearTtmExport: () => {
    set({ ttmExporting: false, ttmProgress: null, ttmResult: null, ttmError: null })
  },

  discoverAll: async (folder?: string) => {
    set({ discovering: true, discoverError: null, discovered: [] })
    try {
      const result = await api.jenkins.discoverJobs(folder ? { folder } : undefined)
      if (result.ok) {
        set({ discovering: false, discovered: result.jobs })
      } else {
        set({ discovering: false, discoverError: result.error })
      }
    } catch (err) {
      set({
        discovering: false,
        discoverError: err instanceof Error ? err.message : String(err)
      })
    }
  },

  clearDiscovered: () => {
    set({ discovered: [], discoverError: null })
  }
}))
