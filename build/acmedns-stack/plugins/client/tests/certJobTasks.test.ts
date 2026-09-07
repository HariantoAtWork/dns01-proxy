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
    expect(runningCertJobTask(next)?.requests).toHaveLength(2)
  })

  test('trackCertJobTaskRequest advances nested ACME steps on the active task', () => {
    let tasks = createCertJobTaskPlan(['a.test'])
    tasks = startCertJobTask(tasks, 'a.test')
    tasks = trackCertJobTaskRequest(
      tasks,
      'a.test',
      ACME_REQUEST_STEPS.PUBLISH_TXT,
      'Publish TXT a.test',
    )

    const running = runningCertJobTask(tasks)
    expect(running?.requests?.find(item => item.step === ACME_REQUEST_STEPS.PUBLISH_TXT)?.status)
      .toBe('running')
  })

  test('trackCertJobTaskRequest lists order tokens then pending Publish TXT rows', () => {
    let tasks = createCertJobTaskPlan(['mdstn.com'])
    tasks = startCertJobTask(tasks, 'mdstn.com')
    tasks = trackCertJobTaskRequest(
      tasks,
      'mdstn.com',
      ACME_REQUEST_STEPS.ACME_ORDER,
      'ACME order',
      [
        { domain: 'mdstn.com', token: 'tok-apex' },
        { domain: 'www.mdstn.com', token: 'tok-www' },
      ],
    )

    const labels = runningCertJobTask(tasks)?.requests?.map(item => item.label)
    expect(labels).toEqual([
      'DNS preflight',
      'ACME order',
      'mdstn.com → tok-apex',
      'www.mdstn.com → tok-www',
      'Publish TXT mdstn.com',
      'TXT online mdstn.com',
      'DNS settle mdstn.com',
      'LE validate mdstn.com',
      'Publish TXT www.mdstn.com',
      'TXT online www.mdstn.com',
      'DNS settle www.mdstn.com',
      'LE validate www.mdstn.com',
    ])
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
    tasks = trackCertJobTaskRequest(tasks, 'a.test', ACME_REQUEST_STEPS.VALIDATE_SAVE)
    tasks = completeCertJobTaskRequests(tasks, 'a.test')

    expect(tasks[0]?.requests?.every(item => item.status === 'done')).toBe(true)
  })
})
