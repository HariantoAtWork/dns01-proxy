import { describe, expect, test } from 'bun:test'
import {
  normalizeBearerPaths,
  pathnameRequiresBearer,
} from '../runtime/shared/utils/bearerPaths'

describe('normalizeBearerPaths', () => {
  test('accepts array and newline text; strips root and duplicates', () => {
    expect(normalizeBearerPaths(['/tunnel', '/tunnel/', 'tunnel', '/', '/t'])).toEqual([
      '/tunnel',
      '/t',
    ])
    expect(normalizeBearerPaths('/tunnel\n/health')).toEqual(['/tunnel', '/health'])
    expect(normalizeBearerPaths(null)).toEqual([])
  })
})

describe('pathnameRequiresBearer', () => {
  test('empty prefixes gate all paths', () => {
    expect(pathnameRequiresBearer('/t/abc', [])).toBe(true)
    expect(pathnameRequiresBearer('/tunnel', undefined)).toBe(true)
  })

  test('prefix match with boundary', () => {
    expect(pathnameRequiresBearer('/tunnel', ['/tunnel'])).toBe(true)
    expect(pathnameRequiresBearer('/tunnel/', ['/tunnel'])).toBe(true)
    expect(pathnameRequiresBearer('/tunneling', ['/tunnel'])).toBe(false)
    expect(pathnameRequiresBearer('/t/abc', ['/tunnel'])).toBe(false)
    expect(pathnameRequiresBearer('/health', ['/tunnel'])).toBe(false)
  })
})
