import type { AcmeRequestItem, CertJobTask } from '#shared/types/certs'
import { currentAcmeRequestProgress } from './acmeIssueSteps'
import { runningCertJobTask } from './certJobTasks'

export interface JobProgressParts {
  task?: string
  request?: string
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

  const requestProgress = currentAcmeRequestProgress(runningCertJobTask(job.tasks)?.requests)
  if (requestProgress) {
    parts.request = `${requestProgress.index}/${requestProgress.total}`
    parts.requestLabel = requestProgress.label
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
  const { task, request, cert, requestLabel } = jobProgressParts(job)
  const segments: string[] = []
  if (task) {
    segments.push(task)
  }
  if (request) {
    segments.push(request)
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

export function acmeRequestStatusClass(status: AcmeRequestItem['status']) {
  switch (status) {
    case 'done':
      return 'text-live'
    case 'running':
      return 'text-live font-semibold'
    case 'failed':
      return 'text-danger'
    default:
      return 'text-muted'
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

export function certJobTaskStatusClass(status: CertJobTask['status']) {
  switch (status) {
    case 'done':
      return 'text-live'
    case 'running':
      return 'text-live font-semibold'
    case 'failed':
      return 'text-danger'
    case 'skipped':
      return 'text-muted'
    default:
      return 'text-muted'
  }
}
