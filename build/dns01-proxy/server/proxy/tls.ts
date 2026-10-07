import { resolveTlsMaterial } from '../utils/listen'
import { isWildcardDomainName } from '../../plugins/proxy/runtime/shared/utils/proxyHost'
import {
  certHasWildcardSanForPattern,
  pickBestCertificateForDomain,
} from '../../plugins/proxy/runtime/shared/utils/proxyCertMatch'
import { listLiveCertCandidatesSync } from './liveCerts'
import { listEnabledProxyHosts, resolveCertPemPaths } from './routeTable'
import {
  authSniHostnames,
  sniServerNamesForProxyDomain,
} from './tlsSni'
import {
  loadDefaultTlsEntry,
  readPemPair,
  type BunTlsEntry,
} from './tlsMaterial'

export type { BunTlsEntry } from './tlsMaterial'
export {
  fingerprintEdgeTls,
  fingerprintEdgeTlsPems,
  loadDefaultTlsEntry,
  toListenTlsMaterial,
} from './tlsMaterial'
export {
  certHasWildcardSanForPattern,
  coveringWildcardSanForHostname,
  sniHostnamesForDomain,
  sniServerNamesForProxyDomain,
} from './tlsSni'

/**
 * Build Bun `tls` option for edge HTTPS.
 *
 * Bun matches `serverName` exactly **or** as a one-label wildcard (`*.uti.email`
 * matches `banana.uti.email`, not `a.b.uti.email`). Register each Proxy Host
 * wildcard pattern as a literal `*.zone` SNI entry so multiple catch-alls
 * (uti + harianto.link) all work — NPM-style. Exact domainNames still get their
 * own entries (and win over the wildcard for the same PEM).
 */
export function buildEdgeTlsOptions(): BunTlsEntry[] | BunTlsEntry | null {
  const sniEntries: BunTlsEntry[] = []
  const seen = new Set<string>()
  /** Literal `*.zone` SNI patterns registered (for logging). */
  const wildcardSnIs: string[] = []

  const liveCerts = listLiveCertCandidatesSync()
  const pemCache = new Map<string, { cert: string, key: string }>()

  for (const host of listEnabledProxyHosts()) {
    if (!host.certificateName) {
      continue
    }
    for (const name of host.domainNames) {
      const pattern = name.replace(/\.$/, '').toLowerCase()
      if (!pattern) {
        continue
      }

      const best = pickBestCertificateForDomain(liveCerts, pattern)
      const certName = best?.certName
      if (!certName) {
        console.warn(`[proxy] no live cert covers SNI ${pattern} (host ${host.id})`)
        continue
      }

      let pem = pemCache.get(certName)
      if (!pem) {
        const loaded = readPemPair(certName)
        if (!loaded) {
          console.warn(`[proxy] PEMs missing for live cert ${certName} (SNI ${pattern})`)
          continue
        }
        pemCache.set(certName, loaded)
        pem = loaded
      }

      const sans = best?.sans ?? []
      if (
        isWildcardDomainName(pattern)
        && !certHasWildcardSanForPattern(pattern, sans)
      ) {
        console.warn(
          `[proxy] wildcard ${pattern} has no matching SAN on cert ${certName}; `
          + 'random subdomains under this pattern will not get this leaf',
        )
      }

      // Prefer parent-wildcard SNI (`*.admin.harianto.dev`) over per-host exact
      // names so nested Proxy Hosts do not rebind :443 on every save.
      for (const serverName of sniServerNamesForProxyDomain(pattern, sans)) {
        if (seen.has(serverName)) {
          continue
        }
        seen.add(serverName)
        sniEntries.push({ cert: pem.cert, key: pem.key, serverName })
        if (isWildcardDomainName(serverName)) {
          wildcardSnIs.push(serverName)
        }
      }
    }
  }

  if (wildcardSnIs.length) {
    console.info(
      `[proxy] TLS SNI wildcards ← ${[...new Set(wildcardSnIs)].sort().join(', ')} `
      + '(Bun one-label match; nested names use parent *.zone, not per-host rebind)',
    )
  }

  const auth = loadDefaultTlsEntry()
  const entries: BunTlsEntry[] = []

  // Auth / control cert as no-SNI default for unmatched names (not a catch-all zone).
  if (auth) {
    entries.push(auth)
    for (const serverName of authSniHostnames()) {
      if (seen.has(serverName)) {
        continue
      }
      seen.add(serverName)
      entries.push({ cert: auth.cert, key: auth.key, serverName })
    }
  }

  entries.push(...sniEntries)

  if (entries.length === 0) {
    return null
  }
  if (entries.length === 1 && !entries[0]!.serverName) {
    return entries[0]!
  }
  return entries
}

/** Whether edge HTTPS should bind (default cert and/or any SSL-enabled proxy host). */
export function shouldBindEdgeHttps(): boolean {
  if (resolveTlsMaterial()) {
    return true
  }
  for (const host of listEnabledProxyHosts()) {
    if (!host.certificateName) {
      continue
    }
    // SSL on — bind if at least one domain has a readable live cert.
    const liveCerts = listLiveCertCandidatesSync()
    for (const name of host.domainNames) {
      const best = pickBestCertificateForDomain(liveCerts, name)
      if (best && resolveCertPemPaths(best.certName)) {
        return true
      }
    }
  }
  return false
}
