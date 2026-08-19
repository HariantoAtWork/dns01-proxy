import type { AcmeDnsCredentials } from '#shared/types/clientstorage'
import { fulldomainForAccount } from '#shared/utils/fulldomain'

export function resolveAcmeDnsBase(requestedUrl?: string) {
  const config = useRuntimeConfig()
  const fallback = process.env.ACMEDNS_URL
    || process.env.NUXT_ACMEDNS_URL
    || config.acmednsUrl
    || 'http://acmedns-server'

  return (requestedUrl || fallback).replace(/\/$/, '')
}

export async function registerAcmeDnsAccount(serverUrl: string) {
  const base = resolveAcmeDnsBase(serverUrl)

  try {
    const payload = await $fetch<Partial<AcmeDnsCredentials>>(`${base}/register`, {
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
      fulldomain: fulldomainForAccount(payload.subdomain, base, payload.fulldomain),
      subdomain: payload.subdomain,
      username: payload.username,
      password: payload.password,
      server_url: base,
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
    const message = error instanceof Error ? error.message : 'Failed to update TXT'
    throw createError({
      statusCode: 502,
      statusMessage: message,
    })
  }
}
