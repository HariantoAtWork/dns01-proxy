import { afterEach, describe, expect, test } from 'bun:test'
import { createSocket } from 'node:dgram'
import { createServer } from 'node:net'
import { startUdpForward } from './udp'

const closes: Array<() => Promise<void>> = []

afterEach(async () => {
  while (closes.length) {
    const close = closes.pop()
    await close?.().catch(() => {})
  }
})

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('no port'))
        return
      }
      const port = address.port
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

describe('startUdpForward', () => {
  test('relays datagrams and returns replies to the client', async () => {
    const upstreamPort = await freePort()
    const listenPort = await freePort()

    const upstream = createSocket('udp4')
    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject)
      upstream.bind(upstreamPort, '127.0.0.1', () => resolve())
    })
    upstream.on('message', (msg, rinfo) => {
      upstream.send(Buffer.from(`echo:${msg.toString('utf8')}`), rinfo.port, rinfo.address)
    })
    closes.push(() => new Promise(res => upstream.close(() => res())))

    const forward = await startUdpForward({
      listenHost: '127.0.0.1',
      listenPort,
      targetHost: '127.0.0.1',
      targetPort: upstreamPort,
      idleMs: 5_000,
    })
    closes.push(() => forward.close())

    const client = createSocket('udp4')
    closes.push(() => new Promise(res => client.close(() => res())))

    const reply = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 2000)
      client.once('message', (msg) => {
        clearTimeout(timer)
        resolve(msg.toString('utf8'))
      })
      client.send(Buffer.from('moonlight'), listenPort, '127.0.0.1', (error) => {
        if (error) {
          clearTimeout(timer)
          reject(error)
        }
      })
    })

    expect(reply).toBe('echo:moonlight')
    expect(forward.sessionCount()).toBe(1)
  })
})
