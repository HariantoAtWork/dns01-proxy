import { X509Certificate } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProxyCertCandidate } from '../../plugins/proxy/runtime/shared/utils/proxyCertMatch'
import { getLetsencryptDir } from '../../core/paths'

function sansFromPem(pem: string): { sans: string[], notAfter: string } {
  const leaf = pem.split(/(?=-----BEGIN CERTIFICATE-----)/).find(s => s.includes('BEGIN')) || pem
  const cert = new X509Certificate(leaf)
  const notAfter = new Date(cert.validTo).toISOString()
  const sans: string[] = []
  const cn = cert.subject.split('\n').find(line => line.startsWith('CN='))?.slice(3)
  if (cn) {
    sans.push(cn.toLowerCase().replace(/\.$/, ''))
  }
  const alt = cert.subjectAltName
  if (alt) {
    for (const part of alt.split(', ')) {
      if (part.startsWith('DNS:')) {
        const name = part.slice(4).toLowerCase().replace(/\.$/, '')
        if (name && !sans.includes(name)) {
          sans.push(name)
        }
      }
    }
  }
  return { sans, notAfter }
}

/**
 * Sync inventory of `/live/<name>/` certificates with leaf SANs.
 * Used by edge TLS SNI binding — no domains.txt.
 */
export function listLiveCertCandidatesSync(): ProxyCertCandidate[] {
  const root = join(getLetsencryptDir(), 'live')
  if (!existsSync(root)) {
    return []
  }
  let names: string[]
  try {
    names = readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== 'README')
      .map(entry => entry.name)
      .sort()
  }
  catch {
    return []
  }

  const out: ProxyCertCandidate[] = []
  for (const certName of names) {
    const fullchain = join(root, certName, 'fullchain.pem')
    const privkey = join(root, certName, 'privkey.pem')
    if (!existsSync(fullchain) || !existsSync(privkey)) {
      continue
    }
    try {
      const pem = readFileSync(fullchain, 'utf8')
      const meta = sansFromPem(pem)
      if (!meta.sans.length) {
        continue
      }
      out.push({
        certName,
        sans: meta.sans,
        liveOnDisk: true,
        notAfter: meta.notAfter,
        status: 'ok',
      })
    }
    catch {
      // Skip unreadable / invalid PEMs.
    }
  }
  return out
}
