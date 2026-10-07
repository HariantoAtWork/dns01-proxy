import { describe, expect, test } from 'bun:test'
import {
  defaultAcmednsUrlForTinyDomain,
  normalizeTinyDomain,
} from '../runtime/shared/utils/tinyDomain'

describe('tinyDomain', () => {
  test('normalises hostname without scheme', () => {
    expect(normalizeTinyDomain('auth.uti.email.')).toBe('auth.uti.email')
  })

  test('strips https URL to hostname', () => {
    expect(normalizeTinyDomain('https://auth.uti.email/path')).toBe('auth.uti.email')
  })

  test('default URL uses https', () => {
    expect(defaultAcmednsUrlForTinyDomain('auth.uti.email')).toBe('https://auth.uti.email')
  })
})
