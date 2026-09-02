import { describe, expect, test } from 'bun:test'
import {
  LAB_REQUEST_STEPS,
  createLabRequestPlan,
  labRequestStepLabel,
  seedLabChallengePlan,
} from '../runtime/shared/utils/labIssueSteps'

describe('labIssueSteps', () => {
  test('uses FAKE labels for ACME order and LE validate', () => {
    expect(labRequestStepLabel(LAB_REQUEST_STEPS.ACME_ORDER)).toBe('FAKE ACME order')
    expect(labRequestStepLabel(LAB_REQUEST_STEPS.VALIDATE_SAVE)).toBe('FAKE LE validate')
    expect(labRequestStepLabel(LAB_REQUEST_STEPS.PUBLISH_TXT)).toBe('Publish TXT')
  })

  test('seeds challenge steps for each SAN after fake ACME order', () => {
    let plan = createLabRequestPlan()
    plan = seedLabChallengePlan(plan, 'mdstn.com', ['mdstn.com', 'www.mdstn.com'])
    expect(plan.map(item => item.label)).toEqual([
      'DNS preflight',
      'FAKE ACME order',
      'Publish TXT mdstn.com',
      'TXT online mdstn.com',
      'DNS settle mdstn.com',
      'FAKE LE validate mdstn.com',
      'Publish TXT www.mdstn.com',
      'TXT online www.mdstn.com',
      'DNS settle www.mdstn.com',
      'FAKE LE validate www.mdstn.com',
    ])
  })
})
