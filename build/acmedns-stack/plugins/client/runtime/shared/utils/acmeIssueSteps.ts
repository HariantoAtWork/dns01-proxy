import type { AcmeRequestItem } from '#shared/types/certs'

/** Fixed ACME dns-01 request phases for the running job requests array. */
export const ACME_REQUEST_STEP_TOTAL = 5

export const ACME_REQUEST_STEPS = {
  DNS_PREFLIGHT: 1,
  ACME_ORDER: 2,
  PUBLISH_TXT: 3,
  TXT_ONLINE: 4,
  VALIDATE_SAVE: 5,
} as const

export type AcmeRequestStep = typeof ACME_REQUEST_STEPS[keyof typeof ACME_REQUEST_STEPS]

export type AcmeRequestStatus = AcmeRequestItem['status']

export function acmeRequestStepLabel(step: number): string {
  switch (step) {
    case ACME_REQUEST_STEPS.DNS_PREFLIGHT:
      return 'DNS preflight'
    case ACME_REQUEST_STEPS.ACME_ORDER:
      return 'ACME order'
    case ACME_REQUEST_STEPS.PUBLISH_TXT:
      return 'Publish TXT'
    case ACME_REQUEST_STEPS.TXT_ONLINE:
      return 'TXT online'
    case ACME_REQUEST_STEPS.VALIDATE_SAVE:
      return 'LE validate'
    default:
      return 'ACME'
  }
}

export interface AcmeRequestStepProgress {
  index: number
  total: number
  label: string
}

export function acmeRequestStepProgress(step: number, label?: string): AcmeRequestStepProgress {
  return {
    index: step,
    total: ACME_REQUEST_STEP_TOTAL,
    label: label ?? acmeRequestStepLabel(step),
  }
}

function newAcmeRequestItem(
  step: number,
  label: string,
  status: AcmeRequestItem['status'],
): AcmeRequestItem {
  return {
    id: crypto.randomUUID(),
    step,
    label,
    status,
  }
}

export function createAcmeRequestPlan(): AcmeRequestItem[] {
  return [
    ACME_REQUEST_STEPS.DNS_PREFLIGHT,
    ACME_REQUEST_STEPS.ACME_ORDER,
    ACME_REQUEST_STEPS.PUBLISH_TXT,
    ACME_REQUEST_STEPS.TXT_ONLINE,
    ACME_REQUEST_STEPS.VALIDATE_SAVE,
  ].map(step => newAcmeRequestItem(step, acmeRequestStepLabel(step), 'pending'))
}

export function advanceAcmeRequestPlan(
  requests: AcmeRequestItem[],
  stepIndex: number,
  stepLabel?: string,
): AcmeRequestItem[] {
  const label = stepLabel ?? acmeRequestStepLabel(stepIndex)
  const next = requests.map(item => ({ ...item }))

  const runningIdx = next.findIndex(item => item.status === 'running')
  if (runningIdx >= 0) {
    next[runningIdx] = { ...next[runningIdx]!, status: 'done' }
  }

  const pendingIdx = next.findIndex(item => item.step === stepIndex && item.status === 'pending')
  if (pendingIdx >= 0) {
    next[pendingIdx] = { ...next[pendingIdx]!, label, status: 'running' }
    return next
  }

  next.push(newAcmeRequestItem(stepIndex, label, 'running'))
  return next
}

export function finishAcmeRequestPlan(requests: AcmeRequestItem[]): AcmeRequestItem[] {
  return requests.map((item) => {
    if (item.status === 'running') {
      return { ...item, status: 'done' }
    }
    return { ...item }
  })
}

export function currentAcmeRequestLabel(requests: AcmeRequestItem[] | undefined): string | undefined {
  if (!requests?.length) {
    return undefined
  }

  const running = requests.find(item => item.status === 'running')
  if (running) {
    return running.label
  }

  const done = requests.filter(item => item.status === 'done')
  if (done.length > 0) {
    return done[done.length - 1]!.label
  }

  return undefined
}
