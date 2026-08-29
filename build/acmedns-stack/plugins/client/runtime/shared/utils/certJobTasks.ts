import type { AcmeRequestItem, CertJobTask } from '#shared/types/certs'
import {
  advanceAcmeRequestPlan,
  closeAcmeRequestPlan,
  createAcmeRequestPlan,
  finishAcmeRequestPlan,
  seedAcmeChallengePlan,
  ACME_REQUEST_STEPS,
} from './acmeIssueSteps'

export function createCertJobTaskPlan(
  certNames: string[],
  completed = new Set<string>(),
): CertJobTask[] {
  return certNames.map(certName => ({
    id: crypto.randomUUID(),
    certName,
    status: completed.has(certName) ? 'done' : 'pending',
  }))
}

function findTaskIndex(tasks: CertJobTask[], certName: string) {
  return tasks.findIndex(task => task.certName === certName)
}

export function startCertJobTask(tasks: CertJobTask[], certName: string): CertJobTask[] {
  const next = tasks.map(task => ({ ...task, requests: task.requests ? [...task.requests] : undefined }))

  const runningIdx = next.findIndex(task => task.status === 'running')
  if (runningIdx >= 0) {
    next[runningIdx] = { ...next[runningIdx]!, status: 'done' }
  }

  const idx = findTaskIndex(next, certName)
  if (idx < 0) {
    next.push({
      id: crypto.randomUUID(),
      certName,
      status: 'running',
      requests: createAcmeRequestPlan(),
    })
    return next
  }

  next[idx] = {
    ...next[idx]!,
    status: 'running',
    requests: createAcmeRequestPlan(),
  }
  return next
}

export function finishCertJobTask(
  tasks: CertJobTask[],
  certName: string,
  status: CertJobTask['status'],
  message?: string,
): CertJobTask[] {
  const idx = findTaskIndex(tasks, certName)
  if (idx < 0) {
    return tasks
  }

  const next = tasks.map(task => ({
    ...task,
    requests: task.requests
      ? (status === 'done' ? closeAcmeRequestPlan(task.requests) : finishAcmeRequestPlan(task.requests))
      : undefined,
  }))

  next[idx] = {
    ...next[idx]!,
    status,
    message,
    requests: next[idx]!.requests,
  }
  return next
}

export function trackCertJobTaskRequest(
  tasks: CertJobTask[],
  certName: string,
  stepIndex: number,
  stepLabel?: string,
): CertJobTask[] {
  const idx = findTaskIndex(tasks, certName)
  if (idx < 0) {
    return tasks
  }

  const next = tasks.map(task => ({ ...task }))
  const task = next[idx]!
  const base = task.requests?.length ? task.requests : createAcmeRequestPlan()
  let requests = advanceAcmeRequestPlan(base, stepIndex, stepLabel)
  if (stepIndex === ACME_REQUEST_STEPS.ACME_ORDER) {
    requests = seedAcmeChallengePlan(requests, certName)
  }
  next[idx] = {
    ...task,
    requests,
  }
  return next
}

export function completeCertJobTaskRequests(tasks: CertJobTask[], certName: string): CertJobTask[] {
  const idx = findTaskIndex(tasks, certName)
  if (idx < 0 || !tasks[idx]?.requests?.length) {
    return tasks
  }

  const next = tasks.map(task => ({ ...task }))
  next[idx] = {
    ...next[idx]!,
    requests: closeAcmeRequestPlan(next[idx]!.requests!),
  }
  return next
}

export function runningCertJobTask(tasks: CertJobTask[] | undefined) {
  return tasks?.find(task => task.status === 'running')
}

export function certJobTaskProgress(tasks: CertJobTask[] | undefined) {
  if (!tasks?.length) {
    return undefined
  }
  const done = tasks.filter(task => task.status === 'done' || task.status === 'skipped').length
  const running = tasks.findIndex(task => task.status === 'running')
  const index = running >= 0 ? running + 1 : Math.min(done + 1, tasks.length)
  return { index, total: tasks.length }
}
