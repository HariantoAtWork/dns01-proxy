import { describe, expect, test } from 'bun:test'
import acme from 'acme-client'
import { createHash } from 'node:crypto'
import { fakeAcmeOrder } from '../runtime/server/utils/fakeAcmeOrder'

describe('fakeAcmeOrder', () => {
  test('generates dns-01 TXT values matching acme-client digest', async () => {
    const accountKey = (await acme.crypto.createPrivateKey()).toString()
    const token = 'test-token-value'
    const jwk = acme.crypto.getJwk(accountKey)
    const thumbprint = createHash('sha256').update(JSON.stringify(jwk)).digest('base64url')
    const expected = createHash('sha256').update(`${token}.${thumbprint}`).digest('base64url')

    const client = new acme.Client({
      directoryUrl: acme.directory.letsencrypt.staging,
      accountKey,
    })
    const fromClient = await client.getChallengeKeyAuthorization({
      type: 'dns-01',
      token,
      url: 'https://example.invalid/challenge',
      status: 'pending',
    })

    const { challenges } = await fakeAcmeOrder(['example.com'])
    expect(challenges).toHaveLength(1)
    expect(challenges[0]!.domain).toBe('example.com')
    expect(challenges[0]!.keyAuthorization).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(fromClient).toBe(expected)
    expect(challenges[0]!.keyAuthorization.length).toBeGreaterThan(10)
  })

  test('creates one challenge per SAN', async () => {
    const { challenges } = await fakeAcmeOrder(['a.example.com', 'b.example.com'])
    expect(challenges.map(c => c.domain)).toEqual(['a.example.com', 'b.example.com'])
  })
})
