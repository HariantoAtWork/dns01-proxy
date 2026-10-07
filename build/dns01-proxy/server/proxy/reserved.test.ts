import { describe, expect, test } from 'bun:test'
import { findReservedDomainOverlap, isReservedHostname } from '../proxy/reserved'

describe('proxy reserved hosts', () => {
  test('normalises hostname comparison via env when set', () => {
    const previous = process.env.AUTH_DOMAIN
    process.env.AUTH_DOMAIN = 'auth.example.test'
    try {
      expect(isReservedHostname('auth.example.test')).toBe(true)
      expect(isReservedHostname('AUTH.EXAMPLE.TEST.')).toBe(true)
      expect(isReservedHostname('ha.example.test')).toBe(false)
      expect(findReservedDomainOverlap(['ha.example.test', 'auth.example.test'])).toEqual([
        'auth.example.test',
      ])
    }
    finally {
      if (previous === undefined) {
        delete process.env.AUTH_DOMAIN
      }
      else {
        process.env.AUTH_DOMAIN = previous
      }
    }
  })
})
