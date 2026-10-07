import { describe, expect, test } from 'bun:test'
import { getLabDomainsFilePath } from '../../../core/paths'

describe('lab domains path', () => {
  test('resolves lab-domains.txt under client data dir', () => {
    const previous = process.env.ACMEDNS_DATA_ROOT
    process.env.ACMEDNS_DATA_ROOT = '/tmp/acmedns-test-data'
    try {
      expect(getLabDomainsFilePath()).toBe('/tmp/acmedns-test-data/client/lab-domains.txt')
    }
    finally {
      if (previous === undefined) {
        delete process.env.ACMEDNS_DATA_ROOT
      }
      else {
        process.env.ACMEDNS_DATA_ROOT = previous
      }
    }
  })
})
