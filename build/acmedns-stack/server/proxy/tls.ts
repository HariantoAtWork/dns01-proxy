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
import { pickBestCertificateForDomain } from '../../plugins/proxy/runtime/shared/utils/proxyCertMatch'
import { listLiveCertCandidatesSync } from './liveCerts'
import { listEnabledProxyHosts, resolveCertPemPaths } from './routeTable'

export interface BunTlsEntry {
  cert: string
  key: string
  serverName?: string
}

function pemFingerprint(cert: string, key: string): string {
  return createHash('sha256').update(cert).update('\0').update(key).digest('hex')
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

/** True when the cert has a DNS SAN identical to the wildcard proxy pattern (e.g. both `*.uti.email`). */
export function certHasWildcardSanForPattern(pattern: string, certSans: string[]): boolean {
  const name = normalizeDomainName(pattern)
  if (!name || !isWildcardDomainName(name)) {
    return false
  }
  return certSans.some(san => normalizeDomainName(san) === name)
}

/**
 * Hostnames to register for Bun SNI for one proxy domain pattern.
 * Bun matches `serverName` exactly — a literal `*.example.com` never matches clients.
 * For wildcards, expand to exact SANs on the covering cert that the pattern matches,
 * plus the parent apex when present on the cert (`uti.email` for `*.uti.email`).
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
 * Build Bun `tls` option for edge HTTPS: SNI entries for exact names, plus a
 * no-`serverName` default. When a proxy host uses a LE wildcard cert (no exact
 * SANs), that PEM becomes the TLS default so `derp.uti.email` etc. get the right
 * cert — Bun cannot match a literal `*.uti.email` serverName.
 */
export function buildEdgeTlsOptions(): BunTlsEntry[] | BunTlsEntry | null {
  const sniEntries: BunTlsEntry[] = []
  const seen = new Set<string>()
  /** PEM fingerprint → material for wildcard zones that need a TLS default. */
  const wildcardDefaults = new Map<string, { cert: string, key: string, patterns: string[] }>()

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
      const hostnames = [
        ...sniHostnamesForDomain(pattern, sans),
        ...exactProxyHostnamesUnderPattern(pattern),
      ]
      const uniqueNames = [...new Set(hostnames)]

      if (uniqueNames.length) {
        for (const serverName of uniqueNames) {
          if (seen.has(serverName)) {
            continue
          }
          seen.add(serverName)
          sniEntries.push({ cert: pem.cert, key: pem.key, serverName })
        }
      }

      // LE wildcard certs often only have `*.zone` + apex — Bun cannot SNI-match `*.zone`.
      // Use that PEM as the TLS default so arbitrary subdomains still get the right cert.
      if (
        isWildcardDomainName(pattern)
        && certHasWildcardSanForPattern(pattern, sans)
      ) {
        const fp = pemFingerprint(pem.cert, pem.key)
        const existing = wildcardDefaults.get(fp)
        if (existing) {
          if (!existing.patterns.includes(pattern)) {
            existing.patterns.push(pattern)
          }
        }
        else {
          wildcardDefaults.set(fp, {
            cert: pem.cert,
            key: pem.key,
            patterns: [pattern],
          })
        }
      }
      else if (!uniqueNames.length) {
        console.warn(
          `[proxy] wildcard ${pattern} has no exact SANs for SNI `
          + `(cert ${certName}); add exact domainNames or SANs`,
        )
      }
    }
  }

  const auth = loadDefaultTlsEntry()
  const entries: BunTlsEntry[] = []

  if (wildcardDefaults.size === 1) {
    const only = [...wildcardDefaults.values()][0]!
    entries.push({ cert: only.cert, key: only.key })
    console.info(
      `[proxy] TLS default ← wildcard cert for ${only.patterns.join(', ')} `
      + '(Bun SNI is exact-only; unmatched names use this cert)',
    )
    if (auth) {
      for (const serverName of authSniHostnames()) {
        if (seen.has(serverName)) {
          continue
        }
        seen.add(serverName)
        entries.push({ cert: auth.cert, key: auth.key, serverName })
      }
    }
  }
  else {
    if (wildcardDefaults.size > 1) {
      const zones = [...wildcardDefaults.values()].flatMap(item => item.patterns).join(', ')
      console.warn(
        `[proxy] ${wildcardDefaults.size} distinct wildcard certs (${zones}) — `
        + 'only one TLS default is possible; add exact SANs/domainNames or terminate TLS upstream',
      )
    }
    if (auth) {
      entries.push(auth)
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
