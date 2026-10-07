import { collectChallengeChecks } from '#shared/utils/challengeDns'
import type { DomainsDnsCheck, ParsedDomainsLine } from '#shared/types/certs'
import type { CnameMatchOptions } from '#shared/utils/dnsMatch'
import { tinyPreflightAcceptZones } from '#shared/utils/tinyModeDns'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import { dnsQueryCnameAnyMatch, dnsQueryCnameAuthoritativeMatch } from './dnsQuery'
import { readStorage } from './storage'

export type DomainsDnsCheckMode = 'ui' | 'preflight'

function tinyCnameMatchOptions(authZone: string): CnameMatchOptions {
  return {
    acceptUnderZones: tinyPreflightAcceptZones(authZone),
    // `_mdstn-com_.auth.other-tiny` when expected is `_mdstn-com_.auth.local`
    acceptSameTinyLabel: true,
  }
}

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
  const tinyOptions = shared ? tinyCnameMatchOptions(shared.authZone) : undefined

  const queried = await Promise.all(toQuery.map(async (check) => {
    const result = options?.mode === 'preflight'
      ? await dnsQueryCnameAuthoritativeMatch(check.name, check.expected, tinyOptions)
      : await dnsQueryCnameAnyMatch(check.name, check.expected, tinyOptions)
    return {
      ...check,
      actual: result.actual,
      status: result.status,
      message: result.message,
    } satisfies DomainsDnsCheck
  }))

  return [...noAccount, ...queried]
}
