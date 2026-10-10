import { v7 as uuid } from 'uuid'
import type { RouterTarget, RouterTargetInput, RouterTargetsFile } from '../types/routerTarget'

export function emptyRouterTarget(): RouterTargetInput {
  return {
    name: '',
    host: '',
    notes: null,
    enabled: true,
  }
}

export function normalizeTargetName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-')
}

export function normalizeTargetHost(raw: string): string {
  return raw.trim().replace(/\.$/, '')
}

function isPlainHostnameOrIp(name: string): boolean {
  if (!name) {
    return false
  }
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) {
    return name.split('.').every((octet) => {
      const n = Number(octet)
      return n >= 0 && n <= 255
    })
  }
  // IPv6 (loose)
  if (name.includes(':')) {
    return /^[0-9a-fA-F:.]+$/.test(name)
  }
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(name)
}

export function validateRouterTarget(target: RouterTarget): string | null {
  const name = normalizeTargetName(target.name)
  if (!name) {
    return 'Target name is required'
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
    return 'Target name must be a short slug (letters, digits, hyphens)'
  }
  const host = normalizeTargetHost(target.host)
  if (!host) {
    return 'Target host is required'
  }
  if (!isPlainHostnameOrIp(host)) {
    return 'Target host must be a hostname or IP'
  }
  return null
}

export function normalizeRouterTarget(input: RouterTargetInput, id?: string): RouterTarget {
  return {
    id: id || input.id || uuid(),
    name: normalizeTargetName(String(input.name ?? '')),
    host: normalizeTargetHost(String(input.host ?? '')),
    notes: input.notes == null || input.notes === ''
      ? null
      : String(input.notes).trim() || null,
    enabled: input.enabled !== false,
  }
}

export function normalizeRouterTargetsFile(raw: unknown): RouterTargetsFile {
  const file = (raw && typeof raw === 'object' ? raw : {}) as Partial<RouterTargetsFile>
  const targets = Array.isArray(file.targets)
    ? file.targets.map(item => normalizeRouterTarget(item as RouterTargetInput))
    : []
  return { version: 1, targets }
}

export function findDuplicateTargetName(
  name: string,
  targets: Array<Pick<RouterTarget, 'id' | 'name'>>,
  excludeId?: string | null,
): RouterTarget | null {
  const key = normalizeTargetName(name)
  for (const target of targets) {
    if (excludeId && target.id === excludeId) {
      continue
    }
    if (normalizeTargetName(target.name) === key) {
      return target as RouterTarget
    }
  }
  return null
}
