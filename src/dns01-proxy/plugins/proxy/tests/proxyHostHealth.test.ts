import { describe, expect, test } from 'bun:test'
import {
  classifyProbeError,
  probeProxyHostHealth,
  probeProxyRemoteHealth,
} from '../runtime/server/utils/proxyHostHealth'

describe('classifyProbeError', () => {
  test('maps common failure classes', () => {
    expect(classifyProbeError('getaddrinfo ENOTFOUND example.test')).toBe('DNS: hostname not found')
    expect(classifyProbeError('The operation was aborted')).toBe('timeout')
    expect(classifyProbeError('UNKNOWN_CERTIFICATE_VERIFICATION_ERROR')).toBe('TLS probe failed')
    expect(classifyProbeError('connect ECONNREFUSED 127.0.0.1:9')).toBe('connection refused')
  })
})

describe('probeProxyHostHealth', () => {
  test('marks HTTP upstream online on any response status', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('nope', { status: 401 })
      },
    })
    try {
      const result = await probeProxyHostHealth({
        forwardScheme: 'http',
        forwardHost: '127.0.0.1',
        forwardPort: server.port,
      })
      expect(result.online).toBe(true)
      expect(result.via).toBe('http')
      expect(result.status).toBe(401)
    }
    finally {
      server.stop(true)
    }
  })

  test('treats non-200 HTTP status as online', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response(null, { status: 405 })
      },
    })
    try {
      const result = await probeProxyHostHealth({
        forwardScheme: 'http',
        forwardHost: '127.0.0.1',
        forwardPort: server.port,
      })
      expect(result.online).toBe(true)
      expect(result.via).toBe('http')
      expect(result.status).toBe(405)
    }
    finally {
      server.stop(true)
    }
  })

  test('falls back to TCP when HTTP cannot speak the protocol', async () => {
    // Plain TCP acceptor that resets on request bytes (TLS-only style port).
    const { createServer } = await import('node:net')
    const server = createServer((socket) => {
      socket.on('data', () => {
        socket.destroy()
      })
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('expected TCP listen address')
    }
    try {
      const result = await probeProxyHostHealth({
        forwardScheme: 'http',
        forwardHost: '127.0.0.1',
        forwardPort: address.port,
      }, 500)
      expect(result.online).toBe(true)
      expect(result.via).toBe('tcp')
    }
    finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
      })
    }
  })

  test('marks HTTPS upstream online with self-signed certificate', async () => {
    // mailserver-style: https://… with a private/self-signed cert
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const os = await import('node:os')
    const { $ } = await import('bun')
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'proxy-health-'))
    const keyPath = path.join(dir, 'key.pem')
    const certPath = path.join(dir, 'cert.pem')
    await $`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj /CN=mailserver`.quiet()

    const server = Bun.serve({
      port: 0,
      tls: {
        cert: await fs.readFile(certPath),
        key: await fs.readFile(keyPath),
      },
      fetch() {
        return new Response('ok', { status: 200 })
      },
    })
    try {
      const result = await probeProxyHostHealth({
        forwardScheme: 'https',
        forwardHost: '127.0.0.1',
        forwardPort: server.port,
      })
      expect(result.online).toBe(true)
      expect(result.via).toBe('http')
    }
    finally {
      server.stop(true)
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  test('reports offline when nothing listens', async () => {
    const result = await probeProxyHostHealth({
      forwardScheme: 'http',
      forwardHost: '127.0.0.1',
      forwardPort: 9,
    }, 400)
    expect(result.online).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test('fails fast when forward host is empty', async () => {
    const result = await probeProxyHostHealth({
      forwardScheme: 'http',
      forwardHost: '  ',
      forwardPort: 80,
    })
    expect(result.online).toBe(false)
    expect(result.error).toContain('empty')
  })

  test('releases HTTP response body so sockets can be reused', async () => {
    let open = 0
    const server = Bun.serve({
      port: 0,
      async fetch() {
        open += 1
        // Large-ish body that would pin the connection if left unread.
        return new Response('x'.repeat(64_000), { status: 200 })
      },
    })
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, () => probeProxyHostHealth({
          forwardScheme: 'http',
          forwardHost: '127.0.0.1',
          forwardPort: server.port,
        }, 1000)),
      )
      expect(results.every(r => r.online)).toBe(true)
      expect(open).toBe(12)
    }
    finally {
      server.stop(true)
    }
  })
})

describe('probeProxyRemoteHealth', () => {
  test('marks public URL online on any HTTP status', async () => {
    const server = Bun.serve({
      port: 0,
      fetch() {
        return new Response('nope', { status: 404 })
      },
    })
    try {
      const result = await probeProxyRemoteHealth(`http://127.0.0.1:${server.port}/`)
      expect(result.online).toBe(true)
      expect(result.status).toBe(404)
      expect(result.target).toContain(String(server.port))
    }
    finally {
      server.stop(true)
    }
  })

  test('reports offline when nothing listens', async () => {
    const result = await probeProxyRemoteHealth('http://127.0.0.1:9/', 400)
    expect(result.online).toBe(false)
    expect(result.error).toBeTruthy()
  })

  test('fails fast when URL is empty', async () => {
    const result = await probeProxyRemoteHealth('  ')
    expect(result.online).toBe(false)
    expect(result.error).toContain('empty')
  })

  test('does not use TCP fallback for remote probes', async () => {
    const { createServer } = await import('node:net')
    const server = createServer((socket) => {
      socket.on('data', () => {
        socket.destroy()
      })
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      server.close()
      throw new Error('expected TCP listen address')
    }
    try {
      const result = await probeProxyRemoteHealth(`http://127.0.0.1:${address.port}/`, 500)
      expect(result.online).toBe(false)
      expect(result.error).toBeTruthy()
    }
    finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve())
      })
    }
  })

  test('serializes concurrent remote probes process-wide', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const server = Bun.serve({
      port: 0,
      async fetch() {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await Bun.sleep(40)
        inFlight -= 1
        return new Response('ok', { status: 200 })
      },
    })
    try {
      const url = `http://127.0.0.1:${server.port}/`
      const results = await Promise.all(
        Array.from({ length: 6 }, () => probeProxyRemoteHealth(url, 2000)),
      )
      expect(results.every(r => r.online)).toBe(true)
      expect(maxInFlight).toBe(1)
    }
    finally {
      server.stop(true)
    }
  })
})
