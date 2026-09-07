import type { AcmeRequestItem } from '../../../../client/runtime/shared/types/certs'
import { apexName, canonicalSans } from '../../../../client/runtime/shared/utils/domains'
import {
  formatAcmeOrderTokenLabel,
  isAcmeOrderTokenLabel,
  parseAcmeOrderTokenLabel,
  type AcmeOrderToken,
} from '../../../../client/runtime/shared/utils/acmeIssueSteps'

/** Fixed dns-01 request phases for the lab job requests array. */
export const LAB_REQUEST_STEP_TOTAL = 6

export const LAB_REQUEST_STEPS = {
  DNS_PREFLIGHT: 1,
  ACME_ORDER: 2,
  PUBLISH_TXT: 3,
  TXT_ONLINE: 4,
  DNS_SETTLE: 5,
  VALIDATE_SAVE: 6,
} as const

export function labRequestStepLabel(step: number): string {
  switch (step) {
    case LAB_REQUEST_STEPS.DNS_PREFLIGHT:
      return 'DNS preflight'
    case LAB_REQUEST_STEPS.ACME_ORDER:
      return 'FAKE ACME order'
    case LAB_REQUEST_STEPS.PUBLISH_TXT:
      return 'Publish TXT'
    case LAB_REQUEST_STEPS.TXT_ONLINE:
      return 'TXT online'
    case LAB_REQUEST_STEPS.DNS_SETTLE:
      return 'DNS settle'
    case LAB_REQUEST_STEPS.VALIDATE_SAVE:
      return 'FAKE LE validate'
    default:
      return 'Lab'
  }
}

export interface LabRequestStepProgress {
  index: number
  total: number
  label: string
  orderTokens?: AcmeOrderToken[]
}

function newLabRequestItem(
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

export function labRequestDomain(label: string): string | undefined {
  for (const prefix of [
    'Publish TXT ',
    'TXT online ',
    'DNS settle ',
    'LE validate ',
    'FAKE LE validate ',
  ]) {
    if (label.startsWith(prefix)) {
      const domain = label.slice(prefix.length).trim().replace(/\s*\([^)]*\)\s*$/, '').trim()
      return domain || undefined
    }
  }
  return undefined
}

function isChallengeStep(stepIndex: number) {
  return stepIndex >= LAB_REQUEST_STEPS.PUBLISH_TXT
}

function isLabOrderHeader(item: AcmeRequestItem) {
  return item.step === LAB_REQUEST_STEPS.ACME_ORDER && !isAcmeOrderTokenLabel(item.label)
}

const CHALLENGE_STEP_ORDER = [
  LAB_REQUEST_STEPS.PUBLISH_TXT,
  LAB_REQUEST_STEPS.TXT_ONLINE,
  LAB_REQUEST_STEPS.DNS_SETTLE,
  LAB_REQUEST_STEPS.VALIDATE_SAVE,
] as const

export function createLabRequestPlan(): AcmeRequestItem[] {
  return [
    LAB_REQUEST_STEPS.DNS_PREFLIGHT,
    LAB_REQUEST_STEPS.ACME_ORDER,
  ].map(step => newLabRequestItem(step, labRequestStepLabel(step), 'pending'))
}

export function seedLabChallengePlan(
  requests: AcmeRequestItem[],
  certName: string,
  altNames?: string[],
): AcmeRequestItem[] {
  const domains = altNames?.length ? canonicalSans(altNames) : [apexName(certName)]
  const next = requests.map(item => ({ ...item }))

  for (const domain of domains) {
    for (const step of CHALLENGE_STEP_ORDER) {
      const label = `${labRequestStepLabel(step)} ${domain}`
      const exists = next.some(item => item.label === label)
      if (exists) {
        continue
      }
      next.push(newLabRequestItem(step, label, 'pending'))
    }
  }

  return next
}

export function applyLabOrderTokens(
  requests: AcmeRequestItem[],
  certName: string,
  tokens: AcmeOrderToken[],
): AcmeRequestItem[] {
  let next = requests.map(item => ({ ...item }))

  const headerIdx = next.findIndex(isLabOrderHeader)
  if (headerIdx >= 0) {
    next[headerIdx] = { ...next[headerIdx]!, status: 'done' }
  }

  const ordered = canonicalSans(tokens.map(item => item.domain))
  const byDomain = new Map(tokens.map(item => [item.domain, item.token]))

  for (const domain of ordered) {
    const token = byDomain.get(domain)
    if (!token) {
      continue
    }
    const label = formatAcmeOrderTokenLabel(domain, token)
    if (next.some(item => item.label === label || (
      isAcmeOrderTokenLabel(item.label)
      && parseAcmeOrderTokenLabel(item.label)?.domain === domain
    ))) {
      continue
    }
    next.push(newLabRequestItem(LAB_REQUEST_STEPS.ACME_ORDER, label, 'done'))
  }

  next = seedLabChallengePlan(next, certName, ordered.length ? ordered : undefined)
  return sortLabRequestItems(next, certName)
}

export function advanceLabRequestPlan(
  requests: AcmeRequestItem[],
  stepIndex: number,
  stepLabel?: string,
): AcmeRequestItem[] {
  const label = stepLabel ?? labRequestStepLabel(stepIndex)
  const next = requests.map(item => ({ ...item }))
  const domain = labRequestDomain(label)

  const runningIdx = next.findIndex(item => item.status === 'running')
  if (runningIdx >= 0) {
    const running = next[runningIdx]!
    const runningDomain = labRequestDomain(running.label)
    if (
      running.step === stepIndex
      && (
        (!domain && !runningDomain)
        || (Boolean(domain) && domain === runningDomain)
      )
    ) {
      next[runningIdx] = { ...running, label }
      return next
    }
    next[runningIdx] = { ...running, status: 'done' }
  }

  if (isChallengeStep(stepIndex) && domain) {
    const pendingIdx = next.findIndex(
      item => item.step === stepIndex
        && labRequestDomain(item.label) === domain
        && item.status === 'pending',
    )
    if (pendingIdx >= 0) {
      next[pendingIdx] = { ...next[pendingIdx]!, label, status: 'running' }
      return next
    }

    next.push(newLabRequestItem(stepIndex, label, 'running'))
    return next
  }

  const pendingIdx = next.findIndex(
    item => item.step === stepIndex
      && item.status === 'pending'
      && (stepIndex !== LAB_REQUEST_STEPS.ACME_ORDER || !isAcmeOrderTokenLabel(item.label)),
  )
  if (pendingIdx >= 0) {
    next[pendingIdx] = { ...next[pendingIdx]!, label, status: 'running' }
    return next
  }

  next.push(newLabRequestItem(stepIndex, label, 'running'))
  return next
}

/** Mark any running lab step failed (abort / timeout / hard fail mid-plan). */
export function finishLabRequestPlan(requests: AcmeRequestItem[]): AcmeRequestItem[] {
  return requests.map((item) => {
    if (item.status === 'running') {
      return { ...item, status: 'failed' }
    }
    return { ...item }
  })
}

export function closeLabRequestPlan(requests: AcmeRequestItem[]): AcmeRequestItem[] {
  return requests.map(item => ({
    ...item,
    status: item.status === 'failed' ? 'failed' : 'done',
  }))
}

export function sortLabRequestItems(
  requests: AcmeRequestItem[],
  certName: string,
): AcmeRequestItem[] {
  if (!requests.length) {
    return requests
  }

  const preOrder = requests.filter(item => item.step < LAB_REQUEST_STEPS.ACME_ORDER)
  const orderHeader = requests.filter(isLabOrderHeader)
  const tokenRows = requests.filter(
    item => item.step === LAB_REQUEST_STEPS.ACME_ORDER && isAcmeOrderTokenLabel(item.label),
  )
  const challenge = requests.filter(item => Boolean(labRequestDomain(item.label)))

  const tokenDomains = canonicalSans([
    ...new Set(
      tokenRows
        .map(item => parseAcmeOrderTokenLabel(item.label)?.domain)
        .filter(Boolean) as string[],
    ),
  ])
  const sortedTokens: AcmeRequestItem[] = []
  const usedTokens = new Set<string>()
  for (const domain of tokenDomains) {
    for (const item of tokenRows) {
      if (usedTokens.has(item.id)) {
        continue
      }
      if (parseAcmeOrderTokenLabel(item.label)?.domain === domain) {
        sortedTokens.push(item)
        usedTokens.add(item.id)
      }
    }
  }
  for (const item of tokenRows) {
    if (!usedTokens.has(item.id)) {
      sortedTokens.push(item)
    }
  }

  const domains = canonicalSans([
    ...new Set([
      ...tokenDomains,
      ...challenge.map(item => labRequestDomain(item.label)).filter(Boolean) as string[],
    ]),
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
        if (item.step === step && labRequestDomain(item.label) === domain) {
          grouped.push(item)
          used.add(item.id)
        }
      }
    }
  }

  const orphans = challenge.filter(item => !used.has(item.id))
  return [...preOrder, ...orderHeader, ...sortedTokens, ...grouped, ...orphans]
}
