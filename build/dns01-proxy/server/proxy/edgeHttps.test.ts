import { afterEach, describe, expect, test } from 'bun:test'
import {
  EDGE_HTTPS_BIND_ATTEMPTS,
  EDGE_HTTPS_DRAIN_MS,
  EDGE_HTTPS_HEAL_MS,
  applyEdgeHttpsTlsHot,
  registerEdgeHttpsRuntime,
  resetEdgeHttpsForTests,
  stopHttpsWithDrainCap,
} from './edgeHttps'

afterEach(() => {
  resetEdgeHttpsForTests()
})

describe('stopHttpsWithDrainCap', () => {
  test('returns graceful when stop finishes before drain cap', async () => {
    const server = {
      stop: async (_force?: boolean) => {
        await Bun.sleep(5)
      },
    }
    const how = await stopHttpsWithDrainCap(server as never, 200)
    expect(how).toBe('graceful')
  })

  test('force-stops when graceful drain exceeds cap', async () => {
    let forced = false
    const server = {
      stop: async (force?: boolean) => {
        if (force) {
          forced = true
          return
        }
        await Bun.sleep(500)
      },
    }
    const how = await stopHttpsWithDrainCap(server as never, 30)
    expect(how).toBe('forced')
    expect(forced).toBe(true)
  })

  test('default drain budget is 2s', () => {
    expect(EDGE_HTTPS_DRAIN_MS).toBe(2_000)
  })

  test('bind retry budget covers slow port release', () => {
    expect(EDGE_HTTPS_BIND_ATTEMPTS).toBeGreaterThanOrEqual(12)
    expect(EDGE_HTTPS_HEAL_MS).toBeGreaterThanOrEqual(1_000)
  })
})

describe('edge HTTPS overlap rebind (reusePort)', () => {
  test('new listener can bind before old is stopped so Sources stay reachable', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const { $ } = await import('bun')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edge-overlap-'))

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

    const a = await makeLeaf('a.example', 'DNS:a.example')
    const b = await makeLeaf('b.example', 'DNS:b.example')

    const first = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      reusePort: true,
      tls: [{ cert: a.cert, key: a.key, serverName: 'a.example' }],
      fetch: () => new Response('one'),
    })
    const port = first.port!

    // Production rebind path: bind next SNI set first, then drain the previous listener.
    const second = Bun.serve({
      port,
      hostname: '127.0.0.1',
      reusePort: true,
      tls: [
        { cert: a.cert, key: a.key, serverName: 'a.example' },
        { cert: b.cert, key: b.key, serverName: 'b.example' },
      ],
      fetch: () => new Response('two'),
    })

    await stopHttpsWithDrainCap(first, 200)

    const res = await fetch(`https://127.0.0.1:${port}/`, {
      tls: { rejectUnauthorized: false },
      headers: { Host: 'a.example' },
    } as RequestInit)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('two')

    second.stop(true)
    await fs.rm(dir, { recursive: true, force: true })
  })
})

describe('applyEdgeHttpsTlsHot (documents Bun.reload TLS gaps)', () => {
  async function presentedCn(port: number, serverName: string) {
    const { $ } = await import('bun')
    const out = await $`openssl s_client -connect 127.0.0.1:${port} -servername ${serverName}`.nothrow().quiet()
    const text = `${out.stdout.toString()}${out.stderr.toString()}`
    return (text.match(/subject=.*?CN\s*=\s*([^\s/,]+)/i) || text.match(/subject=.*?\/CN=([^\s/]+)/))?.[1]
  }

  test('Bun.reload does not register newly added serverNames (must rebind)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const { $ } = await import('bun')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edge-add-sni-'))

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

    const def = await makeLeaf('default.example', 'DNS:default.example')
    const link = await makeLeaf(
      'harianto.link',
      'DNS:*.admin.harianto.link,DNS:*.harianto.link,DNS:harianto.link',
    )

    registerEdgeHttpsRuntime(
      {
        binding: { host: '127.0.0.1', port: 0 },
        fetch: () => new Response('ok'),
        websocket: { message() {}, open() {}, close() {} },
      },
      null,
    )

    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      tls: [
        { cert: def.cert, key: def.key },
        { cert: link.cert, key: link.key, serverName: '*.harianto.link' },
        { cert: link.cert, key: link.key, serverName: 'harianto.link' },
      ],
      fetch: () => new Response('ok'),
    })
    const port = server.port!
    try {
      expect(await presentedCn(port, 'markdown-to-cv.admin.harianto.link')).toBe('default.example')
      applyEdgeHttpsTlsHot(server, [
        { cert: def.cert, key: def.key },
        { cert: link.cert, key: link.key, serverName: '*.harianto.link' },
        { cert: link.cert, key: link.key, serverName: 'harianto.link' },
        { cert: link.cert, key: link.key, serverName: 'markdown-to-cv.admin.harianto.link' },
      ])
      await Bun.sleep(30)
      // Document Bun behaviour: reload leaves new names on the no-SNI default.
      expect(await presentedCn(port, 'markdown-to-cv.admin.harianto.link')).toBe('default.example')
      expect(await presentedCn(port, 'zz.harianto.link')).toBe('harianto.link')
    }
    finally {
      server.stop(true)
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('Bun.reload keeps old PEM for existing serverName (must rebind on cert renew)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const { $ } = await import('bun')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edge-pem-'))

    async function makeLeaf(cn: string) {
      const keyPath = path.join(dir, `${cn}.key`)
      const certPath = path.join(dir, `${cn}.crt`)
      await $`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj /CN=${cn}`.quiet()
      return {
        cert: await fs.readFile(certPath, 'utf-8'),
        key: await fs.readFile(keyPath, 'utf-8'),
      }
    }

    const oldLeaf = await makeLeaf('old.example')
    const newLeaf = await makeLeaf('new.example')

    registerEdgeHttpsRuntime(
      {
        binding: { host: '127.0.0.1', port: 0 },
        fetch: () => new Response('ok'),
        websocket: { message() {}, open() {}, close() {} },
      },
      null,
    )

    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      tls: [{ cert: oldLeaf.cert, key: oldLeaf.key, serverName: 'app.example' }],
      fetch: () => new Response('ok'),
    })
    const port = server.port!
    try {
      expect(await presentedCn(port, 'app.example')).toBe('old.example')
      applyEdgeHttpsTlsHot(server, [
        { cert: newLeaf.cert, key: newLeaf.key, serverName: 'app.example' },
      ])
      await Bun.sleep(30)
      // Document Bun behaviour: reload does not swap PEM bodies for existing names.
      expect(await presentedCn(port, 'app.example')).toBe('old.example')
    }
    finally {
      server.stop(true)
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})
