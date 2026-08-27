import type { CertRateLimit, DomainsDnsCheck, ParsedDomainsLine } from '#shared/types/certs'
import { checkDomainsDns } from '../domainsDnsCheck'

export function rateLimitSkipMessage(limit: CertRateLimit) {
  const when = new Date(limit.until).toLocaleString()
  return `Skipped — Let's Encrypt rate limited until ${when}`
}

export function formatDnsPreflightFailure(checks: DomainsDnsCheck[]): string {
  const bad = checks.filter(check => check.status !== 'ok')
  if (!bad.length) {
    return 'DNS preflight failed'
  }
  const parts = bad.map((check) => {
    if (check.status === 'no_account') {
      return check.message || `no acme-dns account for ${check.zone}`
    }
    if (check.status === 'mismatch') {
      const found = check.actual ? ` found ${check.actual}` : ''
      return `${check.name} mismatch (expected ${check.expected}${found})`
    }
    if (check.status === 'missing') {
      return `${check.name} missing (expected ${check.expected})`
    }
    if (check.message) {
      return `${check.name} ${check.status}: ${check.message}`
    }
    return `${check.name} ${check.status}`
  })
  return `DNS preflight failed: ${parts.join('; ')}`
}

export async function dnsPreflightForLine(line: ParsedDomainsLine): Promise<{
  ok: boolean
  message: string
  checks: DomainsDnsCheck[]
}> {
  const checks = await checkDomainsDns([line])
  const failed = checks.filter(check => check.status !== 'ok')
  if (!failed.length) {
    return { ok: true, message: '', checks }
  }
  return { ok: false, message: formatDnsPreflightFailure(checks), checks }
}
