import { describe, expect, test } from 'bun:test'
import {
  certHasWildcardSanForPattern,
  coveringWildcardSanForHostname,
  fingerprintEdgeTls,
  fingerprintEdgeTlsPems,
  sniHostnamesForDomain,
  sniServerNamesForProxyDomain,
  type BunTlsEntry,
} from './tls'

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

  test('includes apex when present on a wildcard-only cert', () => {
    expect(
      sniHostnamesForDomain('*.uti.email', ['*.uti.email', 'uti.email']),
    ).toEqual(['uti.email'])
  })

  test('wildcard-only SAN without apex yields no exact SNI names', () => {
    expect(sniHostnamesForDomain('*.example.com', ['*.example.com'])).toEqual([])
  })
})

describe('coveringWildcardSanForHostname', () => {
  test('picks one-label parent for nested admin hosts', () => {
    expect(coveringWildcardSanForHostname(
      'test.admin.harianto.dev',
      ['*.harianto.dev', '*.admin.harianto.dev', 'harianto.dev'],
    )).toBe('*.admin.harianto.dev')
  })

  test('does not use apex wildcard for nested names', () => {
    expect(coveringWildcardSanForHostname(
      'test.admin.harianto.dev',
      ['*.harianto.dev', 'harianto.dev'],
    )).toBeNull()
  })

  test('covers one-label hosts with zone wildcard', () => {
    expect(coveringWildcardSanForHostname(
      'banana.uti.email',
      ['*.uti.email', 'uti.email'],
    )).toBe('*.uti.email')
  })
})

describe('sniServerNamesForProxyDomain', () => {
  test('exact nested host uses parent wildcard SNI when cert has it', () => {
    expect(sniServerNamesForProxyDomain(
      'test.admin.harianto.dev',
      ['*.admin.harianto.dev', 'admin.harianto.dev'],
    )).toEqual(['*.admin.harianto.dev'])
  })

  test('two nested hosts share the same SNI set (no fingerprint churn)', () => {
    const sans = ['*.admin.harianto.dev', 'admin.harianto.dev']
    expect(sniServerNamesForProxyDomain('blog.admin.harianto.dev', sans)).toEqual(
      sniServerNamesForProxyDomain('test.admin.harianto.dev', sans),
    )
  })

  test('wildcard proxy row registers literal *.zone + apex only', () => {
    expect(sniServerNamesForProxyDomain(
      '*.admin.harianto.dev',
      ['*.admin.harianto.dev', 'admin.harianto.dev'],
    )).toEqual(['*.admin.harianto.dev', 'admin.harianto.dev'])
  })

  test('falls back to exact name when cert has no parent wildcard', () => {
    expect(sniServerNamesForProxyDomain(
      'test.admin.harianto.dev',
      ['test.admin.harianto.dev'],
    )).toEqual(['test.admin.harianto.dev'])
  })
})

describe('certHasWildcardSanForPattern', () => {
  test('detects matching wildcard SAN', () => {
    expect(certHasWildcardSanForPattern('*.uti.email', ['*.uti.email', 'uti.email'])).toBe(true)
    expect(certHasWildcardSanForPattern('*.uti.email', ['uti.email'])).toBe(false)
    expect(certHasWildcardSanForPattern('derp.uti.email', ['*.uti.email'])).toBe(false)
  })
})

describe('Bun.serve literal wildcard serverName', () => {
  test('matches nested multi-label names via parent *.admin.zone SNI', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const { $ } = await import('bun')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sni-admin-'))

    const keyPath = path.join(dir, 'admin.key')
    const certPath = path.join(dir, 'admin.crt')
    const confPath = path.join(dir, 'admin.cnf')
    await Bun.write(
      confPath,
      '[req]\ndistinguished_name=req\n[req]\n[v3]\nsubjectAltName=DNS:*.admin.harianto.dev,DNS:admin.harianto.dev\n',
    )
    await $`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj /CN=admin.harianto.dev -extensions v3 -config ${confPath}`.quiet()
    const cert = await fs.readFile(certPath, 'utf-8')
    const key = await fs.readFile(keyPath, 'utf-8')

    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      tls: [
        { cert, key, serverName: '*.admin.harianto.dev' },
        { cert, key, serverName: 'admin.harianto.dev' },
      ],
      fetch: () => new Response('ok'),
    })
    const port = server.port!
    try {
      const out = await $`openssl s_client -connect 127.0.0.1:${port} -servername test.admin.harianto.dev`.nothrow().quiet()
      const text = `${out.stdout.toString()}${out.stderr.toString()}`
      const cn = (text.match(/subject=.*?CN\s*=\s*([^\s/,]+)/i) || text.match(/subject=.*?\/CN=([^\s/]+)/))?.[1]
      expect(cn).toBe('admin.harianto.dev')
    }
    finally {
      server.stop(true)
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('matches one-label SNI for multiple *.zone entries', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const { $ } = await import('bun')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sni-wc-'))

    async function makeLeaf(cn: string, san: string) {
      const keyPath = path.join(dir, `${cn}.key`)
      const certPath = path.join(dir, `${cn}.crt`)
      const confPath = path.join(dir, `${cn}.cnf`)
      await Bun.write(
        confPath,
        `[req]\ndistinguished_name=req\n[req]\n[v3]\nsubjectAltName=${san}\n`,
      )
      await $`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj /CN=${cn} -extensions v3 -config ${confPath}`.quiet()
      return {
        cert: await fs.readFile(certPath, 'utf-8'),
        key: await fs.readFile(keyPath, 'utf-8'),
      }
    }

    async function presentedCn(port: number, serverName: string) {
      const out = await $`openssl s_client -connect 127.0.0.1:${port} -servername ${serverName}`.nothrow().quiet()
      const text = `${out.stdout.toString()}${out.stderr.toString()}`
      return (text.match(/subject=.*?CN\s*=\s*([^\s/,]+)/i) || text.match(/subject=.*?\/CN=([^\s/]+)/))?.[1]
    }

    const uti = await makeLeaf('uti.email', 'DNS:*.uti.email,DNS:uti.email')
    const link = await makeLeaf('harianto.link', 'DNS:*.harianto.link,DNS:harianto.link')
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      tls: [
        { cert: uti.cert, key: uti.key, serverName: '*.uti.email' },
        { cert: link.cert, key: link.key, serverName: '*.harianto.link' },
        { cert: link.cert, key: link.key, serverName: 'harianto.link' },
      ],
      fetch: () => new Response('ok'),
    })
    const port = server.port!
    try {
      expect(await presentedCn(port, 'banana.uti.email')).toBe('uti.email')
      expect(await presentedCn(port, 'zz.uti.email')).toBe('uti.email')
      expect(await presentedCn(port, 'zz.harianto.link')).toBe('harianto.link')
      expect(await presentedCn(port, 'harianto.link')).toBe('harianto.link')
    }
    finally {
      server.stop(true)
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe('fingerprintEdgeTls', () => {
  const entry = (serverName: string | undefined, cert: string, key: string): BunTlsEntry => ({
    serverName,
    cert,
    key,
  })

  test('null and empty are empty fingerprint', () => {
    expect(fingerprintEdgeTls(null)).toBe('')
    expect(fingerprintEdgeTls(undefined)).toBe('')
    expect(fingerprintEdgeTls([])).toBe('')
  })

  test('same material yields same fingerprint regardless of order', () => {
    const a = entry('b.example.com', 'cert-b', 'key-b')
    const b = entry('a.example.com', 'cert-a', 'key-a')
    expect(fingerprintEdgeTls([a, b])).toBe(fingerprintEdgeTls([b, a]))
  })

  test('single entry matches one-element array', () => {
    const one = entry(undefined, 'cert', 'key')
    expect(fingerprintEdgeTls(one)).toBe(fingerprintEdgeTls([one]))
  })

  test('cert or key change alters fingerprint', () => {
    const base = entry('app.example.com', 'cert', 'key')
    expect(fingerprintEdgeTls(base)).not.toBe(
      fingerprintEdgeTls(entry('app.example.com', 'cert-2', 'key')),
    )
    expect(fingerprintEdgeTls(base)).not.toBe(
      fingerprintEdgeTls(entry('app.example.com', 'cert', 'key-2')),
    )
  })

  test('serverName change alters fingerprint', () => {
    expect(fingerprintEdgeTls(entry('a.example.com', 'cert', 'key'))).not.toBe(
      fingerprintEdgeTls(entry('b.example.com', 'cert', 'key')),
    )
  })
})

describe('fingerprintEdgeTlsPems', () => {
  const entry = (serverName: string | undefined, cert: string, key: string): BunTlsEntry => ({
    serverName,
    cert,
    key,
  })

  test('ignores serverName-only changes', () => {
    expect(fingerprintEdgeTlsPems(entry('a.example.com', 'cert', 'key'))).toBe(
      fingerprintEdgeTlsPems(entry('b.example.com', 'cert', 'key')),
    )
  })

  test('cert body change alters PEM fingerprint', () => {
    expect(fingerprintEdgeTlsPems(entry('app.example.com', 'cert', 'key'))).not.toBe(
      fingerprintEdgeTlsPems(entry('app.example.com', 'cert-2', 'key')),
    )
  })
})
