import { findAccount } from '#shared/utils/domains'
import { normaliseDnsName } from '#shared/utils/dnsMatch'
import { pickCnameTarget } from '#shared/utils/challengeTxtProbe'
import {
  mergeSharedPublishSubdomains,
  planTinyPublishSlots,
  tinyApexLabel,
  authZoneTxtLabel,
  type TinyPublishSlot,
} from '#shared/utils/tinyModeDns'
import {
  planAuthHopPublishSlot,
  resolveAuthHopEntryLabel,
} from '#shared/utils/authHopDns'
import { getSharedModeContext } from '../../../../../server/utils/sharedModeBootstrap'
import {
  clearAuthHop,
  isAuthHopEnabled,
  mintAuthHop,
} from '../../../../../server/utils/authHop'
import { isInProcessAcmeDnsPublish } from './acmednsRouting'
import { acmeTxtOnlineTcpFallback } from './challengeTxtOnline'
import { queryAuthoritative } from './dnsAuthoritative'
import { readStorage } from './storage'

const MAX_SHARED_CNAME_HOPS = 10

export interface Dns01PublishTarget {
  serverUrl: string
  username: string
  password: string
  /** Primary / first publish key (encoded Tiny label in shared mode). */
  subdomain: string
  /** All TXT store keys to write (encoded + live CNAME labels under auth zone). */
  subdomains: string[]
  /** Tiny: per-slot local vs remote HTTP /update destinations. */
  slots: TinyPublishSlot[]
  txt: string
  certName: string
  domain: string
  /** Clear dynamic auth-hop CNAME after LE validate (when enabled). */
  authHopCleanup?: () => void
  /** Auth-zone entry FQDN that CNAMEs to the hop (e.g. `_apex_.auth.zone`). */
  authHopEntryFqdn?: string
  /** Terminal hop FQDN holding TXT (e.g. `<uuid>.auth.zone`). */
  authHopFqdn?: string
}

/** Follow public CNAME hops from the challenge host; collect targets under auth zone. */
export async function collectChallengeCnameTargets(
  challengeName: string,
  authZone: string,
): Promise<string[]> {
  const targets: string[] = []
  const visited = new Set<string>()
  let current = normaliseDnsName(challengeName)
  const zone = normaliseDnsName(authZone)
  const transport = { tcpFallback: acmeTxtOnlineTcpFallback() }

  for (let hop = 0; hop < MAX_SHARED_CNAME_HOPS; hop += 1) {
    if (visited.has(current)) {
      break
    }
    visited.add(current)

    const cnameOutcomes = await queryAuthoritative(current, 'CNAME', transport)
    const next = pickCnameTarget(cnameOutcomes)
    if (!next) {
      break
    }
    targets.push(next)
    current = next
    // Stop once we land under this stack's auth zone — remote Tiny targets keep going until NODATA.
    if (current === zone || current.endsWith(`.${zone}`)) {
      break
    }
  }

  return targets
}

export function resolveDns01PublishTarget(options: {
  authzIdentifier: string
  keyAuthorization: string
  certName: string
  preferUrl: string
  shared: ReturnType<typeof getSharedModeContext>
  storage: Awaited<ReturnType<typeof readStorage>>
  /** Extra auth-zone CNAME targets (shared mode dual-publish). */
  cnameTargets?: string[]
}): Dns01PublishTarget {
  const domain = options.authzIdentifier
  const { key: storageKey, account } = options.shared
    ? { key: domain, account: options.shared.account }
    : findAccount(options.storage, domain)
  if (!account || (!options.shared && !storageKey)) {
    throw new Error(`No acme-dns account for ${domain}`)
  }

  const localServerUrl = account.server_url || options.preferUrl
  const slots = options.shared
    ? planTinyPublishSlots({
        certName: options.certName,
        localAuthZone: options.shared.authZone,
        localServerUrl,
        cnameTargets: options.cnameTargets ?? [],
      })
    : account.subdomain
      ? [{
          subdomain: account.subdomain,
          serverUrl: localServerUrl,
          local: isInProcessAcmeDnsPublish(localServerUrl, account.username),
          authZone: '',
        } satisfies TinyPublishSlot]
      : []

  const subdomains = options.shared
    ? (slots.length
        ? [...new Set(slots.map(slot => slot.subdomain))]
        : mergeSharedPublishSubdomains(
            options.certName,
            options.shared.authZone,
            options.cnameTargets ?? [],
          ))
    : account.subdomain
      ? [account.subdomain]
      : []
  const subdomain = subdomains[0] || (options.shared ? tinyApexLabel(options.certName) : account.subdomain)
  if (!subdomain || !subdomains.length) {
    throw new Error(`No acme-dns subdomain for ${domain}`)
  }

  return {
    serverUrl: localServerUrl,
    username: account.username,
    password: account.password,
    subdomain,
    subdomains,
    slots: slots.length
      ? slots
      : subdomains.map(name => ({
          subdomain: name,
          serverUrl: localServerUrl,
          local: true,
          authZone: options.shared?.authZone || '',
        })),
    txt: options.keyAuthorization,
    certName: options.certName,
    domain,
  }
}

/** Auth-hop branch: mint a dynamic hop and publish TXT only on that hop label. */
export function resolveDns01AuthHopPublishTarget(options: {
  authzIdentifier: string
  keyAuthorization: string
  certName: string
  preferUrl: string
  shared: NonNullable<ReturnType<typeof getSharedModeContext>>
  cnameTargets: string[]
}): Dns01PublishTarget {
  const domain = options.authzIdentifier
  const authZone = options.shared.authZone
  const lastLanding = options.cnameTargets[options.cnameTargets.length - 1]
  if (!lastLanding || !authZoneTxtLabel(lastLanding, authZone)) {
    throw new Error(
      `Auth hop requires a public CNAME to any single label under ${authZone} `
      + `(e.g. _apex_.${authZone}, i-eat-cake.${authZone}, or <uuid>.${authZone})`
      + (lastLanding ? ` — got ${lastLanding}` : ' — no auth-zone landing found'),
    )
  }
  const entryLabel = resolveAuthHopEntryLabel(options.certName, authZone, options.cnameTargets)
  const hopLabel = mintAuthHop(entryLabel)
  const entryFqdn = `${entryLabel}.${authZone}`
  const hopFqdn = `${hopLabel}.${authZone}`
  const account = options.shared.account
  const localServerUrl = account.server_url || options.preferUrl
  const slot = planAuthHopPublishSlot({
    hopLabel,
    localServerUrl,
    authZone,
  })
  return {
    serverUrl: localServerUrl,
    username: account.username,
    password: account.password,
    subdomain: hopLabel,
    subdomains: [hopLabel],
    slots: [slot],
    txt: options.keyAuthorization,
    certName: options.certName,
    domain,
    authHopCleanup: () => {
      clearAuthHop(entryLabel)
    },
    authHopEntryFqdn: entryFqdn,
    authHopFqdn: hopFqdn,
  }
}

export function isAuthHopPublishEnabled(
  shared: ReturnType<typeof getSharedModeContext>,
): boolean {
  return Boolean(shared && isAuthHopEnabled())
}
