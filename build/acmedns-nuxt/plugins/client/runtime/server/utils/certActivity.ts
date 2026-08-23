import type {
  CertActivityEntry,
  CertActivityLevel,
  CertActivitySource,
} from '#shared/types/certs'

const MAX_ENTRIES = 400

const entries: CertActivityEntry[] = []
let nextId = 1

const lastErrors = new Map<string, { message: string, at: string }>()

function logToConsole(source: CertActivitySource, level: CertActivityLevel, line: string) {
  const prefix = source === 'acme' ? '[acme]' : `[cert-${source}]`
  if (level === 'error') {
    console.error(prefix, line)
  }
  else if (level === 'warn') {
    console.warn(prefix, line)
  }
  else {
    console.info(prefix, line)
  }
}

export function appendCertActivity(partial: {
  source: CertActivitySource
  level: CertActivityLevel
  certName?: string
  message: string
}) {
  const entry: CertActivityEntry = {
    id: nextId++,
    at: new Date().toISOString(),
    ...partial,
  }
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) {
    entries.shift()
  }

  if (partial.level === 'error' && partial.certName) {
    lastErrors.set(partial.certName, { message: partial.message, at: entry.at })
  }
  else if (
    partial.level === 'info'
    && partial.certName
    && ['Renewed', 'Issued', 'Re-issued (SAN change)'].includes(partial.message)
  ) {
    lastErrors.delete(partial.certName)
  }

  const line = partial.certName ? `${partial.certName}: ${partial.message}` : partial.message
  logToConsole(partial.source, partial.level, line)
  publishCertLive({
    type: 'activity',
    data: {
      entry,
      lastErrors: getLastCertErrors(),
    },
  })
  return entry
}

export function getCertActivityEntries(options?: { sinceId?: number, limit?: number }) {
  const sinceId = options?.sinceId ?? 0
  const limit = options?.limit ?? 100
  const list = sinceId > 0 ? entries.filter(e => e.id > sinceId) : [...entries]
  return list.slice(-limit).reverse()
}

export function getLastCertErrors() {
  return Object.fromEntries(lastErrors)
}
