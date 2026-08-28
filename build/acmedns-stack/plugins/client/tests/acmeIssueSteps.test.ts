import { describe, expect, test } from 'bun:test'
import {
  ACME_REQUEST_STEP_TOTAL,
  ACME_REQUEST_STEPS,
  acmeRequestStepLabel,
  acmeRequestStepProgress,
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

  test('labels each step', () => {
    expect(acmeRequestStepLabel(ACME_REQUEST_STEPS.DNS_PREFLIGHT)).toBe('DNS preflight')
    expect(acmeRequestStepLabel(ACME_REQUEST_STEPS.VALIDATE_SAVE)).toBe('LE validate')
  })
})

describe('formatJobProgress', () => {
  test('includes cert batch and ACME request steps', () => {
    expect(formatJobProgress({
      taskIndex: 2,
      taskTotal: 5,
      requestIndex: 3,
      requestTotal: 5,
      requestLabel: 'Publish TXT',
      currentCert: 'mdstn.com',
    })).toBe('2/5 · 3/5 Publish TXT · mdstn.com')
  })

  test('omits missing parts', () => {
    expect(jobProgressParts({
      requestIndex: 1,
      requestTotal: 5,
      requestLabel: 'DNS preflight',
    })).toEqual({
      request: '1/5',
      requestLabel: 'DNS preflight',
    })
  })
})
