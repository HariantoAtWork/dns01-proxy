import { X509Certificate } from 'node:crypto'
import { join } from 'node:path'
import {
  certTreePath,
  lastSavedTreePath,
  listCertNamesInTree,
  readPem,
  trashTreePath,
} from './letsencryptFs'
import { readDomainsFile } from './domainsFile'
import type { CertStatusEntry, LetsEncryptDirectoryMode } from '#shared/types/certs'

function sansFromCert(pem: string): { sans: string[], notAfter: string } {
  const cert = new X509Certificate(pem)
  const notAfter = new Date(cert.validTo).toISOString()
  const sans: string[] = []
  const subject = cert.subject
  const cn = subject.split('\n').find(l => l.startsWith('CN='))?.slice(3)
  if (cn) {
    sans.push(cn)
  }
  const alt = cert.subjectAltName
  if (alt) {
    for (const part of alt.split(', ')) {
      if (part.startsWith('DNS:')) {
        const name = part.slice(4)
        if (!sans.includes(name)) {
          sans.push(name)
        }
      }
    }
  }
  return { sans, notAfter }
}

function sameSanSet(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false
  }
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

export async function readCertMeta(
  mode: LetsEncryptDirectoryMode | 'trash' | 'last-saved-live' | 'last-saved-staging',
  certName: string,
) {
  const dir = mode === 'trash'
    ? trashTreePath(certName)
    : mode === 'last-saved-live'
      ? lastSavedTreePath('live', certName)
      : mode === 'last-saved-staging'
        ? lastSavedTreePath('staging', certName)
        : certTreePath(mode, certName)
  const fullchainPath = join(dir, 'fullchain.pem')
  try {
    const pem = await readPem(fullchainPath)
    // leaf is first cert in fullchain
    const leaf = pem.split(/(?=-----BEGIN CERTIFICATE-----)/).find(s => s.includes('BEGIN')) || pem
    return sansFromCert(leaf)
  }
  catch {
    return null
  }
}

export async function buildCertStatus(mode: LetsEncryptDirectoryMode = 'production'): Promise<CertStatusEntry[]> {
  const domains = await readDomainsFile()
  const tree = mode === 'staging' ? 'staging' : 'live'
  const onDisk = new Set(await listCertNamesInTree(tree))
  const onLive = new Set(await listCertNamesInTree('live'))
  const entries: CertStatusEntry[] = []
  const seen = new Set<string>()

  for (const line of domains.lines) {
    seen.add(line.certName)
    const meta = await readCertMeta(mode, line.certName)
    if (!meta) {
      entries.push({
        certName: line.certName,
        names: line.names,
        expanded: line.expanded,
        status: 'missing',
        tree: 'none',
        liveOnDisk: onLive.has(line.certName),
        inDomainsFile: true,
      })
      continue
    }
    const drift = !sameSanSet(meta.sans, line.expanded)
    entries.push({
      certName: line.certName,
      names: line.names,
      expanded: line.expanded,
      status: drift ? 'drift' : 'ok',
      notAfter: meta.notAfter,
      sansOnDisk: meta.sans,
      tree,
      liveOnDisk: onLive.has(line.certName),
      inDomainsFile: true,
    })
  }

  for (const certName of onDisk) {
    if (seen.has(certName)) {
      continue
    }
    const meta = await readCertMeta(mode, certName)
    entries.push({
      certName,
      names: meta?.sans ?? [],
      expanded: meta?.sans ?? [],
      status: 'orphan',
      notAfter: meta?.notAfter,
      sansOnDisk: meta?.sans,
      tree,
      liveOnDisk: onLive.has(certName),
      inDomainsFile: false,
    })
  }

  return entries.sort((a, b) => a.certName.localeCompare(b.certName))
}

export function needsRenewal(notAfterIso: string, withinDays = 30) {
  const notAfter = Date.parse(notAfterIso)
  if (!Number.isFinite(notAfter)) {
    return true
  }
  const ms = withinDays * 24 * 60 * 60 * 1000
  return notAfter - Date.now() <= ms
}
