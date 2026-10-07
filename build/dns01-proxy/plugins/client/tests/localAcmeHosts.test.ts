import { describe, expect, test } from 'bun:test'
import os from 'node:os'
import {
  internalAcmeDnsHosts,
  isInternalAcmeDnsHost,
  normalizeAcmeHost,
} from '../runtime/server/utils/localAcmeHosts'

describe('localAcmeHosts', () => {
  test('normalises host casing and trailing dot', () => {
    expect(normalizeAcmeHost('Auth.Example.ORG.')).toBe('auth.example.org')
  })

  test('loopback hosts are internal', () => {
    expect(isInternalAcmeDnsHost('127.0.0.1')).toBe(true)
    expect(isInternalAcmeDnsHost('localhost')).toBe(true)
    expect(isInternalAcmeDnsHost('::1')).toBe(true)
  })

  test('os.hostname is internal', () => {
    expect(isInternalAcmeDnsHost(os.hostname())).toBe(true)
  })

  test('arbitrary compose service names are not internal', () => {
    expect(isInternalAcmeDnsHost('dns01-proxy')).toBe(false)
    expect(internalAcmeDnsHosts().has('dns01-proxy')).toBe(false)
  })
})
