import acme from 'acme-client'
import type { CertActivityLevel, LetsEncryptDirectoryMode } from '#shared/types/certs'
import { appendCertActivity } from './certActivity'

let context: { certName: string, mode: LetsEncryptDirectoryMode } | null = null
let installed = false

function classifyAcmeLevel(message: string): CertActivityLevel {
  const lower = message.toLowerCase()
  if (
    lower.includes('unable to')
    || lower.includes(' threw error')
    || lower.includes('returned error')
    || /^resp [45]\d\d/.test(lower)
  ) {
    return 'error'
  }
  if (lower.includes('skipping') || lower.includes('deactivating')) {
    return 'warn'
  }
  return 'info'
}

export function installAcmeLogger() {
  if (installed) {
    return
  }
  installed = true

  acme.setLogger((message: string) => {
    appendCertActivity({
      source: 'acme',
      level: classifyAcmeLevel(message),
      certName: context?.certName,
      message,
    })
  })
}

export async function withAcmeLogContext<T>(
  ctx: { certName: string, mode: LetsEncryptDirectoryMode },
  fn: () => Promise<T>,
): Promise<T> {
  installAcmeLogger()
  context = ctx
  try {
    return await fn()
  }
  finally {
    context = null
  }
}

export function logAcmeStep(
  certName: string,
  message: string,
  level: CertActivityLevel = 'info',
) {
  appendCertActivity({ source: 'acme', level, certName, message })
}
