export function hostnameOf(base: string): string {
  try {
    return new URL(base).hostname.replace(/\.$/, '').toLowerCase()
  }
  catch {
    return ''
  }
}

export interface AcmeDnsRoutingContext {
  authZoneHost: string
  preferredPublicHost: string
  preferredAcmednsUrl: string
  authZoneTls: string
  isInternalHost: (host: string) => boolean
}

/** In-process API (loopback / container hostname / auth zone / ACMEDNS_URL). */
export function isLocalAcmeDnsBase(base: string, ctx: AcmeDnsRoutingContext): boolean {
  if (!base || base.startsWith('local://')) {
    return true
  }
  const host = hostnameOf(base)
  if (!host) {
    return false
  }
  if (ctx.isInternalHost(host)) {
    return true
  }
  if (ctx.authZoneHost && host === ctx.authZoneHost) {
    return true
  }
  return Boolean(ctx.preferredPublicHost && host === ctx.preferredPublicHost)
}

/**
 * Prefer in-process /update when server_url is the public identity of this
 * process (ACMEDNS_URL) and the account actually lives in the local DB.
 */
export function shouldUseInProcessUpdate(
  base: string,
  username: string,
  ctx: AcmeDnsRoutingContext,
  hasLocalAccount: (username: string) => boolean,
): boolean {
  if (isLocalAcmeDnsBase(base, ctx)) {
    return true
  }
  const host = hostnameOf(base)
  if (!host || !ctx.preferredPublicHost || host !== ctx.preferredPublicHost) {
    return false
  }
  return hasLocalAccount(username)
}

/**
 * URL stored on the account for CNAME / UI.
 * Prefer a public ACMEDNS_URL (or auth zone) over loopback so register
 * does not persist http://127.0.0.1 when the operator set a public identity.
 */
export function identityServerUrl(resolvedBase: string, ctx: AcmeDnsRoutingContext): string {
  const cleaned = resolvedBase.replace(/\/$/, '')
  const host = hostnameOf(cleaned)
  if (host && !ctx.isInternalHost(host)) {
    return cleaned
  }

  if (ctx.preferredAcmednsUrl && !ctx.isInternalHost(hostnameOf(ctx.preferredAcmednsUrl))) {
    return ctx.preferredAcmednsUrl
  }

  const zone = ctx.authZoneHost
  if (zone && zone.includes('.')) {
    const scheme = ctx.authZoneTls === 'cert' ? 'https' : 'http'
    return `${scheme}://${zone}`
  }

  return cleaned
}

export function resolveAcmeDnsBaseUrl(requestedUrl: string | undefined, fallback: string): string {
  return (requestedUrl || fallback).replace(/\/$/, '')
}
