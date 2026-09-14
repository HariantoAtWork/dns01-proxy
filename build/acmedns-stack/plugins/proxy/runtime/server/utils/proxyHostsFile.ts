import { dirname } from 'node:path'
import { promises as fs } from 'node:fs'
import type { ProxyHost, ProxyHostInput, ProxyHostsFile } from '../../shared/types/proxyHost'
import {
  normalizeProxyHost,
  normalizeProxyHostsFile,
  validateProxyHost,
} from '../../shared/utils/proxyHost'
import { getProxyHostsFilePath } from '../../../../../server/utils/paths'
import { reloadEdgeHttps } from '../../../../../server/proxy/edgeHttps'
import { findReservedDomainOverlap } from '../../../../../server/proxy/reserved'
import { reloadRouteTable } from '../../../../../server/proxy/routeTable'

const EMPTY_FILE: ProxyHostsFile = { version: 1, hosts: [] }

export async function ensureProxyHostsFile(): Promise<string> {
  const filePath = getProxyHostsFilePath()
  try {
    const stat = await fs.stat(filePath)
    if (stat.isDirectory()) {
      throw createError({
        statusCode: 500,
        statusMessage: `${filePath} is a directory. Remove it and use a file named proxy-hosts.json.`,
      })
    }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      await fs.mkdir(dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, `${JSON.stringify(EMPTY_FILE, null, 2)}\n`, 'utf-8')
      return filePath
    }
    throw error
  }
  return filePath
}

export async function readProxyHostsFile(): Promise<ProxyHostsFile> {
  const filePath = await ensureProxyHostsFile()
  const text = await fs.readFile(filePath, 'utf-8')
  try {
    return normalizeProxyHostsFile(JSON.parse(text))
  }
  catch {
    return { ...EMPTY_FILE }
  }
}

async function writeProxyHostsFile(file: ProxyHostsFile): Promise<ProxyHostsFile> {
  const filePath = await ensureProxyHostsFile()
  const normalized = normalizeProxyHostsFile(file)
  await fs.writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8')
  reloadRouteTable(normalized.hosts)
  // Routes update in-memory; edge SNI PEMs are bound at listen time — rebind :443.
  void reloadEdgeHttps()
  return normalized
}

export async function listProxyHosts(): Promise<ProxyHost[]> {
  const file = await readProxyHostsFile()
  return file.hosts
}

export async function getProxyHost(id: string): Promise<ProxyHost | null> {
  const hosts = await listProxyHosts()
  return hosts.find(host => host.id === id) ?? null
}

export async function upsertProxyHost(input: ProxyHostInput): Promise<ProxyHost> {
  const file = await readProxyHostsFile()
  const host = normalizeProxyHost(input, input.id)
  const error = validateProxyHost(host)
  if (error) {
    throw createError({ statusCode: 400, statusMessage: error })
  }

  const reserved = findReservedDomainOverlap(host.domainNames)
  if (reserved.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `Domain(s) reserved for auth zone / control plane: ${reserved.join(', ')}`,
    })
  }

  const index = file.hosts.findIndex(item => item.id === host.id)
  if (index >= 0) {
    file.hosts[index] = host
  }
  else {
    file.hosts.push(host)
  }
  await writeProxyHostsFile(file)
  return host
}

export async function deleteProxyHost(id: string): Promise<boolean> {
  const file = await readProxyHostsFile()
  const next = file.hosts.filter(host => host.id !== id)
  if (next.length === file.hosts.length) {
    return false
  }
  await writeProxyHostsFile({ version: 1, hosts: next })
  return true
}
