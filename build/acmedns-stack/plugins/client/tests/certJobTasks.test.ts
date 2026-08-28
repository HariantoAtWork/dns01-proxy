import { describe, expect, test } from 'bun:test'
import { ACME_REQUEST_STEPS } from '../runtime/shared/utils/acmeIssueSteps'
import {
  completeCertJobTaskRequests,
  createCertJobTaskPlan,
  finishCertJobTask,
  runningCertJobTask,
  startCertJobTask,
  trackCertJobTaskRequest,
} from '../runtime/shared/utils/certJobTasks'

describe('certJobTasks', () => {
  test('createCertJobTaskPlan marks completed certs as done', () => {
    const tasks = createCertJobTaskPlan(['a.test', 'b.test'], new Set(['a.test']))
    expect(tasks).toHaveLength(2)
    expect(tasks[0]?.status).toBe('done')
    expect(tasks[1]?.status).toBe('pending')
  })

  test('startCertJobTask marks one cert running with ACME request plan', () => {
    const tasks = createCertJobTaskPlan(['a.test', 'b.test'])
    const next = startCertJobTask(tasks, 'b.test')

    expect(runningCertJobTask(next)?.certName).toBe('b.test')
    expect(runningCertJobTask(next)?.requests).toHaveLength(5)
  })

  test('trackCertJobTaskRequest advances nested ACME steps on the active task', () => {
    let tasks = createCertJobTaskPlan(['a.test'])
    tasks = startCertJobTask(tasks, 'a.test')
    tasks = trackCertJobTaskRequest(
      tasks,
      'a.test',
      ACME_REQUEST_STEPS.PUBLISH_TXT,
      'Publish TXT',
    )

    const running = runningCertJobTask(tasks)
    expect(running?.requests?.find(item => item.step === ACME_REQUEST_STEPS.PUBLISH_TXT)?.status)
      .toBe('running')
  })

  test('finishCertJobTask completes nested requests', () => {
    let tasks = createCertJobTaskPlan(['a.test'])
    tasks = startCertJobTask(tasks, 'a.test')
    tasks = trackCertJobTaskRequest(tasks, 'a.test', ACME_REQUEST_STEPS.DNS_PREFLIGHT)
    tasks = finishCertJobTask(tasks, 'a.test', 'done')

    expect(tasks[0]?.status).toBe('done')
    expect(tasks[0]?.requests?.every(item => item.status === 'done')).toBe(true)
  })

  test('completeCertJobTaskRequests marks all request steps done', () => {
    let tasks = createCertJobTaskPlan(['a.test'])
    tasks = startCertJobTask(tasks, 'a.test')
    tasks = trackCertJobTaskRequest(tasks, 'a.test', ACME_REQUEST_STEPS.LE_VALIDATE)
    tasks = completeCertJobTaskRequests(tasks, 'a.test')

    expect(tasks[0]?.requests?.every(item => item.status === 'done')).toBe(true)
  })
})
