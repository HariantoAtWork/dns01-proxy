import { describe, expect, test } from 'bun:test'
import { visitMatchesDomainEntry } from '../runtime/shared/utils/proxyHost'

describe('visitMatchesDomainEntry', () => {
  test('matches exact domain', () => {
    expect(visitMatchesDomainEntry('app.example.com', 'app.example.com')).toBe(true)
    expect(visitMatchesDomainEntry('APP.example.com', 'app.example.com')).toBe(true)
    expect(visitMatchesDomainEntry('other.example.com', 'app.example.com')).toBe(false)
  })

  test('matches one-label wildcard entries', () => {
    expect(visitMatchesDomainEntry('blog.example.com', '*.example.com')).toBe(true)
    expect(visitMatchesDomainEntry('a.b.example.com', '*.example.com')).toBe(false)
    expect(visitMatchesDomainEntry('example.com', '*.example.com')).toBe(false)
  })
})
