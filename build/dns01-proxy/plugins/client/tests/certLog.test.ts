import { describe, expect, test } from 'bun:test'
import {
  certActivitySourceLabel,
  certLogTree,
  formatCertActivityPrefix,
} from '../runtime/shared/utils/certLog'

describe('certLog', () => {
  test('maps production to live tree label', () => {
    expect(certLogTree('production')).toBe('live')
    expect(certLogTree('staging')).toBe('staging')
  })

  test('formats mode-aware console prefixes', () => {
    expect(formatCertActivityPrefix('acme', 'production')).toBe('[live/acme]')
    expect(formatCertActivityPrefix('apply', 'staging')).toBe('[staging/apply]')
    expect(formatCertActivityPrefix('renew', 'production')).toBe('[live/renew]')
  })

  test('falls back when mode is omitted', () => {
    expect(formatCertActivityPrefix('system')).toBe('[cert-system]')
    expect(formatCertActivityPrefix('acme')).toBe('[acme]')
  })

  test('formats lab source without mode tree', () => {
    expect(formatCertActivityPrefix('lab')).toBe('[lab]')
    expect(certActivitySourceLabel('lab')).toBe('lab')
  })
})
