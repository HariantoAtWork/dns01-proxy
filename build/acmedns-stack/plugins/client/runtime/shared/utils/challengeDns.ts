import type { ClientStorageMap } from '#shared/types/clientstorage'
import type { DomainsDnsCheck, ParsedDomainsLine } from '#shared/types/certs'
import { fulldomainForAccount } from './fulldomain'
import {
  tinyApexFulldomain,
  type SharedModeContext,
} from './tinyModeDns'
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
  // Tiny mode: apex → `_encoded-apex_.authZone`; nested still chains to `_acme-challenge.<apex>`.
  if (sharedAuthZone) {
    if (zone === lineApex) {
      return stripTrailingDot(fulldomain)
    }

    const keyApex = apexName(storageKey)
    if (storageKey === lineApex || keyApex === lineApex) {
      return challengeHost(lineApex)
    }

    return stripTrailingDot(fulldomain)
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
        const fulldomain = tinyApexFulldomain(lineApex, shared.authZone)
        seen.set(name, {
          line: line.line,
          zone,
          name,
          expected: expectedChallengeTarget(
            lineApex,
            zone,
            lineApex,
            fulldomain,
            shared.authZone,
          ),
          status: 'pending',
          accountKey: lineApex,
          serverUrl: shared.serverUrl.replace(/\/$/, ''),
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

      const fulldomain = fulldomainForAccount(
        account.subdomain,
        account.server_url,
        account.fulldomain,
      )

      seen.set(name, {
        line: line.line,
        zone,
        name,
        expected: expectedChallengeTarget(lineApex, zone, key, fulldomain),
        status: 'pending',
        accountKey: key,
        serverUrl: account.server_url.replace(/\/$/, ''),
      })
    }
  }

  return [...seen.values()]
}
