import { compareSync } from 'bcryptjs'
import type { AcmeDnsCredentials } from '#shared/types/clientstorage'
import { fulldomainForAccount } from '#shared/utils/fulldomain'

function hostnameOf(base: string): string {
  try {
    return new URL(base).hostname.replace(/\.$/, '').toLowerCase()
  }
  catch {
    return ''
  }
}

function authZoneHost(): string {
  try {
    return getAcmeConfig().general.domain.replace(/\.$/, '').toLowerCase()
  }
  catch {
    return ''
  }
}

function isLoopbackAcmeDnsHost(host: string): boolean {
  return host === '127.0.0.1'
    || host === 'localhost'
    || host === '::1'
    || host === 'acmedns-server'
    || host === 'acmedns-nuxt'
}

/** In-process API (loopback / compose name / this stack's auth zone). */
function isLocalAcmeDnsBase(base: string): boolean {
  if (!base || base.startsWith('local://')) {
    return true
  }
  const host = hostnameOf(base)
  if (!host) {
    return false
  }
  if (isLoopbackAcmeDnsHost(host)) {
    return true
  }
  const zone = authZoneHost()
  return Boolean(zone && host === zone)
}

/**
 * URL stored on the account for CNAME / UI.
 * Prefer a public ACMEDNS_URL (or auth zone) over loopback so register
 * does not persist http://127.0.0.1 when the operator set a public identity.
 */
function identityServerUrl(resolvedBase: string): string {
  const cleaned = resolvedBase.replace(/\/$/, '')
  const host = hostnameOf(cleaned)
  if (host && !isLoopbackAcmeDnsHost(host)) {
    return cleaned
  }

  const preferred = (
    process.env.ACMEDNS_URL
    || process.env.NUXT_ACMEDNS_URL
    || ''
  ).replace(/\/$/, '')
  if (preferred && !isLoopbackAcmeDnsHost(hostnameOf(preferred))) {
    return preferred
  }

  const zone = authZoneHost()
  if (zone && zone.includes('.')) {
    try {
      const scheme = getAcmeConfig().api.tls === 'cert' ? 'https' : 'http'
      return `${scheme}://${zone}`
    }
    catch {
      return `https://${zone}`
    }
  }

  return cleaned
}

export function resolveAcmeDnsBase(requestedUrl?: string) {
  const config = useRuntimeConfig()
  const fallback = process.env.ACMEDNS_URL
    || process.env.NUXT_ACMEDNS_URL
    || (config.acmednsUrl as string)
    || defaultLocalAcmeDnsBase()

  return (requestedUrl || fallback).replace(/\/$/, '')
}

function defaultLocalAcmeDnsBase(): string {
  try {
    return localApiBaseUrl()
  }
  catch {
    return 'http://127.0.0.1'
  }
}

export async function registerAcmeDnsAccount(serverUrl: string) {
  const base = resolveAcmeDnsBase(serverUrl)
  const storedUrl = identityServerUrl(base)

  if (isLocalAcmeDnsBase(base)) {
    try {
      const account = registerAccount([])
      const acmeConfig = getAcmeConfig()
      const reported = `${account.subdomain}.${acmeConfig.general.domain}`
      return {
        fulldomain: fulldomainForAccount(account.subdomain, storedUrl, reported),
        subdomain: account.subdomain,
        username: account.username,
        password: account.plaintextPassword,
        server_url: storedUrl,
        allowfrom: account.allowfrom,
      } satisfies AcmeDnsCredentials
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register with local acme-dns'
      throw createError({
        statusCode: 500,
        statusMessage: message,
      })
    }
  }

  try {
    const payload = await $fetch<Partial<AcmeDnsCredentials> & { fulldomain?: string }>(`${base}/register`, {
      method: 'POST',
      body: {},
    })

    if (!payload?.fulldomain || !payload.username || !payload.password || !payload.subdomain) {
      throw createError({
        statusCode: 502,
        statusMessage: 'acme-dns register returned an incomplete account',
      })
    }

    return {
      fulldomain: fulldomainForAccount(payload.subdomain, storedUrl, payload.fulldomain),
      subdomain: payload.subdomain,
      username: payload.username,
      password: payload.password,
      server_url: storedUrl,
      allowfrom: payload.allowfrom,
    } satisfies AcmeDnsCredentials
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to register with acme-dns'
    throw createError({
      statusCode: 502,
      statusMessage: message,
    })
  }
}

export async function updateAcmeDnsTxt(options: {
  serverUrl: string
  username: string
  password: string
  subdomain: string
  txt: string
}) {
  const base = resolveAcmeDnsBase(options.serverUrl)

  if (isLocalAcmeDnsBase(base)) {
    const user = getByUsername(options.username)
    if (!user) {
      throw createError({
        statusCode: 401,
        statusMessage: 'acme-dns update failed: account_not_found',
        data: { error: 'account_not_found' },
      })
    }
    if (!compareSync(options.password, user.password)) {
      throw createError({
        statusCode: 401,
        statusMessage: 'acme-dns update failed: forbidden',
        data: { error: 'forbidden' },
      })
    }
    if (user.subdomain !== options.subdomain) {
      throw createError({
        statusCode: 401,
        statusMessage: 'acme-dns update failed: subdomain_mismatch',
        data: { error: 'subdomain_mismatch' },
      })
    }
    if (!validTXT(options.txt)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'acme-dns update failed: bad_txt',
        data: { error: 'bad_txt' },
      })
    }
    const updated = updateTXT({ subdomain: options.subdomain, txt: options.txt })
    if (!updated) {
      throw createError({
        statusCode: 404,
        statusMessage: 'acme-dns update failed: subdomain_not_found',
        data: { error: 'subdomain_not_found' },
      })
    }
    return { txt: options.txt }
  }

  try {
    return await $fetch(`${base}/update`, {
      method: 'POST',
      headers: {
        'X-Api-User': options.username,
        'X-Api-Key': options.password,
      },
      body: {
        subdomain: options.subdomain,
        txt: options.txt,
      },
    })
  }
  catch (error) {
    const data = (error as { data?: { error?: string } })?.data
    const code = data?.error
    const message = code
      ? `acme-dns update failed: ${code}`
      : (error instanceof Error ? error.message : 'Failed to update TXT')
    throw createError({
      statusCode: 502,
      statusMessage: message,
    })
  }
}
