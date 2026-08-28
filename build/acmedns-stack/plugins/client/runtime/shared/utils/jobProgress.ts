export interface JobProgressParts {
  task?: string
  request?: string
  cert?: string
  requestLabel?: string
}

export function jobProgressParts(job: {
  taskIndex?: number
  taskTotal?: number
  requestIndex?: number
  requestTotal?: number
  requestLabel?: string
  currentCert?: string
}): JobProgressParts {
  const parts: JobProgressParts = {}
  if (job.taskTotal) {
    parts.task = `${job.taskIndex ?? 0}/${job.taskTotal}`
  }
  if (job.requestTotal && job.requestIndex) {
    parts.request = `${job.requestIndex}/${job.requestTotal}`
    parts.requestLabel = job.requestLabel
  }
  if (job.currentCert) {
    parts.cert = job.currentCert
  }
  return parts
}

export function formatJobProgress(job: {
  taskIndex?: number
  taskTotal?: number
  requestIndex?: number
  requestTotal?: number
  requestLabel?: string
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
