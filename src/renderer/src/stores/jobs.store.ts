import { create } from 'zustand'
import type { BackgroundJob, JobStreamEvent } from '@shared/types'
import { api } from '@renderer/lib/api'

type Store = {
  jobs: BackgroundJob[]
  init: () => () => void
  cancelJob: (jobId: string) => void
  dismissJob: (jobId: string) => void
}

function handleEvent(jobs: BackgroundJob[], event: JobStreamEvent): BackgroundJob[] {
  switch (event.type) {
    case 'queued':
      return [event.job, ...jobs]
    case 'status':
      return jobs.map((j) =>
        j.id === event.jobId ? { ...j, status: event.status } : j
      )
    case 'progress':
      return jobs.map((j) =>
        j.id === event.jobId
          ? { ...j, progress: { current: event.current, total: event.total }, currentFile: event.currentFile }
          : j
      )
    case 'done':
      return jobs.map((j) =>
        j.id === event.jobId
          ? { ...j, status: 'done', prId: event.prId, prUrl: event.prUrl, branchCreated: event.branchCreated }
          : j
      )
    case 'error':
      return jobs.map((j) =>
        j.id === event.jobId ? { ...j, status: 'error', error: event.error } : j
      )
    case 'cancelled':
      return jobs.map((j) =>
        j.id === event.jobId ? { ...j, status: 'cancelled' } : j
      )
    default:
      return jobs
  }
}

export const useJobs = create<Store>((set) => ({
  jobs: [],

  init(): () => void {
    return api.gitExplorer.subscribe((event) => {
      set((state) => ({ jobs: handleEvent(state.jobs, event) }))
    })
  },

  cancelJob(jobId: string): void {
    void api.gitExplorer.cancelJob(jobId)
  },

  dismissJob(jobId: string): void {
    set((state) => ({ jobs: state.jobs.filter((j) => j.id !== jobId) }))
  }
}))
