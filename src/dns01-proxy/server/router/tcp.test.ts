import { afterEach, describe, expect, test } from 'bun:test'
import { createServer, connect } from 'node:net'
import { startTcpForward } from './tcp'

const handles: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  while (handles.length) {
    const handle = handles.pop()
    await handle?.close().catch(() => {})
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

describe('startTcpForward', () => {
  test('relays bytes to upstream echo', async () => {
    const upstreamPort = await freePort()
    const listenPort = await freePort()

    const upstream = createServer((socket) => {
      socket.on('data', (chunk) => {
        socket.write(chunk)
      })
    })
    await new Promise<void>((resolve, reject) => {
      upstream.once('error', reject)
      upstream.listen(upstreamPort, '127.0.0.1', () => resolve())
    })
    handles.push({
      close: () => new Promise((res, rej) => upstream.close(err => err ? rej(err) : res())),
    })

    const forward = await startTcpForward({
      listenHost: '127.0.0.1',
      listenPort,
      targetHost: '127.0.0.1',
      targetPort: upstreamPort,
    })
    handles.push(forward)

    const reply = await new Promise<string>((resolve, reject) => {
      const client = connect({ port: listenPort, host: '127.0.0.1' }, () => {
        client.write('ping-router')
      })
      client.setTimeout(2000)
      client.on('data', (chunk) => {
        resolve(chunk.toString('utf8'))
        client.end()
      })
      client.on('timeout', () => {
        client.destroy()
        reject(new Error('timeout'))
      })
      client.on('error', reject)
    })

    expect(reply).toBe('ping-router')
  })
})
