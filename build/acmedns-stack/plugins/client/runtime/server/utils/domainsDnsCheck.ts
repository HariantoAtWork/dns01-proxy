import { collectChallengeChecks } from '#shared/utils/challengeDns'
import type { DomainsDnsCheck, ParsedDomainsLine } from '#shared/types/certs'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { dnsQueryCnameAnyMatch, dnsQueryCnameAuthoritativeMatch } from './dnsQuery'
import { readStorage } from './storage'

export type DomainsDnsCheckMode = 'ui' | 'preflight'

export async function checkDomainsDns(
  lines: ParsedDomainsLine[],
  options?: { mode?: DomainsDnsCheckMode },
): Promise<DomainsDnsCheck[]> {
  if (!lines.length) {
    return []
  }

  const storage = await readStorage()
  const shared = getSharedModeContext()
  const expected = collectChallengeChecks(lines, storage, shared)

  const noAccount = expected.filter(check => check.status === 'no_account')
  const toQuery = expected.filter(check => check.status !== 'no_account')
  const query = options?.mode === 'preflight'
    ? dnsQueryCnameAuthoritativeMatch
    : dnsQueryCnameAnyMatch

  const queried = await Promise.all(toQuery.map(async (check) => {
    const result = await query(check.name, check.expected)
    return {
      ...check,
      actual: result.actual,
      status: result.status,
      message: result.message,
    } satisfies DomainsDnsCheck
  }))

  return [...noAccount, ...queried]
}
