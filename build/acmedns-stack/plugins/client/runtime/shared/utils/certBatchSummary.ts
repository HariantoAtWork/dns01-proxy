import type { CertBatchSummary, CertBatchSummaryStatus, CertJobQueueItem, CertJobTask } from '#shared/types/certs'

export interface CertBatchSummaryStats {
  done: number
  failed: number
  skipped: number
  pending: number
  total: number
}

export function certBatchSummaryStats(tasks: CertJobTask[]): CertBatchSummaryStats {
  const done = tasks.filter(task => task.status === 'done').length
  const failed = tasks.filter(task => task.status === 'failed').length
  const skipped = tasks.filter(task => task.status === 'skipped').length
  const pending = tasks.filter(task => task.status === 'pending' || task.status === 'running').length
  return {
    done,
    failed,
    skipped,
    pending,
    total: tasks.length,
  }
}

export function resolveCertBatchSummaryStatus(
  snapshot: CertJobQueueItem,
  cancelled: boolean,
): CertBatchSummaryStatus {
  if (cancelled || snapshot.cancelRequested) {
    return 'cancelled'
  }
  if (snapshot.error || snapshot.tasks?.some(task => task.status === 'failed')) {
    return 'failed'
  }
  return 'completed'
}

export function certBatchSummaryHeadline(summary: CertBatchSummary) {
  const stats = certBatchSummaryStats(summary.tasks)
  const parts = [`${stats.done} ok`]
  if (stats.failed) {
    parts.push(`${stats.failed} failed`)
  }
  if (stats.skipped) {
    parts.push(`${stats.skipped} skipped`)
  }
  if (stats.pending) {
    parts.push(`${stats.pending} incomplete`)
  }
  return parts.join(' · ')
}

export function certBatchSummaryTitle(summary: CertBatchSummary) {
  const tree = summary.mode === 'staging' ? 'staging' : 'live'
  const job = `#${summary.jobId} ${tree}/${summary.source}`
  return `${job} · ${certBatchSummaryHeadline(summary)}`
}

export function certBatchSummaryStatusLabel(status: CertBatchSummaryStatus) {
  switch (status) {
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    default:
      return 'Cancelled'
  }
}

export function certBatchSummaryStatusClass(status: CertBatchSummaryStatus) {
  switch (status) {
    case 'completed':
      return 'text-signal'
    case 'failed':
      return 'text-danger'
    default:
      return 'text-muted'
  }
}

export function cloneCertJobQueueItem(job: CertJobQueueItem): CertJobQueueItem {
  return structuredClone(job)
}
