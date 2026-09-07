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

/** dns-01 TXT value (key authorization digest) for one order authorization. */
export interface AcmeOrderToken {
  domain: string
  token: string
}

const ORDER_TOKEN_SEP = ' → '

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
  orderTokens?: AcmeOrderToken[]
}

export function acmeRequestStepProgress(
  step: number,
  label?: string,
  orderTokens?: AcmeOrderToken[],
): AcmeRequestStepProgress {
  return {
    index: step,
    total: ACME_REQUEST_STEP_TOTAL,
    label: label ?? acmeRequestStepLabel(step),
    ...(orderTokens?.length ? { orderTokens } : {}),
  }
}

export function formatAcmeOrderTokenLabel(domain: string, token: string): string {
  return `${domain}${ORDER_TOKEN_SEP}${token}`
}

export function isAcmeOrderTokenLabel(label: string): boolean {
  return label.includes(ORDER_TOKEN_SEP)
}

export function parseAcmeOrderTokenLabel(label: string): AcmeOrderToken | undefined {
  const idx = label.indexOf(ORDER_TOKEN_SEP)
  if (idx <= 0) {
    return undefined
  }
  const domain = label.slice(0, idx).trim()
  const token = label.slice(idx + ORDER_TOKEN_SEP.length).trim()
  if (!domain || !token) {
    return undefined
  }
  return { domain, token }
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
      const domain = label.slice(prefix.length).trim().replace(/\s*\([^)]*\)\s*$/, '').trim()
      return domain || undefined
    }
  }
  return undefined
}

function isChallengeStep(stepIndex: number) {
  return stepIndex >= ACME_REQUEST_STEPS.PUBLISH_TXT
}

function isAcmeOrderHeader(item: AcmeRequestItem) {
  return item.step === ACME_REQUEST_STEPS.ACME_ORDER && !isAcmeOrderTokenLabel(item.label)
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

/** Pending dns-01 steps per domain so the task list shows every token round after ACME order. */
export function seedAcmeChallengePlan(
  requests: AcmeRequestItem[],
  certName: string,
  domains?: string[],
): AcmeRequestItem[] {
  const list = domains?.length ? canonicalSans(domains) : [apexName(certName)]
  const next = requests.map(item => ({ ...item }))

  for (const domain of list) {
    for (const step of CHALLENGE_STEP_ORDER) {
      const label = `${acmeRequestStepLabel(step)} ${domain}`
      const exists = next.some(item => item.label === label)
      if (exists) {
        continue
      }
      next.push(newAcmeRequestItem(step, label, 'pending'))
    }
  }

  return next
}

/** After Let's Encrypt returns authorizations: list domain → TXT token rows, then seed Publish TXT… */
export function applyAcmeOrderTokens(
  requests: AcmeRequestItem[],
  certName: string,
  tokens: AcmeOrderToken[],
): AcmeRequestItem[] {
  let next = requests.map(item => ({ ...item }))

  const headerIdx = next.findIndex(isAcmeOrderHeader)
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
    next.push(newAcmeRequestItem(ACME_REQUEST_STEPS.ACME_ORDER, label, 'done'))
  }

  next = seedAcmeChallengePlan(next, certName, ordered.length ? ordered : undefined)
  return sortAcmeRequestItems(next, certName)
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
    const running = next[runningIdx]!
    const runningDomain = acmeRequestDomain(running.label)
    // Same step (e.g. DNS settle countdown ticks) — refresh label in place.
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

  const pendingIdx = next.findIndex(
    item => item.step === stepIndex
      && item.status === 'pending'
      && (stepIndex !== ACME_REQUEST_STEPS.ACME_ORDER || !isAcmeOrderTokenLabel(item.label)),
  )
  if (pendingIdx >= 0) {
    next[pendingIdx] = { ...next[pendingIdx]!, label, status: 'running' }
    return next
  }

  next.push(newAcmeRequestItem(stepIndex, label, 'running'))
  return next
}

/** Mark any running ACME step failed (abort / timeout / hard fail mid-plan). */
export function finishAcmeRequestPlan(requests: AcmeRequestItem[]): AcmeRequestItem[] {
  return requests.map((item) => {
    if (item.status === 'running') {
      return { ...item, status: 'failed' }
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

export interface AcmeRequestProgress {
  index: number
  total: number
  label: string
}

/** 1-based position in the running cert's ACME request plan plus the short step label. */
export function currentAcmeRequestProgress(
  requests: AcmeRequestItem[] | undefined,
): AcmeRequestProgress | undefined {
  if (!requests?.length) {
    return undefined
  }

  const total = requests.length
  const runningIdx = requests.findIndex(item => item.status === 'running')
  if (runningIdx >= 0) {
    const running = requests[runningIdx]!
    if (isAcmeOrderTokenLabel(running.label)) {
      const parsed = parseAcmeOrderTokenLabel(running.label)
      return {
        index: runningIdx + 1,
        total,
        label: parsed ? `token ${parsed.domain}` : 'token',
      }
    }
    const detail = running.label.match(/\(([^)]+)\)$/)?.[1]
    const base = acmeRequestStepLabel(running.step)
    return {
      index: runningIdx + 1,
      total,
      label: detail ? `${base} ${detail}` : base,
    }
  }

  const done = requests.filter(item => item.status === 'done')
  if (done.length > 0) {
    const lastDone = done[done.length - 1]!
    const lastIdx = requests.findIndex(item => item.id === lastDone.id)
    return {
      index: lastIdx + 1,
      total,
      label: isAcmeOrderTokenLabel(lastDone.label)
        ? 'ACME order'
        : acmeRequestStepLabel(lastDone.step),
    }
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

  const preOrder = requests.filter(item => item.step < ACME_REQUEST_STEPS.ACME_ORDER)
  const orderHeader = requests.filter(isAcmeOrderHeader)
  const tokenRows = requests.filter(
    item => item.step === ACME_REQUEST_STEPS.ACME_ORDER && isAcmeOrderTokenLabel(item.label),
  )
  const epilogue = requests.filter(
    item => item.step === ACME_REQUEST_STEPS.VALIDATE_SAVE && !acmeRequestDomain(item.label),
  )
  const challenge = requests.filter(item => Boolean(acmeRequestDomain(item.label)))

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
      ...challenge.map(item => acmeRequestDomain(item.label)).filter(Boolean) as string[],
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
        if (item.step === step && acmeRequestDomain(item.label) === domain) {
          grouped.push(item)
          used.add(item.id)
        }
      }
    }
  }

  const orphans = challenge.filter(item => !used.has(item.id))
  return [...preOrder, ...orderHeader, ...sortedTokens, ...grouped, ...orphans, ...epilogue]
}
