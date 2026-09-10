import type { Server } from 'bun'
import { isIP } from 'node:net'
import { sanitizeIPv6addr } from '../utils/validation'

export type ClientIpSource = 'cf-connecting-ip' | 'x-real-ip' | 'x-forwarded-for' | 'peer' | 'unknown'

export interface ResolvedClientIp {
  address: string | null
  source: ClientIpSource
}

function headerIp(req: Request, name: string): string | null {
  const raw = req.headers.get(name)
  if (!raw) {
    return null
  }
  const first = raw.split(',')[0]?.trim()
  if (!first) {
    return null
  }
  const cleaned = sanitizeIPv6addr(first)
  return isIP(cleaned) ? cleaned : null
}

function peerIp(req: Request, server?: Server): string | null {
  if (!server || typeof server.requestIP !== 'function') {
    return null
  }
  try {
    const info = server.requestIP(req)
    const address = info?.address?.trim()
    if (!address) {
      return null
    }
    const cleaned = sanitizeIPv6addr(address)
    return isIP(cleaned) ? cleaned : null
  }
  catch {
    return null
  }
}

/**
 * Resolve client IP for Access Lists and upstream X-Real-IP.
 * When trustForwardedClientIp is false, only the Bun peer is used (anti-spoof).
 */
export function resolveProxyClientIp(
  req: Request,
  options: { trustForwardedClientIp: boolean, server?: Server },
): ResolvedClientIp {
  const peer = peerIp(req, options.server)

  if (!options.trustForwardedClientIp) {
    return peer
      ? { address: peer, source: 'peer' }
      : { address: null, source: 'unknown' }
  }

  const cf = headerIp(req, 'cf-connecting-ip')
  if (cf) {
    return { address: cf, source: 'cf-connecting-ip' }
  }
  const real = headerIp(req, 'x-real-ip')
  if (real) {
    return { address: real, source: 'x-real-ip' }
  }
  const xff = headerIp(req, 'x-forwarded-for')
  if (xff) {
    return { address: xff, source: 'x-forwarded-for' }
  }
  if (peer) {
    return { address: peer, source: 'peer' }
  }
  return { address: null, source: 'unknown' }
}
