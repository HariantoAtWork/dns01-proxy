import { readFileSync } from 'node:fs'
import type { ListenTlsOptions } from '../utils/listen'
import { resolveTlsMaterial } from '../utils/listen'
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

/**
 * Build Bun `tls` option for edge HTTPS: one entry per proxy domain with a
 * readable certificateName PEM, plus the default auth cert.
 */
export function buildEdgeTlsOptions(): BunTlsEntry[] | BunTlsEntry | null {
  const entries: BunTlsEntry[] = []
  const seen = new Set<string>()

  const defaults = loadDefaultTlsEntry()
  if (defaults) {
    entries.push(defaults)
  }

  for (const host of listEnabledProxyHosts()) {
    if (!host.certificateName) {
      continue
    }
    const paths = resolveCertPemPaths(host.certificateName)
    if (!paths) {
      console.warn(`[proxy] PEMs missing for certificateName=${host.certificateName}`)
      continue
    }
    let cert: string
    let key: string
    try {
      cert = readFileSync(paths.certPath, 'utf8')
      key = readFileSync(paths.keyPath, 'utf8')
    }
    catch (error) {
      console.warn(`[proxy] cannot read PEMs for ${host.certificateName}:`, error)
      continue
    }
    for (const name of host.domainNames) {
      const serverName = name.replace(/\.$/, '').toLowerCase()
      if (!serverName || seen.has(serverName)) {
        continue
      }
      seen.add(serverName)
      entries.push({ cert, key, serverName })
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

/** Whether edge HTTPS should bind (default cert and/or any proxy host PEMs). */
export function shouldBindEdgeHttps(): boolean {
  if (resolveTlsMaterial()) {
    return true
  }
  for (const host of listEnabledProxyHosts()) {
    if (host.certificateName && resolveCertPemPaths(host.certificateName)) {
      return true
    }
  }
  return false
}

export function toListenTlsMaterial(entry: BunTlsEntry): ListenTlsOptions {
  // Paths are not used when entry already has PEM bodies — entry.ts reads via buildEdgeTlsOptions.
  return {
    certPath: '',
    keyPath: '',
    serverName: entry.serverName,
  }
}
