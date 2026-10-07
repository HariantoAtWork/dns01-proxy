import { afterEach, describe, expect, test } from 'bun:test'
import {
  envAcmednsUrl,
  envAuthDomain,
  envDefaultAcmednsUrl,
  envLetsencryptEmail,
  expandDomainRefs,
} from './env'

const KEYS = ['APEX', 'AUTH_DOMAIN', 'ACMEDNS_URL', 'NUXT_ACMEDNS_URL', 'NUXT_PUBLIC_DEFAULT_ACMEDNS_URL', 'LETSENCRYPT_EMAIL'] as const

const saved: Record<string, string | undefined> = {}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key]
    }
    else {
      process.env[key] = saved[key]
    }
  }
})

function clearEnv() {
  for (const key of KEYS) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
}

describe('envAuthDomain', () => {
  test('derives auth.<APEX> when AUTH_DOMAIN unset', () => {
    clearEnv()
    process.env.APEX = 'Example.ORG'
    expect(envAuthDomain()).toBe('auth.example.org')
  })

  test('expands ${APEX} in AUTH_DOMAIN', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    process.env.AUTH_DOMAIN = 'auth.${APEX}'
    expect(envAuthDomain()).toBe('auth.example.org')
  })

  test('prefers explicit AUTH_DOMAIN', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    process.env.AUTH_DOMAIN = 'Auth.Custom.Example.ORG'
    expect(envAuthDomain()).toBe('auth.custom.example.org')
  })
})

describe('envAcmednsUrl', () => {
  test('derives https URL from APEX when ACMEDNS_URL unset', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    expect(envAcmednsUrl()).toBe('https://auth.example.org')
  })

  test('expands ${AUTH_DOMAIN} in ACMEDNS_URL', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    process.env.AUTH_DOMAIN = 'auth.${APEX}'
    process.env.ACMEDNS_URL = 'https://${AUTH_DOMAIN}'
    expect(envAcmednsUrl()).toBe('https://auth.example.org')
  })

  test('prefers explicit ACMEDNS_URL over APEX', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    process.env.ACMEDNS_URL = 'http://127.0.0.1'
    expect(envAcmednsUrl()).toBe('http://127.0.0.1')
  })
})

describe('envDefaultAcmednsUrl', () => {
  test('derives from APEX like envAcmednsUrl', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    expect(envDefaultAcmednsUrl()).toBe('https://auth.example.org')
  })
})

describe('envLetsencryptEmail', () => {
  test('derives admin@<APEX> when LETSENCRYPT_EMAIL unset', () => {
    clearEnv()
    process.env.APEX = 'Example.org'
    expect(envLetsencryptEmail()).toBe('admin@example.org')
  })

  test('expands ${APEX} in explicit LETSENCRYPT_EMAIL', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    process.env.LETSENCRYPT_EMAIL = 'ops@${APEX}'
    expect(envLetsencryptEmail()).toBe('ops@example.org')
  })

  test('prefers explicit LETSENCRYPT_EMAIL', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    process.env.LETSENCRYPT_EMAIL = 'ops@other.test'
    expect(envLetsencryptEmail()).toBe('ops@other.test')
  })
})

describe('expandDomainRefs', () => {
  test('expands both refs in one pass', () => {
    clearEnv()
    process.env.APEX = 'example.org'
    process.env.AUTH_DOMAIN = 'auth.${APEX}'
    expect(expandDomainRefs('https://${AUTH_DOMAIN}/update')).toBe('https://auth.example.org/update')
  })
})
