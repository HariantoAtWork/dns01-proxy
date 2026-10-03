import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { ListenTlsOptions } from '../utils/listen'
import { resolveTlsMaterial } from '../utils/listen'
import { getAcmeConfig } from '../utils/config'
import {
  domainPatternMatchesHostname,
  isWildcardDomainName,
  normalizeDomainName,
  wildcardParentSuffix,
} from '../../plugins/proxy/runtime/shared/utils/proxyHost'
import {
  certHasWildcardSanForPattern,
  coveringWildcardSanForHostname,
  pickBestCertificateForDomain,
  preferredSniServerNamesForDomain,
} from '../../plugins/proxy/runtime/shared/utils/proxyCertMatch'

export {
  certHasWildcardSanForPattern,
  coveringWildcardSanForHostname,
} from '../../plugins/proxy/runtime/shared/utils/proxyCertMatch'
import { listLiveCertCandidatesSync } from './liveCerts'
import { listEnabledProxyHosts, resolveCertPemPaths } from './routeTable'

export interface BunTlsEntry {
  cert: string
  key: string
  serverName?: string
}

/** Default (auth) cert from config.cfg — used for control HTTPS and as SNI fallback. */
export function loadDefaultTlsEntry(): BunTlsEntry | null {
  const material = resolveTlsMaterial()
  if (!material) {
    return null
  }
  return {
    cert: readFileSync(material.certPath, 'utf8'),
    key: readFileSync(material.keyPath, 'utf8'),
  }
}

function readPemPair(certificateName: string): { cert: string, key: string } | null {
  const paths = resolveCertPemPaths(certificateName)
  if (!paths) {
    return null
  }
  try {
    return {
      cert: readFileSync(paths.certPath, 'utf8'),
      key: readFileSync(paths.keyPath, 'utf8'),
    }
  }
  catch (error) {
    console.warn(`[proxy] cannot read PEMs for ${certificateName}:`, error)
    return null
  }
}

/**
 * Hostnames to register for Bun SNI for one proxy domain pattern.
 * Exact patterns return themselves. Wildcard patterns expand to exact SANs on
 * the covering cert that the pattern matches, plus apex when present.
 * The literal `*.zone` itself is registered separately in buildEdgeTlsOptions
 * (Bun matches one-label wildcards).
 */
export function sniHostnamesForDomain(
  domain: string,
  certSans: string[],
): string[] {
  const name = domain.replace(/\.$/, '').toLowerCase()
  if (!name) {
    return []
  }
  if (!isWildcardDomainName(name)) {
    return [name]
  }
  const exact = certSans
    .map(san => san.replace(/\.$/, '').toLowerCase())
    .filter(san => san && !isWildcardDomainName(san) && domainPatternMatchesHostname(name, san))
  const apex = wildcardParentSuffix(name)
  if (apex) {
    const hasApex = certSans.some(san => normalizeDomainName(san) === apex)
    if (hasApex) {
      exact.push(apex)
    }
  }
  return [...new Set(exact)]
}

/**
 * Bun `serverName` values for one Proxy Host domain + covering cert.
 *
 * Prefer a one-label parent wildcard SAN when the cert has it, so adding
 * `test.admin.harianto.dev` after `blog.admin.harianto.dev` does not change the
 * TLS fingerprint (no :443 rebind). Nested names never match `*.harianto.dev`.
 */
export function sniServerNamesForProxyDomain(
  domain: string,
  certSans: string[],
): string[] {
  const preferred = preferredSniServerNamesForDomain(domain, certSans)
  if (preferred.length) {
    return preferred
  }
  const pattern = normalizeDomainName(domain)
  if (!pattern || !isWildcardDomainName(pattern)) {
    return preferred
  }
  // Cert lacks the literal wildcard SAN — fall back to exact SAN / known hosts.
  return [
    ...sniHostnamesForDomain(pattern, certSans),
    ...exactProxyHostnamesUnderPattern(pattern),
  ]
}

/** Auth-zone hostnames that should keep an explicit SNI mapping to the default cert. */
function authSniHostnames(): string[] {
  try {
    const config = getAcmeConfig()
    return [...new Set(
      [config.general.domain, config.general.nsname]
        .map(name => normalizeDomainName(name))
        .filter(Boolean),
    )]
  }
  catch {
    return []
  }
}

/**
 * Exact proxy domainNames covered by a wildcard pattern (other rows / extras on the same host).
 * Lets Bun SNI list known names even when the LE cert only has `*.zone` + apex.
 */
function exactProxyHostnamesUnderPattern(pattern: string): string[] {
  const names: string[] = []
  for (const host of listEnabledProxyHosts()) {
    for (const domain of host.domainNames) {
      const key = normalizeDomainName(domain)
      if (!key || isWildcardDomainName(key)) {
        continue
      }
      if (domainPatternMatchesHostname(pattern, key)) {
        names.push(key)
      }
    }
  }
  return [...new Set(names)]
}

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

export function toListenTlsMaterial(entry: BunTlsEntry): ListenTlsOptions {
  return {
    certPath: '',
    keyPath: '',
    serverName: entry.serverName,
  }
}

/**
 * Stable fingerprint of edge TLS/SNI material.
 * Used to skip :443 rebinds when Proxy Host writes do not change certs.
 */
export function fingerprintEdgeTls(
  tlsBodies: BunTlsEntry[] | BunTlsEntry | null | undefined,
): string {
  if (!tlsBodies) {
    return ''
  }
  const entries = Array.isArray(tlsBodies) ? tlsBodies : [tlsBodies]
  if (entries.length === 0) {
    return ''
  }
  const lines = entries.map((entry) => {
    const name = (entry.serverName || '').toLowerCase()
    const certHash = createHash('sha256').update(entry.cert).digest('hex')
    const keyHash = createHash('sha256').update(entry.key).digest('hex')
    return `${name}\0${certHash}\0${keyHash}`
  })
  lines.sort()
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}

/**
 * Fingerprint of PEM bodies only (ignores serverName).
 * Bun.serve().reload() updates the SNI name set but does not swap cert/key for
 * names that already existed — PEM changes need a full :443 rebind.
 */
export function fingerprintEdgeTlsPems(
  tlsBodies: BunTlsEntry[] | BunTlsEntry | null | undefined,
): string {
  if (!tlsBodies) {
    return ''
  }
  const entries = Array.isArray(tlsBodies) ? tlsBodies : [tlsBodies]
  if (entries.length === 0) {
    return ''
  }
  const lines = [...new Set(entries.map((entry) => {
    const certHash = createHash('sha256').update(entry.cert).digest('hex')
    const keyHash = createHash('sha256').update(entry.key).digest('hex')
    return `${certHash}\0${keyHash}`
  }))].sort()
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}
