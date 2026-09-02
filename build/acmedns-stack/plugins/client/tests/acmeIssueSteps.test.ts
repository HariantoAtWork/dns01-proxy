import { describe, expect, test } from 'bun:test'
import {
  ACME_REQUEST_STEP_TOTAL,
  ACME_REQUEST_STEPS,
  acmeRequestStepLabel,
  acmeRequestStepProgress,
  advanceAcmeRequestPlan,
  createAcmeRequestPlan,
  currentAcmeRequestLabel,
  currentAcmeRequestProgress,
  finishAcmeRequestPlan,
  seedAcmeChallengePlan,
  sortAcmeRequestItems,
} from '../runtime/shared/utils/acmeIssueSteps'
import { formatJobProgress, jobProgressParts } from '../runtime/shared/utils/jobProgress'

describe('acmeIssueSteps', () => {
  test('defines six ACME request steps', () => {
    expect(ACME_REQUEST_STEP_TOTAL).toBe(6)
    expect(ACME_REQUEST_STEPS.DNS_SETTLE).toBe(5)
    expect(ACME_REQUEST_STEPS.VALIDATE_SAVE).toBe(6)
  })

  test('builds step progress payload', () => {
    expect(acmeRequestStepProgress(ACME_REQUEST_STEPS.TXT_ONLINE)).toEqual({
      index: 4,
      total: 6,
      label: 'TXT online',
    })
  })

  test('creates a pending request plan with stable ids', () => {
    const plan = createAcmeRequestPlan()
    expect(plan).toHaveLength(2)
    expect(plan.every(item => item.status === 'pending')).toBe(true)
    expect(new Set(plan.map(item => item.id)).size).toBe(2)
  })

  test('seeds pending challenge steps for the cert apex after ACME order', () => {
    let plan = createAcmeRequestPlan()
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.DNS_PREFLIGHT)
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.ACME_ORDER)
    plan = seedAcmeChallengePlan(plan, 'sylo.space')

    expect(plan.map(item => item.label)).toEqual([
      'DNS preflight',
      'ACME order',
      'Publish TXT sylo.space',
      'TXT online sylo.space',
      'DNS settle sylo.space',
      'LE validate sylo.space',
    ])
    expect(plan.slice(2).every(item => item.status === 'pending')).toBe(true)
  })

  test('advances the plan through running and done states', () => {
    let plan = createAcmeRequestPlan()
    const firstId = plan[0]!.id
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.DNS_PREFLIGHT)
    expect(plan[0]?.id).toBe(firstId)
    expect(plan[0]?.status).toBe('running')

    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.ACME_ORDER)
    expect(plan[0]?.status).toBe('done')
    expect(plan[1]?.status).toBe('running')

    plan = finishAcmeRequestPlan(plan)
    expect(plan[1]?.status).toBe('done')
  })

  test('appends per-domain challenge rounds', () => {
    let plan = createAcmeRequestPlan()
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.DNS_PREFLIGHT)
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.ACME_ORDER)
    plan = finishAcmeRequestPlan(plan)

    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.PUBLISH_TXT, 'Publish TXT admin.mdstn.com')
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.TXT_ONLINE, 'TXT online mdstn.com')
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.PUBLISH_TXT, 'Publish TXT mdstn.com')
    plan = finishAcmeRequestPlan(plan)

    expect(plan).toHaveLength(5)
    expect(plan.filter(item => item.step === ACME_REQUEST_STEPS.PUBLISH_TXT)).toHaveLength(2)
  })

  test('sorts challenge steps apex-first with publish then TXT online per domain', () => {
    const requests = [
      { id: '1', step: ACME_REQUEST_STEPS.DNS_PREFLIGHT, label: 'DNS preflight', status: 'done' as const },
      { id: '2', step: ACME_REQUEST_STEPS.ACME_ORDER, label: 'ACME order', status: 'done' as const },
      { id: '3', step: ACME_REQUEST_STEPS.PUBLISH_TXT, label: 'Publish TXT admin.mdstn.com', status: 'done' as const },
      { id: '4', step: ACME_REQUEST_STEPS.TXT_ONLINE, label: 'TXT online mdstn.com', status: 'done' as const },
      { id: '5', step: ACME_REQUEST_STEPS.VALIDATE_SAVE, label: 'LE validate oib.mdstn.com', status: 'done' as const },
      { id: '6', step: ACME_REQUEST_STEPS.PUBLISH_TXT, label: 'Publish TXT mdstn.com', status: 'done' as const },
      { id: '7', step: ACME_REQUEST_STEPS.PUBLISH_TXT, label: 'Publish TXT oib.mdstn.com', status: 'done' as const },
      { id: '8', step: ACME_REQUEST_STEPS.TXT_ONLINE, label: 'TXT online admin.mdstn.com', status: 'done' as const },
      { id: '9', step: ACME_REQUEST_STEPS.TXT_ONLINE, label: 'TXT online oib.mdstn.com', status: 'done' as const },
      { id: '10', step: ACME_REQUEST_STEPS.VALIDATE_SAVE, label: 'Save certificate', status: 'done' as const },
    ]

    const sorted = sortAcmeRequestItems(requests, 'mdstn.com')
    expect(sorted.map(item => item.label)).toEqual([
      'DNS preflight',
      'ACME order',
      'Publish TXT mdstn.com',
      'TXT online mdstn.com',
      'Publish TXT admin.mdstn.com',
      'TXT online admin.mdstn.com',
      'Publish TXT oib.mdstn.com',
      'TXT online oib.mdstn.com',
      'LE validate oib.mdstn.com',
      'Save certificate',
    ])
  })

  test('sorts DNS settle between TXT online and LE validate per domain', () => {
    const requests = [
      { id: '1', step: ACME_REQUEST_STEPS.DNS_PREFLIGHT, label: 'DNS preflight', status: 'done' as const },
      { id: '2', step: ACME_REQUEST_STEPS.ACME_ORDER, label: 'ACME order', status: 'done' as const },
      { id: '3', step: ACME_REQUEST_STEPS.VALIDATE_SAVE, label: 'LE validate mdstn.com', status: 'done' as const },
      { id: '4', step: ACME_REQUEST_STEPS.TXT_ONLINE, label: 'TXT online mdstn.com', status: 'done' as const },
      { id: '5', step: ACME_REQUEST_STEPS.DNS_SETTLE, label: 'DNS settle mdstn.com', status: 'done' as const },
      { id: '6', step: ACME_REQUEST_STEPS.PUBLISH_TXT, label: 'Publish TXT mdstn.com', status: 'done' as const },
    ]

    const sorted = sortAcmeRequestItems(requests, 'mdstn.com')
    expect(sorted.map(item => item.label)).toEqual([
      'DNS preflight',
      'ACME order',
      'Publish TXT mdstn.com',
      'TXT online mdstn.com',
      'DNS settle mdstn.com',
      'LE validate mdstn.com',
    ])
  })

  test('derives current request label from the array', () => {
    let plan = createAcmeRequestPlan()
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.PUBLISH_TXT, 'Publish TXT example.com')
    expect(currentAcmeRequestLabel(plan)).toBe('Publish TXT example.com')
  })

  test('derives current request progress from the array', () => {
    let plan = createAcmeRequestPlan()
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.DNS_PREFLIGHT)
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.ACME_ORDER)
    plan = seedAcmeChallengePlan(plan, 'sylo.space')
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.PUBLISH_TXT, 'Publish TXT sylo.space')
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.TXT_ONLINE, 'TXT online sylo.space')
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.DNS_SETTLE, 'DNS settle sylo.space')

    expect(currentAcmeRequestProgress(plan)).toEqual({
      index: 5,
      total: 6,
      label: 'DNS settle',
    })
  })

  test('labels each step', () => {
    expect(acmeRequestStepLabel(ACME_REQUEST_STEPS.DNS_PREFLIGHT)).toBe('DNS preflight')
    expect(acmeRequestStepLabel(ACME_REQUEST_STEPS.DNS_SETTLE)).toBe('DNS settle')
    expect(acmeRequestStepLabel(ACME_REQUEST_STEPS.VALIDATE_SAVE)).toBe('LE validate')
  })
})

describe('formatJobProgress', () => {
  test('includes cert batch and ACME request steps from nested tasks', () => {
    let requests = createAcmeRequestPlan()
    requests = advanceAcmeRequestPlan(requests, ACME_REQUEST_STEPS.PUBLISH_TXT, 'Publish TXT')

    expect(formatJobProgress({
      taskIndex: 2,
      taskTotal: 6,
      tasks: [{
        id: 'task-1',
        certName: 'mdstn.com',
        status: 'running',
        requests,
      }],
      currentCert: 'mdstn.com',
    })).toBe('2/6 · 3/3 · Publish TXT · mdstn.com')
  })

  test('omits request progress when no running task has requests', () => {
    expect(jobProgressParts({
      tasks: [],
    })).toEqual({})
  })
})
