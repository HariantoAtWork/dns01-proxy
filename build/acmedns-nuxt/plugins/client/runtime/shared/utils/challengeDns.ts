import type { ClientStorageMap } from '#shared/types/clientstorage'
import type { DomainsDnsCheck, ParsedDomainsLine } from '#shared/types/certs'
import type { SharedModeContext } from '#shared/utils/sharedMode'
import {
  apexName,
  challengeZones,
  findAccount,
} from './domains'

export const CHALLENGE_LABEL = '_acme-challenge'

export function challengeHost(zone: string) {
  return `${CHALLENGE_LABEL}.${zone.trim()}`
}

function stripTrailingDot(value: string) {
  return value.replace(/\.$/, '')
}

/** Expected CNAME target for a challenge zone on a domains.txt line. */
export function expectedChallengeTarget(
  lineApex: string,
  zone: string,
  storageKey: string,
  fulldomain: string,
  sharedAuthZone?: string,
): string {
  if (sharedAuthZone) {
    if (zone === lineApex) {
      return stripTrailingDot(sharedAuthZone)
    }

    const keyApex = apexName(storageKey)
    if (storageKey === lineApex || keyApex === lineApex) {
      return challengeHost(lineApex)
    }

    return stripTrailingDot(sharedAuthZone)
  }

  if (zone === lineApex) {
    return stripTrailingDot(fulldomain)
  }

  const keyApex = apexName(storageKey)
  if (storageKey === lineApex || keyApex === lineApex) {
    return challengeHost(lineApex)
  }

  return stripTrailingDot(fulldomain)
}

export function collectChallengeChecks(
  lines: ParsedDomainsLine[],
  storage: ClientStorageMap,
  shared?: SharedModeContext | null,
): DomainsDnsCheck[] {
  const seen = new Map<string, DomainsDnsCheck>()

  for (const line of lines) {
    const lineApex = line.certName
    const zones = challengeZones(line.expanded)

    for (const zone of zones) {
      const name = challengeHost(zone)
      if (seen.has(name)) {
        continue
      }

      const sample = line.expanded.find(entry => apexName(entry) === zone) ?? zone

      if (shared) {
        seen.set(name, {
          line: line.line,
          zone,
          name,
          expected: expectedChallengeTarget(
            lineApex,
            zone,
            lineApex,
            shared.account.fulldomain,
            shared.authZone,
          ),
          status: 'pending',
          accountKey: lineApex,
        })
        continue
      }

      const { key, account } = findAccount(storage, sample)

      if (!account || !key) {
        seen.set(name, {
          line: line.line,
          zone,
          name,
          expected: '',
          status: 'no_account',
          message: `No acme-dns account for ${zone}`,
        })
        continue
      }

      seen.set(name, {
        line: line.line,
        zone,
        name,
        expected: expectedChallengeTarget(lineApex, zone, key, account.fulldomain),
        status: 'pending',
        accountKey: key,
      })
    }
  }

  return [...seen.values()]
}
