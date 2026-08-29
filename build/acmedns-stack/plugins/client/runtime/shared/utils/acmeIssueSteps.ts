import type { AcmeRequestItem } from '#shared/types/certs'
import { apexName, canonicalSans } from './domains'

/** Fixed ACME dns-01 request phases for the running job requests array. */
export const ACME_REQUEST_STEP_TOTAL = 6

export const ACME_REQUEST_STEPS = {
  DNS_PREFLIGHT: 1,
  ACME_ORDER: 2,
  PUBLISH_TXT: 3,
  TXT_ONLINE: 4,
  DNS_SETTLE: 5,
  VALIDATE_SAVE: 6,
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
    case ACME_REQUEST_STEPS.DNS_SETTLE:
      return 'DNS settle'
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

export function acmeRequestDomain(label: string): string | undefined {
  for (const prefix of ['Publish TXT ', 'TXT online ', 'DNS settle ', 'LE validate ']) {
    if (label.startsWith(prefix)) {
      const domain = label.slice(prefix.length).trim()
      return domain || undefined
    }
  }
  return undefined
}

function isChallengeStep(stepIndex: number) {
  return stepIndex >= ACME_REQUEST_STEPS.PUBLISH_TXT
}

const CHALLENGE_STEP_ORDER = [
  ACME_REQUEST_STEPS.PUBLISH_TXT,
  ACME_REQUEST_STEPS.TXT_ONLINE,
  ACME_REQUEST_STEPS.DNS_SETTLE,
  ACME_REQUEST_STEPS.VALIDATE_SAVE,
] as const

export function createAcmeRequestPlan(): AcmeRequestItem[] {
  return [
    ACME_REQUEST_STEPS.DNS_PREFLIGHT,
    ACME_REQUEST_STEPS.ACME_ORDER,
  ].map(step => newAcmeRequestItem(step, acmeRequestStepLabel(step), 'pending'))
}

/** Pending dns-01 steps for the cert apex so the task list shows the full pipeline early. */
export function seedAcmeChallengePlan(
  requests: AcmeRequestItem[],
  certName: string,
): AcmeRequestItem[] {
  const domain = apexName(certName)
  const next = requests.map(item => ({ ...item }))

  for (const step of CHALLENGE_STEP_ORDER) {
    const label = `${acmeRequestStepLabel(step)} ${domain}`
    const exists = next.some(item => item.label === label)
    if (exists) {
      continue
    }
    next.push(newAcmeRequestItem(step, label, 'pending'))
  }

  return next
}

export function advanceAcmeRequestPlan(
  requests: AcmeRequestItem[],
  stepIndex: number,
  stepLabel?: string,
): AcmeRequestItem[] {
  const label = stepLabel ?? acmeRequestStepLabel(stepIndex)
  const next = requests.map(item => ({ ...item }))
  const domain = acmeRequestDomain(label)

  const runningIdx = next.findIndex(item => item.status === 'running')
  if (runningIdx >= 0) {
    next[runningIdx] = { ...next[runningIdx]!, status: 'done' }
  }

  if (isChallengeStep(stepIndex) && domain) {
    const pendingIdx = next.findIndex(
      item => item.step === stepIndex
        && acmeRequestDomain(item.label) === domain
        && item.status === 'pending',
    )
    if (pendingIdx >= 0) {
      next[pendingIdx] = { ...next[pendingIdx]!, label, status: 'running' }
      return next
    }

    next.push(newAcmeRequestItem(stepIndex, label, 'running'))
    return next
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

/** Mark every non-failed ACME step done (batch or cert finished). */
export function closeAcmeRequestPlan(requests: AcmeRequestItem[]): AcmeRequestItem[] {
  return requests.map(item => ({
    ...item,
    status: item.status === 'failed' ? 'failed' : 'done',
  }))
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

/** Group dns-01 steps by domain — apex first, then each SAN publish → TXT online → LE validate. */
export function sortAcmeRequestItems(
  requests: AcmeRequestItem[],
  certName: string,
): AcmeRequestItem[] {
  if (!requests.length) {
    return requests
  }

  const preamble = requests.filter(item => item.step <= ACME_REQUEST_STEPS.ACME_ORDER)
  const epilogue = requests.filter(
    item => item.step === ACME_REQUEST_STEPS.VALIDATE_SAVE && !acmeRequestDomain(item.label),
  )
  const challenge = requests.filter(item => Boolean(acmeRequestDomain(item.label)))

  const domains = canonicalSans([
    ...new Set(challenge.map(item => acmeRequestDomain(item.label)).filter(Boolean) as string[]),
  ])
  if (!domains.length) {
    domains.push(apexName(certName))
  }

  const grouped: AcmeRequestItem[] = []
  const used = new Set<string>()

  for (const domain of domains) {
    for (const step of CHALLENGE_STEP_ORDER) {
      for (const item of challenge) {
        if (used.has(item.id)) {
          continue
        }
        if (item.step === step && acmeRequestDomain(item.label) === domain) {
          grouped.push(item)
          used.add(item.id)
        }
      }
    }
  }

  const orphans = challenge.filter(item => !used.has(item.id))
  return [...preamble, ...grouped, ...orphans, ...epilogue]
}
