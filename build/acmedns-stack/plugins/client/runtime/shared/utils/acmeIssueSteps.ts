/** Fixed ACME dns-01 request phases shown in the job queue (1/5 … 5/5). */
export const ACME_REQUEST_STEP_TOTAL = 5

export const ACME_REQUEST_STEPS = {
  DNS_PREFLIGHT: 1,
  ACME_ORDER: 2,
  PUBLISH_TXT: 3,
  TXT_ONLINE: 4,
  VALIDATE_SAVE: 5,
} as const

export type AcmeRequestStep = typeof ACME_REQUEST_STEPS[keyof typeof ACME_REQUEST_STEPS]

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
