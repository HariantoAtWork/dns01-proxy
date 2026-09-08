import { compareSync } from 'bcryptjs'
import type { AcmeDnsCredentials } from '#shared/types/clientstorage'
import { fulldomainForAccount } from '#shared/utils/fulldomain'
import {
  hostnameOf,
  identityServerUrl as routingIdentityServerUrl,
  isLocalAcmeDnsBase,
  resolveAcmeDnsBaseUrl,
  shouldUseInProcessUpdate,
  type AcmeDnsRoutingContext,
} from '#shared/utils/acmeDnsRouting'
import { isSharedMode, sharedModeUsername } from '../../../../../server/utils/sharedModeBootstrap'
import { zoneApexTxtSubdomain } from '#shared/utils/tinyModeDns'
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

function routingContext(): AcmeDnsRoutingContext {
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

function identityServerUrl(resolvedBase: string): string {
  return routingIdentityServerUrl(resolvedBase, routingContext())
}

function useInProcessUpdate(base: string, username: string): boolean {
  return shouldUseInProcessUpdate(base, username, routingContext(), user => Boolean(getByUsername(user)))
}

/** True when Publish TXT uses this stack's in-process store (not HTTP /update to a remote host). */
export function isInProcessAcmeDnsPublish(serverUrl: string, username: string): boolean {
  if (isSharedMode()) {
    return true
  }
  return useInProcessUpdate(resolveAcmeDnsBase(serverUrl), username)
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

export async function updateAcmeDnsTxt(options: {
  serverUrl: string
  username: string
  password: string
  subdomain: string
  txt: string
}) {
  const base = resolveAcmeDnsBase(options.serverUrl)

  if (useInProcessUpdate(base, options.username) || isSharedMode()) {
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

export type AcmeDnsAccountVerifyStatus = 'ok' | 'invalid' | 'unreachable'

export interface AcmeDnsAccountVerifyResult {
  ok: boolean
  status: AcmeDnsAccountVerifyStatus
  message: string
  code?: string
}

const TXT_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function randomProbeTxt(): string {
  const bytes = new Uint8Array(43)
  globalThis.crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) {
    out += TXT_ALPHABET[byte % TXT_ALPHABET.length]!
  }
  return out
}

function verifyResultFromCode(code: string): AcmeDnsAccountVerifyResult {
  if (code === 'account_not_found' || code === 'forbidden' || code === 'subdomain_mismatch') {
    return {
      ok: false,
      status: 'invalid',
      code,
      message: code === 'account_not_found'
        ? 'Account missing on this acme-dns server (reset or never registered here)'
        : code === 'forbidden'
          ? 'Username/password rejected by acme-dns'
          : 'Subdomain does not match this account',
    }
  }
  return {
    ok: false,
    status: 'unreachable',
    code,
    message: `acme-dns verify failed: ${code}`,
  }
}

/**
 * Confirm stored credentials still work on the account's server_url.
 * Local/in-process: password check only (no TXT write).
 * Remote: one probe /update (acme-dns has no list/verify API).
 */
export async function verifyAcmeDnsCredentials(
  details: Pick<AcmeDnsCredentials, 'server_url' | 'username' | 'password' | 'subdomain'>,
): Promise<AcmeDnsAccountVerifyResult> {
  const base = resolveAcmeDnsBase(details.server_url)
  const ctx = routingContext()

  if (useInProcessUpdate(base, details.username) || isLocalAcmeDnsBase(base, ctx) || isSharedMode()) {
    const expectedUser = isSharedMode() ? sharedModeUsername() : details.username
    const user = getByUsername(expectedUser)
    if (!user) {
      return verifyResultFromCode('account_not_found')
    }
    if (!compareSync(details.password, user.password)) {
      return verifyResultFromCode('forbidden')
    }
    if (!isSharedMode() && user.subdomain !== details.subdomain) {
      return verifyResultFromCode('subdomain_mismatch')
    }
    return {
      ok: true,
      status: 'ok',
      message: isSharedMode()
        ? 'Shared acme-dns credentials match the local server'
        : 'Credentials match the local acme-dns account',
    }
  }

  try {
    await updateAcmeDnsTxt({
      serverUrl: details.server_url,
      username: details.username,
      password: details.password,
      subdomain: details.subdomain,
      txt: randomProbeTxt(),
    })
    return {
      ok: true,
      status: 'ok',
      message: 'Credentials accepted by remote acme-dns (/update)',
    }
  }
  catch (error) {
    const data = (error as { data?: { error?: string }, statusMessage?: string })?.data
    const statusMessage = (error as { statusMessage?: string })?.statusMessage || ''
    const code = data?.error
      || /account_not_found|forbidden|subdomain_mismatch|bad_txt/i.exec(statusMessage)?.[0]?.toLowerCase()

    if (code) {
      return verifyResultFromCode(code)
    }

    const message = error instanceof Error
      ? error.message
      : 'Could not reach acme-dns to verify'
    return {
      ok: false,
      status: 'unreachable',
      message,
    }
  }
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  const queue = [...items]
  const runners = Array.from(
    { length: Math.min(concurrency, Math.max(queue.length, 1)) },
    async () => {
      while (queue.length) {
        const item = queue.shift()
        if (item === undefined) {
          return
        }
        await worker(item)
      }
    },
  )
  await Promise.all(runners)
}

export async function verifyAcmeDnsStorageAccounts(
  storage: Record<string, AcmeDnsCredentials>,
  domains?: string[],
): Promise<Record<string, AcmeDnsAccountVerifyResult>> {
  const keys = domains?.length
    ? domains.filter(domain => Boolean(storage[domain]))
    : Object.keys(storage)

  const results: Record<string, AcmeDnsAccountVerifyResult> = {}
  await mapPool(keys, 4, async (domain) => {
    const details = storage[domain]
    if (!details) {
      results[domain] = {
        ok: false,
        status: 'invalid',
        message: 'Not in clientstorage',
      }
      return
    }
    results[domain] = await verifyAcmeDnsCredentials(details)
  })
  return results
}
