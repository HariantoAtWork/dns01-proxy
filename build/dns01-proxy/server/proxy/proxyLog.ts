/**
 * Proxy subsystem log levels.
 *
 * Threshold: `PROXY_LOG_LEVEL` → else `LOG_LEVEL` → default `info`.
 * Values: `silent` | `error` | `warn` | `info` | `debug` (aliases: `off`→silent, `trace`→debug).
 *
 * Access lines use level `info` by default (`PROXY_ACCESS_LOG_LEVEL` overrides).
 * `PROXY_ACCESS_LOG=0|false|off|no` still disables access lines only.
 */

export type ProxyLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

const RANK: Record<ProxyLogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

export function parseProxyLogLevel(raw: string | undefined | null): ProxyLogLevel | null {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return null
  }
  const key = raw.trim().toLowerCase()
  if (key === 'off' || key === 'none' || key === '0') {
    return 'silent'
  }
  if (key === 'trace' || key === 'verbose') {
    return 'debug'
  }
  if (key in RANK) {
    return key as ProxyLogLevel
  }
  return null
}

export function resolveProxyLogLevel(): ProxyLogLevel {
  return (
    parseProxyLogLevel(process.env.PROXY_LOG_LEVEL)
    ?? parseProxyLogLevel(process.env.LOG_LEVEL)
    ?? 'info'
  )
}

/** Level used for per-request access lines (default `info`). */
export function resolveProxyAccessLogLevel(): ProxyLogLevel {
  return parseProxyLogLevel(process.env.PROXY_ACCESS_LOG_LEVEL) ?? 'info'
}

export function proxyLogEnabled(level: Exclude<ProxyLogLevel, 'silent'>): boolean {
  return RANK[level] <= RANK[resolveProxyLogLevel()]
}

export function proxyAccessLogEnabled(): boolean {
  const raw = process.env.PROXY_ACCESS_LOG
  if (raw !== undefined && raw.trim() !== '') {
    if (['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase())) {
      return false
    }
    if (['1', 'true', 'on', 'yes'].includes(raw.trim().toLowerCase())) {
      return proxyLogEnabled(resolveProxyAccessLogLevel() as Exclude<ProxyLogLevel, 'silent'>)
    }
  }
  const accessLevel = resolveProxyAccessLogLevel()
  if (accessLevel === 'silent') {
    return false
  }
  return proxyLogEnabled(accessLevel)
}

export function proxyLog(
  level: Exclude<ProxyLogLevel, 'silent'>,
  message: string,
  ...extra: unknown[]
): void {
  if (!proxyLogEnabled(level)) {
    return
  }
  if (level === 'debug') {
    console.debug(message, ...extra)
    return
  }
  if (level === 'info') {
    console.info(message, ...extra)
    return
  }
  if (level === 'warn') {
    console.warn(message, ...extra)
    return
  }
  console.error(message, ...extra)
}
