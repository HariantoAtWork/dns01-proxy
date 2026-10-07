import { compareSync } from 'bcryptjs'
import type { AcmeDnsCredentials } from '#shared/types/clientstorage'
import { isLocalAcmeDnsBase } from '#shared/utils/acmeDnsRouting'
import { isSharedMode, sharedModeUsername } from '../../../../../server/utils/sharedModeBootstrap'
import {
  resolveAcmeDnsBase,
  routingContext,
  useInProcessUpdate,
} from './acmednsRouting'
import { updateAcmeDnsTxt } from './acmednsTxt'

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
