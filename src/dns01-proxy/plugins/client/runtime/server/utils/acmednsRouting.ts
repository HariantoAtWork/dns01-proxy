import {
  hostnameOf,
  identityServerUrl as routingIdentityServerUrl,
  isLocalAcmeDnsBase,
  resolveAcmeDnsBaseUrl,
  shouldUseInProcessUpdate,
  type AcmeDnsRoutingContext,
} from '#shared/utils/acmeDnsRouting'
import { isSharedMode } from '../../../../../server/utils/sharedModeBootstrap'
import { resolveAcmednsUrl } from './appSettings'
import { isInternalAcmeDnsHost } from './localAcmeHosts'

function authZoneHost(): string {
  try {
    return getAcmeConfig().general.domain.replace(/\.$/, '').toLowerCase()
  }
  catch {
    return ''
  }
}

function preferredPublicAcmeHost(): string {
  return hostnameOf(resolveAcmednsUrl().value)
}

export function routingContext(): AcmeDnsRoutingContext {
  return {
    authZoneHost: authZoneHost(),
    preferredPublicHost: preferredPublicAcmeHost(),
    preferredAcmednsUrl: resolveAcmednsUrl().value,
    authZoneTls: (() => {
      try {
        return getAcmeConfig().api.tls
      }
      catch {
        return 'none'
      }
    })(),
    isInternalHost: isInternalAcmeDnsHost,
  }
}

export function identityServerUrl(resolvedBase: string): string {
  return routingIdentityServerUrl(resolvedBase, routingContext())
}

export function useInProcessUpdate(base: string, username: string): boolean {
  return shouldUseInProcessUpdate(base, username, routingContext(), user => Boolean(getByUsername(user)))
}

/** True when Publish TXT uses this stack's in-process store (not HTTP /update to a remote host). */
export function isInProcessAcmeDnsPublish(serverUrl: string, username: string): boolean {
  const base = resolveAcmeDnsBase(serverUrl)
  if (useInProcessUpdate(base, username)) {
    return true
  }
  // Tiny/shared: only treat as local when the URL is this stack’s identity.
  if (isSharedMode()) {
    return isLocalAcmeDnsBase(base, routingContext())
  }
  return false
}

export function resolveAcmeDnsBase(requestedUrl?: string) {
  const fallback = resolveAcmednsUrl().value || defaultLocalAcmeDnsBase()
  return resolveAcmeDnsBaseUrl(requestedUrl, fallback)
}

function defaultLocalAcmeDnsBase(): string {
  try {
    return localApiBaseUrl()
  }
  catch {
    return 'http://127.0.0.1'
  }
}
