import { describe, expect, test } from 'bun:test'
import {
  ACME_REQUEST_STEP_TOTAL,
  ACME_REQUEST_STEPS,
  acmeRequestStepLabel,
  acmeRequestStepProgress,
  advanceAcmeRequestPlan,
  createAcmeRequestPlan,
  currentAcmeRequestView,
  finishAcmeRequestPlan,
} from '../runtime/shared/utils/acmeIssueSteps'
import { formatJobProgress, jobProgressParts } from '../runtime/shared/utils/jobProgress'

describe('acmeIssueSteps', () => {
  test('defines five ACME request steps', () => {
    expect(ACME_REQUEST_STEP_TOTAL).toBe(5)
    expect(ACME_REQUEST_STEPS.VALIDATE_SAVE).toBe(5)
  })

  test('builds step progress payload', () => {
    expect(acmeRequestStepProgress(ACME_REQUEST_STEPS.TXT_ONLINE)).toEqual({
      index: 4,
      total: 5,
      label: 'TXT online',
    })
  })

  test('creates a pending request plan', () => {
    const plan = createAcmeRequestPlan()
    expect(plan).toHaveLength(5)
    expect(plan.every(item => item.status === 'pending')).toBe(true)
  })

  test('advances the plan through running and done states', () => {
    let plan = createAcmeRequestPlan()
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.DNS_PREFLIGHT)
    expect(plan[0]?.status).toBe('running')

    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.ACME_ORDER)
    expect(plan[0]?.status).toBe('done')
    expect(plan[1]?.status).toBe('running')

    plan = finishAcmeRequestPlan(plan)
    expect(plan[1]?.status).toBe('done')
  })

  test('appends extra challenge rounds after the base plan is consumed', () => {
    let plan = createAcmeRequestPlan()
    for (const step of [
      ACME_REQUEST_STEPS.DNS_PREFLIGHT,
      ACME_REQUEST_STEPS.ACME_ORDER,
      ACME_REQUEST_STEPS.PUBLISH_TXT,
      ACME_REQUEST_STEPS.TXT_ONLINE,
      ACME_REQUEST_STEPS.VALIDATE_SAVE,
    ]) {
      plan = advanceAcmeRequestPlan(plan, step)
    }
    plan = finishAcmeRequestPlan(plan)

    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.PUBLISH_TXT, 'Publish TXT *.oib.example.com')
    expect(plan).toHaveLength(6)
    expect(plan[5]?.label).toContain('oib')
    expect(plan[5]?.status).toBe('running')
  })

  test('derives current request view from the array', () => {
    let plan = createAcmeRequestPlan()
    plan = advanceAcmeRequestPlan(plan, ACME_REQUEST_STEPS.PUBLISH_TXT, 'Publish TXT example.com')
    expect(currentAcmeRequestView(plan)).toEqual({
      index: 3,
      total: 5,
      label: 'Publish TXT example.com',
      item: plan[2],
    })
  })

  test('labels each step', () => {
    expect(acmeRequestStepLabel(ACME_REQUEST_STEPS.DNS_PREFLIGHT)).toBe('DNS preflight')
    expect(acmeRequestStepLabel(ACME_REQUEST_STEPS.VALIDATE_SAVE)).toBe('LE validate')
  })
})

describe('formatJobProgress', () => {
  test('includes cert batch and ACME request steps from the array', () => {
    let requests = createAcmeRequestPlan()
    requests = advanceAcmeRequestPlan(requests, ACME_REQUEST_STEPS.PUBLISH_TXT, 'Publish TXT')

    expect(formatJobProgress({
      taskIndex: 2,
      taskTotal: 5,
      requests,
      currentCert: 'mdstn.com',
    })).toBe('2/5 · 3/5 Publish TXT · mdstn.com')
  })

  test('omits request progress when the array is empty', () => {
    expect(jobProgressParts({
      requests: [],
    })).toEqual({})
  })
})
