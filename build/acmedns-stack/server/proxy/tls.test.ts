import { describe, expect, test } from 'bun:test'
import { sniHostnamesForDomain } from './tls'

describe('sniHostnamesForDomain', () => {
  test('returns exact domain as-is', () => {
    expect(sniHostnamesForDomain('Vault.Example.com.', ['*.example.com'])).toEqual([
      'vault.example.com',
    ])
  })

  test('expands wildcard to exact cert SANs that match', () => {
    expect(
      sniHostnamesForDomain('*.example.com', [
        '*.example.com',
        'app.example.com',
        'www.example.com',
        'other.org',
      ]),
    ).toEqual(['app.example.com', 'www.example.com'])
  })

  test('does not register literal wildcard as serverName', () => {
    expect(sniHostnamesForDomain('*.example.com', ['*.example.com'])).toEqual([])
  })
})
