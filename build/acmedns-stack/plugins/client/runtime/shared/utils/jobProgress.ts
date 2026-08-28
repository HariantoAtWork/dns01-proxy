import type { AcmeRequestItem } from '#shared/types/certs'
import { currentAcmeRequestView } from './acmeIssueSteps'

export interface JobProgressParts {
  task?: string
  request?: string
  cert?: string
  requestLabel?: string
}

export function jobProgressParts(job: {
  taskIndex?: number
  taskTotal?: number
  requests?: AcmeRequestItem[]
  currentCert?: string
}): JobProgressParts {
  const parts: JobProgressParts = {}
  if (job.taskTotal) {
    parts.task = `${job.taskIndex ?? 0}/${job.taskTotal}`
  }

  const current = currentAcmeRequestView(job.requests)
  if (current) {
    parts.request = `${current.index}/${current.total}`
    parts.requestLabel = current.label
  }

  if (job.currentCert) {
    parts.cert = job.currentCert
  }
  return parts
}

export function formatJobProgress(job: {
  taskIndex?: number
  taskTotal?: number
  requests?: AcmeRequestItem[]
  currentCert?: string
}) {
  const { task, request, cert, requestLabel } = jobProgressParts(job)
  const segments: string[] = []
  if (task) {
    segments.push(task)
  }
  if (request) {
    segments.push(requestLabel ? `${request} ${requestLabel}` : request)
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
