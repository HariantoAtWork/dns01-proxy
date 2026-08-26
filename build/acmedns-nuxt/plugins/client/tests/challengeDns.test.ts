import { describe, expect, test } from 'bun:test'
import {
  CHALLENGE_LABEL,
  challengeHost,
  collectChallengeChecks,
  expectedChallengeTarget,
} from '../runtime/shared/utils/challengeDns'

const LOCAL = {
  username: 'u',
  password: 'p',
  subdomain: 'uuid-local',
  fulldomain: 'uuid-local.auth.uti.email',
  server_url: 'https://auth.uti.email',
}

const NESTED = {
  username: 'n',
  password: 'p',
  subdomain: 'uuid-nested',
  fulldomain: 'uuid-nested.auth.uti.email',
  server_url: 'https://auth.uti.email',
}

describe('challengeDns', () => {
  test('challenge host uses _acme-challenge label', () => {
    expect(challengeHost('mdstn.com')).toBe(`${CHALLENGE_LABEL}.mdstn.com`)
  })

  test('apex challenge targets fulldomain', () => {
    expect(expectedChallengeTarget(
      'mdstn.com',
      'mdstn.com',
      'mdstn.com',
      LOCAL.fulldomain,
    )).toBe(LOCAL.fulldomain)
  })

  test('nested zone chains to line apex challenge', () => {
    expect(expectedChallengeTarget(
      'mdstn.com',
      'oib.mdstn.com',
      'mdstn.com',
      LOCAL.fulldomain,
    )).toBe(`${CHALLENGE_LABEL}.mdstn.com`)
  })

  test('dedicated nested registration targets its fulldomain', () => {
    expect(expectedChallengeTarget(
      'mdstn.com',
      'admin.mdstn.com',
      'admin.mdstn.com',
      NESTED.fulldomain,
    )).toBe(NESTED.fulldomain)
  })

  test('collect checks for grouped line', () => {
    const checks = collectChallengeChecks([
      {
        line: 1,
        names: ['mdstn.com', '*.mdstn.com', '*.oib.mdstn.com'],
        certName: 'mdstn.com',
        expanded: ['mdstn.com', '*.mdstn.com', '*.oib.mdstn.com'],
        raw: 'mdstn.com *.mdstn.com *.oib.mdstn.com',
      },
    ], { 'mdstn.com': LOCAL })

    expect(checks).toHaveLength(2)
    expect(checks.find(c => c.zone === 'mdstn.com')).toMatchObject({
      name: `${CHALLENGE_LABEL}.mdstn.com`,
      expected: LOCAL.fulldomain,
      status: 'pending',
    })
    expect(checks.find(c => c.zone === 'oib.mdstn.com')).toMatchObject({
      name: `${CHALLENGE_LABEL}.oib.mdstn.com`,
      expected: `${CHALLENGE_LABEL}.mdstn.com`,
    })
  })

  test('collect reports missing account', () => {
    const checks = collectChallengeChecks([
      {
        line: 2,
        names: ['example.com'],
        certName: 'example.com',
        expanded: ['example.com'],
        raw: 'example.com',
      },
    ], {})

    expect(checks).toEqual([{
      line: 2,
      zone: 'example.com',
      name: `${CHALLENGE_LABEL}.example.com`,
      expected: '',
      status: 'no_account',
      message: 'No acme-dns account for example.com',
    }])
  })

  test('shared mode targets auth zone apex', () => {
    const shared = {
      authZone: 'auth.uti.email',
      serverUrl: 'https://auth.uti.email',
      account: {
        fulldomain: 'auth.uti.email',
        subdomain: 'auth',
        username: '00000000-0000-4000-8000-000000000001',
        password: 'x'.repeat(40),
        server_url: 'https://auth.uti.email',
      },
    }

    expect(expectedChallengeTarget(
      'mdstn.com',
      'mdstn.com',
      'mdstn.com',
      shared.account.fulldomain,
      shared.authZone,
    )).toBe('auth.uti.email')

    const checks = collectChallengeChecks([
      {
        line: 1,
        names: ['mdstn.com'],
        certName: 'mdstn.com',
        expanded: ['mdstn.com'],
        raw: 'mdstn.com',
      },
    ], {}, shared)

    expect(checks).toHaveLength(1)
    expect(checks[0]).toMatchObject({
      expected: 'auth.uti.email',
      status: 'pending',
    })
  })
})
