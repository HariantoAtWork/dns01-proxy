import { collectChallengeChecks } from '#shared/utils/challengeDns'
import type { DomainsDnsCheck, ParsedDomainsLine } from '#shared/types/certs'
import { resolveAcmeDnsBase } from './acmedns'
import { dnsQueryCnameAnyMatch } from './dnsQuery'
import { readStorage } from './storage'

export async function checkDomainsDns(lines: ParsedDomainsLine[]): Promise<DomainsDnsCheck[]> {
  if (!lines.length) {
    return []
  }

  const storage = await readStorage()
  const preferUrl = resolveAcmeDnsBase()
  const expected = collectChallengeChecks(lines, storage, preferUrl)

  const noAccount = expected.filter(check => check.status === 'no_account')
  const toQuery = expected.filter(check => check.status !== 'no_account')

  const queried = await Promise.all(toQuery.map(async (check) => {
    const result = await dnsQueryCnameAnyMatch(check.name, check.expected)
    return {
      ...check,
      actual: result.actual,
      status: result.status,
      message: result.message,
    } satisfies DomainsDnsCheck
  }))

  return [...noAccount, ...queried]
}
