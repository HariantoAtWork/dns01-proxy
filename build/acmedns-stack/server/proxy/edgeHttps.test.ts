import { describe, expect, test } from 'bun:test'
import {
  EDGE_HTTPS_DRAIN_MS,
  applyEdgeHttpsTlsHot,
  registerEdgeHttpsRuntime,
  stopHttpsWithDrainCap,
} from './edgeHttps'

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
})

describe('applyEdgeHttpsTlsHot', () => {
  test('updates SNI without dropping the listen port', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const { $ } = await import('bun')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edge-hot-'))
    const keyPath = path.join(dir, 'key.pem')
    const certPath = path.join(dir, 'cert.pem')
    await $`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj /CN=a.example`.quiet()
    const cert = await fs.readFile(certPath, 'utf-8')
    const key = await fs.readFile(keyPath, 'utf-8')

    registerEdgeHttpsRuntime(
      {
        binding: { host: '127.0.0.1', port: 0 },
        fetch: () => new Response('ok'),
        websocket: {
          message() {},
          open() {},
          close() {},
        },
      },
      null,
    )

    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      tls: [
        { cert, key, serverName: 'a.example' },
        { cert, key, serverName: 'z.example' },
      ],
      fetch: () => new Response('v1'),
    })
    const portBefore = server.port
    try {
      const next = applyEdgeHttpsTlsHot(server, [
        { cert, key, serverName: 'a.example' },
        { cert, key, serverName: 'b.example' },
        { cert, key, serverName: 'z.example' },
      ])
      expect(next.port).toBe(portBefore)
      const res = await fetch(`https://127.0.0.1:${portBefore}/`, {
        // @ts-expect-error Bun fetch TLS options
        tls: { rejectUnauthorized: false, serverName: 'b.example' },
      })
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('ok')
    }
    finally {
      server.stop(true)
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('other SNI host stays reachable while a host is added (no port drop)', async () => {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const { $ } = await import('bun')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edge-reach-'))
    const keyPath = path.join(dir, 'key.pem')
    const certPath = path.join(dir, 'cert.pem')
    await $`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj /CN=mail.example`.quiet()
    const cert = await fs.readFile(certPath, 'utf-8')
    const key = await fs.readFile(keyPath, 'utf-8')

    registerEdgeHttpsRuntime(
      {
        binding: { host: '127.0.0.1', port: 0 },
        fetch: (req) => {
          const host = req.headers.get('host') || ''
          return new Response(`host:${host}`)
        },
        websocket: {
          message() {},
          open() {},
          close() {},
        },
      },
      null,
    )

    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      tls: [
        { cert, key, serverName: 'mail.example' },
        { cert, key, serverName: 'blog.example' },
      ],
      fetch: (req) => {
        const host = req.headers.get('host') || ''
        return new Response(`host:${host}`)
      },
    })
    const port = server.port
    const tlsMail = { rejectUnauthorized: false, serverName: 'mail.example' }

    try {
      // Simulate remove/add of another host while mail keeps getting traffic.
      const before = await fetch(`https://127.0.0.1:${port}/`, {
        headers: { host: 'mail.example' },
        // @ts-expect-error Bun fetch TLS options
        tls: tlsMail,
      })
      expect(before.status).toBe(200)

      applyEdgeHttpsTlsHot(server, [
        { cert, key, serverName: 'mail.example' },
        { cert, key, serverName: 'blog.example' },
        { cert, key, serverName: 'harianto.link' },
      ])

      const after = await Promise.all([
        fetch(`https://127.0.0.1:${port}/`, {
          headers: { host: 'mail.example' },
          // @ts-expect-error Bun fetch TLS options
          tls: tlsMail,
        }),
        fetch(`https://127.0.0.1:${port}/`, {
          headers: { host: 'blog.example' },
          // @ts-expect-error Bun fetch TLS options
          tls: { rejectUnauthorized: false, serverName: 'blog.example' },
        }),
        fetch(`https://127.0.0.1:${port}/`, {
          headers: { host: 'harianto.link' },
          // @ts-expect-error Bun fetch TLS options
          tls: { rejectUnauthorized: false, serverName: 'harianto.link' },
        }),
      ])
      expect(after.every(r => r.status === 200)).toBe(true)
      expect(server.port).toBe(port)
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

    async function presentedCn(port: number, serverName: string) {
      const out = await $`openssl s_client -connect 127.0.0.1:${port} -servername ${serverName}`.nothrow().quiet()
      const text = `${out.stdout.toString()}${out.stderr.toString()}`
      return (text.match(/subject=.*?CN\s*=\s*([^\s/,]+)/i) || text.match(/subject=.*?\/CN=([^\s/]+)/))?.[1]
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
