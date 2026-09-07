import { readFileSync } from 'node:fs'
import type { ListenTlsOptions } from '../utils/listen'
import { resolveTlsMaterial } from '../utils/listen'
import { pickBestCertificateForDomain } from '../../plugins/proxy/runtime/shared/utils/proxyCertMatch'
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
 * Build Bun `tls` option for edge HTTPS: default auth cert plus one SNI entry
 * per proxy domain, each bound to the best covering live/ certificate.
 */
export function buildEdgeTlsOptions(): BunTlsEntry[] | BunTlsEntry | null {
  const entries: BunTlsEntry[] = []
  const seen = new Set<string>()

  const defaults = loadDefaultTlsEntry()
  if (defaults) {
    entries.push(defaults)
  }

  const liveCerts = listLiveCertCandidatesSync()
  const pemCache = new Map<string, { cert: string, key: string }>()

  for (const host of listEnabledProxyHosts()) {
    if (!host.certificateName) {
      continue
    }
    for (const name of host.domainNames) {
      const serverName = name.replace(/\.$/, '').toLowerCase()
      if (!serverName || seen.has(serverName)) {
        continue
      }

      const best = pickBestCertificateForDomain(liveCerts, serverName)
      const certName = best?.certName
      if (!certName) {
        console.warn(`[proxy] no live cert covers SNI ${serverName} (host ${host.id})`)
        continue
      }

      let pem = pemCache.get(certName)
      if (!pem) {
        const loaded = readPemPair(certName)
        if (!loaded) {
          console.warn(`[proxy] PEMs missing for live cert ${certName} (SNI ${serverName})`)
          continue
        }
        pemCache.set(certName, loaded)
        pem = loaded
      }

      seen.add(serverName)
      entries.push({ cert: pem.cert, key: pem.key, serverName })
    }
  }

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
