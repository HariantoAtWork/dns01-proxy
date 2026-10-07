import type { CertActivityEntry, DomainsDnsCheck } from '#shared/types/certs'

type ToastApi = {
  ok: (message: string, title?: string) => void
  info: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
}

export function notifyDnsCheckResult(toasts: ToastApi, dnsChecks: DomainsDnsCheck[] | undefined) {
  const dnsIssues = dnsChecks?.filter(check => check.status !== 'ok') ?? []
  if (dnsChecks?.length && dnsIssues.length === 0) {
    toasts.ok('All _acme-challenge CNAMEs look good', 'DNS')
  }
  else if (dnsIssues.length) {
    toasts.info(
      `${dnsIssues.length} _acme-challenge CNAME(s) need attention`,
      'DNS',
    )
  }
}

export function notifyNewActivity(toasts: ToastApi, entries: CertActivityEntry[]) {
  for (const entry of entries) {
    if (entry.source === 'acme' && entry.level !== 'error') {
      continue
    }
    if (entry.level === 'error') {
      toasts.error(entry.certName ? `${entry.certName}: ${entry.message}` : entry.message, 'Certificate')
    }
    else if (entry.certName && ['Renewed', 'Issued', 'Re-issued (SAN change)'].includes(entry.message)) {
      toasts.ok(`${entry.certName}: ${entry.message}`, 'Certificate')
    }
    else if (entry.source === 'renew' && entry.message.startsWith('Check complete')) {
      toasts.info(entry.message, 'Renewal')
    }
  }
}
