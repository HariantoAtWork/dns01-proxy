import { compareSync } from 'bcryptjs'
import { isLocalAcmeDnsBase } from '#shared/utils/acmeDnsRouting'
import { isSharedMode, sharedModeUsername } from '../../../../../server/utils/sharedModeBootstrap'
import { zoneApexTxtSubdomain } from '#shared/utils/tinyModeDns'
import {
  resolveAcmeDnsBase,
  routingContext,
  useInProcessUpdate,
} from './acmednsRouting'

export async function updateAcmeDnsTxt(options: {
  serverUrl: string
  username: string
  password: string
  subdomain: string
  txt: string
}) {
  const base = resolveAcmeDnsBase(options.serverUrl)
  const preferLocal = useInProcessUpdate(base, options.username)
    || (isSharedMode() && isLocalAcmeDnsBase(base, routingContext()))

  if (preferLocal) {
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
    if (!isSharedMode() && user.subdomain !== options.subdomain) {
      throw createError({
        statusCode: 401,
        statusMessage: 'acme-dns update failed: subdomain_mismatch',
        data: { error: 'subdomain_mismatch' },
      })
    }
    if (!validTXT(options.txt)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'acme-dns update failed: bad_txt (need exactly 43 chars A–Z a–z 0–9 - _)',
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

export function isLocalInProcessAcmeDns(): boolean {
  const base = resolveAcmeDnsBase()
  const ctx = routingContext()
  return isSharedMode() || isLocalAcmeDnsBase(base, ctx)
}

function authorizeInProcessTxtMutation(
  base: string,
  username: string,
  password: string,
  subdomain: string,
): void {
  if (!useInProcessUpdate(base, username) && !isSharedMode()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'TXT mutation only works with local in-process acme-dns',
    })
  }

  const user = getByUsername(isSharedMode() ? sharedModeUsername() : username)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'acme-dns update failed: account_not_found',
      data: { error: 'account_not_found' },
    })
  }
  if (!compareSync(password, user.password)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'acme-dns update failed: forbidden',
      data: { error: 'forbidden' },
    })
  }
  if (!isSharedMode() && user.subdomain !== subdomain) {
    throw createError({
      statusCode: 401,
      statusMessage: 'acme-dns update failed: subdomain_mismatch',
      data: { error: 'subdomain_mismatch' },
    })
  }
}

export async function clearAcmeDnsTxt(options: {
  serverUrl: string
  username: string
  password: string
  subdomain: string
  txt: string
}): Promise<number> {
  const base = resolveAcmeDnsBase(options.serverUrl)
  if (!useInProcessUpdate(base, options.username) && !isSharedMode()) {
    return 0
  }

  authorizeInProcessTxtMutation(
    base,
    options.username,
    options.password,
    options.subdomain,
  )

  return clearTxtByValue(options.subdomain, options.txt)
}

export async function purgeAcmeDnsTxtSlots(options?: {
  subdomain?: string
}): Promise<{ subdomain: string, cleared: number }> {
  if (!isLocalInProcessAcmeDns()) {
    throw createError({
      statusCode: 403,
      statusMessage: 'TXT purge only works with local in-process acme-dns',
    })
  }

  let subdomain = options?.subdomain?.trim()
  if (!subdomain) {
    if (!isSharedMode()) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Body must include subdomain when not in shared mode',
      })
    }
    subdomain = zoneApexTxtSubdomain(getAcmeConfig().general.domain)
  }

  return {
    subdomain,
    cleared: clearAllTxtForSubdomain(subdomain),
  }
}
