import type { AccessDenyEntry } from '../../plugins/proxy/runtime/shared/types/accessList'

const MAX = 50
const denies: AccessDenyEntry[] = []

export function recordAccessDeny(entry: Omit<AccessDenyEntry, 'at'> & { at?: string }): void {
  denies.unshift({
    at: entry.at ?? new Date().toISOString(),
    ip: entry.ip,
    hostId: entry.hostId,
    domain: entry.domain,
    listId: entry.listId,
    reason: entry.reason,
  })
  if (denies.length > MAX) {
    denies.length = MAX
  }
}

export function listAccessDenies(): AccessDenyEntry[] {
  return [...denies]
}

export type { AccessDenyEntry }
