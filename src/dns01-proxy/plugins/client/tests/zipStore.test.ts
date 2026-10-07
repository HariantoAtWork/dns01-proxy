import { describe, expect, test } from 'bun:test'
import { createZipStore, groupZipCertFolders, parseZipStore, parseZipStorePaths } from '../runtime/server/utils/zipStore'

describe('zipStore', () => {
  test('round-trips store entries', () => {
    const files = {
      'cert.pem': '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n',
      'privkey.pem': '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n',
    }
    const zip = createZipStore(files)
    expect(parseZipStore(zip)).toEqual({
      'cert.pem': Buffer.from(files['cert.pem'], 'utf8'),
      'privkey.pem': Buffer.from(files['privkey.pem'], 'utf8'),
    })
  })

  test('reads files from nested zip paths by basename', () => {
    const zip = createZipStore({
      'live/example.org/fullchain.pem': 'fullchain',
    })
    expect(parseZipStore(zip)['fullchain.pem']?.toString('utf8')).toBe('fullchain')
  })

  test('groups cert folders for batch upload', () => {
    const zip = createZipStore({
      'example.org/cert.pem': 'cert-a',
      'example.org/privkey.pem': 'key-a',
      'other.org/cert.pem': 'cert-b',
    })
    expect(groupZipCertFolders(parseZipStorePaths(zip))).toEqual({
      'example.org': {
        'cert.pem': Buffer.from('cert-a', 'utf8'),
        'privkey.pem': Buffer.from('key-a', 'utf8'),
      },
      'other.org': {
        'cert.pem': Buffer.from('cert-b', 'utf8'),
      },
    })
  })
})
