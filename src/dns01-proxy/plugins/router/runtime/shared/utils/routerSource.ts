import { v7 as uuid } from 'uuid'
import type {
  RouterPortMap,
  RouterProtocol,
  RouterSource,
  RouterSourceInput,
  RouterSourcesFile,
} from '../types/routerSource'
import type { RouterTarget } from '../types/routerTarget'
import { isReservedRouterPort, reservedPortLabel } from './reservedPorts'

export function emptyRouterSource(): RouterSourceInput {
  return {
    domainNames: [],
    targetId: '',
    portMaps: [],
    enabled: true,
  }
}

export function normalizeDomainName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, '')
}

export function normalizeDomainNames(raw: string | string[]): string[] {
  const parts = Array.isArray(raw)
    ? raw
    : raw.split(/[\s,]+/)
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const name = normalizeDomainName(part)
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    out.push(name)
  }
  return out
}

function isPlainHostname(name: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(name)
}

export function validateDomainName(raw: string): string | null {
  const name = normalizeDomainName(raw)
  if (!name) {
    return 'Domain name is required'
  }
  if (!isPlainHostname(name)) {
    return `Invalid domain name: ${raw}`
  }
  return null
}

function asPort(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 65535) {
    return null
  }
  return n
}

function asProtocol(raw: unknown): RouterProtocol | null {
  const value = String(raw ?? '').trim().toLowerCase()
  if (value === 'tcp' || value === 'udp') {
    return value
  }
  return null
}

export function normalizePortMap(raw: Partial<RouterPortMap> | null | undefined): RouterPortMap | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const protocol = asProtocol(raw.protocol)
  const listenPort = asPort(raw.listenPort)
  const targetPort = asPort(raw.targetPort) ?? listenPort
  if (!protocol || listenPort == null || targetPort == null) {
    return null
  }
  return { protocol, listenPort, targetPort }
}

export function normalizeRouterSource(input: RouterSourceInput, id?: string): RouterSource {
  const portMaps: RouterPortMap[] = []
  const seen = new Set<string>()
  for (const item of Array.isArray(input.portMaps) ? input.portMaps : []) {
    const map = normalizePortMap(item)
    if (!map) {
      continue
    }
    const key = `${map.protocol}:${map.listenPort}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    portMaps.push(map)
  }
  portMaps.sort((a, b) => {
    if (a.protocol !== b.protocol) {
      return a.protocol.localeCompare(b.protocol)
    }
    return a.listenPort - b.listenPort
  })

  return {
    id: id || input.id || uuid(),
    domainNames: normalizeDomainNames(input.domainNames ?? []),
    targetId: String(input.targetId ?? '').trim(),
    portMaps,
    enabled: input.enabled !== false,
  }
}

export function normalizeRouterSourcesFile(raw: unknown): RouterSourcesFile {
  const file = (raw && typeof raw === 'object' ? raw : {}) as Partial<RouterSourcesFile>
  const sources = Array.isArray(file.sources)
    ? file.sources.map(item => normalizeRouterSource(item as RouterSourceInput))
    : []
  return { version: 1, sources }
}

export function portMapKey(map: Pick<RouterPortMap, 'protocol' | 'listenPort'>): string {
  return `${map.protocol}:${map.listenPort}`
}

export function formatPortMapsSummary(maps: RouterPortMap[]): string {
  if (!maps.length) {
    return '—'
  }
  const tcp = maps.filter(m => m.protocol === 'tcp').map(m =>
    m.listenPort === m.targetPort ? String(m.listenPort) : `${m.listenPort}→${m.targetPort}`,
  )
  const udp = maps.filter(m => m.protocol === 'udp').map(m =>
    m.listenPort === m.targetPort ? String(m.listenPort) : `${m.listenPort}→${m.targetPort}`,
  )
  const parts: string[] = []
  if (tcp.length) {
    parts.push(`TCP ${tcp.join(', ')}`)
  }
  if (udp.length) {
    parts.push(`UDP ${udp.join(', ')}`)
  }
  return parts.join(' · ')
}

export type PortConflict = {
  protocol: RouterProtocol
  listenPort: number
  sourceId: string
  domainNames: string[]
}

/** Find listen-port clashes among enabled sources (and reserved stack ports). */
export function findPortConflicts(
  sources: RouterSource[],
  excludeSourceId?: string | null,
): PortConflict[] {
  const conflicts: PortConflict[] = []
  const claimed = new Map<string, { sourceId: string, domainNames: string[] }>()

  for (const source of sources) {
    if (!source.enabled) {
      continue
    }
    if (excludeSourceId && source.id === excludeSourceId) {
      continue
    }
    for (const map of source.portMaps) {
      const key = portMapKey(map)
      const existing = claimed.get(key)
      if (existing) {
        conflicts.push({
          protocol: map.protocol,
          listenPort: map.listenPort,
          sourceId: existing.sourceId,
          domainNames: existing.domainNames,
        })
        continue
      }
      claimed.set(key, { sourceId: source.id, domainNames: source.domainNames })
    }
  }
  return conflicts
}

export function validateRouterSource(
  source: RouterSource,
  targets: RouterTarget[],
  allSources: RouterSource[],
): string | null {
  if (!source.domainNames.length) {
    return 'At least one source domain is required'
  }
  for (const name of source.domainNames) {
    const err = validateDomainName(name)
    if (err) {
      return err
    }
  }
  if (!source.targetId) {
    return 'Target is required'
  }
  const target = targets.find(item => item.id === source.targetId)
  if (!target) {
    return 'Target not found'
  }
  if (!source.portMaps.length) {
    return 'At least one port map is required'
  }
  for (const map of source.portMaps) {
    if (isReservedRouterPort(map.listenPort)) {
      return `Listen port ${map.listenPort} is reserved (${reservedPortLabel(map.listenPort)})`
    }
  }

  const others = allSources.filter(item => item.id !== source.id)
  if (source.enabled) {
    for (const map of source.portMaps) {
      for (const other of others) {
        if (!other.enabled) {
          continue
        }
        if (other.portMaps.some(m => m.protocol === map.protocol && m.listenPort === map.listenPort)) {
          const label = other.domainNames[0] || other.id
          return `${map.protocol.toUpperCase()} listen port ${map.listenPort} already used by ${label}`
        }
      }
    }
  }

  return null
}
