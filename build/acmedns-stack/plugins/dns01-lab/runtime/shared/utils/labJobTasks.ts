import type { CertJobTask } from '../../../../client/runtime/shared/types/certs'
import type { AcmeOrderToken } from '../../../../client/runtime/shared/utils/acmeIssueSteps'
import { v7 as uuid } from 'uuid'
import {
  advanceLabRequestPlan,
  applyLabOrderTokens,
  closeLabRequestPlan,
  createLabRequestPlan,
  finishLabRequestPlan,
  seedLabChallengePlan,
  sortLabRequestItems,
  LAB_REQUEST_STEPS,
} from './labIssueSteps'

export function createLabJobTaskPlan(
  certNames: string[],
  completed = new Set<string>(),
): CertJobTask[] {
  return certNames.map(certName => ({
    id: uuid(),
    certName,
    status: completed.has(certName) ? 'done' : 'pending',
  }))
}

function findTaskIndex(tasks: CertJobTask[], certName: string) {
  return tasks.findIndex(task => task.certName === certName)
}

export function startLabJobTask(tasks: CertJobTask[], certName: string): CertJobTask[] {
  const next = tasks.map(task => ({ ...task, requests: task.requests ? [...task.requests] : undefined }))

  const runningIdx = next.findIndex(task => task.status === 'running')
  if (runningIdx >= 0) {
    next[runningIdx] = { ...next[runningIdx]!, status: 'done' }
  }

  const idx = findTaskIndex(next, certName)
  if (idx < 0) {
    next.push({
      id: uuid(),
      certName,
      status: 'running',
      requests: createLabRequestPlan(),
    })
    return next
  }

  next[idx] = {
    ...next[idx]!,
    status: 'running',
    requests: createLabRequestPlan(),
  }
  return next
}

export function finishLabJobTask(
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
      ? (status === 'done' ? closeLabRequestPlan(task.requests) : finishLabRequestPlan(task.requests))
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

export function trackLabJobTaskRequest(
  tasks: CertJobTask[],
  certName: string,
  stepIndex: number,
  stepLabel?: string,
  seedAltNames?: string[],
  orderTokens?: AcmeOrderToken[],
): CertJobTask[] {
  const idx = findTaskIndex(tasks, certName)
  if (idx < 0) {
    return tasks
  }

  const next = tasks.map(task => ({ ...task }))
  const task = next[idx]!
  const base = task.requests?.length ? task.requests : createLabRequestPlan()
  let requests = base

  if (stepIndex === LAB_REQUEST_STEPS.ACME_ORDER && orderTokens?.length) {
    requests = advanceLabRequestPlan(requests, stepIndex, stepLabel)
    requests = applyLabOrderTokens(requests, certName, orderTokens)
  }
  else if (stepIndex === LAB_REQUEST_STEPS.ACME_ORDER) {
    requests = seedLabChallengePlan(requests, certName, seedAltNames)
    requests = advanceLabRequestPlan(requests, stepIndex, stepLabel)
    requests = sortLabRequestItems(requests, certName)
  }
  else {
    requests = advanceLabRequestPlan(requests, stepIndex, stepLabel)
    requests = sortLabRequestItems(requests, certName)
  }

  next[idx] = {
    ...task,
    requests,
  }
  return next
}

export function completeLabJobTaskRequests(tasks: CertJobTask[], certName: string): CertJobTask[] {
  const idx = findTaskIndex(tasks, certName)
  if (idx < 0 || !tasks[idx]?.requests?.length) {
    return tasks
  }

  const next = tasks.map(task => ({ ...task }))
  next[idx] = {
    ...next[idx]!,
    requests: closeLabRequestPlan(next[idx]!.requests!),
  }
  return next
}
