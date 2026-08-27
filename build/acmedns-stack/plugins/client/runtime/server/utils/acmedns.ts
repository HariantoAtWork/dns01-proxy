import { compareSync } from 'bcryptjs'
import type { AcmeDnsCredentials } from '#shared/types/clientstorage'
import { fulldomainForAccount } from '#shared/utils/fulldomain'
import { isSharedMode, sharedModeUsername } from '../../../../../server/utils/sharedMode'
import { resolveAcmednsUrl } from './appSettings'
import { isInternalAcmeDnsHost } from './localAcmeHosts'

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

function preferredPublicAcmeHost(): string {
  return hostnameOf(resolveAcmednsUrl().value)
}

/** In-process API (loopback / container hostname / auth zone / ACMEDNS_URL). */
function isLocalAcmeDnsBase(base: string): boolean {
  if (!base || base.startsWith('local://')) {
    return true
  }
  const host = hostnameOf(base)
  if (!host) {
    return false
  }
  if (isInternalAcmeDnsHost(host)) {
    return true
  }
  const zone = authZoneHost()
  if (zone && host === zone) {
    return true
  }
  const publicHost = preferredPublicAcmeHost()
  return Boolean(publicHost && host === publicHost)
}

/**
 * Prefer in-process /update when server_url is the public identity of this
 * process (ACMEDNS_URL) and the account actually lives in the local DB.
 * Avoids HTTPS self-fetch via Cloudflare (TLS / admin login) after register
 * rewrote loopback to the public URL.
 */
function useInProcessUpdate(base: string, username: string): boolean {
  if (isLocalAcmeDnsBase(base)) {
    return true
  }
  const host = hostnameOf(base)
  const publicHost = preferredPublicAcmeHost()
  if (!host || !publicHost || host !== publicHost) {
    return false
  }
  return Boolean(getByUsername(username))
}

/**
 * URL stored on the account for CNAME / UI.
 * Prefer a public ACMEDNS_URL (or auth zone) over loopback so register
 * does not persist http://127.0.0.1 when the operator set a public identity.
 */
function identityServerUrl(resolvedBase: string): string {
  const cleaned = resolvedBase.replace(/\/$/, '')
  const host = hostnameOf(cleaned)
  if (host && !isInternalAcmeDnsHost(host)) {
    return cleaned
  }

  const preferred = resolveAcmednsUrl().value
  if (preferred && !isInternalAcmeDnsHost(hostnameOf(preferred))) {
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
  const fallback = resolveAcmednsUrl().value || defaultLocalAcmeDnsBase()
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

  if (useInProcessUpdate(base, details.username) || isLocalAcmeDnsBase(base) || isSharedMode()) {
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
