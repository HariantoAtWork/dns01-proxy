import { afterEach, describe, expect, test } from 'bun:test'
import { acmeTxtOnlineTcpFallback } from '../runtime/shared/utils/challengeTxtOnlineEnv'

const ENV_KEY = 'ACME_TXT_ONLINE_TCP_FALLBACK'

describe('acmeTxtOnlineTcpFallback', () => {
  afterEach(() => {
    delete process.env[ENV_KEY]
  })

  test('defaults to false (UDP only)', () => {
    delete process.env[ENV_KEY]
    expect(acmeTxtOnlineTcpFallback()).toBe(false)
  })

  test('accepts common truthy values', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
      process.env[ENV_KEY] = value
      expect(acmeTxtOnlineTcpFallback()).toBe(true)
    }
  })

  test('rejects other values', () => {
    for (const value of ['0', 'false', 'no', 'off', '']) {
      process.env[ENV_KEY] = value
      expect(acmeTxtOnlineTcpFallback()).toBe(false)
    }
  })
})
