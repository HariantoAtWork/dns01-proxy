import { createHash, randomBytes } from 'node:crypto'
import acme from 'acme-client'
import { canonicalSans } from '../../../../client/runtime/shared/utils/domains'

export interface FakeAcmeChallenge {
  domain: string
  token: string
  /** dns-01 TXT value (same as acme-client passes to challengeCreateFn). */
  keyAuthorization: string
}

function dns01TxtValue(token: string, accountKey: string): string {
  const jwk = acme.crypto.getJwk(accountKey)
  const thumbprint = createHash('sha256').update(JSON.stringify(jwk)).digest('base64url')
  const keyAuth = `${token}.${thumbprint}`
  return createHash('sha256').update(keyAuth).digest('base64url')
}

export async function fakeAcmeOrder(altNames: string[]): Promise<{
  challenges: FakeAcmeChallenge[]
}> {
  const accountKey = (await acme.crypto.createPrivateKey()).toString()
  const challenges: FakeAcmeChallenge[] = []

  for (const domain of canonicalSans(altNames)) {
    const token = randomBytes(32).toString('base64url')
    const keyAuthorization = dns01TxtValue(token, accountKey)
    challenges.push({ domain, token, keyAuthorization })
  }

  return { challenges }
}

export function formatFakeAcmeOrderDetail(challenges: FakeAcmeChallenge[]): string {
  return challenges
    .map(c => `${c.domain}: ${c.keyAuthorization.slice(0, 24)}…`)
    .join(', ')
}
