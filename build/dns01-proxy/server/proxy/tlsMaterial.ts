import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { ListenTlsOptions } from '../utils/listen'
import { resolveTlsMaterial } from '../utils/listen'
import { resolveCertPemPaths } from './routeTable'

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

export function readPemPair(certificateName: string): { cert: string, key: string } | null {
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
