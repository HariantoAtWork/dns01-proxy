import type { AcmeRequestItem, CertJobTask } from '#shared/types/certs'
import { currentAcmeRequestLabel } from './acmeIssueSteps'
import { runningCertJobTask } from './certJobTasks'

export interface JobProgressParts {
  task?: string
  requestLabel?: string
  cert?: string
}

export function jobProgressParts(job: {
  taskIndex?: number
  taskTotal?: number
  tasks?: CertJobTask[]
  currentCert?: string
}): JobProgressParts {
  const parts: JobProgressParts = {}
  if (job.taskTotal) {
    parts.task = `${job.taskIndex ?? 0}/${job.taskTotal}`
  }

  const label = currentAcmeRequestLabel(runningCertJobTask(job.tasks)?.requests)
  if (label) {
    parts.requestLabel = label
  }

  if (job.currentCert) {
    parts.cert = job.currentCert
  }
  return parts
}

export function formatJobProgress(job: {
  taskIndex?: number
  taskTotal?: number
  tasks?: CertJobTask[]
  currentCert?: string
}) {
  const { task, cert, requestLabel } = jobProgressParts(job)
  const segments: string[] = []
  if (task) {
    segments.push(task)
  }
  if (requestLabel) {
    segments.push(requestLabel)
  }
  if (cert) {
    segments.push(cert)
  }
  return segments.join(' · ')
}

export function acmeRequestStatusLabel(status: AcmeRequestItem['status']) {
  switch (status) {
    case 'done':
      return 'Done'
    case 'running':
      return 'Running'
    case 'failed':
      return 'Failed'
    default:
      return 'Pending'
  }
}

export function certJobTaskStatusLabel(status: CertJobTask['status']) {
  switch (status) {
    case 'skipped':
      return 'Skipped'
    case 'done':
      return 'Done'
    case 'running':
      return 'Running'
    case 'failed':
      return 'Failed'
    default:
      return 'Pending'
  }
}
