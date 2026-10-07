import {
  domainPatternMatchesHostname,
  isWildcardDomainName,
  normalizeDomainName,
  wildcardParentSuffix,
} from '../../plugins/proxy/runtime/shared/utils/proxyHost'
import { preferredSniServerNamesForDomain } from '../../plugins/proxy/runtime/shared/utils/proxyCertMatch'
import { getAcmeConfig } from '../utils/config'
import { listEnabledProxyHosts } from './routeTable'

export {
  certHasWildcardSanForPattern,
  coveringWildcardSanForHostname,
} from '../../plugins/proxy/runtime/shared/utils/proxyCertMatch'

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
 * Exact proxy domainNames covered by a wildcard pattern (other rows / extras on the same host).
 * Lets Bun SNI list known names even when the LE cert only has `*.zone` + apex.
 */
export function exactProxyHostnamesUnderPattern(pattern: string): string[] {
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
export function authSniHostnames(): string[] {
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
