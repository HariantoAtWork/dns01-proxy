import type { ParsedDomainsLine } from '#shared/types/certs'
import { checkDomainsDns } from './domainsDnsCheck'

const LE_DNS_FAIL_RE = /DNS problem|NXDOMAIN looking up|SERVFAIL looking up|no valid (?:A|AAAA|TXT) records/i
const LE_LOOKUP_HOST_RE = /looking up (?:TXT|CNAME) for ([^\s]+)/i

export function isLetsEncryptDnsFailure(message: string): boolean {
  return LE_DNS_FAIL_RE.test(message)
}

/**
 * When Let's Encrypt reports NXDOMAIN / DNS problem but our multi-resolver
 * CNAME check already matches, clarify that this is usually LE lag — not a
 * missing record on our side.
 */
export async function enrichLetsEncryptDnsError(
  message: string,
  line: ParsedDomainsLine,
): Promise<string> {
  if (!isLetsEncryptDnsFailure(message)) {
    return message
  }

  try {
    const checks = await checkDomainsDns([line])
    const lookupHost = LE_LOOKUP_HOST_RE.exec(message)?.[1]
      ?.replace(/\.$/, '')
      .toLowerCase()

    const relevant = lookupHost
      ? checks.filter(check => check.name.toLowerCase() === lookupHost)
      : checks

    if (!relevant.length) {
      return message
    }

    const allOk = relevant.every(check => check.status === 'ok')
    if (!allOk) {
      return message
    }

    const names = relevant.map(check => check.name).join(', ')
    return `${message} — Our Recheck DNS already sees a matching CNAME for ${names}. Let's Encrypt has likely not picked it up yet; wait for propagation and retry.`
  }
  catch {
    return message
  }
}
