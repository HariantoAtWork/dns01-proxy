import type { AcmeDnsCredentials } from '#shared/types/clientstorage'
import { fulldomainForAccount } from '#shared/utils/fulldomain'
import { isLocalAcmeDnsBase } from '#shared/utils/acmeDnsRouting'
import {
  identityServerUrl,
  resolveAcmeDnsBase,
  routingContext,
} from './acmednsRouting'

export async function registerAcmeDnsAccount(serverUrl: string) {
  const base = resolveAcmeDnsBase(serverUrl)
  const storedUrl = identityServerUrl(base)
  const ctx = routingContext()

  if (isLocalAcmeDnsBase(base, ctx)) {
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
