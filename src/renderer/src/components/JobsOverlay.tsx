import * as React from 'react'
import { useJobs } from '@renderer/stores/jobs.store'
import { JobToast } from './JobToast'

const MAX_VISIBLE = 6

export function JobsOverlay(): React.ReactElement | null {
  const { jobs, dismissJob, cancelJob } = useJobs()
  const visible = jobs.slice(0, MAX_VISIBLE)

  if (visible.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {visible.map((job) => (
        <JobToast
          key={job.id}
          job={job}
          onDismiss={() => dismissJob(job.id)}
          onCancel={() => cancelJob(job.id)}
        />
      ))}
    </div>
  )
}
